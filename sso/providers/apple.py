import requests as http_requests
from authlib.jose import JsonWebKey, jwt as jose_jwt
from django.conf import settings


_APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


def verify_token(id_token):
    resp = http_requests.get(_APPLE_JWKS_URL, timeout=5)
    resp.raise_for_status()
    jwks = JsonWebKey.import_key_set(resp.json())
    claims = jose_jwt.decode(id_token, jwks)
    claims.validate()
    if claims.get("iss") != "https://appleid.apple.com":
        raise ValueError("Invalid issuer")
    valid_audiences = {settings.APPLE_SSO_CLIENT_ID, settings.APPLE_SSO_IOS_BUNDLE_ID}
    if claims.get("aud") not in valid_audiences:
        raise ValueError("Invalid audience")
    return {
        "sub": claims["sub"],
        "email": claims.get("email", ""),
    }
