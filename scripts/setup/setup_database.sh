#!/bin/bash

###############################################################################
# Setup Database Script
#
# Creates local_settings.py with appropriate database configuration
# Supports both SQLite (default) and PostgreSQL (with --postgres flag)
###############################################################################

set -e

# Source utility functions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ ERROR: $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ WARNING: $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

# Backup existing local_settings.py
backup_local_settings() {
  if [ -f "sefaria/local_settings.py" ]; then
    BACKUP_FILE="sefaria/local_settings.py.backup.$(date +%Y%m%d_%H%M%S)"
    print_warning "Backing up existing local_settings.py to $BACKUP_FILE"
    cp sefaria/local_settings.py "$BACKUP_FILE"
    print_success "Backup created"
  fi
}

# Create PostgreSQL database
setup_postgresql_db() {
  print_info "Setting up PostgreSQL database..."

  # Check if PostgreSQL is running
  if ! pg_isready &> /dev/null; then
    print_error "PostgreSQL is not running"
    print_info "Starting PostgreSQL..."
    if [[ "$OS" == "macos" ]]; then
      brew services start postgresql@14
      sleep 2
    fi
  fi

  # Check if database exists
  if psql -lqt | cut -d \| -f 1 | grep -qw sefaria; then
    print_success "Database 'sefaria' already exists"
  else
    print_info "Creating database 'sefaria'..."
    createdb sefaria
    print_success "Database 'sefaria' created"
  fi
}

# Create local_settings.py
create_local_settings() {
  print_info "Creating sefaria/local_settings.py..."

  # Get absolute path to project directory
  PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

  # Get current username
  CURRENT_USER=$(whoami)

  # Create local_settings.py
  cat > sefaria/local_settings.py << EOF
from datetime import timedelta
import sys
import structlog
import sefaria.system.logging as sefaria_logging
import os

# Django Database Configuration
EOF

  if [ "$USE_POSTGRES" = true ]; then
    cat >> sefaria/local_settings.py << EOF
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'sefaria',
        'USER': os.getenv('USER'),
        'PASSWORD': '',
        'HOST': '127.0.0.1',
        'PORT': '5432',
    }
}
EOF
    print_success "Configured for PostgreSQL"
  else
    cat >> sefaria/local_settings.py << EOF
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': '${PROJECT_DIR}/db.sqlite',
        'USER': '',
        'PASSWORD': '',
        'HOST': '',
        'PORT': '',
    }
}
EOF
    print_success "Configured for SQLite"
  fi

  # Add rest of configuration
  cat >> sefaria/local_settings.py << 'EOF'

# Domain and Host Configuration
DOMAIN_LANGUAGES = {}

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

# Admin Configuration
SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']

ADMINS = (
    ('Local Admin', 'admin@localhost'),
)

ADMIN_PATH = 'admin'

# MongoDB Configuration
PINNED_IPCOUNTRY = "IL"
MONGO_REPLICASET_NAME = None
MONGO_HOST = "localhost"
MONGO_PORT = 27017
SEFARIA_DB = 'sefaria'
SEFARIA_DB_USER = ''
SEFARIA_DB_PASSWORD = ''
APSCHEDULER_NAME = "apscheduler"

# Cache Configuration
# Note: For Redis caching (needed for SSR), install Redis and uncomment the Redis configuration below
CACHES = {
    "shared": {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    },
    "default": {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    },
}

# Uncomment this for Redis caching (required for Node SSR):
"""
CACHES = {
    "shared": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://127.0.0.1:6379/1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "SERIALIZER": "sefaria.system.serializers.JSONSerializer",
        },
        "TIMEOUT": None,
    },
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://127.0.0.1:6379/0",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
        "TIMEOUT": 60 * 60 * 24 * 30,
    },
}
"""

SESSION_CACHE_ALIAS = "default"
USER_AGENTS_CACHE = 'default'
SHARED_DATA_CACHE_ALIAS = 'shared'

SITE_PACKAGE = "sites.sefaria"

# Development Settings
DEBUG = True
OFFLINE = False
DOWN_FOR_MAINTENANCE = False
MAINTENANCE_MESSAGE = ""

STRAPI_LOCATION = None
STRAPI_PORT = None

MANAGERS = ADMINS

SECRET_KEY = 'local-development-secret-key-change-in-production'

# Email Configuration
EMAIL_HOST = 'localhost'
EMAIL_PORT = 1025
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

# Search Configuration (Use production search)
SEARCH_URL = "https://www.sefaria.org/api/search/"
SEARCH_INDEX_ON_SAVE = False
SEARCH_INDEX_NAME_TEXT = 'text'
SEARCH_INDEX_NAME_SHEET = 'sheet'

# Node Server Configuration
# For server-side rendering, install Redis (brew install redis) and enable Redis caching above
USE_NODE = False
NODE_HOST = "http://localhost:3000"
NODE_TIMEOUT = 10

# Data Paths (not required for basic setup)
SEFARIA_DATA_PATH = '/path/to/your/Sefaria-Data'
SEFARIA_EXPORT_PATH = '/path/to/your/Sefaria-Data/export'

# Analytics (not needed for local development)
GOOGLE_GTAG = ''
GOOGLE_TAG_MANAGER_CODE = ''
HOTJAR_ID = None

# CRM Configuration
CRM_TYPE = "NONE"

# NationBuilder Integration
NATIONBUILDER_SLUG = ""
NATIONBUILDER_TOKEN = ""
NATIONBUILDER_CLIENT_ID = ""
NATIONBUILDER_CLIENT_SECRET = ""

# Salesforce Integration
SALESFORCE_BASE_URL = ""
SALESFORCE_CLIENT_ID = ""
SALESFORCE_CLIENT_SECRET = ""

# OAuth Configuration
GOOGLE_OAUTH2_CLIENT_ID = ""
GOOGLE_OAUTH2_CLIENT_SECRET = ""
GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH = ""

# Varnish Configuration
USE_VARNISH = False
FRONT_END_URL = "http://localhost:8000"
VARNISH_ADM_ADDR = "localhost:6082"
VARNISH_HOST = "localhost"
VARNISH_FRNT_PORT = 8040
VARNISH_SECRET = "/etc/varnish/secret"
USE_VARNISH_ESI = False

# Cloudflare Configuration
CLOUDFLARE_ZONE = ""
CLOUDFLARE_EMAIL = ""
CLOUDFLARE_TOKEN = ""

# Feature Flags
DISABLE_INDEX_SAVE = False
DISABLE_AUTOCOMPLETER = True  # Disabled for local development
ENABLE_LINKER = False

# Multiserver Configuration
MULTISERVER_ENABLED = False
MULTISERVER_REDIS_SERVER = "127.0.0.1"
MULTISERVER_REDIS_PORT = 6379
MULTISERVER_REDIS_DB = 0
MULTISERVER_REDIS_EVENT_CHANNEL = "msync"
MULTISERVER_REDIS_CONFIRM_CHANNEL = "mconfirm"

# Celery
CELERY_ENABLED = False

# Slack
SLACK_URL = ''

# Mobile App Key
MOBILE_APP_KEY = "MOBILE_APP_KEY"

# GeoIP and GPU Server
GEOIP_DATABASE = 'data/geoip/GeoLiteCity.dat'
GEOIPV6_DATABASE = 'data/geoip/GeoLiteCityv6.dat'
GPU_SERVER_URL = 'http://localhost:5000'

# Machine Learning Model Paths
RAW_REF_MODEL_BY_LANG_FILEPATH = {
    "en": None,
    "he": None
}

RAW_REF_PART_MODEL_BY_LANG_FILEPATH = {
    "en": None,
    "he": None
}

# Redis Configuration (for Celery)
REDIS_URL = "redis://127.0.0.1"
REDIS_PORT = 6379
REDIS_PASSWORD = None
SENTINEL_HEADLESS_URL = None
SENTINEL_PASSWORD = None
SENTINEL_TRANSPORT_OPTS = {}
CELERY_REDIS_BROKER_DB_NUM = 2
CELERY_REDIS_RESULT_BACKEND_DB_NUM = 3
CELERY_QUEUES = {}

# JWT Configuration
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=90),
    'ROTATE_REFRESH_TOKENS': True,
    'SIGNING_KEY': 'local-development-jwt-signing-key',
}

# Logging Configuration
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

SENTRY_DSN = None
CLIENT_SENTRY_DSN = None

# Error Handling
FAIL_GRACEFULLY = False
if "pytest" in sys.modules:
    FAIL_GRACEFULLY = False

# Mobile App
MOBILE_APP_KEY = "MOBILE_APP_KEY"
EOF

  print_success "local_settings.py created successfully"
}

# Verify database configuration
verify_database() {
  print_info "Verifying database configuration..."

  # Check if local_settings.py exists
  if [ ! -f "sefaria/local_settings.py" ]; then
    print_error "local_settings.py not found"
    exit 1
  fi

  print_success "local_settings.py exists"

  if [ "$USE_POSTGRES" = true ]; then
    # Test PostgreSQL connection
    if psql -d sefaria -c "SELECT 1;" &> /dev/null; then
      print_success "PostgreSQL connection successful"
    else
      print_error "Could not connect to PostgreSQL database"
      exit 1
    fi
  else
    # Check if SQLite path is accessible
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    if [ -w "$PROJECT_DIR" ]; then
      print_success "SQLite database path is writable"
    else
      print_error "SQLite database path is not writable"
      exit 1
    fi
  fi
}

# Main function
main() {
  print_info "Setting up Django database configuration..."
  echo ""

  backup_local_settings

  if [ "$USE_POSTGRES" = true ]; then
    setup_postgresql_db
  else
    print_info "Using SQLite (no database creation needed)"
  fi

  create_local_settings
  verify_database

  echo ""
  print_success "Database configuration complete!"

  if [ "$USE_POSTGRES" = true ]; then
    print_info "Using PostgreSQL database: sefaria"
  else
    print_info "Using SQLite database: db.sqlite"
  fi
}

main
