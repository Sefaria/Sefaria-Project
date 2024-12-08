from django.conf import settings
from django.core import validators
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone
from django.utils.functional import cached_property
import cryptography.fernet


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
        raise ImproperlyConfigured('FIELD_ENCRYPTION_KEY must be defined in settings')

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
    return cypher.encrypt(s.encode('utf-8'))

def decrypt_str_with_key(t, key):
    cypher = get_crypter(key)
    return cypher.decrypt(t.encode('utf-8')).decode('utf-8')