
import os.path
from django.utils.translation import ugettext_lazy as _

relative_to_abs_path = lambda *x: os.path.join(os.path.dirname(
                               os.path.realpath(__file__)), *x)

# ------------
# Locale Options
# ------------

# Local time zone for this installation. Choices can be found here:
# http://en.wikipedia.org/wiki/List_of_tz_zones_by_name
# although not all choices may be available on all operating systems.
# On Unix systems, a value of None will cause Django to use the same
# timezone as the operating system.
# If running in a Windows environment this must be set to the same as your
# system time zone.
TIME_ZONE = 'America/Halifax'

# Language code for this installation. All choices can be found here:
# http://www.i18nguy.com/unicode/language-identifiers.html
LANGUAGE_CODE = 'en'

LANGUAGES = (
    ('en', _("English")),
    ('he', _("Hebrew")),
)

SITE_ID = 1

# If you set this to False, Django will make some optimizations so as not
# hereto load the internationalization machinery.
USE_I18N = True

# If you set this to False, Django will not format dates, numbers and
# calendars according to the current locale.
USE_L10N = True

# If you set this to False, Django will not use timezone-aware datetimes.
USE_TZ = True

LOCALE_PATHS = (relative_to_abs_path('../locale'),)

# This needs to be handled better -- hostnames can be arbitrary
# Can we base the default language on the TLD (e.g. `org` or `org.il`)
DOMAIN_LANGUAGES = {
    "https://www.sefaria.org": "english",
    "https://www.sefaria.org.il": "hebrew",
}

# ------------
# Media & Assets
# ------------

# Absolute filesystem path to the directory that will hold user-uploaded files.
# Example: "/home/media/media.lawrence.com/media/"
MEDIA_ROOT = ''

# URL that handles the media served from MEDIA_ROOT. Make sure to use a
# trailing slash.
# Examples: "http://media.lawrence.com/media/", "http://example.com/media/"
MEDIA_URL = ''

# Absolute path to the directory static files should be collected to.
# Don't put anything in this directory yourself; store your static files
# in apps' "static/" subdirectories and in STATICFILES_DIRS.
# Example: "/home/media/media.lawrence.com/static/"
STATIC_ROOT = '/app/static-collected'

# URL prefix for static files.
# Example: "http://media.lawrence.com/static/"
STATIC_URL = '/static/'

# List of finder classes that know how to find static files in
# various locations.
STATICFILES_FINDERS = (
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
    #'django.contrib.staticfiles.finders.DefaultStorageFinder',
)

STATICFILES_DIRS = [
    relative_to_abs_path('../static/'),
]

# ------------
# Templating
# ------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            relative_to_abs_path('../templates/'),
        ],
        'OPTIONS': {
            'context_processors': [
                    # Insert your TEMPLATE_CONTEXT_PROCESSORS here or use this
                    # list if you haven't customized them:
                    "django.contrib.auth.context_processors.auth",
                    "django.template.context_processors.debug",
                    "django.template.context_processors.i18n",
                    "django.template.context_processors.media",
                    "django.template.context_processors.static",
                    "django.template.context_processors.tz",
                    "django.contrib.messages.context_processors.messages",
                    "django.template.context_processors.request",
                    "sefaria.system.context_processors.global_settings",
                    "sefaria.system.context_processors.titles_json",
                    "sefaria.system.context_processors.toc",
                    "sefaria.system.context_processors.terms",
                    "sefaria.system.context_processors.body_flags",
                    "sefaria.system.context_processors.user_and_notifications",
                    "sefaria.system.context_processors.calendar_links",
                    "sefaria.system.context_processors.header_html",
                    "sefaria.system.context_processors.footer_html",
            ],
            'loaders': [
                'django.template.loaders.filesystem.Loader',
                'django.template.loaders.app_directories.Loader',
            ]
        },
    },
]

# ------------
# Django Internals
# ------------
# SEFARIA__APP_ADMINS
WSGI_APPLICATION = 'sefaria.wsgi.application'
ROOT_URLCONF = 'sefaria.urls'
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"
SITE_PACKAGE = "sites.sefaria"

MIDDLEWARE = [
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django_user_agents.middleware.UserAgentMiddleware',
    'sefaria.system.middleware.LocationSettingsMiddleware',
    'sefaria.system.middleware.LanguageCookieMiddleware',
    'sefaria.system.middleware.LanguageSettingsMiddleware',
    'sefaria.system.middleware.ProfileMiddleware',
    'sefaria.system.middleware.CORSDebugMiddleware',
    'sefaria.system.multiserver.coordinator.MultiServerEventListenerMiddleware',
]

INSTALLED_APPS = (
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.sites',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.humanize',
    'emailusernames',
    'reader',
    'sourcesheets',
    'sefaria.gauth',
    'captcha',
    'django.contrib.admin',
    'anymail',
    'webpack_loader',
    'django_user_agents',
    'rest_framework',
    #'easy_timezones'
    # Uncomment the next line to enable admin documentation:
    # 'django.contrib.admindocs',
)

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    )
}

# ------------
# Login & Authentication
# ------------
LOGIN_URL = 'login'
LOGIN_REDIRECT_URL = LOGOUT_REDIRECT_URL = 'table_of_contents'
AUTHENTICATION_BACKENDS = ('emailusernames.backends.EmailAuthBackend')

# OAUTH these fields dont need to be filled in. they are only required for oauth2client to __init__ successfully
GOOGLE_OAUTH2_CLIENT_ID = ""
GOOGLE_OAUTH2_CLIENT_SECRET = ""
# This is the field that is actually used
GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH = "/client-secret/client_secrets.json"

# ------------
# Logging
# ------------
# A sample logging configuration. The only tangible logging
# performed by this configuration is to send an email to
# the site admins on every HTTP 500 error when DEBUG=False.
# See http://docs.djangoproject.com/en/dev/topics/logging for
# more details on how to customize your logging configuration.

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
"""

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '%(asctime)s - %(levelname)s %(name)s: %(message)s'
        },
        'simple': {
            'format': '%(levelname)s [%(name)s] %(message)s'
        },
        'verbose': {
            'format': '%(asctime)s - %(levelname)s: [%(name)s] %(process)d %(thread)d %(message)s'
        },

    },
    'filters': {
        'require_debug_false': {
            '()': 'django.utils.log.RequireDebugFalse'
        },
        'exclude_errors' : {
            '()': 'sefaria.utils.log.ErrorTypeFilter',
            'error_types' : ['BookNameError'],
            'exclude' : True
        },
        'filter_book_name_errors' : {
            '()': 'sefaria.utils.log.ErrorTypeFilter',
            'error_types' : ['BookNameError', 'InputError'],
            'exclude' : False
        }
    },
    'handlers': {
        'default': {
            'level':'WARNING',
            'filters': ['exclude_errors'],
            'class':'logging.handlers.RotatingFileHandler',
            'filename': '/log/sefaria.log',
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 20,
            'formatter':'verbose',
        },
        'request_handler': {
            'level':'WARNING',
            'class':'logging.handlers.RotatingFileHandler',
            'filename': '/log/django_request.log',
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 20,
            'formatter':'standard',
        },
        'console': {
            'level':'INFO',
            'filters': ['exclude_errors'],
            'class': 'logging.StreamHandler',
            'formatter':'simple',
        },
        'book_name_errors': {
            'level':'ERROR',
            'filters': ['filter_book_name_errors'],
            'class':'logging.handlers.RotatingFileHandler',
            'filename': '/log/sefaria_book_errors.log',
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 20,
            'formatter':'verbose',
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
	    'slack_error': {
            'level':'ERROR',
            'class':'sefaria.utils.log.SlackLogHandler',
            'logging_url':'https://hooks.slack.com/services/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',
            'channel': "#error-logs",
            'stack_trace':True,
            'filters': ['require_debug_false', 'exclude_errors'],
            'formatter': 'verbose'
        },
        'cloudflare_response_handler': {
            'level':'INFO',
            'class':'logging.handlers.RotatingFileHandler',
            'filename': '/log/cloudflare.log',
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 20,
            'formatter':'standard',
        }
    },
    'loggers': {
        '': {
            'handlers': ['slack_error', 'default', 'console', 'book_name_errors'],
            'level': 'INFO',
            'propagate': True
        },
        'cloudflare':{
            'handlers': ['cloudflare_response_handler'],
            'level': 'INFO',
            'propagate': True
        },
        'django': {
            'handlers': ['null'],
            'propagate': False,
            'level': 'INFO',
        },
        'django.request': {
            'handlers': ['slack_error', 'request_handler', 'console', 'mail_admins'],
            'level': 'INFO',
            'propagate': True,
        },
    }
}

# ------------
# GeoIP
# ------------
GEOIP_DATABASE = 'data/geoip/GeoLiteCity.dat'
GEOIPV6_DATABASE = 'data/geoip/GeoLiteCityv6.dat'

# ------------
# MultiServer
# ------------
# SEFARIA__MULTISERVER_ENABLED
# SEFARIA__MULTISERVER_REDIS_HOST
MULTISERVER_REDIS_PORT = 6379
MULTISERVER_REDIS_DB = 0
MULTISERVER_REDIS_EVENT_CHANNEL = "msync"   # Message queue on Redis
MULTISERVER_REDIS_CONFIRM_CHANNEL = "mconfirm"   # Message queue on Redis

# ------------
# Data Export
# ------------
SEFARIA_DATA_PATH = '/export' # used for exporting texts
SEFARIA_EXPORT_PATH = '/export'

# ------------
# Google
# ------------
# SEFARIA__GOOGLE_TAG_MANAGER_CODE
# SEFARIA__GOOGLE_ANALYTICS_CODE
# SEFARIA__GOOGLE_MAPS_API_KEY
GOOGLE_APPLICATION_CREDENTIALS_FILEPATH = "/google-cloud-secret/BackupManagerKey.json"

# ------------
# Database - MongoDB
# ------------
# SEFARIA__MONGO_HOST
# SEFARIA__MONGO_DB
# SEFARIA__MONGO_USER
# SEFARIA__MONGO_PASSWORD
MONGO_PORT = 27017
DISABLE_INDEX_SAVE = False

# ------------
# ElasticSearch Search
# ------------
# SEFARIA__SEARCH_HOST
# SEFARIA__SEARCH_USER
# SEFARIA__SEARCH_PASSWORD
SEARCH_HOST = "/api/search"
SEARCH_INDEX_ON_SAVE = True
SEARCH_INDEX_NAME = "sefaria"
SEARCH_INDEX_NAME_TEXT = 'text'  # name of the ElasticSearch index to use
SEARCH_INDEX_NAME_SHEET = 'sheet'
SEARCH_INDEX_NAME_MERGED = 'merged'

# ------------
# NodeJS
# ------------
NODE_TIMEOUT_MONITOR = "/log/forever-timeouts.log"

# ------------
# Partners
# ------------
PARTNER_GROUP_EMAIL_PATTERN_LOOKUP_FILE = "/school-lookup-data/schools.tsv"

# ------------
# Varnish
# ------------
# SEFARIA__VARNISH_ENABLED
# SEFARIA__VARNISH_FRONTEND_URL
# SEFARIA__VARNISH_HOST
# SEFARIA__VARNISH_ESI_ENABLED
VARNISH_FRNT_PORT = 8040
VARNISH_SECRET = "/varnish-secret/varnish-secret"

# ------------
# Epilogue
# ------------
from sefaria.envvar_settings import *
from sefaria.message_settings import *

# Listed after local settings are imported so CACHE can depend on DEBUG
WEBPACK_LOADER = {
    'DEFAULT': {
        'BUNDLE_DIR_NAME': 'bundles/client/',  # must end with slash
        'STATS_FILE': relative_to_abs_path('../node/webpack-stats.client.json'),
        'POLL_INTERVAL': 0.1,
        'TIMEOUT': None,
        'CACHE': not DEBUG,
    },
    'SEFARIA_JS': {
        'BUNDLE_DIR_NAME': 'bundles/sefaria/',  # must end with slash
        'STATS_FILE': relative_to_abs_path('../node/webpack-stats.sefaria.json'),
        'POLL_INTERVAL': 0.1,
        'TIMEOUT': None,
        'CACHE': not DEBUG,
    }

}
DATA_UPLOAD_MAX_MEMORY_SIZE = 24000000
BASE_DIR = os.path.dirname(os.path.dirname(__file__))