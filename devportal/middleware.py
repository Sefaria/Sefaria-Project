"""DevportalMiddleware (PLAN.md §2.2 rule Q5, contract C1, C10).

Placed after LanguageSettingsMiddleware in sefaria/settings.py. It does nothing unless the request
is a portal request, which means:

- under sefaria.settings: `request.active_module == DEVELOPERS_MODULE` (set by ModuleMiddleware from
  the host; /api/ and /static/ paths are always the library module, so they never qualify);
- under the standalone settings, which have no ModuleMiddleware: every request except /api/,
  /static/ and the Django admin.

For a portal request it activates English (LanguageSettingsMiddleware may have activated Hebrew for
a visitor from Israel, F-20), makes a CSP nonce for the views and templates, and on the response sets
the CSP, the security headers, `Content-Language: en` and the `Link` header, and records 404s in
NotFoundLog. It never touches the session and sets no cookie.
"""

import hashlib
import logging

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone, translation

from sefaria.constants.model import DEVELOPERS_MODULE

from .security.csp import new_nonce
from .security.headers import apply_portal_headers

logger = logging.getLogger("devportal")

MODULE_MIDDLEWARE = "sefaria.system.middleware.ModuleMiddleware"
# Standalone mode only: paths that are not portal pages (ModuleMiddleware's exclusions plus the admin,
# whose own inline scripts and styles the portal CSP would block).
STANDALONE_EXCLUDED_PREFIXES = ("/api/", "/_api/", "/static/", "/admin/")

# NotFoundLog writes are rate limited: per client address and overall, per minute.
NOT_FOUND_LOG_PER_IP_PER_MINUTE = 30
NOT_FOUND_LOG_TOTAL_PER_MINUTE = 300
MAX_LOGGED_PATH = 1024
MAX_LOGGED_REFERRER = 2048


def is_standalone():
    return MODULE_MIDDLEWARE not in settings.MIDDLEWARE


def is_portal_request(request):
    active_module = getattr(request, "active_module", None)
    if active_module is not None:
        return active_module == DEVELOPERS_MODULE
    if is_standalone():
        return not request.path.startswith(STANDALONE_EXCLUDED_PREFIXES)
    return False


def is_editor_path(path):
    return path == "/editor" or path.startswith("/editor/")


class DevportalMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not is_portal_request(request):
            return self.get_response(request)

        request.is_devportal = True
        request.devportal_nonce = new_nonce()
        translation.activate("en")
        request.LANGUAGE_CODE = "en"

        response = self.get_response(request)

        apply_portal_headers(request, response, request.devportal_nonce, editor=is_editor_path(request.path))
        not_found_path = getattr(response, "devportal_not_found_path", None)
        if not_found_path is None and response.status_code == 404 and request.method in ("GET", "HEAD"):
            not_found_path = request.path
        if not_found_path:
            record_not_found(request, not_found_path)
        return response


def _within_rate_limit(request):
    window = timezone.now().strftime("%Y%m%d%H%M")
    client = request.META.get("REMOTE_ADDR") or "unknown"
    client_key = "dp:404log:ip:" + hashlib.sha256(f"{client}:{window}".encode()).hexdigest()[:32]
    total_key = f"dp:404log:all:{window}"
    for key, limit in ((client_key, NOT_FOUND_LOG_PER_IP_PER_MINUTE), (total_key, NOT_FOUND_LOG_TOTAL_PER_MINUTE)):
        cache.add(key, 0, timeout=120)
        try:
            count = cache.incr(key)
        except ValueError:  # evicted between add and incr
            cache.set(key, 1, timeout=120)
            count = 1
        if count > limit:
            return False
    return True


def record_not_found(request, path):
    """Upserts NotFoundLog for a path (PLAN.md §2.3.3). Never raises: a 404 must still be served."""
    if path.startswith("/_portal/") or len(path) > MAX_LOGGED_PATH:
        return
    try:
        if not _within_rate_limit(request):
            return
        from django.db.models import F  # noqa: PLC0415

        from .models import NotFoundLog  # noqa: PLC0415

        now = timezone.now()
        referrer = (request.META.get("HTTP_REFERER") or "")[:MAX_LOGGED_REFERRER]
        updated = NotFoundLog.objects.filter(path=path).update(
            count=F("count") + 1, last_seen=now, last_referrer=referrer
        )
        if not updated:
            _, created = NotFoundLog.objects.get_or_create(
                path=path,
                defaults={"count": 1, "first_seen": now, "last_seen": now, "last_referrer": referrer},
            )
            if not created:  # another request created it in between
                NotFoundLog.objects.filter(path=path).update(
                    count=F("count") + 1, last_seen=now, last_referrer=referrer
                )
    except Exception:  # noqa: BLE001 - logging a 404 must never turn it into a 500
        logger.warning("Could not record a 404 for %s", path, exc_info=True)
