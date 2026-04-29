from django.conf import settings
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests


def verify_token(credential):
    payload = id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        settings.GOOGLE_SSO_CLIENT_ID,
    )
    return {
        "sub": payload["sub"],
        "email": payload.get("email", ""),
        "given_name": payload.get("given_name", ""),
        "family_name": payload.get("family_name", ""),
    }
