import base64
import hashlib
import json
import os
from datetime import timedelta

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.utils import timezone

DEFAULT_TTL_HOURS = 72
NONCE_SIZE_BYTES = 12


def _hash_user_id(user_id):
    return hashlib.sha256(str(user_id).encode("utf-8")).hexdigest()


def _derive_key(secret):
    return hashlib.sha256(secret.encode("utf-8")).digest()


def build_chatbot_user_token(user_id, secret, now=None, ttl_hours=DEFAULT_TTL_HOURS):
    if not user_id or not secret:
        return None

    expires_at = (now or timezone.now()) + timedelta(hours=ttl_hours)
    payload = {
        "id": _hash_user_id(user_id),
        "expiration": expires_at.replace(microsecond=0).isoformat(),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    key = _derive_key(secret)
    aesgcm = AESGCM(key)
    nonce = os.urandom(NONCE_SIZE_BYTES)
    encrypted = aesgcm.encrypt(nonce, payload_bytes, None)
    token_bytes = nonce + encrypted
    return base64.urlsafe_b64encode(token_bytes).decode("ascii")
