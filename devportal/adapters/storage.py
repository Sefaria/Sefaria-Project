"""Where uploaded and mirrored images are stored (PLAN.md §2.11, §7.3).

Two backends with the same interface:

- `GCSStorage`: Google Cloud Storage through `sefaria.google_storage_manager.GoogleStorageManager`
  (imported lazily, inside the method, so `devportal` stays importable without the Sefaria stack),
  in `DEVPORTAL_MEDIA_BUCKET`, or `SITE_SETTINGS["TOPICS_BUCKET"]` when that is empty (I-11).
- `LocalStorage`: files under `MEDIA_ROOT`, served at `MEDIA_URL`. Used when Google Cloud
  credentials are not configured (local development, the standalone server, tests).

`get_storage()` picks one; tests install a fake with `set_storage()`.
"""

import logging
from pathlib import Path

from django.conf import settings

logger = logging.getLogger("devportal")

PREFIX = "developers/"


class LocalStorage:
    name = "local"

    def __init__(self, root=None, base_url=None):
        self.root = Path(root or getattr(settings, "MEDIA_ROOT", "") or "media")
        self.base_url = base_url if base_url is not None else (getattr(settings, "MEDIA_URL", "/media/") or "/media/")

    def url_for(self, name):
        return self.base_url.rstrip("/") + "/" + name

    def save(self, name, data, content_type):  # noqa: ARG002 - same signature as GCSStorage
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return self.url_for(name)

    def exists(self, name):
        return (self.root / name).exists()

    def owns_url(self, url):
        return bool(url) and url.startswith(self.base_url.rstrip("/") + "/" + PREFIX)


class GCSStorage:
    name = "gcs"
    BASE_URL = "https://storage.googleapis.com"

    def __init__(self, bucket):
        self.bucket = bucket

    def _manager(self):
        from sefaria.google_storage_manager import GoogleStorageManager  # lazy: needs the Sefaria stack

        return GoogleStorageManager

    def url_for(self, name):
        return f"{self.BASE_URL}/{self.bucket}/{name}"

    def save(self, name, data, content_type):  # noqa: ARG002 - GCS infers the type from the name
        from io import BytesIO

        return self._manager().upload_file(BytesIO(data), name, self.bucket)

    def exists(self, name):
        return self._manager().file_exists(name, self.bucket)

    def owns_url(self, url):
        return bool(url) and url.startswith(f"{self.BASE_URL}/{self.bucket}/{PREFIX}")


_override = None


def set_storage(storage):
    """Install a storage backend (tests). `None` restores automatic selection."""
    global _override  # noqa: PLW0603
    _override = storage


def media_bucket():
    bucket = getattr(settings, "DEVPORTAL_MEDIA_BUCKET", "")
    if bucket:
        return bucket
    if not hasattr(settings, "SITE_PACKAGE"):  # not the Sefaria settings (e.g. the standalone mode)
        return ""
    try:
        from sefaria.site.site_settings import SITE_SETTINGS  # lazy: needs the Sefaria stack

        return SITE_SETTINGS.get("TOPICS_BUCKET", "")
    except Exception:  # noqa: BLE001 - standalone mode has no Sefaria settings
        return ""


def gcs_configured():
    credentials = getattr(settings, "GOOGLE_APPLICATION_CREDENTIALS_FILEPATH", "")
    return bool(credentials) and Path(credentials).is_file() and bool(media_bucket())


def get_storage():
    if _override is not None:
        return _override
    if gcs_configured():
        return GCSStorage(media_bucket())
    return LocalStorage()


def is_media_url(url):
    """True when `url` already points into the portal's media store (either backend)."""
    storage = get_storage()
    if storage.owns_url(url):
        return True
    bucket = media_bucket()
    return bool(bucket) and url.startswith(f"{GCSStorage.BASE_URL}/{bucket}/{PREFIX}")
