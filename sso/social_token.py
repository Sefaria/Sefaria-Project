"""
The identity token Django gives Sefaria Social, and the public keys that verify it.

Django signs a short-lived JWT (RS256) with an RSA private key only Django holds. Social and its
relay verify it with the public keys published as a JWKS document, so they can check who a user
is but can never mint that identity themselves.

Keys come from settings.SOCIAL_TOKEN_PRIVATE_KEYS, a list of {"kid": ..., "pem": ...}. The first
key signs; every key is published. Nothing here ever generates a key: with no keys configured
the token endpoint answers 503 and the JWKS is empty.

Signing uses the installed PyJWT 1.7.1 with `cryptography` (RS256 is supported there); neither is
upgraded for this.
"""

from __future__ import annotations

import base64
import secrets
import time
from dataclasses import dataclass
from functools import lru_cache

import jwt
import structlog
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from django.conf import settings

logger = structlog.get_logger(__name__)

SOCIAL_TOKEN_AUDIENCE = "sefaria-social"
SOCIAL_TOKEN_ALGORITHM = "RS256"
DEFAULT_SOCIAL_TOKEN_LIFETIME_SECONDS = 10 * 60
MINIMUM_RSA_KEY_BITS = 2048


class SocialTokenNotConfigured(Exception):
    """No usable signing key is configured. The view answers 503."""


@dataclass(frozen=True)
class SocialTokenKey:
    kid: str
    private_key: RSAPrivateKey


def _b64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


@lru_cache(maxsize=4)
def _load_keys(configured: tuple[tuple[str, str], ...]) -> tuple[SocialTokenKey, ...]:
    """
    Parses the configured PEMs once per distinct configuration. Any invalid entry makes the whole
    configuration unusable (empty), so a typo can't silently publish one key and sign with another.
    """
    keys = []
    seen_kids = set()
    for kid, pem in configured:
        if not kid or kid in seen_kids:
            logger.error("social_token_key_invalid", reason="missing_or_duplicate_kid")
            return ()
        seen_kids.add(kid)
        try:
            private_key = serialization.load_pem_private_key(pem.encode("utf-8"), password=None)
        except (ValueError, TypeError) as error:
            logger.error("social_token_key_invalid", kid=kid, reason=type(error).__name__)
            return ()
        if not isinstance(private_key, RSAPrivateKey) or private_key.key_size < MINIMUM_RSA_KEY_BITS:
            logger.error("social_token_key_invalid", kid=kid, reason="not_rsa_2048_or_larger")
            return ()
        keys.append(SocialTokenKey(kid=kid, private_key=private_key))
    return tuple(keys)


def configured_keys() -> tuple[SocialTokenKey, ...]:
    raw = getattr(settings, "SOCIAL_TOKEN_PRIVATE_KEYS", None) or []
    try:
        configured = tuple((str(entry.get("kid") or ""), str(entry.get("pem") or "")) for entry in raw)
    except AttributeError:
        logger.error("social_token_key_invalid", reason="entries_must_be_objects")
        return ()
    return _load_keys(configured)


def social_token_issuer() -> str:
    """
    SOCIAL_TOKEN_ISSUER, or else the English library origin from DOMAIN_MODULES. A fixed value, not
    the request's host, so the issuer is the same on every domain (sefaria.org and sefaria.org.il).
    """
    issuer = getattr(settings, "SOCIAL_TOKEN_ISSUER", None)
    if issuer:
        return issuer.rstrip("/")
    domain_modules = getattr(settings, "DOMAIN_MODULES", None) or {}
    return (domain_modules.get("en", {}).get("library") or "").rstrip("/")


def social_token_lifetime_seconds() -> int:
    return int(getattr(settings, "SOCIAL_TOKEN_LIFETIME_SECONDS", None) or DEFAULT_SOCIAL_TOKEN_LIFETIME_SECONDS)


def _absolute_http_url(value) -> str | None:
    if isinstance(value, str) and value.startswith(("https://", "http://")):
        return value
    return None


def mint_social_token(user, name: str = "", picture: str | None = None) -> tuple[str, int]:
    """Returns (token, expires_at) for `user`. expires_at is the `exp` claim, in Unix seconds."""
    keys = configured_keys()
    if not keys:
        raise SocialTokenNotConfigured
    signing_key = keys[0]
    issued_at = int(time.time())
    expires_at = issued_at + social_token_lifetime_seconds()
    claims = {
        "iss": social_token_issuer(),
        "aud": SOCIAL_TOKEN_AUDIENCE,
        # auth_user.id, never username (which is a hash of the email).
        "sub": str(user.pk),
        "name": name,
        "staff": bool(user.is_staff),
        "iat": issued_at,
        "exp": expires_at,
        "jti": secrets.token_urlsafe(16),
    }
    picture_url = _absolute_http_url(picture)
    if picture_url:
        claims["picture"] = picture_url
    token = jwt.encode(
        claims, signing_key.private_key, algorithm=SOCIAL_TOKEN_ALGORITHM, headers={"kid": signing_key.kid}
    )
    if isinstance(token, bytes):  # PyJWT 1.x returns bytes, 2.x returns str
        token = token.decode("ascii")
    return token, expires_at


def public_jwks() -> dict:
    """The JWKS document: one RSA public key per configured key, signing key first."""
    jwks = []
    for key in configured_keys():
        numbers = key.private_key.public_key().public_numbers()
        jwks.append(
            {
                "kty": "RSA",
                "use": "sig",
                "alg": SOCIAL_TOKEN_ALGORITHM,
                "kid": key.kid,
                "n": _b64url_uint(numbers.n),
                "e": _b64url_uint(numbers.e),
            }
        )
    return {"keys": jwks}
