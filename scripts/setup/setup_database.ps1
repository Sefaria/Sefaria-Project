###############################################################################
# Setup Database Script (Windows)
#
# Creates local_settings.py with database configuration
# Supports both SQLite and PostgreSQL
###############################################################################

$ErrorActionPreference = "Stop"

function Write-Success { param([string]$Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-ErrorMsg { param([string]$Message) Write-Host "✗ ERROR: $Message" -ForegroundColor Red }
function Write-Warning { param([string]$Message) Write-Host "⚠ WARNING: $Message" -ForegroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "ℹ $Message" -ForegroundColor Cyan }

# Create local_settings.py
function New-LocalSettings {
    Write-Info "Creating local_settings.py..."

    $localSettingsPath = "sefaria\local_settings.py"

    # Check if file already exists
    if (Test-Path $localSettingsPath) {
        Write-Warning "local_settings.py already exists"
        $response = Read-Host "Do you want to overwrite it? (y/n)"
        if ($response -ne 'y') {
            Write-Info "Keeping existing local_settings.py"
            return
        }
    }

    # Determine database configuration
    if ($env:USE_POSTGRES -eq "true") {
        $dbConfig = @"
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'sefaria',
        'USER': os.getenv('POSTGRES_USER', 'postgres'),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', ''),
        'HOST': '127.0.0.1',
        'PORT': '5432',
    }
}
"@
    } else {
        $dbConfig = @"
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': str(BASE_DIR / 'db.sqlite'),
        'USER': '',
        'PASSWORD': '',
        'HOST': '',
        'PORT': '',
    }
}
"@
    }

    $contentParts = @()
    $contentParts += @"
from datetime import timedelta
import sys
import structlog
import sefaria.system.logging as sefaria_logging
import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Django Database Configuration
"@
    $contentParts += $dbConfig.TrimEnd()
    $contentParts += @"

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

ALLOWED_HOSTS = ['127.0.0.1', '0.0.0.0', '[::1]', 'localhost', 'voices.localhost']

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
USE_NODE = False
NODE_HOST = "http://localhost:3000"
NODE_TIMEOUT = 10

# Data Paths (not required for basic setup)
SEFARIA_DATA_PATH = str(BASE_DIR / 'data')
SEFARIA_EXPORT_PATH = str(BASE_DIR / 'data' / 'export')

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
"@

    Set-Content -Path $localSettingsPath -Value ($contentParts -join "`n") -Encoding UTF8
    Write-Success "Created local_settings.py"
}

# Setup PostgreSQL database (if using PostgreSQL)
function Initialize-PostgreSQL {
    if ($env:USE_POSTGRES -ne "true") {
        Write-Info "Using SQLite (no PostgreSQL setup needed)"
        return
    }

    Write-Info "Setting up PostgreSQL database..."

    # Check if PostgreSQL is installed
    try {
        $pgVersion = psql --version
    } catch {
        Write-ErrorMsg "PostgreSQL is not installed"
        Write-Info "Run install_system_tools.ps1 with -Postgres flag"
        exit 1
    }

    # Check if PostgreSQL service is running
    $service = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    if ($service -and $service.Status -ne 'Running') {
        Write-Info "Starting PostgreSQL service..."
        Start-Service $service.Name
        Write-Success "PostgreSQL service started"
    }

    Write-Info "Creating PostgreSQL database 'sefaria'..."
    Write-Warning "You may be prompted for the postgres password"

    # Try to create database
    try {
        $env:PGPASSWORD = "postgres"
        $result = psql -U postgres -c "CREATE DATABASE sefaria;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "PostgreSQL database 'sefaria' created"
        } else {
            # Database might already exist
            $checkDb = psql -U postgres -c "\l" 2>&1 | Select-String "sefaria"
            if ($checkDb) {
                Write-Success "PostgreSQL database 'sefaria' already exists"
            } else {
                Write-Warning "Could not create PostgreSQL database"
                Write-Info "You may need to create it manually:"
                Write-Info "  psql -U postgres -c `"CREATE DATABASE sefaria;`""
            }
        }
    } catch {
        Write-Warning "Could not connect to PostgreSQL"
        Write-Info "Please ensure PostgreSQL is running and accessible"
    }
}

# Verify database configuration
function Test-DatabaseConfig {
    Write-Info "Verifying database configuration..."

    # Activate virtual environment
    $venvPath = Join-Path $env:USERPROFILE ".virtualenvs\senv"
    $activateScript = Join-Path $venvPath "Scripts\Activate.ps1"

    if (Test-Path $activateScript) {
        & $activateScript
    }

    # Test Django settings
    try {
        $checkOutput = python manage.py check --database default 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Database configuration is valid"
        } else {
            Write-ErrorMsg "Database configuration check failed"
            if ($checkOutput) {
                Write-Info ($checkOutput -join "`n")
            }
            exit 1
        }
    } catch {
        Write-Warning "Database configuration check encountered an unexpected error"
        if ($_.Exception.Message) {
            Write-Info $_.Exception.Message
        }
        exit 1
    }
}

# Main
Write-Info "Setting up database..."
Write-Host ""

New-LocalSettings
Initialize-PostgreSQL
Test-DatabaseConfig

Write-Host ""
Write-Success "Database setup complete!"

if ($env:USE_POSTGRES -eq "true") {
    Write-Info "Using PostgreSQL database"
} else {
    Write-Info "Using SQLite database (file: db.sqlite)"
}
