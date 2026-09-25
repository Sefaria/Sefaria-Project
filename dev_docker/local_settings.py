# Local settings for running the site with the root docker-compose.yml.
# dev_docker/setup_local.sh copies this to sefaria/local_settings.py.
# Hostnames below are the compose service names (db, postgres).

from sefaria.local_settings_example import *

SECRET_KEY = "local-dev-only-not-secret"
SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error', 'django_recaptcha.recaptcha_test_key_error']

MONGO_HOST = "db"
MONGO_PORT = 27017
SEFARIA_DB = "sefaria"

DATABASES["default"] = {
    "ENGINE": "django.db.backends.postgresql",
    "NAME": "sefaria",
    "USER": "admin",
    "PASSWORD": "admin",
    "HOST": "postgres",
    "PORT": "5432",
}
