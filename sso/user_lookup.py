"""
Which Sefaria account has this email address? Asked by Sefaria Social when someone is invited to a
room by email (sefaria-social spec 059): an account is told in Social, any other address is emailed.

    POST /api/social/user-lookup
    Content-Type: application/json
    X-Sefaria-Signature: sha256=<lowercase hex HMAC-SHA256(SOCIAL_LOOKUP_SECRET, raw body)>

    {"email": "<address>"}

    200 {"user_id": <int>}   -- an active account has that address
    404 {}                   -- none does (or only a deactivated one)
    400 {"error": ...}       -- not JSON, no email, or a body over 1 KB
    401 {"error": ...}       -- missing or wrong signature
    503 {"error": ...}       -- SOCIAL_LOOKUP_SECRET is not set

Server to server only: the signature is the same scheme as the account-deletion webhook
(sso/user_deleted_webhook.py), checked over the raw bytes before parsing, in constant time. The
address is never logged. Accounts are found with get_user(email) (the username is a hash of the
address, never the address).
"""

from __future__ import annotations

import hmac
import json

import structlog
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from emailusernames.utils import get_user
from sso.user_deleted_webhook import SIGNATURE_HEADER, sign_body

logger = structlog.get_logger(__name__)

MAX_BODY_BYTES = 1024
MAX_EMAIL_LENGTH = 320


def _signature_ok(secret: str, body: bytes, given: str | None) -> bool:
    if not given:
        return False
    expected = sign_body(secret, body)
    return hmac.compare_digest(expected.encode("ascii"), given.strip().encode("ascii", "ignore"))


@csrf_exempt
@require_POST
def social_user_lookup(request):
    secret = getattr(settings, "SOCIAL_LOOKUP_SECRET", None)
    if not secret:
        return JsonResponse({"error": "lookup_not_configured"}, status=503)
    body = request.body
    if len(body) > MAX_BODY_BYTES:
        return JsonResponse({"error": "body_too_large"}, status=400)
    if not _signature_ok(secret, body, request.headers.get(SIGNATURE_HEADER)):
        logger.warning("social_user_lookup_bad_signature")
        return JsonResponse({"error": "bad_signature"}, status=401)
    try:
        payload = json.loads(body)
    except ValueError:
        return JsonResponse({"error": "invalid_json"}, status=400)
    email = payload.get("email") if isinstance(payload, dict) else None
    if not isinstance(email, str) or not email.strip() or len(email) > MAX_EMAIL_LENGTH:
        return JsonResponse({"error": "invalid_email"}, status=400)
    try:
        user = get_user(email.strip())
    except Exception:  # get_user raises DoesNotExist (and MultipleObjectsReturned) for no single match
        user = None
    if user is not None and not user.is_active:
        # A deactivated account is not told in Social: Social emails the address instead.
        user = None
    response = JsonResponse({"user_id": user.pk}, status=200) if user else JsonResponse({}, status=404)
    response["Cache-Control"] = "no-store"
    return response
