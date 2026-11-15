"""Django settings for running a checkout's migrations against a local or port-forwarded Postgres.

The checkout's own settings (sefaria.settings and its local_settings.py) with the database taken from RELEASE_PG_*:

  PYTHONPATH=<this directory> DJANGO_SETTINGS_MODULE=release_settings RELEASE_PG_PORT=56441 python manage.py migrate

Used by rehearse-migration.sh and the kind test suite, never by a deployed environment.
"""

import os

from sefaria.settings import *  # noqa: F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("RELEASE_PG_DB", "sefaria_auth"),
        "USER": os.environ.get("RELEASE_PG_USER", "postgres"),
        "PASSWORD": os.environ.get("RELEASE_PG_PASSWORD", "postgres"),
        "HOST": os.environ.get("RELEASE_PG_HOST", "127.0.0.1"),
        "PORT": os.environ["RELEASE_PG_PORT"],
    }
}

# The test reCAPTCHA keys of local_settings_example.py fail this check, which would stop manage.py.
SILENCED_SYSTEM_CHECKS = list(globals().get("SILENCED_SYSTEM_CHECKS", [])) + [
    "django_recaptcha.recaptcha_test_key_error"
]
