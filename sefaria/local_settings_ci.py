
from datetime import timedelta
import structlog
import os
import json

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'sefaria_auth',
        'USER': 'sefaria',
        'PASSWORD': '',
        'HOST': 'localhost',
        'PORT': '',
    }
}


# Map domain to an interface language that the domain should be pinned to.
# Leave as {} to prevent language pinning, in which case one domain can serve either Hebrew or English
DOMAIN_LANGUAGES = {
    "http://hebrew.example.org": "hebrew",
    "http://english.example.org": "english",
}
DOMAIN_MODULES = {
    "en": {
        "library": "http://localhost:8000",
        "voices": "http://voices.localhost:8000",
    },
    "he": {
        "library": "http://localhost:8000",
        "voices": "http://voices.localhost:8000",
    }
}
ALLOWED_HOSTS = ['127.0.0.1', "0.0.0.0", '[::1]', "localhost", "voices.localhost"]
#SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']

ADMINS = (
     ('Your Name', 'you@example.com'),
)
MANAGERS = ADMINS

PINNED_IPCOUNTRY = "IL" #change if you want parashat hashavua to be diaspora.

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    }
}

SITE_PACKAGE = "sites.sefaria"

DEBUG = True
OFFLINE = False
DOWN_FOR_MAINTENANCE = False
MAINTENANCE_MESSAGE = ""
GLOBAL_WARNING = False
GLOBAL_WARNING_MESSAGE = ""


SECRET_KEY = 'insert your long random secret key here !'


EMAIL_HOST = 'localhost'
EMAIL_PORT = 1025
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

MONGO_HOST = "localhost"
MONGO_PORT = 27017

# Name of the MongoDB database to use.
SEFARIA_DB = os.getenv('MONGO_DB_NAME')

# Leave user and password blank if not using Mongo Auth
SEFARIA_DB_USER = ''
SEFARIA_DB_PASSWORD = ''
APSCHEDULER_NAME = "apscheduler"

# ElasticSearch server
SEARCH_URL = "http://localhost:9200"
SEARCH_INDEX_ON_SAVE = False  # Whether to send texts and source sheet to Search Host for indexing after save
SEARCH_INDEX_NAME_TEXT = 'text'  # name of the ElasticSearch index to use
SEARCH_INDEX_NAME_SHEET = 'sheet'

# Node Server
USE_NODE = False
NODE_HOST = "http://localhost:4040"
NODE_TIMEOUT = 10
# NODE_TIMEOUT_MONITOR = relative_to_abs_path("../log/forever/timeouts")

SEFARIA_DATA_PATH = '/path/to/your/Sefaria-Data' # used for Data
SEFARIA_EXPORT_PATH = '/path/to/your/Sefaria-Data/export' # used for exporting texts


GOOGLE_TAG_MANAGER_CODE = 'you tag manager code here'

# Determine which CRM connection implementations to use
CRM_TYPE = "NONE"  # "SALESFORCE" || "NATIONBUILDER" || "NONE"

# Integration with a NationBuilder list
NATIONBUILDER_SLUG = ""
NATIONBUILDER_TOKEN = ""
NATIONBUILDER_CLIENT_ID = ""
NATIONBUILDER_CLIENT_SECRET = ""

# Integration with Salesforce
SALESFORCE_BASE_URL = ""
SALESFORCE_CLIENT_ID = ""
SALESFORCE_CLIENT_SECRET = ""

# Issue bans to Varnish on update.
USE_VARNISH = False
FRONT_END_URL = "http://localhost:8000"      # This one wants the http://
VARNISH_ADM_ADDR = "localhost:6082"          # And this one doesn't
VARNISH_HOST = "localhost"
VARNISH_FRNT_PORT = 8040
VARNISH_SECRET = "/etc/varnish/secret"
# Use ESI for user box in header.
USE_VARNISH_ESI = False

# Prevent modification of Index records
DISABLE_INDEX_SAVE = False

# Caching with Cloudflare
CLOUDFLARE_ZONE = ""
CLOUDFLARE_EMAIL = ""
CLOUDFLARE_TOKEN = ""

# Multiserver
MULTISERVER_ENABLED = False
MULTISERVER_REDIS_SERVER = "127.0.0.1"
MULTISERVER_REDIS_PORT = 6379
MULTISERVER_REDIS_DB = 0
MULTISERVER_REDIS_EVENT_CHANNEL = "msync"   # Message queue on Redis
MULTISERVER_REDIS_CONFIRM_CHANNEL = "mconfirm"   # Message queue on Redis

# OAUTH these fields dont need to be filled in. they are only required for oauth2client to __init__ successfully
GOOGLE_OAUTH2_CLIENT_ID = ""
GOOGLE_OAUTH2_CLIENT_SECRET = ""
# This is the field that is actually used
GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH = ""

GOOGLE_APPLICATION_CREDENTIALS_FILEPATH = ""

GEOIP_DATABASE = 'data/geoip/GeoLiteCity.dat'
GEOIPV6_DATABASE = 'data/geoip/GeoLiteCityv6.dat'

PARTNER_GROUP_EMAIL_PATTERN_LOOKUP_FILE = None

# Simple JWT
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=90),
    'ROTATE_REFRESH_TOKENS': True,
    'SIGNING_KEY': 'a signing key: at least 256 bits',
}

# Celery
REDIS_PORT = 26379
REDIS_PASSWORD = None
CELERY_REDIS_BROKER_DB_NUM = 0
CELERY_REDIS_RESULT_BACKEND_DB_NUM = 1
CELERY_QUEUES = {}
# Either define SENTINEL_HEADLESS_URL if using sentinel or REDIS_URL for a simple redis instance
SENTINEL_HEADLESS_URL = None
SENTINEL_TRANSPORT_OPTS = {}
SENTINEL_PASSWORD = None
REDIS_URL = "redis://127.0.0.1"

# Key which identifies the Sefaria app as opposed to a user
# using our API outside of the app. Mainly for registration
MOBILE_APP_KEY = "MOBILE_APP_KEY"

ENABLE_LINKER = False
GPU_SERVER_URL = "http://localhost:5000"

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        "json_formatter": {
            "()": structlog.stdlib.ProcessorFormatter,
            "processor": structlog.processors.JSONRenderer(),
        },
    },
    'handlers': {
        'default': {
            "class": "logging.StreamHandler",
            "formatter": "json_formatter",
        },
    },
    'loggers': {
        '': {
            'handlers': ['default'],
            'propagate': False,
        },
        'django': {
            'handlers': ['default'],
            'propagate': False,
        },
        'django.request': {
            'handlers': ['default'],
            'propagate': False,
        },
    }
}

STRAPI_LOCATION = None
STRAPI_PORT = None

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.ExceptionPrettyPrinter(),
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    context_class=structlog.threadlocal.wrap_dict(dict),
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

WEBHOOK_USERNAME = os.getenv("WEBHOOK_USERNAME")
WEBHOOK_PASSWORD = os.getenv("WEBHOOK_PASSWORD")
