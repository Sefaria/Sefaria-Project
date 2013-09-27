# An example of settings needed in a local_settings.py file which is ignored by git.
# copy this file to sefaria/local_settings.py and provide local info to run.

DEBUG = True
TEMPLATE_DEBUG = DEBUG
OFFLINE = False

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

SECRET_KEY = 'insert your long random secret key here !'

STATICFILES_DIRS = (
    '/path/to/your/sefaria/static/',
    # Put strings here, like "/home/html/static" or "C:/www/django/static".
    # Always use forward slashes, even on Windows.
    # Don't forget to use absolute paths, not relative paths.
)

TEMPLATE_DIRS = (
    '/path/to/your/sefaria/templates/',
    # Put strings here, like "/home/html/django_templates" or "C:/www/django/templates".
    # Always use forward slashes, even on Windows.
    # Don't forget to use absolute paths, not relative paths.
)

EMAIL_HOST = 'localhost'
EMAIL_PORT = 1025
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

# Name of the MongoDB datebase to use.
SEFARIA_DB = 'sefaria_local'
SEFARIA_DB_USER = 'sefaria'
SEFARIA_DB_PASSWORD = 'your mongo password'

# ElasticSearch server
SEARCH_HOST = "http://localhost:9200" 

GOOGLE_ANALYTICS_CODE = 'your google analytics code'

# Integration with a mailchimp list
MAILCHIMP = False # whether to use it at all
MAILCHIMP_API_KEY = "your mailchimp key"
MAILCHIMP_ANNOUNCE_ID = 'announce list id'
MAILCHIMP_WEBHOOK_KEY = "webhook key"