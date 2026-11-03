"""
Pins the JWT stack behind the REST auth endpoints: djangorestframework-simplejwt
on top of PyJWT.

Pure unit tests: no Django models, no Mongo.
"""
import os
import re

import jwt
import pytest
from rest_framework_simplejwt.backends import TokenBackend
from rest_framework_simplejwt.exceptions import TokenBackendError

REQUIREMENTS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "requirements.txt"
)
# PyJWT 2.4.0 is the first release with the algorithm-handling fix for CVE-2022-29217.
MIN_PYJWT = (2, 4, 0)
SIGNING_KEY = "test-signing-key-at-least-256-bits-long-0123456789"


def _version_tuple(text):
    return tuple(int(part) for part in text.split("."))


def _pinned_pyjwt_version():
    with open(REQUIREMENTS_PATH) as requirements:
        for line in requirements:
            match = re.match(r"^pyjwt==([0-9.]+)\s*$", line.strip(), re.IGNORECASE)
            if match:
                return _version_tuple(match.group(1))
    raise AssertionError("requirements.txt has no exact pyjwt pin")


def test_pinned_pyjwt_includes_algorithm_fix():
    assert _pinned_pyjwt_version() >= MIN_PYJWT


def test_installed_pyjwt_includes_algorithm_fix():
    assert _version_tuple(jwt.__version__) >= MIN_PYJWT


def test_backend_encode_returns_str_and_round_trips():
    backend = TokenBackend(algorithm="HS256", signing_key=SIGNING_KEY)
    token = backend.encode({"token_type": "access", "user_id": "42"})

    assert isinstance(token, str)
    payload = backend.decode(token)
    assert payload["user_id"] == "42"
    assert payload["token_type"] == "access"


def test_backend_rejects_token_signed_with_other_algorithm():
    signer = TokenBackend(algorithm="HS512", signing_key=SIGNING_KEY)
    verifier = TokenBackend(algorithm="HS256", signing_key=SIGNING_KEY)
    token = signer.encode({"token_type": "access", "user_id": "42"})

    with pytest.raises(TokenBackendError):
        verifier.decode(token)
