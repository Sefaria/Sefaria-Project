import base64
import binascii
import hashlib
import json
import os
from datetime import timedelta

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime

DEFAULT_TTL_HOURS = 72
NONCE_SIZE_BYTES = 12


def resolve_chatbot_version(request):
    """
    The ai-chatbot PR preview this request should use: ``?chatbot_version=<PR#>`` is
    remembered in the session for later pages, and ``?chatbot_version=clear`` forgets it.
    With neither, ``settings.CHATBOT_DEFAULT_VERSION`` (the landy POC pins its preview there).

    Both the script tag (context processor) and the widget's API base (``base_props``)
    read it through here. ``base_props`` runs before the context processors, so reading
    only the session there pointed the first page at the default backend.
    """
    requested = request.GET.get("chatbot_version", "").strip()
    default = getattr(settings, "CHATBOT_DEFAULT_VERSION", None)
    if requested == "clear":
        request.session.pop("chatbot_version", None)
        return default
    if requested:
        request.session["chatbot_version"] = requested
        return requested
    return request.session.get("chatbot_version") or default


def _hash_user_id(user_id):
    return hashlib.sha256(str(user_id).encode("utf-8")).hexdigest()


def _derive_key(secret):
    return hashlib.sha256(secret.encode("utf-8")).digest()


def _decrypt_chatbot_user_token(token, secret):
    padded_token = token + ("=" * (-len(token) % 4))
    token_bytes = base64.urlsafe_b64decode(padded_token.encode("ascii"))
    if len(token_bytes) <= NONCE_SIZE_BYTES:
        return None

    nonce = token_bytes[:NONCE_SIZE_BYTES]
    encrypted = token_bytes[NONCE_SIZE_BYTES:]
    aesgcm = AESGCM(_derive_key(secret))
    payload_bytes = aesgcm.decrypt(nonce, encrypted, None)
    payload = json.loads(payload_bytes.decode("utf-8"))

    expiration = parse_datetime(payload.get("expiration"))
    if expiration is None:
        return None
    if timezone.is_naive(expiration):
        expiration = timezone.make_aware(expiration, timezone.utc)
    if expiration <= timezone.now():
        return None

    return payload


def build_chatbot_user_token(user_id, secret, now=None, ttl_hours=DEFAULT_TTL_HOURS):
    if not user_id or not secret:
        return None

    expires_at = (now or timezone.now()) + timedelta(hours=ttl_hours)
    payload = {
        "id": _hash_user_id(user_id),
        "user_id": int(user_id),
        "expiration": expires_at.replace(microsecond=0).isoformat(),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    key = _derive_key(secret)
    aesgcm = AESGCM(key)
    nonce = os.urandom(NONCE_SIZE_BYTES)
    encrypted = aesgcm.encrypt(nonce, payload_bytes, None)
    token_bytes = nonce + encrypted
    return base64.urlsafe_b64encode(token_bytes).decode("ascii")


def get_user_id_from_chatbot_user_token(token, secret):
    if not token or not secret:
        return None

    try:
        payload = _decrypt_chatbot_user_token(token, secret)
        if payload is None:
            return None
        user_id = int(payload["user_id"])
        return user_id if user_id > 0 else None
    except (binascii.Error, InvalidTag, KeyError, TypeError, ValueError):
        return None
