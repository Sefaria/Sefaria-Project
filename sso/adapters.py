from __future__ import annotations

import hashlib
import urllib.error
import urllib.parse
import urllib.request

import structlog
from allauth.account.adapter import DefaultAccountAdapter
from allauth.core import context as allauth_context
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib.auth.models import User
from django.utils.http import url_has_allowed_host_and_scheme
from google.cloud.exceptions import GoogleCloudError
from PIL import Image

from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.helper.crm.crm_mediator import CrmMediator
from sefaria.helper.file import get_resized_file
from sefaria.model.user_profile import UserProfile
from sefaria.utils.util import epoch_time

logger = structlog.get_logger(__name__)


def import_gravatar(profile):
    """
    Attempt to fetch the user's Gravatar and upload it to Google Storage.
    Used by both SSO registration (sso/adapters.py) and email registration
    (sefaria/views.py process_register_form) so both registration paths get
    the same treatment.
    """
    email_hash = hashlib.md5(profile.email.lower().encode("utf-8")).hexdigest()
    gravatar_url = f"https://www.gravatar.com/avatar/{email_hash}?d=404&s=250"
    try:
        with urllib.request.urlopen(gravatar_url) as r:
            bucket_name = GoogleStorageManager.PROFILES_BUCKET
            with Image.open(r) as image:
                now = epoch_time()
                big_pic_url = GoogleStorageManager.upload_file(
                    get_resized_file(image, (250, 250)),
                    f"{profile.slug}-{now}.png",
                    bucket_name,
                    None,
                )
                small_pic_url = GoogleStorageManager.upload_file(
                    get_resized_file(image, (80, 80)),
                    f"{profile.slug}-{now}-small.png",
                    bucket_name,
                    None,
                )
                profile.profile_pic_url = big_pic_url
                profile.profile_pic_url_small = small_pic_url
    except urllib.error.HTTPError as e:
        logger.info("Gravatar HTTP error", code=e.code)
    except urllib.error.URLError as e:
        logger.info("Gravatar URL error", reason=str(e.reason))
    except GoogleCloudError as e:
        logger.warning("Google Storage error during Gravatar import", error=str(e))
    except OSError as e:
        logger.info("Gravatar image error", error=str(e))


class SefariaAccountAdapter(DefaultAccountAdapter):
    # Google's redirect-mode SSO (static/js/auth/useSsoSignIn.jsx) can't carry `next` as
    # a query param on login_uri — Google requires an exact-match registered redirect
    # URI with no query string — so the client stashes it in this short-lived cookie
    # instead. Apple's OAuth2 flow already threads `next` via allauth's own `state`
    # mechanism and never reaches these fallbacks. Keep this name in sync with the JS.
    SSO_NEXT_COOKIE = "sefaria_sso_next"

    def populate_username(self, request, user):
        # emailusernames requires username == email
        user.username = user.email

    def is_safe_url(self, url):
        # DefaultAccountAdapter.is_safe_url falls back to settings.ALLOWED_HOSTS, which
        # we run as ["*"] in production for multi-domain routing (see DOMAIN_MODULES).
        # allauth's own fallback for "*" degenerates into checking a URL's host against
        # itself, i.e. it accepts any external URL. Scope the check to the current
        # request's host instead, matching the pattern in sefaria/views.py's register().
        request = allauth_context.request
        return bool(request) and url_has_allowed_host_and_scheme(
            url, allowed_hosts={request.get_host()}, require_https=request.is_secure()
        )

    def _next_from_cookie(self, request):
        raw_next_url = request.COOKIES.get(self.SSO_NEXT_COOKIE)
        if not raw_next_url:
            return None
        # Python's cookie parser never percent-decodes values, so the encodeURIComponent()
        # applied client-side (useSsoSignIn.jsx) has to be undone here explicitly.
        next_url = urllib.parse.unquote(raw_next_url)
        return next_url if self.is_safe_url(next_url) else None

    def get_login_redirect_url(self, request):
        return self._next_from_cookie(request) or super().get_login_redirect_url(request)

    def get_signup_redirect_url(self, request):
        return self._next_from_cookie(request) or super().get_signup_redirect_url(request)


class SefariaSocialAccountAdapter(DefaultSocialAccountAdapter):

    def pre_social_login(self, request, sociallogin):
        """
        Called after sociallogin.lookup() has run (so is_existing is already set)
        but before the user is logged in or created.

        Scenarios:
        - is_existing=True: returning user who already has a SocialAccount row
          for this (provider, uid). Nothing to do.
        - is_existing=False, email matches an existing Django user: email
          collision. SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT will link
          the new SocialAccount to that existing user. We disable their password
          here so the account becomes SSO-only going forward.
        - is_existing=False, no matching user: brand-new user. save_user() will
          handle them. Nothing to do here.
        """
        if sociallogin.is_existing:
            return
        email = (sociallogin.user.email or "").lower()
        if not email:
            return
        try:
            existing_user = User.objects.get(email__iexact=email)
            if existing_user.has_usable_password():
                existing_user.set_unusable_password()
                existing_user.save(update_fields=["password"])
        except User.DoesNotExist:
            pass

    def save_user(self, request, sociallogin, form=None):
        """
        Called only for brand-new users (email-collision users reuse their
        existing Django account and never reach this method).

        After the base implementation creates the Django User and SocialAccount
        row, we:
        1. Create the MongoDB UserProfile (slug, language setting, Gravatar pic)
        2. Register the user in Salesforce CRM — wrapped in its own try/except
           so a CRM outage doesn't affect the user or profile already created above
        """
        user = super().save_user(request, sociallogin, form)

        p = UserProfile(id=user.id, user_registration=True)
        p.assign_slug()
        p.join_invited_collections()
        if hasattr(request, "interfaceLang"):
            p.settings["interface_language"] = request.interfaceLang
        import_gravatar(p)
        p.save()

        try:
            CrmMediator().create_crm_user(
                user.email,
                first_name=user.first_name,
                last_name=user.last_name,
                lang=getattr(request, "LANGUAGE_CODE", "en"),
                educator=False,
            )
        except Exception:
            logger.error("SSO: failed to create CRM user", exc_info=True)

        return user
