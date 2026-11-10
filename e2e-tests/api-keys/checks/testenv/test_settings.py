# Test settings for the API-key checks. Loaded through PYTHONPATH=<this dir> and DJANGO_SETTINGS_MODULE=test_settings
# by run-checks.sh; nothing outside this directory is read or written.
import copy
import os

from sefaria.settings import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("APIKEYS_CHECKS_PG_DB", "sefaria_auth"),
        "USER": "postgres",
        "PASSWORD": os.environ.get("APIKEYS_CHECKS_PG_PASSWORD", "pg"),
        "HOST": "127.0.0.1",
        "PORT": os.environ.get("APIKEYS_CHECKS_PG_PORT", "55442"),
    },
}
SILENCED_SYSTEM_CHECKS = ["django_recaptcha.recaptcha_test_key_error"]

# A bare checkout has no webpack build; pages that render a bundle fail without a stats file.
WEBPACK_LOADER = copy.deepcopy(WEBPACK_LOADER)  # noqa: F405
_STUB_STATS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webpack-stats.stub.json")
for _loader_config in WEBPACK_LOADER.values():  # noqa: F405
    _loader_config["STATS_FILE"] = _STUB_STATS
