from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
import cryptography.fernet
import structlog

logger = structlog.get_logger(__name__)

def parse_key(key):
    """
    If the key is a string we need to ensure that it can be decoded
    :param key:
    :return:
    """
    return cryptography.fernet.Fernet(key)


def get_crypter(configured_keys=None):
    if not configured_keys:
        configured_keys = getattr(settings, 'FIELD_ENCRYPTION_KEY', None)

    if configured_keys is None:
        logger.warning('FIELD_ENCRYPTION_KEY must be defined in settings')
        return None

    try:
        # Allow the use of key rotation
        if isinstance(configured_keys, (tuple, list)):
            keys = [parse_key(k) for k in configured_keys]
        else:
            # else turn the single key into a list of one
            keys = [parse_key(configured_keys), ]
    except Exception as e:
        raise ImproperlyConfigured(f'FIELD_ENCRYPTION_KEY defined incorrectly: {str(e)}')

    if len(keys) == 0:
        raise ImproperlyConfigured('No keys defined in setting FIELD_ENCRYPTION_KEY')

    return cryptography.fernet.MultiFernet(keys)

def encrypt_str_with_key(s, key):
    cypher = get_crypter(key)
    if cypher:
        return cypher.encrypt(s.encode('utf-8'))

def decrypt_str_with_key(t, key):
    cypher = get_crypter(key)
    if cypher:
        return cypher.decrypt(t.encode('utf-8')).decode('utf-8')