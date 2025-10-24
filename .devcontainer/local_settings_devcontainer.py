# Sefaria Development Container Local Settings
# This file is automatically copied to sefaria/local_settings.py during devcontainer setup
#
# DERIVATION NOTES:
# - Based on sefaria/local_settings_example.py structure
# - Database/service hostnames derived from docker-compose.yml service names
# - Settings optimized for container-based development environment

# Import baseline defaults so optional settings expected by Django are populated
from sefaria.local_settings_example import *  # type: ignore  # noqa

# ====================
# Core Settings
# ====================

# [DERIVED] DEBUG=True from local_settings_example.py for development
DEBUG = True

# [RECOMMENDATION] Allow all hosts in container environment
# Reason: Container may be accessed via various hostnames/IPs
ALLOWED_HOSTS = ['*']

# ====================
# Database Configuration
# ====================

# PostgreSQL - Used by Django for authentication and sessions
# [DERIVED] PostgreSQL configuration from docker-compose.yml postgres service
# Service: postgres (docker-compose.yml)
# Environment variables: POSTGRES_USER=admin, POSTGRES_PASSWORD=admin, POSTGRES_DB=sefaria
# Port mapping: 5433:5432
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'sefaria',
        'USER': 'admin',
        'PASSWORD': 'admin',
        'HOST': 'postgres',  # [DERIVED] Docker Compose service name from docker-compose.yml
        'PORT': '',          # [DERIVED] Use default internal port (5432), not the external mapping
    }
}

# MongoDB - Main database for Sefaria texts and data
# [DERIVED] MongoDB configuration from docker-compose.yml db service
# Service: db, image: mongo:4.4, port: 27017
MONGO_REPLICASET_NAME = None
MONGO_HOST = "db"  # [DERIVED] Docker Compose service name from docker-compose.yml
MONGO_PORT = 27017
SEFARIA_DB = "sefaria"
SEFARIA_DB_USER = ""
SEFARIA_DB_PASSWORD = ""
APSCHEDULER_NAME = "apscheduler"

# ====================
# Cache Configuration
# ====================

# Redis configuration for caching
# [DERIVED] Redis service from docker-compose.yml cache service
# Service: cache, image: redis:latest, port: 6379
MULTISERVER_REDIS_SERVER = "cache"  # [DERIVED] Docker Compose service name
REDIS_HOST = "cache"
REDIS_PORT = 6379

# [DERIVED] Cache structure from local_settings_example.py Redis section
# Modified to use container service name instead of localhost
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://cache:6379/0",  # [DERIVED] Service name 'cache' from docker-compose.yml
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
        "KEY_PREFIX": "sefaria",
        "TIMEOUT": 60 * 60 * 24 * 30,
    },
    "shared": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://cache:6379/1",  # [DERIVED] Service name 'cache' from docker-compose.yml
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
        "KEY_PREFIX": "sefaria-shared",
        "TIMEOUT": 60 * 60 * 24 * 30,
    }
}

# Session configuration
# [DERIVED] From local_settings_example.py
SESSION_CACHE_ALIAS = "default"
USER_AGENTS_CACHE = 'default'
SHARED_DATA_CACHE_ALIAS = 'shared'

# ====================
# Node.js Server-Side Rendering
# ====================

# [DERIVED] Node configuration from docker-compose.yml node service
# Service: node, image: node:latest, port: 3000
# [DERIVED] USE_NODE from local_settings_example.py
USE_NODE = True
NODE_HOST = "http://node:3000"  # [DERIVED] Docker Compose service name from docker-compose.yml
NODE_TIMEOUT = 10

# ====================
# reCAPTCHA Configuration
# ====================

# [DERIVED] From local_settings_example.py (commented section)
# Use test keys for development to suppress warnings
SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']

# ====================
# Logging Configuration
# ====================

# [RECOMMENDATION] Simplified logging for development
# Based on local_settings_example.py but simplified for container environment
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'standard'
        },
        'file': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'filename': '/app/log/sefaria.log',  # [DERIVED] Log directory from installation docs
            'formatter': 'standard'
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'sefaria': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    }
}

# ====================
# Email Configuration (Development)
# ====================

# [DERIVED] From local_settings_example.py EMAIL_BACKEND
# Use console backend for development (prints emails to console)
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# ====================
# Static Files
# ====================

# [DERIVED] Standard Django static file settings
STATIC_URL = '/static/'
STATIC_ROOT = '/app/static-collected/'

# ====================
# Security Settings (Development)
# ====================

# [DERIVED] SECRET_KEY required by Django (from local_settings_example.py)
# Less strict security for development
SECRET_KEY = 'dev-secret-key-change-in-production'
CSRF_COOKIE_SECURE = False
SESSION_COOKIE_SECURE = False

# ====================
# Celery Configuration
# ====================

# [DERIVED] Celery configuration from local_settings_example.py
# Use Redis as broker for Celery (same Redis instance as cache)
# [DERIVED] Service name 'cache' from docker-compose.yml
CELERY_BROKER_URL = 'redis://cache:6379/2'
CELERY_RESULT_BACKEND = 'redis://cache:6379/2'

# ====================
# Search Configuration
# ====================

# [RECOMMENDATION] Elasticsearch is not included in the basic devcontainer setup
# Uncomment and configure if you need Elasticsearch for development
# [DERIVED] SEARCH_URL pattern from local_settings_example.py
# SEARCH_HOST = "elasticsearch"
# SEARCH_ADMIN = "http://elasticsearch:9200"

# ====================
# Custom Settings
# ====================

# Add any custom settings below this line

# CRM / NationBuilder placeholders to prevent attribute errors during setup
CRM_TYPE = "NONE"
NATIONBUILDER_SLUG = ""
NATIONBUILDER_TOKEN = ""
NATIONBUILDER_CLIENT_ID = ""
NATIONBUILDER_CLIENT_SECRET = ""

# Development-friendly failure handling
FAIL_GRACEFULLY = False
