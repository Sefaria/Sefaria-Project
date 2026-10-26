"""Loopback-only settings for running the live reading map without the full Sefaria stack. Never use this module for public deployment."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get('INQUIRY_SECRET_KEY', 'local-rehearsal-only-not-a-production-secret')
DEBUG = True
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', 'testserver']
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions',
                  'django.contrib.messages', 'django.contrib.staticfiles', 'django.contrib.admin', 'inquiry']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware',
              'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware',
              'django.contrib.auth.middleware.AuthenticationMiddleware', 'django.contrib.messages.middleware.MessageMiddleware']
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': os.environ.get('INQUIRY_DB', str(BASE_DIR / '.inquiry-pilot.sqlite3'))}}
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'APP_DIRS': True,
              'OPTIONS': {'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
ROOT_URLCONF = 'inquiry.pilot_urls'
STATIC_URL = '/static/'
LOGIN_URL = '/admin/login/'
USE_TZ = True
TIME_ZONE = 'UTC'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
INQUIRY_STANDALONE = True
DATA_UPLOAD_MAX_MEMORY_SIZE = 512_000
PASSWORD_HASHERS = ['django.contrib.auth.hashers.PBKDF2PasswordHasher']

INQUIRY_ATLAS_ENABLED = True
INQUIRY_ATLAS_MONGO_URI = os.environ.get('INQUIRY_ATLAS_MONGO_URI', 'mongodb://127.0.0.1:27017')
INQUIRY_ATLAS_MONGO_DB = os.environ.get('INQUIRY_ATLAS_MONGO_DB', 'sefaria')

STATICFILES_DIRS = [BASE_DIR / "static"]

INQUIRY_ATLAS_DEMO_ENABLED = os.environ.get('INQUIRY_ATLAS_DEMO_ENABLED', '0') == '1'
