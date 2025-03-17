import os

SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']
ALLOWED_HOSTS = ['*']

MONGO_HOST = os.getenv("MONGO_HOST", "localhost")
MONGO_PORT = int(os.getenv("MONGO_PORT", 27017))
SEFARIA_DB = os.getenv('MONGO_DB_NAME')
SEFARIA_DB_USER = os.getenv('MONGO_DB_USER', '')
SEFARIA_DB_PASSWORD = os.getenv('MONGO_DB_PASSWORD', '')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('POSTGRES_DB', 'sefaria_auth'),
        'USER': os.getenv('POSTGRES_USER', 'admin'),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'admin'),
        'HOST': os.getenv('POSTGRES_HOST', 'localhost'),
        'PORT': os.getenv('POSTGRES_PORT', '5432'),
    }
}

ADMIN_PATH = 'admin'