"""
A read-back mailbox for end-to-end tests: keeps a copy of emails sent to test addresses so a test
on a staging deployment can open the link inside them.

Off unless TEST_MAILBOX_ENABLED is on and TEST_MAILBOX_TOKEN is set. Only addresses matching
TEST_MAILBOX_ADDRESS_REGEX are kept, in the default cache (shared by every pod), for
TEST_MAILBOX_TTL_SECONDS. Mail still goes out through the configured backend; this only keeps a copy.
"""

import hmac
import logging
import re

from django.conf import settings
from django.core.cache import cache
from django.http import Http404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

from sefaria.client.util import jsonResponse

logger = logging.getLogger(__name__)

TOKEN_HEADER = "X-Test-Mailbox-Token"
CACHE_KEY_PREFIX = "e2e-mailbox:"
LINK_PATTERN = re.compile(r"https?://[^\s<>\"']+")


def enabled():
    return bool(getattr(settings, "TEST_MAILBOX_ENABLED", False) and getattr(settings, "TEST_MAILBOX_TOKEN", None))


def is_test_address(address):
    pattern = getattr(settings, "TEST_MAILBOX_ADDRESS_REGEX", "")
    return bool(pattern and address and re.search(pattern, address, re.IGNORECASE))


def _key(address):
    return CACHE_KEY_PREFIX + address.strip().lower()


def links_in(text):
    return [link.rstrip(".,;:)]") for link in LINK_PATTERN.findall(text or "")]


def record(recipients, subject, body):
    """Keep a copy of a sent email for each test address among the recipients. Never raises."""
    if not enabled():
        return
    try:
        message = {
            "subject": subject,
            "sent_at": timezone.now().isoformat(),
            "links": links_in(body),
            "body": body,
        }
        timeout = getattr(settings, "TEST_MAILBOX_TTL_SECONDS", 60 * 60)
        for address in recipients:
            if is_test_address(address):
                cache.set(_key(address), {"to": address, **message}, timeout)
    except Exception:
        logger.exception("Could not keep a test mailbox copy")


def _authorized(request):
    expected = getattr(settings, "TEST_MAILBOX_TOKEN", None) or ""
    given = request.headers.get(TOKEN_HEADER) or ""
    return bool(expected) and hmac.compare_digest(given.encode(), expected.encode())


@never_cache
@require_GET
def latest_api(request):
    """The latest email kept for ?to=<address>. 404 unless the mailbox is on and the token matches."""
    if not enabled() or not _authorized(request):
        raise Http404
    address = request.GET.get("to", "")
    if not is_test_address(address):
        raise Http404
    message = cache.get(_key(address))
    if message is None:
        return jsonResponse({"error": "No message for this address yet."}, status=404)
    return jsonResponse(message)
