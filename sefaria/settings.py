# Django settings for sefaria project.
import os
import os.path
from django.utils.translation import ugettext_lazy as _
from dotenv import load_dotenv

load_dotenv()

relative_to_abs_path = lambda *x: os.path.join(os.path.dirname(
                               os.path.realpath(__file__)), *x)
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
    ('bo', _("Tibetan")),
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

# Make this unique, and don't share it with anybody.
SECRET_KEY = ''

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
                    "sefaria.system.context_processors.cache_timestamp",
                    "sefaria.system.context_processors.large_data",
                    "sefaria.system.context_processors.body_flags",
                    "sefaria.system.context_processors.header_html",
                    "sefaria.system.context_processors.footer_html",
                    "sefaria.system.context_processors.base_props",
            ],
            'loaders': [
                #'django_mobile.loader.Loader',
                'django.template.loaders.filesystem.Loader',
                'django.template.loaders.app_directories.Loader',
            ]
        },
    },
]

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
    'sefaria.system.middleware.SharedCacheMiddleware',
    'sefaria.system.multiserver.coordinator.MultiServerEventListenerMiddleware',
    'django_structlog.middlewares.RequestMiddleware',
    #'easy_timezones.middleware.EasyTimezoneMiddleware',
    #'django.middleware.cache.UpdateCacheMiddleware',
    #'django.middleware.cache.FetchFromCacheMiddleware',

]

ROOT_URLCONF = 'sefaria.urls'

# Python dotted path to the WSGI application used by Django's runserver.
WSGI_APPLICATION = 'sefaria.wsgi.application'

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

LOGIN_URL = 'login'

LOGIN_REDIRECT_URL = 'table_of_contents'

LOGOUT_REDIRECT_URL = 'table_of_contents'

AUTHENTICATION_BACKENDS = (
    'emailusernames.backends.EmailAuthBackend',
)

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    )
}

SESSION_SAVE_EVERY_REQUEST = True
SESSION_SERIALIZER = 'django.contrib.sessions.serializers.JSONSerializer' # this is the default anyway right now, but make sure

LOCALE_PATHS = (
    relative_to_abs_path('../locale'),
)

# A sample logging configuration. The only tangible logging
# performed by this configuration is to send an email to
# the site admins on every HTTP 500 error when DEBUG=False.
# See http://docs.djangoproject.com/en/dev/topics/logging for
# more details on how to customize your logging configuration.

""" to use logging, in any module:
# import the logging library
import structlog

# Get an instance of a logger
logger = structlog.get_logger(__name__)

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
            'filename': relative_to_abs_path('../log/sefaria.log'),
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 20,
            'formatter':'verbose',
        },
        'book_name_errors': {
            'level':'ERROR',
            'filters': ['filter_book_name_errors'],
            'class':'logging.handlers.RotatingFileHandler',
            'filename': relative_to_abs_path('../log/sefaria_book_errors.log'),
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
        'request_handler': {
            'level':'WARNING',
            'class':'logging.handlers.RotatingFileHandler',
            'filename': relative_to_abs_path('../log/django_request.log'),
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 20,
            'formatter':'standard',
        }
    },
    'loggers': {
        '': {
            'handlers': ['default', 'book_name_errors'],
            'level': 'INFO',
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

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
        'LOCATION': '/var/tmp/django_cache',
    }
}



# GLOBAL_INTERRUPTING_MESSAGE = {
#     "name": "2023-06-16-help-center",
#     "style":      "banner",  # "modal" or "banner"
#     "repetition": 1,
#     "is_fundraising": False,
#     "condition":  {
#         "returning_only": False,
#         "english_only": False,
#         "desktop_only": True,
#         "debug": False,
#     }
# }


GLOBAL_INTERRUPTING_MESSAGE = None

REMOTE_HOSTS = os.getenv('REMOTE_HOSTS', 'staging.pecha.org').replace(" ", "")

LOCAL_HOSTS = [
    'localhost',
    '127.0.0.1',
    "0.0.0.0",
    '[::1]'
]

ALLOWED_HOSTS = REMOTE_HOSTS.split(',') + LOCAL_HOSTS



# Grab environment specific settings from a file which
# is left out of the repo.
try:
    if os.getenv("CI_RUN"):
        from sefaria.local_settings_ci import *
    else:
        from sefaria.local_settings import *
except ImportError:
    from sefaria.local_settings_example import *

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
    },
    'LINKER': {
        'BUNDLE_DIR_NAME': 'bundles/linker.v3/',  # must end with slash
        'STATS_FILE': relative_to_abs_path('../node/webpack-stats.linker.v3.json'),
        'POLL_INTERVAL': 0.1,
        'TIMEOUT': None,
        'CACHE': not DEBUG,
    }

}
DATA_UPLOAD_MAX_MEMORY_SIZE = 24000000

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")  # Use the app password you generated
EMAIL_USE_TLS = True
