# An example of settings needed in a local_settings.py file.
# copy this file to sefaria/local_settings.py and provide local info to run.
from datetime import timedelta
import structlog
import sefaria.system.logging as sefaria_logging
import os

from decoder import private_key_1
from dotenv import load_dotenv
from google_auth_oauthlib.flow import Flow

load_dotenv()

################
# YOU ONLY NEED TO CHANGE "NAME" TO THE PATH OF YOUR SQLITE DATA FILE
# If the db.sqlite file does not exist, simply list a path where it can be created.
# You can set the path to /path/to/Sefaria-Project/db.sqlite, since we git-ignore all sqlite files
# (you do not need to create the empty db.sqlite file, as Django will handle that later)
# ########################################
"""
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql_psycopg2', # Add 'postgresql_psycopg2', 'mysql', 'sqlite3' or 'oracle'.
        'NAME': 'sefaria', # Path to where you would like the database to be created including a file name, or path to an existing database file if using sqlite3.
        'USER': 'sefaria',                      # Not used with sqlite3.
        'PASSWORD': os.getenv("POSTGRESQL_PASSWORD", "POSTGRESQL_PASSWORD not defined!"),                     # Not used with sqlite3.
        'HOST': os.getenv("POSTGRESQL_HOST", "POSTGRESQL_HOST not defined"),                      # Set to empty string for localhost. Not used with sqlite3.
        'PORT': '5432',                      # Set to empty string for default. Not used with sqlite3.
    }
}
"""

PROD_DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv("POSTGRESQL_DATABASE_NAME", "POSTGRESQL_DATABASE_NAME not defined!"),
        'USER': os.getenv("POSTGRESQL_USER", "POSTGRESQL_USER not defined!"),
        'PASSWORD': os.getenv("POSTGRESQL_PASSWORD", "POSTGRESQL_PASSWORD not defined!"),
        'HOST': os.getenv("POSTGRESQL_HOST", "POSTGRESQL_HOST not defined!"),
        # os.getenv("POSTGRESQL_PORT", "POSTGRESQL_PORT not defined!"),
        'PORT': 5432
    }
}
LOCAL_DATABASE={
      'default': {
        'ENGINE': 'django.db.backends.sqlite3', # Add 'postgresql_psycopg2', 'mysql', 'sqlite3' or 'oracle'.
        'NAME': os.getenv("sqlDB"), # Path to where you would like the database to be created including a file name, or path to an existing database file if using sqlite3.
        'USER': '',                      # Not used with sqlite3.
        'PASSWORD': '',                  # Not used with sqlite3.
        'HOST': '',                      # Set to empty string for localhost. Not used with sqlite3.
        'PORT': '',                      # Set to empty string for default. Not used with sqlite3.
    }
}
DATABASES=PROD_DATABASES if os.getenv('isLocale') is None else LOCAL_DATABASE
# Map domain to an interface language that the domain should be pinned to.
# Leave as {} to prevent language pinning, in which case one domain can serve either Hebrew or English
DOMAIN_LANGUAGES = {}


################ These are things you can change! ###########################################################################
SILENCED_SYSTEM_CHECKS = ['']

ADMINS = (
    ('Your Name', 'you@example.com'),
)
PINNED_IPCOUNTRY = "IL"  # change if you want parashat hashavua to be diaspora.

""" These are some examples of possible caches. more here: https://docs.djangoproject.com/en/1.11/topics/cache/"""
CACHES = {
    "shared": {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    },
    "default": {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    },
}
"""
CACHES = {
    'shared': {
        'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
        'LOCATION': '/home/ephraim/www/sefaria/django_cache/',
    },
    'default': {
        'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
        'LOCATION': '/home/ephraim/www/sefaria/django_cache/',
    }
}
"""

SESSION_CACHE_ALIAS = "default"
USER_AGENTS_CACHE = 'default'
SHARED_DATA_CACHE_ALIAS = 'shared'

"""THIS CACHE DEFINITION IS FOR USE WITH NODE AND SERVER SIDE RENDERING"""
PROD_CACHES = {
    "shared": {
        "BACKEND": "django_redis.cache.RedisCache",
        # "redis://127.0.0.1:6379/1", #The URI used to look like this "127.0.0.1:6379:0"
        "LOCATION": os.getenv("REDIS_HOST", "REDIS_HOST not defined"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            # "SERIALIZER": "django_redis.serializers.json.JSONSerializer", #this is the default, we override it to ensure_ascii=False
            "SERIALIZER": "sefaria.system.serializers.JSONSerializer",
        },
        "TIMEOUT": None,
    },
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        # "redis://127.0.0.1:6379/0", #The URI used to look like this "127.0.0.1:6379:0"
        "LOCATION": os.getenv("REDIS_HOST", "REDIS_HOST not defined!"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "PASSWORD": os.getenv("REDIS_PASSWORD", ""),  # Optional
        },
        "TIMEOUT": 60 * 60 * 24 * 30,
    },
}

LOCAL_CACHES = {
    "shared": {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    },
    "default": {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    },
}
CACHES = PROD_CACHES if os.getenv('isLocale') is None else LOCAL_CACHES
SITE_PACKAGE = "sites.sefaria"


################ These are things you DO NOT NEED to touch unless you know what you are doing. ##############################
DEBUG = os.getenv("DEBUG", "False") == "True"
# In Render environment variables:
# DEBUG = False

REMOTE_HOSTS = os.getenv('REMOTE_HOSTS', 'staging.pecha.org').replace(" ", "")

LOCAL_HOSTS = [
    'localhost',
    '127.0.0.1',
    "0.0.0.0",
    '[::1]'
]

ALLOWED_HOSTS = REMOTE_HOSTS.split(',') + LOCAL_HOSTS

OFFLINE = False
DOWN_FOR_MAINTENANCE = False
MAINTENANCE_MESSAGE = ""

# GLOBAL_INTERRUPTING_MESSAGE = None
"""
GLOBAL_INTERRUPTING_MESSAGE = {
    "name":       "messageName",
    "repetition": 1,
    "is_fundraising": True,
    "style":      "modal" # "modal" or "banner"
    "condition":  {"returning_only": True}
}
"""


STRAPI_LOCATION = None
STRAPI_PORT = None
SENTRY_DSN = None
CLIENT_SENTRY_DSN = None


MANAGERS = ADMINS

SECRET_KEY = 'SECRET_KEY'


EMAIL_HOST = 'localhost'
EMAIL_PORT = 1025
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

# Example using anymail, replaces block above
# EMAIL_BACKEND = 'anymail.backends.mandrill.EmailBackend'
# DEFAULT_FROM_EMAIL = "Sefaria <hello@sefaria.org>"
# ANYMAIL = {
#    "MANDRILL_API_KEY": "your api key",
# }

MONGO_HOST = os.getenv("MONGO_HOST", "ENV_NAME not defined")
MONGO_PORT = 27017  # os.getenv("MONGO_PORT", "ENV_NAME not defined")
# Name of the MongoDB database to use.
SEFARIA_DB = os.getenv("MONGO_DATABASE_NAME", "ENV_NAME not defined")
# Leave user and password blank if not using Mongo Auth
SEFARIA_DB_USER = ''
SEFARIA_DB_PASSWORD = ''
APSCHEDULER_NAME = "apscheduler"

# ElasticSearch server
SEARCH_ADMIN = "http://localhost:9200"
# Whether to send texts and source sheet to Search Host for indexing after save
SEARCH_INDEX_ON_SAVE = False
SEARCH_INDEX_NAME_TEXT = 'text'  # name of the ElasticSearch index to use
SEARCH_INDEX_NAME_SHEET = 'sheet'

# Node Server
USE_NODE = False
NODE_HOST = "http://localhost:4040"
NODE_TIMEOUT = 10

SEFARIA_DATA_PATH = '/path/to/your/Sefaria-Data'  # used for Data
SEFARIA_EXPORT_PATH = '/path/to/your/Sefaria-Data/export'  # used for exporting texts


# DafRoulette server
RTC_SERVER = ''  # Root URL/IP of the server

GOOGLE_GTAG = 'your gtag id here'
GOOGLE_TAG_MANAGER_CODE = 'you tag manager code here'

HOTJAR_ID = None

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
FRONT_END_URL = "http://localhost:8000"  # This one wants the http://
VARNISH_ADM_ADDR = "localhost:6082"  # And this one doesn't
VARNISH_HOST = "localhost"
VARNISH_FRNT_PORT = 8040
VARNISH_SECRET = "/etc/varnish/secret"
# Use ESI for user box in header.
USE_VARNISH_ESI = False

# Prevent modification of Index records
DISABLE_INDEX_SAVE = False
DISABLE_INDEX_SAVE = False

# Turns off search autocomplete suggestions, which are reinitialized on every server reload
# which can be annoying for local development.
DISABLE_AUTOCOMPLETER = False

# Turns on loading of machine learning models to run linker
ENABLE_LINKER = False

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
GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH="/etc/secrets/pecha_auth.json" if os.getenv('isLocale') is None else "etc/secrets/pecha_auth.json"


GOOGLE_APPLICATION_CREDENTIALS = {
  "type": "service_account",
  "project_id": os.getenv("project_id"),
  "private_key_id": os.getenv("private_key_id"),
  "private_key": private_key_1,
  "client_email": os.getenv("client_email"),
  "client_id": os.getenv("client_id"),
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/pecha-15%40pecha-418412.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}


GEOIP_DATABASE = 'data/geoip/GeoLiteCity.dat'
GEOIPV6_DATABASE = 'data/geoip/GeoLiteCityv6.dat'

RAW_REF_MODEL_BY_LANG_FILEPATH = {
    "en": None,
    "he": None
}

RAW_REF_PART_MODEL_BY_LANG_FILEPATH = {
    "en": None,
    "he": None
}

# Simple JWT
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=90),
    'ROTATE_REFRESH_TOKENS': True,
    'SIGNING_KEY': 'a signing key: at least 256 bits',
}

# Key which identifies the Sefaria app as opposed to a user
# using our API outside of the app. Mainly for registration
MOBILE_APP_KEY = "MOBILE_APP_KEY"

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

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_logger_name,
        sefaria_logging.add_severity,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        sefaria_logging.log_exception_info,
        structlog.processors.UnicodeDecoder(),
        sefaria_logging.decompose_request_info,
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    context_class=structlog.threadlocal.wrap_dict(dict),
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)