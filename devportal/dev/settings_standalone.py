"""Standalone settings: the portal on SQLite, with no MongoDB, Redis or library.

    python manage.py migrate --settings=devportal.dev.settings_standalone
    python manage.py runserver --settings=devportal.dev.settings_standalone

See devportal/dev/README.md. Nothing here is used in a deployed environment.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # the repository root
RUN_DIR = BASE_DIR / ".devportal-run"

SECRET_KEY = "devportal-standalone-not-secret"  # noqa: S105 - local development only
DEBUG = os.environ.get("DEVPORTAL_DEBUG", "1") == "1"
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]", "developers.localhost", "testserver"]

INSTALLED_APPS = [
    "adminsortable",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "devportal.apps.DevportalConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    # There is no ModuleMiddleware here, so it treats every request as a portal request except
    # /api/, /static/ and /admin/ (devportal/middleware.py).
    "devportal.middleware.DevportalMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "devportal.dev.urls_standalone"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            # Only the admin uses these; portal views render without a request (PLAN.md §2.2, Q4).
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("DEVPORTAL_SQLITE_PATH", str(RUN_DIR / "standalone.sqlite3")),
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.AutoField"  # as in sefaria/settings.py; devportal sets its own

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

USE_TZ = True
TIME_ZONE = "UTC"
LANGUAGE_CODE = "en"
USE_I18N = True

STATIC_URL = "/static/"
STATIC_ROOT = str(RUN_DIR / "static-collected")
STATICFILES_DIRS = [str(BASE_DIR / "static")] if (BASE_DIR / "static").is_dir() else []
MEDIA_URL = "/media/"
MEDIA_ROOT = str(RUN_DIR / "media")

# The DEVPORTAL_* settings, with the same defaults as sefaria/settings.py (contract C1).
DEVPORTAL_API_ORIGIN = "https://www.sefaria.org"
DEVPORTAL_GA4 = {}
DEVPORTAL_DEMO_API_KEY = ""
DEVPORTAL_MEDIA_BUCKET = ""
DEVPORTAL_ALLOW_INDEXING = False
DEVPORTAL_ALLOW_README_IMAGES = True
DEVPORTAL_AUTO_SEED = os.environ.get("DEVPORTAL_AUTO_SEED", "1") == "1"
DEVPORTAL_CUTOVER_DONE = False
DEVPORTAL_TRUST_GATEWAY_CLIENT_IP = False  # no gateway in front of the standalone server
DEVPORTAL_VITE_DEV_SERVER = os.environ.get("DEVPORTAL_VITE_DEV_SERVER", "")

# Standalone only: the JSON file that answers GET /api/powered-by (the gallery's API snapshot).
DEVPORTAL_STANDALONE_POWERED_BY_FIXTURE = os.environ.get(
    "DEVPORTAL_STANDALONE_POWERED_BY_FIXTURE",
    str(BASE_DIR / "devportal-ui" / "src" / "gallery" / "lib" / "__fixtures__" / "projects.json"),
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {"devportal": {"handlers": ["console"], "level": "INFO"}},
}

try:
    RUN_DIR.mkdir(exist_ok=True)
except OSError:  # a read-only checkout; set DEVPORTAL_SQLITE_PATH to a writable file
    pass
