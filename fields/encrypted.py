import itertools

import django.db
import django.db.models

import cryptography.fernet

from sefaria.utils.encryption import get_crypter


CRYPTER = get_crypter()


def encrypt_str(s):
    # be sure to encode the string to bytes
    return CRYPTER.encrypt(s.encode('utf-8'))


def decrypt_str(t):
    # be sure to decode the bytes to a string
    return CRYPTER.decrypt(t.encode('utf-8')).decode('utf-8')


def calc_encrypted_length(n):
    # calculates the characters necessary to hold an encrypted string of
    # n bytes
    return len(encrypt_str('a' * n))


class EncryptedMixin(object):
    def to_python(self, value):
        if value is None:
            return value

        if isinstance(value, (bytes, str)):
            if isinstance(value, bytes):
                value = value.decode('utf-8')
            try:
                value = decrypt_str(value)
            except cryptography.fernet.InvalidToken:
                pass

        return super(EncryptedMixin, self).to_python(value)

    def from_db_value(self, value, *args, **kwargs):
        return self.to_python(value)

    def get_db_prep_save(self, value, connection):
        value = super(EncryptedMixin, self).get_db_prep_save(value, connection)

        if value is None:
            return value
        # decode the encrypted value to a unicode string, else this breaks in pgsql
        return (encrypt_str(str(value))).decode('utf-8')

    def get_internal_type(self):
        return "TextField"

    def deconstruct(self):
        name, path, args, kwargs = super(EncryptedMixin, self).deconstruct()

        if 'max_length' in kwargs:
            del kwargs['max_length']

        return name, path, args, kwargs


class EncryptedCharField(EncryptedMixin, django.db.models.CharField):
    pass
