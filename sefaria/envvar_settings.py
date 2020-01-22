import os
from socket import gethostname, gethostbyname
from datetime import timedelta

# create map between envvar and settings.py

def getEnvVarBinary(envvar):
  if envvar == "true":
    return True
  elif envvar == "false":
    return False
  else:
    return False # Make this log an error

def getEnvVarString(envvar):
  return os.environ[envvar]

def getEnvVarInteger(envvar):
  return os.environ[envvar]


# TODO: Create a function that makes sure all required envvars are set

# ------------
# Run Options
# ------------
# SEFARIA__APP_DEBUG
# SEFARIA__APP_OFFLINE
# SEFARIA__APP_ALLOWED_HOSTS
DEBUG = getEnvVarBinary("SEFARIA__APP_DEBUG")
OFFLINE = getEnvVarBinary("SEFARIA__APP_OFFLINE")
ALLOWED_HOSTS = getEnvVarString("SEFARIA__APP_ALLOWED_HOSTS").split(";") 
ALLOWED_HOSTS += ["web", gethostname(), gethostbyname(gethostname()), "localhost", "127.0.0.1", "::1"]
WEB_SERVICE_NAME = getEnvVarString("SEFARIA__K8S_SERVICE_NAME_WEB")

# ------------
# Django Internals
# ------------f
# SEFARIA__APP_ADMINS
ADMINS = tuple([tuple(admin.split(",")) for admin in getEnvVarString("SEFARIA__APP_ADMINS").split(";")])
MANAGERS = ADMINS
# e.g. ADMINS = (('dev', 'dev@sefaria.com'), ('elite', 'elite@sefaria.org'), ('loacker', 'loacker@sefaria.org'))

# ------------
# Login & Authentication
# ------------
# SEFARIA__AUTH_OAUTH_SECRET_KEY
SECRET_KEY = getEnvVarString("SEFARIA__AUTH_OAUTH_SECRET_KEY")

# SEFARIA__AUTH_JWT_SIGNING_KEY
# Simple JWT
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=90),
    'ROTATE_REFRESH_TOKENS': True,
    'SIGNING_KEY': getEnvVarString("SEFARIA__AUTH_JWT_SIGNING_KEY"),
}

# ------------
# Cache
# ------------
# SEFARIA__CACHE_SELECT
# SEFARIA__CACHE_REDIS_HOST
# SEFARIA__CACHE_REDIS_PASSWORD

CACHE_LOCAL = {
    'default': {
        'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
        'LOCATION': '/var/tmp/django_cache',
    }
}

CACHE_REDIS = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://{}:6379/0".format(getEnvVarString("SEFARIA__CACHE_REDIS_HOST")),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
        "TIMEOUT": 60 * 60 * 24 * 30,
    }
}

if getEnvVarString("SEFARIA__CACHE_SELECT") == "redis":
  CACHES = CACHE_REDIS
else:
  CACHES = CACHE_LOCAL

# ------------
# MultiServer
# ------------
# SEFARIA__MULTISERVER_ENABLED
# SEFARIA__MULTISERVER_REDIS_HOST
MULTISERVER_ENABLED = getEnvVarBinary("SEFARIA__MULTISERVER_ENABLED")
MULTISERVER_REDIS_SERVER = getEnvVarString("SEFARIA__MULTISERVER_REDIS_HOST")

# ------------
# Google
# ------------
# SEFARIA__GOOGLE_TAG_MANAGER_CODE
# SEFARIA__GOOGLE_ANALYTICS_CODE
# SEFARIA__GOOGLE_MAPS_API_KEY
GOOGLE_TAG_MANAGER_CODE = getEnvVarString("SEFARIA__GOOGLE_TAG_MANAGER_CODE")
GOOGLE_ANALYTICS_CODE = getEnvVarString("SEFARIA__GOOGLE_ANALYTICS_CODE")
GOOGLE_MAPS_API_KEY = getEnvVarString("SEFARIA__GOOGLE_MAPS_API_KEY")

# ------------
# Database - PostgreSQL
# ------------
# SEFARIA__DATABASE_SELECT
# SEFARIA__POSTGRES_USER
# SEFARIA__POSTGRES_PASSWORD
# SEFARIA__POSTGRES_HOST
# SEFARIA__POSTGRES_DBNAME
# SEFARIA__SQLITE_PATH

DATABASE_POSTGRES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'sefaria_auth',
        'USER': getEnvVarString("SEFARIA__POSTGRES_USER"),
        'PASSWORD': getEnvVarString("SEFARIA__POSTGRES_PASSWORD"),
        'HOST': getEnvVarString("SEFARIA__POSTGRES_HOST"),
        'PORT': '',
    }
}

DATABASE_SQLITE = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3', # Add 'postgresql_psycopg2', 'mysql', 'sqlite3' or 'oracle'.
        'NAME': getEnvVarString("SEFARIA__SQLITE_PATH"), # Or path to database file if using sqlite3.
        'USER': '',
        'PASSWORD': '',
        'HOST': '',
        'PORT': '',
    }
}

if getEnvVarString("SEFARIA__DATABASE_SELECT") == "postgres":
  DATABASES = DATABASE_POSTGRES
elif getEnvVarString("SEFARIA__DATABASE_SELECT") == "sqlite":
  DATABASES = DATABASE_SQLITE
else:
  DATABASES = DATABASE_SQLITE # TODO: Handle this better

# ------------
# Database - MongoDB
# ------------
# SEFARIA__MONGO_HOST
# SEFARIA__MONGO_DB
# SEFARIA__MONGO_USER
# SEFARIA__MONGO_PASSWORD
MONGO_HOST = getEnvVarString("SEFARIA__MONGO_HOST")
SEFARIA_DB = getEnvVarString("SEFARIA__MONGO_DBT")
SEFARIA_DB_USER = getEnvVarString("SEFARIA__MONGO_USER")
SEFARIA_DB_PASSWORD = getEnvVarString("SEFARIA__MONGO_PASSWORD")

# ------------
# ElasticSearch Search
# ------------
# SEFARIA__SEARCH_HOST
# SEFARIA__SEARCH_USER
# SEFARIA__SEARCH_PASSWORD
SEARCH_ADMIN = "http://{}:9200".format(getEnvVarString("SEFARIA__SEARCH_HOST"))
SEARCH_ADMIN_USER = getEnvVarString("SEFARIA__SEARCH_USER")
SEARCH_ADMIN_PW = getEnvVarString("SEFARIA__SEARCH_PASSWORD")
SEARCH_ADMIN_K8S = "http://{}:9200".format(getEnvVarString("SEFARIA__SEARCH_HOST"))

# ------------
# NodeJS
# ------------
# SEFARIA__NODEJS_ENABLED
# SEFARIA__NODEJS_HOST
# SEFARIA__NODEJS_TIMEOUT
USE_NODE = getEnvVarBinary("SEFARIA__NODEJS_ENABLED")
NODE_HOST = "http://{}:3000".format(getEnvVarString("SEFARIA__NODEJS_HOST"))
NODE_TIMEOUT = getEnvVarInteger("SEFARIA__NODEJS_TIMEOUT")

# ------------
# Bot User
# ------------
# SEFARIA__BOT_API_KEY
SEFARIA_BOT_API_KEY = getEnvVarString("SEFARIA__BOT_API_KEY")

# ------------
# AWS
# ------------
# SEFARIA__AWS_ACCESS_KEY
# SEFARIA__AWS_SECRET_KEY
# SEFARIA__AWS_S3_BUCKET
AWS_ACCESS_KEY = getEnvVarString("SEFARIA__AWS_ACCESS_KEY")
AWS_SECRET_KEY = getEnvVarString("SEFARIA__AWS_SECRET_KEY")
S3_BUCKET = getEnvVarString("SEFARIA__AWS_S3_BUCKET")

# ------------
# NationBuilder
# ------------
# SEFARIA__NATIONBUILDER_ENABLED
# SEFARIA__NATIONBUILDER_SLUG
# SEFARIA__NATIONBUILDER_TOKEN
# SEFARIA__NATIONBUILDER_CLIENT_ID
# SEFARIA__NATIONBUILDER_CLIENT_SECRET
NATIONBUILDER = getEnvVarBinary("SEFARIA__NATIONBUILDER_ENABLED")
NATIONBUILDER_SLUG = getEnvVarString("SEFARIA__NATIONBUILDER_SLUG")
NATIONBUILDER_TOKEN = getEnvVarString("SEFARIA__NATIONBUILDER_TOKEN")
NATIONBUILDER_CLIENT_ID = getEnvVarString("SEFARIA__NATIONBUILDER_CLIENT_ID")
NATIONBUILDER_CLIENT_SECRET = getEnvVarString("SEFARIA__NATIONBUILDER_CLIENT_SECRET")

# ------------
# MailChimp
# ------------
# SEFARIA__MAILCHIMP_ENABLED
# SEFARIA__MAILCHIMP_API_KEY
# SEFARIA__MAILCHIMP_ANNOUNCE_ID
# SEFARIA__MAILCHIMP_WEBHOOK_KEY
MAILCHIMP = getEnvVarBinary("SEFARIA__MAILCHIMP_ENABLED")
MAILCHIMP_API_KEY = getEnvVarString("SEFARIA__MAILCHIMP_API_KEY")
MAILCHIMP_ANNOUNCE_ID = getEnvVarString("SEFARIA__MAILCHIMP_ANNOUNCE_ID")
MAILCHIMP_WEBHOOK_KEY = getEnvVarString("SEFARIA__MAILCHIMP_WEBHOOK_KEY")

# ------------
# Varnish
# ------------
# SEFARIA__VARNISH_ENABLED
# SEFARIA__VARNISH_FRONTEND_URL
# SEFARIA__VARNISH_HOST
# SEFARIA__VARNISH_ESI_ENABLED
USE_VARNISH = getEnvVarBinary("SEFARIA__VARNISH_ENABLED")
FRONT_END_URL = getEnvVarString("SEFARIA__VARNISH_FRONTEND_URL")
VARNISH_ADM_ADDR = "{}:6082".format(getEnvVarString("SEFARIA__VARNISH_HOST"))
VARNISH_HOST = getEnvVarString("SEFARIA__VARNISH_HOST")
USE_VARNISH_ESI = getEnvVarBinary("SEFARIA__VARNISH_ESI_ENABLED")

# ------------
# reCAPTCHA
# ------------
# SEFARIA__RECAPTCHA_PUBLIC_KEY
# SEFARIA__RECAPTCHA_PRIVATE_KEY
# SEFARIA__RECAPTCHA_NOCAPTCHA
RECAPTCHA_PUBLIC_KEY = getEnvVarString("SEFARIA__RECAPTCHA_PUBLIC_KEY")
RECAPTCHA_PRIVATE_KEY = getEnvVarString("SEFARIA__RECAPTCHA_PRIVATE_KEY")
NOCAPTCHA = getEnvVarBinary("SEFARIA__RECAPTCHA_NOCAPTCHA")

# ------------
# Mobile Application
# ------------
# SEFARIA__MOBILE_APP_KEY
MOBILE_APP_KEY = getEnvVarString("SEFARIA__MOBILE_APP_KEY")

# ------------
# Mail
# ------------
# SEFARIA__ANYMAIL_API_KEY
# SEFARIA__ANYMAIL_SERVER_EMAIL
# SEFARIA__ANYMAIL_FROM_EMAIL
ANYMAIL = { "MANDRILL_API_KEY": getEnvVarString("SEFARIA__ANYMAIL_API_KEY") }
EMAIL_BACKEND = 'anymail.backends.mandrill.EmailBackend'
DEFAULT_FROM_EMAIL = "Sefaria <hello@sefaria.org>"
SERVER_EMAIL = getEnvVarString("SEFARIA__ANYMAIL_SERVER_EMAIL")

# ------------
# CloudFlare
# ------------
# SEFARIA__CLOUDFLARE_ENABLED
# SEFARIA__CLOUDFLARE_ZONE
# SEFARIA__CLOUDFLARE_EMAIL
# SEFARIA__CLOUDFLARE_TOKEN
CLOUDFLARE_ZONE = getEnvVarString("SEFARIA__CLOUDFLARE_ZONE")
CLOUDFLARE_EMAIL = getEnvVarString("SEFARIA__CLOUDFLARE_EMAIL")
CLOUDFLARE_TOKEN = getEnvVarString("SEFARIA__CLOUDFLARE_TOKEN")
USE_CLOUDFLARE = getEnvVarBinary("SEFARIA__CLOUDFLARE_TOKEN")

# TODO: Reduce this only required ENV VARS
# TODO: Consider storing this in a different file
REQUIRED_ENVVARS = [
  "SEFARIA__ANYMAIL_API_KEY", 
  "SEFARIA__ANYMAIL_FROM_EMAIL", 
  "SEFARIA__ANYMAIL_SERVER_EMAIL", 
  "SEFARIA__APP_ADMINS", 
  "SEFARIA__APP_ALLOWED_HOSTS", 
  "SEFARIA__APP_DEBUG",
  "SEFARIA__APP_OFFLINE", 
  "SEFARIA__AUTH_JWT_SIGNING_KEY", 
  "SEFARIA__AUTH_OAUTH_SECRET_KEY", 
  "SEFARIA__AWS_ACCESS_KEY", 
  "SEFARIA__AWS_S3_BUCKET", 
  "SEFARIA__AWS_SECRET_KEY", 
  "SEFARIA__BOT_API_KEY", 
  "SEFARIA__CACHE_REDIS_HOST", 
  "SEFARIA__CACHE_REDIS_PASSWORD", 
  "SEFARIA__CACHE_SELECT", 
  "SEFARIA__CLOUDFLARE_EMAIL", 
  "SEFARIA__CLOUDFLARE_ENABLED", 
  "SEFARIA__CLOUDFLARE_TOKEN", 
  "SEFARIA__CLOUDFLARE_ZONE", 
  "SEFARIA__GLOBALMSG_INTERRUPT_ENABLED", 
  "SEFARIA__GLOBALMSG_INTERRUPT_MESSAGE", 
  "SEFARIA__GLOBALMSG_MAINTENANCE_MESSAGE", 
  "SEFARIA__GLOBALMSG_MAINTENANCE_ENABLED", 
  "SEFARIA__GLOBALMSG_WARNING_ENABLED", 
  "SEFARIA__GLOBALMSG_WARNING_MESSAGE", 
  "SEFARIA__GOOGLE_ANALYTICS_CODE", 
  "SEFARIA__GOOGLE_MAPS_API_KEY", 
  "SEFARIA__GOOGLE_TAG_MANAGER_CODE", 
  "SEFARIA__MAILCHIMP_ANNOUNCE_ID", 
  "SEFARIA__MAILCHIMP_API_KEY", 
  "SEFARIA__MAILCHIMP_ENABLED", 
  "SEFARIA__MAILCHIMP_WEBHOOK_KEY", 
  "SEFARIA__MOBILE_APP_KEY", 
  "SEFARIA__MONGO_DB", 
  "SEFARIA__MONGO_HOST", 
  "SEFARIA__MONGO_PASSWORD", 
  "SEFARIA__MONGO_USER", 
  "SEFARIA__MULTISERVER_ENABLED", 
  "SEFARIA__MULTISERVER_REDIS_HOST", 
  "SEFARIA__NATIONBUILDER_CLIENT_ID", 
  "SEFARIA__NATIONBUILDER_CLIENT_SECRET", 
  "SEFARIA__NATIONBUILDER_ENABLED", 
  "SEFARIA__NATIONBUILDER_SLUG", 
  "SEFARIA__NATIONBUILDER_TOKEN", 
  "SEFARIA__NODEJS_ENABLED", 
  "SEFARIA__NODEJS_HOST", 
  "SEFARIA__NODEJS_TIMEOUT", 
  "SEFARIA__POSTGRES_DBNAME", 
  "SEFARIA__POSTGRES_HOST", 
  "SEFARIA__POSTGRES_PASSWORD", 
  "SEFARIA__POSTGRES_USER", 
  "SEFARIA__RECAPTCHA_NOCAPTCHA", 
  "SEFARIA__RECAPTCHA_PRIVATE_KEY", 
  "SEFARIA__RECAPTCHA_PUBLIC_KEY", 
  "SEFARIA__SEARCH_HOST", 
  "SEFARIA__SEARCH_PASSWORD", 
  "SEFARIA__SEARCH_USER", 
  "SEFARIA__SQLITE_PATH", 
  "SEFARIA__VARNISH_ENABLED", 
  "SEFARIA__VARNISH_ESI_ENABLED", 
  "SEFARIA__VARNISH_FRONTEND_URL", 
  "SEFARIA__VARNISH_HOST", 
]

def ensureEnvvarsPresent():
  missing_envvars = [x for x in REQUIRED_ENVVARS if x not in os.environ]
  
  if len(missing_envvars) > 0:
    print("Missing the following envvars...")
    for envvar in missing_envvars:
      print(envvar)
    print("{} total".format(len(missing_envvars)))
  else:
    print("All required envvars available. Proceeding")