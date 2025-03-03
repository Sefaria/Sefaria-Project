import os

SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']
ALLOWED_HOSTS = ['*']

MONGO_HOST = os.getenv("MONGO_HOST", "localhost")
MONGO_PORT = int(os.getenv("MONGO_PORT", 27017))
# Name of the MongoDB database to use.
SEFARIA_DB = os.getenv('MONGO_DB_NAME')
# Leave user and password blank if not using Mongo Auth
SEFARIA_DB_USER = os.getenv('MONGO_DB_USER', '')
SEFARIA_DB_PASSWORD = os.getenv('MONGO_DB_PASSWORD', '')
