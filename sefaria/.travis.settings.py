# local settings used by travis CI builds
import os
import os.path
relative_to_abs_path = lambda *x: os.path.join(os.path.dirname(
                               os.path.realpath(__file__)), *x)

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
DEBUG = False
OFFLINE = False
DOWN_FOR_MAINTENANCE = False
MAINTENANCE_MESSAGE = ""
GLOBAL_WARNING = False
GLOBAL_WARNING_MESSAGE = ""
GLOBAL_INTERRUPTING_MESSAGE = None
HOME_DIR = os.environ["TRAVIS_BUILD_DIR"]

ADMINS = (
     ('Your Name', 'you@example.com'),
)

# Map domain to an interface language that the domain should be pinned to
DOMAIN_LANGUAGES = {}

# Map domains which should be allowed for language directs, same shape as DOMAIN_LANGUAGES.
# Set if you need to redirects to behave differently.
REDIRECTABLE_DOMAIN_LANGUAGES = DOMAIN_LANGUAGES

MANAGERS = ADMINS

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3', # Add 'postgresql_psycopg2', 'mysql', 'sqlite3' or 'oracle'.
        'NAME': '{}/data/db.sqlite'.format(HOME_DIR), # Or path to database file if using sqlite3.
        'USER': '',                      # Not used with sqlite3.
        'PASSWORD': '',                  # Not used with sqlite3.
        'HOST': '',                      # Set to empty string for localhost. Not used with sqlite3.
        'PORT': '',                      # Set to empty string for default. Not used with sqlite3.
    }
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
        'LOCATION': '{}/data/django_cache/'.format(HOME_DIR),  # can be any accessible path, not necessarily a path inside sefaria eg. /home/user/data/django_cache.
    }
}

SECRET_KEY = 'insert your long random secret key here !'


EMAIL_HOST = 'localhost'
EMAIL_PORT = 1025
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

MONGO_HOST = "localhost"
MONGO_PORT = 27017
# Name of the MongoDB database to use.
SEFARIA_DB = 'sefaria'
# Leave user and password blank if not using Mongo Auth
SEFARIA_DB_USER = ''
SEFARIA_DB_PASSWORD = ''

# ElasticSearch server
SEARCH_HOST = "https://www.sefaria.org/api/search"
SEARCH_ADMIN = "http://localhost:9200"
SEARCH_ADMIN_USER = None  # if not None, use these credentials to access SEARCH_ADMIN
SEARCH_ADMIN_PW = None
SEARCH_ADMIN_K8S = "http://localhost:9200"
SEARCH_INDEX_ON_SAVE = False  # Whether to send texts and source sheet to Search Host for indexing after save
SEARCH_INDEX_NAME = 'sefaria'
SEARCH_INDEX_NAME_TEXT = 'text'  # name of the ElasticSearch index to use
SEARCH_INDEX_NAME_SHEET = 'sheet'
SEARCH_INDEX_NAME_MERGED = 'merged'

# Node Server
USE_NODE = False
NODE_HOST = "http://localhost:4040"

SEFARIA_DATA_PATH = '{}/data'.format(HOME_DIR)  # used for Data
SEFARIA_EXPORT_PATH = '/path/to/your/Sefaria-Data/export'  # used for exporting texts

GOOGLE_ANALYTICS_CODE = 'your google analytics code'
GOOGLE_MAPS_API_KEY = None
MIXPANEL_CODE = 'you mixpanel code here'

# Integration with a NationBuilder list
NATIONBUILDER = False
NATIONBUILDER_SLUG = ""
NATIONBUILDER_TOKEN = ""
NATIONBUILDER_CLIENT_ID = ""
NATIONBUILDER_CLIENT_SECRET = ""

# Issue bans to Varnish on update.
USE_VARNISH = False
FRONT_END_URL = "http://localhost:8000"  # This one wants the http://
VARNISH_ADDR = "localhost:6082"  # And this one doesn't
VARNISH_SECRET = "/etc/varnish/secret"
# Use ESI for user box in header.
USE_VARNISH_ESI = False

# Prevent modification of Index records
DISABLE_INDEX_SAVE = False
RECAPTCHA_PUBLIC_KEY = "Dummy"
RECAPTCHA_PRIVATE_KEY = "Dummy"

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
GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH = "sefaria/gauth/client_secrets.json"

GEOIP_DATABASE = 'data/geoip/GeoLiteCity.dat'
GEOIPV6_DATABASE = 'data/geoip/GeoLiteCityv6.dat'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '%(asctime)s - %(levelname)s %(name)s: %(message)s'
        },
        'simple': {
            'format': '%(levelname)s %(message)s'
        },
        'verbose': {
            'format': '%(asctime)s - %(levelname)s: [%(name)s] %(process)d %(thread)d %(message)s'
        },

    },
    'filters': {
        'require_debug_false': {
            '()': 'django.utils.log.RequireDebugFalse'
        },
    },
    'handlers': {
        'default': {
            'level':'INFO',
            'class':'logging.handlers.RotatingFileHandler',
            'filename': relative_to_abs_path('../log/sefaria.log'),
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 5,
            'formatter':'standard',
        },
        'custom_debug' :{
            'level':'DEBUG',
            'class':'logging.handlers.RotatingFileHandler',
            'filename': relative_to_abs_path('../log/debug.log'),
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 5,
            'formatter':'verbose',
            'filters': [],
        },
        'console':{
            'level':'INFO',
            'class':'logging.StreamHandler',
            'formatter': 'simple',
            'filters': [],
        },

        'null': {
            'level':'INFO',
            'class':'logging.NullHandler',
        },

        'mail_admins': {
            'level': 'ERROR',
            'filters': ['require_debug_false'],
            'class': 'django.utils.log.AdminEmailHandler'
        },
        'request_handler': {
            'level':'INFO',
            'class':'logging.handlers.RotatingFileHandler',
            'filename': relative_to_abs_path('../log/django_request.log'),
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 20,
            'formatter':'standard',
        }
    },
    'loggers': {
        '': {
            'handlers': ['default', 'console', 'custom_debug'],
            'level': 'DEBUG',
            'propagate': True
        },
        'django': {
            'handlers': ['null'],
            'propagate': False,
            'level': 'INFO',
        },
        'django.request': {
            'handlers': ['mail_admins', 'request_handler'],
            'level': 'INFO',
            'propagate': True,
        },
    }
}

SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']

