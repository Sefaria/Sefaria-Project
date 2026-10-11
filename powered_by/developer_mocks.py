"""
Test controls for developer settings, on only where DEVELOPER_SETTINGS_MOCKS is set (cauldrons
where Google refuses the origin and no email is sent). They act on the real data of the
logged-in account. Remove this module, its route and the settings page's test panel together.
"""
from django.http import Http404
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from sefaria.model.user_profile import UserProfile
from sefaria.system.exceptions import InputError
from . import developer
from .developer_views import developer_api, state_response
from .models import Project, SubmissionSource


MOCK_LISTING_NOTE = "Created by the developer settings test controls."

MOCK_LISTINGS = [
    ("Daf Yomi Companion", "https://dafyomicompanion.org", "Today's daf with Steinsaltz, Rashi and a daily review quiz."),
    ("Mishnah Yomit Tracker", "https://mishnahtracker.app", "Track your daily two mishnayot and share progress with a study group."),
    ("Tehillim Circle", "https://tehillimcircle.org", "Split the book of Psalms among a group, with the text in Hebrew and English."),
    ("Luach Widgets", "https://luachwidgets.dev", "Embeddable Hebrew calendar and daily learning widgets for synagogue websites."),
]


def set_email_verified(user, verified):
    address = developer.confirmation_for(user).email_address
    address.verified = verified
    address.save(update_fields=["verified"])


def start_over(request, sso_override, email_verified):
    """
    Clears the account's developer settings: its projects are deleted (claimed listings are
    released instead) and the account's verification is set as asked.
    """
    user = request.user
    for project in developer.owned_projects(user):
        if project.submission_source == SubmissionSource.DEVELOPER_SETTINGS:
            developer.delete_project(user, project.id)
        else:
            project.api_keys.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())
            project.owner = None
            project.save()
    profile = UserProfile(id=user.id)
    for setting in (developer.ENABLED_SETTING, developer.PROFILE_SETTING,
                    developer.CONFIRMATION_SENT_SETTING, developer.DISMISSED_LISTINGS_SETTING):
        profile.settings.pop(setting, None)
    profile.save()
    request.session[developer.MOCK_SSO_SESSION_KEY] = sso_override
    if user.email:
        set_email_verified(user, email_verified)


def create_listing(user):
    """
    An unclaimed Powered by listing submitted with the account's email, as if it came in
    through the public form.
    """
    if not user.email:
        raise InputError("Your account has no email address.")
    count = Project.objects.filter(creator_email__iexact=user.email, notes=MOCK_LISTING_NOTE).count()
    name, link, description = MOCK_LISTINGS[count % len(MOCK_LISTINGS)]
    return Project.objects.create(
        submission_source=SubmissionSource.MANUAL,
        submission_date=timezone.now(),
        creator=user.get_full_name(),
        creator_email=user.email,
        project_name=name,
        project_link=link,
        project_desc=description,
        consent_to_display=True,
        notes=MOCK_LISTING_NOTE,
    )


@require_http_methods(["POST"])
@developer_api
def mock_api(request):
    if not developer.mocks_enabled():
        raise Http404
    action = request.json.get("action")
    if action == "start-over":
        start_over(request, request.json.get("ssoOverride"), bool(request.json.get("emailVerified")))
    elif action == "sso":
        request.session[developer.MOCK_SSO_SESSION_KEY] = request.json.get("ssoOverride")
    elif action == "email-verified":
        set_email_verified(request.user, bool(request.json.get("emailVerified")))
        developer.mark_confirmation_sent(request.user, False)
    elif action == "create-listing":
        create_listing(request.user)
    else:
        raise InputError("Unknown test action.")
    return state_response(request)
