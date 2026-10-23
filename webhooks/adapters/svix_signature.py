"""
Svix webhook signatures, checked with the standard library only.

Written here instead of installing the `svix` package: that package is an API client for
Svix's service and depends on an HTTP client and validation libraries (httpx, pydantic, ...),
none of which take part in checking a signature. The check itself is short and Svix documents
it as a supported way to verify: https://docs.svix.com/receiving/verifying-payloads/how-manual

How Svix signs a delivery:
  - The secret is "whsec_" followed by base64; the HMAC key is the decoded base64.
  - The signed text is "<message id>.<unix timestamp>.<raw body>".
  - The signature header holds space-separated "v1,<base64 HMAC-SHA256>" entries. There can
    be several while a secret is being rotated, and any one matching is enough.
  - The timestamp must be within 5 minutes of now, so a captured delivery can't be replayed later.

svix_signature_test.py checks this against the example Svix publishes in that guide, so the
tests don't only check this code against itself.
"""

import base64
import hashlib
import hmac
from collections.abc import Mapping

from webhooks.webhook_source_adapter import lowercase_header_names

SECRET_PREFIX = "whsec_"
SIGNATURE_VERSION = "v1"
TIMESTAMP_TOLERANCE_SECONDS = 5 * 60


def svix_signature_for(
    secret: str, message_id: str, timestamp: int, raw_body: bytes
) -> str:
    """The "v1,<base64>" signature Svix sends for this delivery. Tests use it to sign requests."""
    # The raw bytes are signed as they arrived, never decoded: decoding would raise on a
    # body that isn't UTF-8, and re-encoding could change bytes that the HMAC covers.
    signed_content = f"{message_id}.{timestamp}.".encode() + raw_body
    digest = hmac.new(_hmac_key(secret), signed_content, hashlib.sha256).digest()
    return f"{SIGNATURE_VERSION},{base64.b64encode(digest).decode()}"


def is_valid_svix_signature(
    secret: str, raw_body: bytes, headers: Mapping[str, str], now: float
) -> bool:
    """
    True when the headers carry a valid, current signature of raw_body.

    `now` is passed in (Unix seconds, as time.time() gives them) instead of read here, so tests
    can check the published example and the edges of the 5-minute window without waiting or
    patching the clock. It stays a float: rounding it to whole seconds would move the edge of
    the window by up to a second compared with the svix library.
    """
    lowercased = lowercase_header_names(headers)
    message_id = _svix_or_standard_header(lowercased, "id")
    timestamp_text = _svix_or_standard_header(lowercased, "timestamp")
    signatures = _svix_or_standard_header(lowercased, "signature")
    if not (message_id and timestamp_text and signatures):
        return False
    # isdigit, not int(): int() would also accept " 17", "+17" and "1_7", and the signature
    # covers the exact text, so a reformatted timestamp is not the one that was signed.
    if not (timestamp_text.isascii() and timestamp_text.isdigit()):
        return False
    if abs(now - int(timestamp_text)) > TIMESTAMP_TOLERANCE_SECONDS:
        return False
    expected = svix_signature_for(
        secret, message_id, int(timestamp_text), raw_body
    ).encode()
    # Every entry is compared, even after a match, so the response time doesn't reveal which
    # entry matched. compare_digest on the base64 text (not on decoded bytes) means a garbled
    # entry is simply unequal; decoding it first could raise.
    return any(
        [
            hmac.compare_digest(expected, candidate.encode())
            for candidate in signatures.split(" ")
        ]
    )


def _hmac_key(secret: str) -> bytes:
    # Svix's own libraries accept the secret with or without the prefix, so this does too.
    # A secret that isn't valid base64 raises here: that is a configuration mistake, and it
    # should fail loudly rather than reject every delivery as a bad signature.
    return base64.b64decode(secret.removeprefix(SECRET_PREFIX), validate=True)


def _svix_or_standard_header(
    lowercased_headers: Mapping[str, str], name: str
) -> str | None:
    # Svix sends svix-id / svix-timestamp / svix-signature. The Standard Webhooks spec, which
    # Svix follows, names the same headers webhook-*. Each is looked up separately, preferring
    # svix-*, which is what the svix library does.
    return lowercased_headers.get(f"svix-{name}") or lowercased_headers.get(
        f"webhook-{name}"
    )
