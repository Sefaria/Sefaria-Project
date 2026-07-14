from __future__ import annotations

import hashlib
import urllib.error
import urllib.request

import structlog
from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib.auth.models import User
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


class SefariaAccountAdapter(DefaultAccountAdapter):
    def populate_username(self, request, user):
        # emailusernames requires username == email
        user.username = user.email


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
        2. Register the user in Salesforce CRM — outside try/except so a CRM
           outage does not roll back the user or profile that were just created
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
                lang=getattr(request, "interfaceLang", "english"),
                educator=False,
            )
        except Exception:
            logger.error("SSO: failed to create CRM user", exc_info=True)

        return user
