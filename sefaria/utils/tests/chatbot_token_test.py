"""
Unit tests for the encrypted chatbot user token.

The token is AES-GCM sealed with a key derived from CHATBOT_USER_ID_SECRET. These tests
pin the payload checks on top of that seal: the hashed user id must match the user id,
and the audience must match this service. Tokens minted before the audience claim
existed are accepted only while CHATBOT_ACCEPT_LEGACY_TOKENS is enabled.
"""
import base64
import hashlib
import json
import os
from datetime import timedelta

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.test import override_settings
from django.utils import timezone

from sefaria.utils.chatbot import build_chatbot_user_token, get_user_id_from_chatbot_user_token

SECRET = "unit-test-chatbot-secret"
AUDIENCE = "sefaria-chatbot-session"
USER_ID = 42


def _hash_user_id(user_id):
    return hashlib.sha256(str(user_id).encode("utf-8")).hexdigest()


def _payload(user_id=USER_ID, **overrides):
    payload = {
        "id": _hash_user_id(user_id),
        "user_id": user_id,
        "expiration": (timezone.now() + timedelta(hours=1)).replace(microsecond=0).isoformat(),
        "aud": AUDIENCE,
    }
    payload.update(overrides)
    return payload


def _seal(payload, secret=SECRET):
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    nonce = os.urandom(12)
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(nonce + AESGCM(key).encrypt(nonce, body, None)).decode("ascii")


def _open(token, secret=SECRET):
    raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    body = AESGCM(hashlib.sha256(secret.encode("utf-8")).digest()).decrypt(raw[:12], raw[12:], None)
    return json.loads(body.decode("utf-8"))


class TestChatbotUserTokenBuild:

    def test_built_token_round_trips_to_user_id(self):
        token = build_chatbot_user_token(USER_ID, SECRET)
        assert get_user_id_from_chatbot_user_token(token, SECRET) == USER_ID

    def test_built_token_carries_user_hash_and_audience(self):
        payload = _open(build_chatbot_user_token(USER_ID, SECRET))
        assert payload["id"] == _hash_user_id(USER_ID)
        assert payload["aud"] == AUDIENCE


class TestChatbotUserTokenVerify:

    def test_token_with_audience_is_accepted(self):
        assert get_user_id_from_chatbot_user_token(_seal(_payload()), SECRET) == USER_ID

    def test_token_with_mismatched_user_hash_is_rejected(self):
        token = _seal(_payload(USER_ID, id=_hash_user_id(USER_ID + 1)))
        assert get_user_id_from_chatbot_user_token(token, SECRET) is None

    def test_token_with_wrong_audience_is_rejected(self):
        token = _seal(_payload(aud="another-service"))
        assert get_user_id_from_chatbot_user_token(token, SECRET) is None

    def test_legacy_token_without_audience_is_accepted_by_default(self):
        legacy = _payload()
        del legacy["aud"]
        assert get_user_id_from_chatbot_user_token(_seal(legacy), SECRET) == USER_ID

    def test_legacy_token_without_audience_is_rejected_when_disabled(self):
        legacy = _payload()
        del legacy["aud"]
        with override_settings(CHATBOT_ACCEPT_LEGACY_TOKENS=False):
            assert get_user_id_from_chatbot_user_token(_seal(legacy), SECRET) is None
