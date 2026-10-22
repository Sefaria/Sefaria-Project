"""
Django settings for the local API-keys stack: the worktree's normal settings (including whatever
sefaria/local_settings.py provides for Mongo and the rest) with the auth database, hosts, cookies, mail and
developer flags of e2e-tests/api-keys/CONTRACT.md on top.

  PYTHONPATH=auth-service/dev/local-stack DJANGO_SETTINGS_MODULE=django_settings python manage.py ...
  pytest --ds=django_settings  (same PYTHONPATH)
"""
import os

from sefaria.settings import *  # noqa: F401,F403


def _flag(name, default):
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("APIKEYS_STACK_PG_DB", "sefaria_auth"),
        "USER": "postgres",
        "PASSWORD": "postgres",
        "HOST": "127.0.0.1",
        "PORT": os.environ.get("APIKEYS_STACK_PG_PORT", "55432"),
    }
}

GATEWAY_HOSTS = ("www", "voices", "direct", "flagoff")
GATEWAY_PORTS = (10080, 10081)

ALLOWED_HOSTS = list(globals().get("ALLOWED_HOSTS", [])) + [".gateway.test"]
CSRF_TRUSTED_ORIGINS = list(globals().get("CSRF_TRUSTED_ORIGINS", [])) + [
    "http://%s.gateway.test:%d" % (host, port) for host in GATEWAY_HOSTS for port in GATEWAY_PORTS
]

SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SESSION_COOKIE_DOMAIN = None
CSRF_COOKIE_DOMAIN = None

DEVELOPER_SETTINGS_ENABLED = _flag("DEVELOPER_SETTINGS_ENABLED", "true")
DEVELOPER_SETTINGS_MOCKS = _flag("DEVELOPER_SETTINGS_MOCKS", "false")

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "127.0.0.1"
EMAIL_PORT = int(os.environ.get("APIKEYS_STACK_SMTP_PORT", "11025"))
EMAIL_USE_TLS = False
EMAIL_USE_SSL = False
EMAIL_HOST_USER = ""
EMAIL_HOST_PASSWORD = ""

# The shared data cache (table of contents, topics) is per process instead of a no-op, so a page view does not
# rebuild it every time; "default" (allauth rate limits, sessions) keeps whatever local_settings chose.
CACHES = dict(globals().get("CACHES", {}))
CACHES["shared"] = {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "apikeys-stack-shared",
                    "TIMEOUT": None}

DOMAIN_MODULES = {
    lang: {"library": "http://www.gateway.test:10080", "voices": "http://voices.gateway.test:10080"}
    for lang in ("en", "he")
}
