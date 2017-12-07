# An example of settings needed in a local_settings.py file which is ignored by git.
# copy this file to sefaria/local_settings.py and provide local info to run.
import os.path
relative_to_abs_path = lambda *x: os.path.join(os.path.dirname(
                               os.path.realpath(__file__)), *x)

#These are things you need to change!

################ YOU ONLY NEED TO CHANGE "NAME" TO THE PATH OF YOUR SQLITE DATA FILE ########################################
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3', # Add 'postgresql_psycopg2', 'mysql', 'sqlite3' or 'oracle'.
        'NAME': '/path/to/your/sefaria/data/db.sqlite', # Or path to database file if using sqlite3.
        'USER': '',                      # Not used with sqlite3.
        'PASSWORD': '',                  # Not used with sqlite3.
        'HOST': '',                      # Set to empty string for localhost. Not used with sqlite3.
        'PORT': '',                      # Set to empty string for default. Not used with sqlite3.
    }
}

################ These are things you can change! ###########################################################################
ADMINS = (
     ('Your Name', 'you@example.com'),
)
PINNED_IPCOUNTRY = "IL" #change if you want parashat hashavua to be diaspora.

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    }
}
""" These are some other examples of possible caches. more here: https://django.readthedocs.io/en/1.4/topics/cache.html"""
"""CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
        'LOCATION': '/home/ephraim/www/sefaria/django_cache/',
    }
}

CACHES = {
    "default": {
        "BACKEND": "redis_cache.cache.RedisCache",
        "LOCATION": "127.0.0.1:6379:0",
        "OPTIONS": {
            "CLIENT_CLASS": "redis_cache.client.DefaultClient",
            #"PASSWORD": "secretpassword", # Optional
        },
        "TIMEOUT": 60 * 60 * 24 * 30,
    }
}"""








################ These are things you DO NOT NEED to touch unless you know what you are doing. ##############################
DEBUG = True
TEMPLATE_DEBUG = DEBUG
OFFLINE = False
DOWN_FOR_MAINTENANCE = False
MAINTENANCE_MESSAGE = ""
GLOBAL_WARNING = False
GLOBAL_WARNING_MESSAGE = ""

GLOBAL_INTERRUPTING_MESSAGE = None
"""
GLOBAL_INTERRUPTING_MESSAGE = {
    "name":       "messageName",
    "repetition": 1,
    "condition":  {"returning_only": True} 
}
"""


MANAGERS = ADMINS

SECRET_KEY = 'insert your long random secret key here !'

STATICFILES_DIRS = (
    relative_to_abs_path('../static/'),
    # Put strings here, like "/home/html/static" or "C:/www/django/static".
    # Always use forward slashes, even on Windows.
    # Don't forget to use absolute paths, not relative paths.
)

TEMPLATE_DIRS = (
    relative_to_abs_path('../templates/'),
    # Put strings here, like "/home/html/django_templates" or "C:/www/django/templates".
    # Always use forward slashes, even on Windows.
    # Don't forget to use absolute paths, not relative paths.
)

EMAIL_HOST = 'localhost'
EMAIL_PORT = 1025
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

# Example using anymail, replaces block above
# EMAIL_BACKEND = 'anymail.backends.mandrill.EmailBackend'
# DEFAULT_FROM_EMAIL = "Sefaria <hello@sefaria.org>"
# ANYMAIL = {
#    "MANDRILL_API_KEY": "your api key",
# }

MONGO_HOST = "localhost"
# Name of the MongoDB database to use.
SEFARIA_DB = 'sefaria'
# Leave user and password blank if not using Mongo Auth
SEFARIA_DB_USER = ''
SEFARIA_DB_PASSWORD = ''

# ElasticSearch server
SEARCH_HOST = "http://localhost:9200"
SEARCH_ADMIN = "http://localhost:9200"
SEARCH_INDEX_ON_SAVE = False  # Whether to send texts and source sheet to Search Host for indexing after save
SEARCH_INDEX_NAME = 'sefaria'  # name of the ElasticSearch index to use

# Node Server
USE_NODE = False
NODE_HOST = "http://localhost:4040"
NODE_TIMEOUT = 10
NODE_TIMEOUT_MONITOR = relative_to_abs_path("../log/forever/timeouts")

SEFARIA_DATA_PATH = '/path/to/your/Sefaria-Data' # used for Data
SEFARIA_EXPORT_PATH = '/path/to/your/Sefaria-Data/export' # used for exporting texts

# Map domain to an interface language that the domain should be pinned to. 
# Leave as {} to prevent language pinning, in which case one domain can serve either Hebrew or English
DOMAIN_LANGUAGES = {
    "http://hebrew.example.org": "hebrew",
    "http://english.example.org": "english",
}

GOOGLE_ANALYTICS_CODE = 'your google analytics code'
MIXPANEL_CODE = 'you mixpanel code here'

AWS_ACCESS_KEY = None
AWS_SECRET_KEY = None
S3_BUCKET = "bucket-name"

# Integration with a NationBuilder list
NATIONBUILDER = False
NATIONBUILDER_SLUG = ""
NATIONBUILDER_TOKEN = ""
NATIONBUILDER_CLIENT_ID = ""
NATIONBUILDER_CLIENT_SECRET = ""

# Issue bans to Varnish on update.
USE_VARNISH = False
FRONT_END_URL = "http://localhost:8000"  # This one wants the http://
VARNISH_ADM_ADDR = "localhost:6082" # And this one doesn't
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

""" to use logging, in any module:
# import the logging library
import logging

# Get an instance of a logger
logger = logging.getLogger(__name__)

#log stuff
logger.critical()
logger.error()
logger.warning()
logger.info()
logger.debug()

if you are logging to a file, make sure the directory exists and is writeable by the server.
"""

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
        'require_debug_true': {
            '()': 'sefaria.utils.log.RequireDebugTrue'
        }
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
            'filters': ['require_debug_true'],
        },
        'console':{
            'level':'INFO',
            'class':'logging.StreamHandler',
            'formatter': 'simple',
            'filters': ['require_debug_true'],
        },

        'null': {
            'level':'INFO',
            'class':'django.utils.log.NullHandler',
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
