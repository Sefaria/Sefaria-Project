import os

from django.core.exceptions import ImproperlyConfigured

SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']


def resolve_allowed_hosts(debug):
    """
    ALLOWED_HOSTS from the comma-separated ALLOWED_HOSTS env var, e.g. "www.sefaria.org,.sefaria.org.il"
    (a leading dot matches subdomains). With no hosts listed, startup fails unless both Django's effective
    DEBUG (`debug`, passed in by settings.py) is on and the explicit ALLOWED_HOSTS_ALLOW_ALL opt-in is set.
    DEBUG alone is not enough: an image without local_settings.py inherits DEBUG = True from the example file.
    """
    hosts = [host.strip() for host in os.getenv("ALLOWED_HOSTS", "").split(",") if host.strip()]
    if hosts:
        return hosts
    if debug and os.getenv("ALLOWED_HOSTS_ALLOW_ALL", "").strip().lower() in ("1", "true", "yes"):
        return ['*']
    raise ImproperlyConfigured("ALLOWED_HOSTS env var must list the served hostnames")


CSRF_TRUSTED_ORIGINS = ['https://*.sefaria.org']

MONGO_HOST = os.getenv("MONGO_HOST", "localhost")
MONGO_PORT = int(os.getenv("MONGO_PORT", 27017))
SEFARIA_DB = os.getenv('MONGO_DB_NAME')
SEFARIA_DB_USER = os.getenv('MONGO_DB_USER', '')
SEFARIA_DB_PASSWORD = os.getenv('MONGO_DB_PASSWORD', '')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('POSTGRES_DB', 'sefaria_auth'),
        'USER': os.getenv('POSTGRES_USER', 'admin'),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'admin'),
        'HOST': os.getenv('POSTGRES_HOST', 'localhost'),
        'PORT': os.getenv('POSTGRES_PORT', '5432'),
    },
    'vector_db': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('PGVECTOR_DB', 'pgvector'),
        'USER': os.getenv('PGVECTOR_USER', os.getenv('POSTGRES_USER', 'admin')),
        'PASSWORD': os.getenv('PGVECTOR_PASSWORD', os.getenv('POSTGRES_PASSWORD', 'admin')),
        'HOST': os.getenv('PGVECTOR_HOST', 'localhost'),
        'PORT': os.getenv('PGVECTOR_DB_PORT', '5432'),
    },
}

ADMIN_PATH = 'admin'

WEBHOOK_USERNAME = os.getenv("WEBHOOK_USERNAME")
WEBHOOK_PASSWORD = os.getenv("WEBHOOK_PASSWORD")

POWERED_BY_FORMSTACK_HMAC_SECRET = os.getenv("POWERED_BY_FORMSTACK_HMAC_SECRET")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SEMANTIC_SEARCH_API_TOKEN = os.getenv("SEMANTIC_SEARCH_API_TOKEN", "")
