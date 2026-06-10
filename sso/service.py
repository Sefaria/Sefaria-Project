import hashlib
import urllib.error
import urllib.request

from django.db import transaction
from django.contrib.auth.models import User
from emailusernames.utils import create_user, get_user, user_exists

from sso.models import SocialIdentity
from sefaria.model.user_profile import UserProfile

import structlog
logger = structlog.get_logger(__name__)


class AlreadyLinkedError(Exception):
    pass


class SocialAuthService:

    @staticmethod
    def get_or_create_social_user(provider, uid, email, first_name, last_name, request):
        """Returns (user, is_new_user).

        If an existing account matches the SSO email but is not yet linked to this
        (provider, uid), auto-link it. Provider verification must reject missing or
        unverified email claims before this method is called.
        """
        try:
            identity = SocialIdentity.objects.select_related("user").get(provider=provider, uid=uid)
            return identity.user, False
        except SocialIdentity.DoesNotExist:
            pass

        if user_exists(email):
            with transaction.atomic():
                existing_user = User.objects.select_for_update().get(pk=get_user(email).pk)
                SocialIdentity.objects.create(provider=provider, uid=uid, email=email, user=existing_user)
                if existing_user.has_usable_password():
                    existing_user.set_unusable_password()
                    existing_user.save(update_fields=["password"])
            return existing_user, False

        with transaction.atomic():
            new_user = create_user(email, password=None)
            new_user.first_name = first_name
            new_user.last_name = last_name
            new_user.save()
            SocialIdentity.objects.create(provider=provider, uid=uid, email=email, user=new_user)
            p = UserProfile(id=new_user.id, user_registration=True)
            p.assign_slug()
            p.join_invited_collections()
            if hasattr(request, "interfaceLang"):
                p.settings["interface_language"] = request.interfaceLang
            SocialAuthService._import_gravatar(p)
            p.save()

        return new_user, True

    @staticmethod
    def _import_gravatar(profile):
        from sefaria.helper.file import get_resized_file
        from sefaria.google_storage_manager import GoogleStorageManager
        from sefaria.utils.util import epoch_time
        from PIL import Image
        from google.cloud.exceptions import GoogleCloudError

        email_hash = hashlib.md5(profile.email.lower().encode("utf-8")).hexdigest()
        gravatar_url = f"https://www.gravatar.com/avatar/{email_hash}?d=404&s=250"
        try:
            with urllib.request.urlopen(gravatar_url) as r:
                bucket_name = GoogleStorageManager.PROFILES_BUCKET
                with Image.open(r) as image:
                    now = epoch_time()
                    big_pic_url = GoogleStorageManager.upload_file(
                        get_resized_file(image, (250, 250)),
                        f"{profile.slug}-{now}.png", bucket_name, None,
                    )
                    small_pic_url = GoogleStorageManager.upload_file(
                        get_resized_file(image, (80, 80)),
                        f"{profile.slug}-{now}-small.png", bucket_name, None,
                    )
                    profile.profile_pic_url = big_pic_url
                    profile.profile_pic_url_small = small_pic_url
        except urllib.error.HTTPError as e:
            logger.info("Gravatar server error", code=e.code)
        except urllib.error.URLError as e:
            logger.info("Gravatar URL error", reason=str(e.reason))
        except GoogleCloudError as e:
            logger.warning("Google Storage error during Gravatar import", error=str(e))

    @staticmethod
    def link_provider(user, provider, uid, email):
        """Adds a SocialIdentity to an already-authenticated user. Raises AlreadyLinkedError if (provider, uid) belongs to another user."""
        if SocialIdentity.objects.filter(provider=provider, uid=uid).exclude(user=user).exists():
            raise AlreadyLinkedError()
        SocialIdentity.objects.get_or_create(
            user=user, provider=provider, uid=uid,
            defaults={"email": email},
        )
