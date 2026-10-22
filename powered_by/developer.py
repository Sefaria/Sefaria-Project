"""
Developer settings: a developer's projects (Powered by Sefaria rows they own) and their API keys,
the developer profile kept in the user's profile settings, and the email check that gates them.

An account may use developer settings while its current email is verified: Google or Apple
reported that address as verified, or it was confirmed through the emailed link (allauth's
EmailAddress). Changing the account email therefore ends verification until the new address is
confirmed; existing keys keep working, but no new project or key can be created.
"""
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from allauth.account import app_settings as account_settings
from allauth.account.models import EmailAddress, EmailConfirmationHMAC
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email
from django.db import transaction
from django.utils import timezone

from sefaria.model.user_profile import UserProfile
from sefaria.system.exceptions import InputError
from .models import ApiKey, Project, SubmissionSource


MAX_KEYS_PER_PROJECT = 5
MAX_DESCRIPTION_LENGTH = 150
MAX_PROFILE_DESCRIPTION_LENGTH = 300

ENABLED_SETTING = "developer_enabled"
PROFILE_SETTING = "developer_profile"
CONFIRMATION_SENT_SETTING = "developer_confirmation_sent_at"
# The address that pending link went to: a link sent before the account email changed doesn't count.
CONFIRMATION_SENT_TO_SETTING = "developer_confirmation_sent_to"
# The times of the sends in the last day. Never cleared by cancelling or confirming, so neither
# resets the limits.
CONFIRMATION_SENDS_SETTING = "developer_confirmation_sends"
CONFIRMATION_COOLDOWN = timedelta(seconds=60)
CONFIRMATION_DAILY_LIMIT = 5
CONFIRMATION_LINK_MAX_AGE = timedelta(days=account_settings.EMAIL_CONFIRMATION_EXPIRE_DAYS)
SSO_PROVIDERS = ("google", "apple")
DISMISSED_LISTINGS_SETTING = "developer_dismissed_listings"

MOCK_SSO_SESSION_KEY = "developer_mock_sso"

_url_validator = URLValidator(schemes=["http", "https"])


class CooldownError(Exception):
    """Too soon to send another confirmation email; retry_after is in whole seconds."""
    def __init__(self, retry_after, message="Wait a minute before asking for another email."):
        super().__init__(message)
        self.retry_after = retry_after


class LinkStatus:
    """What opening an emailed confirmation link did."""
    CONFIRMED = "confirmed"
    ALREADY_CONFIRMED = "already-confirmed"
    EXPIRED = "expired"
    NOT_ACCOUNT_EMAIL = "not-account-email"
    INVALID = "invalid"


def settings_enabled(user):
    if not getattr(settings, "DEVELOPER_SETTINGS_ENABLED", False):
        return False
    return not getattr(settings, "DEVELOPER_SETTINGS_STAFF_ONLY", False) or bool(getattr(user, "is_staff", False))


def mocks_enabled():
    return bool(getattr(settings, "DEVELOPER_SETTINGS_MOCKS", False))


def iso(dt):
    return dt.isoformat() if dt else None


DEFAULT_PORTS = {"http": 80, "https": 443}


def origin_of(url):
    """
    The browser Origin of a URL: scheme://host[:port], lowercase, without a default port. The
    auth service compares it to the Origin header as an exact string.
    """
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    origin = "{}://{}".format(scheme, (parts.hostname or "").lower())
    if parts.port and parts.port != DEFAULT_PORTS.get(scheme):
        origin += ":{}".format(parts.port)
    return origin


# --- Verification ------------------------------------------------------------

def mock_sso_override(request):
    return request.session.get(MOCK_SSO_SESSION_KEY) if mocks_enabled() else None


def sso_connected(request):
    """
    Whether a Google or Apple login of this account vouches for the account email: the provider
    marked that address verified at the last sign-in. Signing in with an address the provider
    hasn't verified doesn't count; that account confirms by link instead.
    """
    override = mock_sso_override(request)
    if override is not None:
        return override
    email = (request.user.email or "").lower()
    if not email:
        return False
    for account in request.user.socialaccount_set.filter(provider__in=SSO_PROVIDERS):
        addresses = account.get_provider(request).extract_email_addresses(account.extra_data or {})
        if any(a.verified and a.email.lower() == email for a in addresses):
            return True
    return False


def account_email_address(user):
    return EmailAddress.objects.filter(user=user, email__iexact=user.email).first()


def email_verified(user):
    address = account_email_address(user)
    return bool(address and address.verified)


def account_verified(request):
    return sso_connected(request) or email_verified(request.user)


def confirmation_for(user):
    address = account_email_address(user)
    if address is None:
        # An account whose email changed still has a primary address row for the old one.
        has_primary = EmailAddress.objects.filter(user=user, primary=True).exists()
        address = EmailAddress.objects.create(user=user, email=user.email.lower(), primary=not has_primary,
                                              verified=False)
    return EmailConfirmationHMAC(address)


def address_of_link(key):
    """The address an emailed link was sent for, however old the link, or None if we didn't sign it."""
    try:
        pk = signing.loads(key, salt=account_settings.SALT)
    except signing.BadSignature:
        return None
    return EmailAddress.objects.select_related("user").filter(pk=pk).first()


def link_expired(key):
    try:
        signing.loads(key, salt=account_settings.SALT, max_age=CONFIRMATION_LINK_MAX_AGE)
    except signing.SignatureExpired:
        return True
    return False


def is_account_email(address):
    return address.email.lower() == (address.user.email or "").lower()


def confirm_email(request, key):
    """
    Confirms the address behind an emailed link and turns developer settings on for its
    account. Opening it needs no login. Returns a LinkStatus: a link for an address that is no
    longer the account email is refused, as is one older than the link lifetime.
    """
    address = address_of_link(key)
    if address is None:
        return LinkStatus.INVALID
    if not is_account_email(address):
        return LinkStatus.NOT_ACCOUNT_EMAIL
    if address.verified:
        return LinkStatus.ALREADY_CONFIRMED
    if link_expired(key):
        return LinkStatus.EXPIRED
    if EmailConfirmationHMAC(address).confirm(request) is None:
        return LinkStatus.INVALID
    profile = UserProfile(id=address.user_id)
    profile.settings[ENABLED_SETTING] = True
    profile.settings.pop(CONFIRMATION_SENT_SETTING, None)
    profile.settings.pop(CONFIRMATION_SENT_TO_SETTING, None)
    profile.save()
    return LinkStatus.CONFIRMED


def user_for_new_link(key):
    """
    The account an expired link was sent to, if a new link may go to it: the link's address is
    still the account email and isn't confirmed yet. Otherwise LookupError.
    """
    address = address_of_link(key)
    if address is None or not is_account_email(address) or address.verified:
        raise LookupError("This link can't be renewed.")
    return address.user


# --- State -------------------------------------------------------------------

def serialize_key(api_key):
    return {
        "id": str(api_key.id),
        "label": api_key.label,
        "value": api_key.key,
        "created": iso(api_key.created_at),
        "restrictToWebsite": bool(api_key.allowed_origins),
    }


def serialize_project(project):
    keys = [k for k in project.api_keys.all() if k.revoked_at is None]
    return {
        "id": str(project.id),
        "name": project.project_name,
        "description": project.project_desc,
        "organization": project.organization,
        "websiteUrl": project.project_link,
        "visibility": "public" if project.consent_to_display else "private",
        "aiAssisted": project.vibe_coded,
        "linkedListing": project.submission_source != SubmissionSource.DEVELOPER_SETTINGS,
        "consentWithdrawnAt": iso(project.consent_withdrawn_at),
        "keys": [serialize_key(k) for k in keys],
    }


def public_listing(project):
    return {
        "id": str(project.id),
        "name": project.project_name,
        "url": project.project_link,
        "description": project.project_desc,
    }


def owned_projects(user):
    return (Project.objects.filter(owner=user, deleted_at__isnull=True)
            .prefetch_related("api_keys").order_by("-created_at"))


def unclaimed_listings(user, profile):
    """
    Powered by listings submitted with this account's email that no account manages yet.
    """
    dismissed = profile.settings.get(DISMISSED_LISTINGS_SETTING, [])
    return listings_submitted_by(user).exclude(id__in=dismissed).order_by("-created_at")


def listings_submitted_by(user):
    return (Project.objects.filter(owner__isnull=True, deleted_at__isnull=True, creator_email__iexact=user.email)
            .exclude(submission_source=SubmissionSource.DEVELOPER_SETTINGS))


def developer_state(request):
    user = request.user
    profile = UserProfile(id=user.id)
    verified = account_verified(request)
    listing = unclaimed_listings(user, profile).first() if verified and user.email else None
    sent_at = None
    if not verified and profile.settings.get(CONFIRMATION_SENT_TO_SETTING) == (user.email or "").lower():
        sent_at = profile.settings.get(CONFIRMATION_SENT_SETTING)
    state = {
        "developerEnabled": bool(profile.settings.get(ENABLED_SETTING)),
        "ssoConnected": sso_connected(request),
        "emailVerified": email_verified(user),
        "confirmationSentAt": sent_at,
        "profile": profile.settings.get(PROFILE_SETTING),
        "projects": [serialize_project(p) for p in owned_projects(user)],
        "yourListing": public_listing(listing) if listing else None,
        "maxKeysPerProject": MAX_KEYS_PER_PROJECT,
        "mock": None,
    }
    if mocks_enabled():
        state["mock"] = {
            "ssoOverride": mock_sso_override(request),
            "realSsoProviders": list(user.socialaccount_set.values_list("provider", flat=True)),
            "confirmationKey": confirmation_for(user).key if sent_at else None,
        }
    return state


# --- Profile -----------------------------------------------------------------

FIELD_LABELS = {
    "developerName": "The name",
    "description": "The description",
    "additionalEmail": "The additional email",
    "name": "The project name",
    "organization": "The organization",
    "websiteUrl": "The website",
}


def _text(data, field, max_length=255):
    label = FIELD_LABELS.get(field, field)
    value = data.get(field, "")
    if not isinstance(value, str):
        raise InputError("{} must be text.".format(label))
    value = value.strip()
    if len(value) > max_length:
        raise InputError("{} can be at most {} characters.".format(label, max_length))
    return value


def clean_profile(data):
    if not isinstance(data, dict):
        raise InputError("The profile must be a JSON object.")
    profile = {
        "developerName": _text(data, "developerName"),
        "description": _text(data, "description", MAX_PROFILE_DESCRIPTION_LENGTH),
        "additionalEmail": _text(data, "additionalEmail"),
        "termsAccepted": bool(data.get("termsAccepted")),
        "developerNews": bool(data.get("developerNews")),
        "notADeveloper": bool(data.get("notADeveloper")),
    }
    if not profile["termsAccepted"]:
        raise InputError("Accept the API terms to continue.")
    if profile["additionalEmail"]:
        try:
            validate_email(profile["additionalEmail"])
        except ValidationError:
            raise InputError("The additional email is not a valid address.")
    return profile


def save_profile(user, data):
    profile = UserProfile(id=user.id)
    profile.settings[PROFILE_SETTING] = clean_profile(data)
    profile.save()
    return profile.settings[PROFILE_SETTING]


def enable(request):
    if not account_verified(request):
        raise InputError("Confirm your email before turning on developer settings.")
    profile = UserProfile(id=request.user.id)
    profile.settings[ENABLED_SETTING] = True
    profile.save()


def developer_enabled(user):
    return bool(UserProfile(id=user.id).settings.get(ENABLED_SETTING))


def require_developer(request):
    """
    Developer settings were set up. Managing what exists (editing, deleting, revoking) needs only
    this, so an account whose email changed keeps control of its projects and keys.
    """
    profile = UserProfile(id=request.user.id)
    if not (profile.settings.get(ENABLED_SETTING) and profile.settings.get(PROFILE_SETTING)):
        raise PermissionError("Developer settings are not set up for this account.")
    return profile


def require_verified_developer(request):
    """Developer settings were set up and the current account email is verified: needed to add projects and keys."""
    profile = require_developer(request)
    if not account_verified(request):
        raise PermissionError("Confirm your email address to create projects and keys.")
    return profile


def _recent_sends(profile, now):
    sends = []
    for sent in profile.settings.get(CONFIRMATION_SENDS_SETTING, []):
        try:
            sent_at = datetime.fromisoformat(sent)
        except (TypeError, ValueError):
            continue
        if now - sent_at < timedelta(days=1):
            sends.append(sent_at)
    return sorted(sends)


def _seconds(delta):
    return int(delta.total_seconds()) + 1


def check_confirmation_limits(user):
    """
    Raises CooldownError if this account was sent a confirmation email less than a minute ago,
    or already had CONFIRMATION_DAILY_LIMIT in the last day.
    """
    now = timezone.now()
    sends = _recent_sends(UserProfile(id=user.id), now)
    if sends and now - sends[-1] < CONFIRMATION_COOLDOWN:
        raise CooldownError(_seconds(CONFIRMATION_COOLDOWN - (now - sends[-1])))
    if len(sends) >= CONFIRMATION_DAILY_LIMIT:
        raise CooldownError(
            _seconds(timedelta(days=1) - (now - sends[-CONFIRMATION_DAILY_LIMIT])),
            "You've asked for {} links today. Try again tomorrow, or contact hello@sefaria.org.".format(
                CONFIRMATION_DAILY_LIMIT),
        )


def reserve_confirmation_send(user):
    """
    Atomically checks the limits and records this send, so concurrent requests for one account
    cannot both pass. The account's auth row is locked for the check and the write; the caller
    sends the email afterwards, so a failed send still throttles. Raises CooldownError.
    """
    with transaction.atomic():
        _lock_account(user)
        check_confirmation_limits(user)
        mark_confirmation_sent(user, True)


def _lock_account(user):
    get_user_model().objects.select_for_update().get(pk=user.pk)


def mark_confirmation_sent(user, sent):
    """
    Every write of the confirmation settings holds the account's row lock: UserProfile.save()
    rewrites the whole profile, so an unlocked cancel could erase a concurrent send's timestamp.
    """
    with transaction.atomic():
        _lock_account(user)
        profile = UserProfile(id=user.id)
        if sent:
            now = timezone.now()
            profile.settings[CONFIRMATION_SENT_SETTING] = iso(now)
            profile.settings[CONFIRMATION_SENT_TO_SETTING] = (user.email or "").lower()
            profile.settings[CONFIRMATION_SENDS_SETTING] = [iso(t) for t in _recent_sends(profile, now)] + [iso(now)]
        else:
            profile.settings.pop(CONFIRMATION_SENT_SETTING, None)
            profile.settings.pop(CONFIRMATION_SENT_TO_SETTING, None)
        profile.save()


# --- Projects ----------------------------------------------------------------

def clean_project_fields(data):
    if not isinstance(data, dict):
        raise InputError("The project must be a JSON object.")
    fields = {
        "name": _text(data, "name"),
        "description": _text(data, "description", MAX_DESCRIPTION_LENGTH),
        "organization": _text(data, "organization"),
        "websiteUrl": _text(data, "websiteUrl", 200),
        "visibility": data.get("visibility"),
        "aiAssisted": bool(data.get("aiAssisted")),
    }
    if not fields["name"]:
        raise InputError("Give the project a name.")
    if fields["visibility"] not in ("public", "private"):
        raise InputError("Choose whether the project is public or private.")
    if fields["websiteUrl"]:
        try:
            _url_validator(fields["websiteUrl"])
        except ValidationError:
            raise InputError("The website is not a valid web address.")
    return fields


def _apply_fields(project, fields):
    project.project_name = fields["name"]
    project.project_desc = fields["description"]
    project.organization = fields["organization"]
    project.project_link = fields["websiteUrl"]
    project.vibe_coded = fields["aiAssisted"]


def _set_visibility(project, visibility):
    """
    Public projects are listed on Powered by Sefaria, as rows from the public form are when
    their submitter consents; staff can still unpublish one.
    """
    if visibility == "public":
        if not project.consent_to_display:
            project.is_published = True
        project.consent_to_display = True
        project.consent_withdrawn_at = None
    elif project.consent_to_display:
        project.consent_to_display = False
        project.is_published = False
        project.consent_withdrawn_at = timezone.now()


def get_owned_project(user, project_id):
    try:
        return owned_projects(user).get(id=int(project_id))
    except (Project.DoesNotExist, ValueError):
        raise LookupError("No such project.")


def _lock_owned_project(user, project_id):
    """
    The owned, undeleted project with its row locked until the transaction ends, so key creation,
    project edits and deletion of one project run one at a time. Call inside transaction.atomic().
    """
    try:
        return Project.objects.select_for_update().get(id=int(project_id), owner=user, deleted_at__isnull=True)
    except (Project.DoesNotExist, ValueError):
        raise LookupError("No such project.")


def create_project(user, data):
    fields = clean_project_fields(data)
    project = Project(
        submission_source=SubmissionSource.DEVELOPER_SETTINGS,
        submission_date=timezone.now(),
        owner=user,
        creator=user.get_full_name(),
        creator_email=user.email,
        is_published=fields["visibility"] == "public",
        consent_to_display=fields["visibility"] == "public",
    )
    _apply_fields(project, fields)
    project.save()
    return project


@transaction.atomic
def update_project(user, project_id, data):
    project = _lock_owned_project(user, project_id)
    fields = clean_project_fields(data)
    old_link = project.project_link
    _apply_fields(project, fields)
    _set_visibility(project, fields["visibility"])
    project.save()
    if project.project_link != old_link:
        new_origins = [origin_of(project.project_link)] if project.project_link else []
        for api_key in project.api_keys.filter(revoked_at__isnull=True).exclude(allowed_origins=[]):
            api_key.allowed_origins = new_origins
            api_key.save(update_fields=["allowed_origins"])
    return get_owned_project(user, project_id)


@transaction.atomic
def delete_project(user, project_id):
    project = _lock_owned_project(user, project_id)
    now = timezone.now()
    project.api_keys.filter(revoked_at__isnull=True).update(revoked_at=now)
    project.deleted_at = now
    project.consent_to_display = False
    project.is_published = False
    project.save()


def claim_listing(user, listing_id):
    """
    Makes an unclaimed Powered by listing submitted with this account's email one of its projects.
    """
    try:
        project = unclaimed_listings(user, UserProfile(id=user.id)).get(id=int(listing_id))
    except (Project.DoesNotExist, ValueError):
        raise LookupError("No such listing.")
    project.owner = user
    _set_visibility(project, "public")
    project.save()
    return project


@transaction.atomic
def release_account_projects(user):
    """
    For an account being deleted: every key of its projects is revoked, projects it created
    are deleted, and listings it claimed go back to unclaimed.
    """
    now = timezone.now()
    for project in Project.objects.filter(owner=user):
        project.api_keys.filter(revoked_at__isnull=True).update(revoked_at=now)
        if project.submission_source == SubmissionSource.DEVELOPER_SETTINGS and project.deleted_at is None:
            project.deleted_at = now
            project.consent_to_display = False
            project.is_published = False
        project.owner = None
        project.save()


def dismiss_listing(user, listing_id):
    profile = UserProfile(id=user.id)
    dismissed = profile.settings.get(DISMISSED_LISTINGS_SETTING, [])
    try:
        listing_id = int(listing_id)
    except ValueError:
        raise LookupError("No such listing.")
    if not listings_submitted_by(user).filter(id=listing_id).exists():
        raise LookupError("No such listing.")
    if listing_id not in dismissed:
        profile.settings[DISMISSED_LISTINGS_SETTING] = dismissed + [listing_id]
        profile.save()


# --- Keys --------------------------------------------------------------------

@transaction.atomic
def create_key(user, project_id, label):
    project = _lock_owned_project(user, project_id)
    label = (label or "").strip() if isinstance(label, str) else ""
    if not label:
        raise InputError("Give the key a name.")
    if len(label) > 100:
        raise InputError("The key name can be at most 100 characters.")
    if project.api_keys.filter(revoked_at__isnull=True).count() >= MAX_KEYS_PER_PROJECT:
        raise InputError("A project can have at most {} keys.".format(MAX_KEYS_PER_PROJECT))
    return ApiKey.objects.create(project=project, label=label)


def get_owned_key(user, key_id):
    try:
        return ApiKey.objects.select_related("project").get(
            id=key_id, revoked_at__isnull=True, project__owner=user, project__deleted_at__isnull=True,
        )
    except (ApiKey.DoesNotExist, ValidationError, ValueError):
        raise LookupError("No such key.")


def set_key_restriction(user, key_id, restrict):
    api_key = get_owned_key(user, key_id)
    if restrict and not api_key.project.project_link:
        raise InputError("Add the project's website before restricting a key to it.")
    api_key.allowed_origins = [origin_of(api_key.project.project_link)] if restrict else []
    api_key.save(update_fields=["allowed_origins"])
    return api_key


def revoke_key(user, key_id):
    api_key = get_owned_key(user, key_id)
    api_key.revoked_at = timezone.now()
    api_key.save(update_fields=["revoked_at"])
