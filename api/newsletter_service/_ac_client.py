"""
The ActiveCampaign (AC) client for the newsletter service.

Every request to AC goes through ActiveCampaignClient.make_request, on the one shared
client defined in this module (`_client`). Code in the package reaches it through
get_ac_client().

Threading model notes:

    In production gunicorn runs several worker processes, and each one runs
    several threads (`--threads`, which switches gunicorn to its gthread worker).
    The module-level `_client` defined below, and the one requests.Session
    inside it, is shared by every thread in a worker process. Sharing the
    session keeps connections to ActiveCampaign (AC) open between requests,
    which saves a new HTTPS handshake on every call.

    Known issue, to be fixed in a separate PR: threads share the session's cookie jar.

    The issue:
        Several threads can write to the same cookie jar at the same time.
        Our code never changes the session after `ActiveCampaignClient.__init__`, but
        requests does: after every response, it saves the response's cookies into
        `session.cookies` so it can send them with later requests. AC sets two
        cookies (PHPSESSID and em_acp_globalauth_cookie) on every reply. So when
        two threads get AC replies at once, both write to the one shared jar.
        requests doesn't promise that a Session is safe to share between threads,
        and its maintainers advise one session per thread
        (https://github.com/psf/requests/issues/1871).

    Why it's unlikely to be a major problem:
        The cookie jar is the only part of the session that changes while it's
        in use. The headers, retry policy and adapter are set once and only read
        afterwards, and urllib3's connection pool is built to be shared by
        threads. We don't use the cookies either: the Api-Token header
        authenticates every call, so it doesn't matter which thread's cookie
        ends up in the jar. And the standard library's cookie jar takes a lock
        while it saves cookies, so two threads writing at once shouldn't corrupt
        it. The one side effect is that every user's requests are sent with the
        same AC web-session cookie (PHPSESSID), which AC doesn't need.

    A possible fix:
        1. Refuse cookies, so requests never writes to the jar:
               session.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))
           (DefaultCookiePolicy is from http.cookiejar. An empty allowed_domains
           list blocks every domain.)
        2. Give each thread its own session, as the requests maintainers advise:
               self._thread_local = threading.local()   # in __init__

               @property
               def _session(self) -> requests.Session:
                   session = getattr(self._thread_local, "session", None)
                   if session is None:
                       session = self._new_session()   # headers, cookie policy, retries
                       self._thread_local.session = session
                   return session
           gunicorn's threads live as long as their worker, so each thread would
           still reuse its session, and its open connection, for every request it
           handles. A worker with 5 threads would hold at most 5 sessions.
           api/conftest.py would then need to mount its RefuseNetworkAdapter in
           `_new_session`, so the adapter covers every thread's session.

    Until then, don't change `_client._session.headers` or `_client._session.cookies`
    after init time.
"""

from __future__ import annotations

import functools
import json
import logging
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.conf import settings

from api.newsletter_service._errors import (
    NewsletterServiceError,
    NewsletterServiceNotConfiguredError,
)

logger: logging.Logger = logging.getLogger(__name__)


# Read from Django settings, not from sefaria.local_settings directly. settings.py
# picks the right file for each environment (local_settings_ci.py in CI, the example
# file when there is no local_settings.py), and a direct import skips that choice.
# getattr keeps an older local_settings.py without these names working; the
# newsletter service is then just turned off.
ACTIVECAMPAIGN_API_TOKEN: str | None = getattr(settings, "ACTIVECAMPAIGN_API_TOKEN", None)
ACTIVECAMPAIGN_ACCOUNT_NAME: str | None = getattr(settings, "ACTIVECAMPAIGN_ACCOUNT_NAME", None)


class ActiveCampaignClient:
    """
    Client for talking to the ActiveCampaign (AC) API.

    In product terms: the newsletter service's one connection to its email provider.
    Code outside this package shouldn't need to know it exists.

    What this class does:
        - Holds a single requests.Session so that multiple API calls reuse the
          same underlying TCP/TLS connection. This is much faster than opening
          a new connection for every call (a fresh HTTPS handshake adds hundreds
          of milliseconds of latency).
        - Sets the auth headers once, in __init__, so every request is
          authenticated without us repeating the headers each time.
        - Translates network/HTTP errors into a single NewsletterServiceError so
          callers only need to catch one exception type.

    Thread safety:
        One instance, and its single session, is shared by every thread in a
        gunicorn worker. The one part of the session that changes while it's in
        use is its cookie jar: requests saves AC's cookies into it after every
        response, so threads can write to it at the same time. That's unlikely to
        cause real problems, because we don't use the cookies and the jar locks
        its writes. The "Threading model" note at the top of this file explains
        the issue and a possible fix for a later PR. Don't add code that changes
        self._session.headers or self._session.cookies after __init__.
    """

    def __init__(self, api_token: str, account_name: str, timeout: int = 10):
        """
        Args:
            api_token: ActiveCampaign API token, sent as the Api-Token header.
            account_name: Sefaria's AC account subdomain (used to build the base URL,
                e.g. account_name 'sefaria' -> https://sefaria.api-us1.com/...).
            timeout: Per-request timeout in seconds. AC sometimes responds slowly
                under load, so 10 seconds is the default.
        """
        self.api_token = api_token
        self.account_name = account_name
        self.timeout = timeout
        self.base_url = f"https://{account_name}.api-us1.com/api/3"
        self._session = requests.Session()
        # Set headers exactly once here. Our code never changes them after this
        # point, though requests itself stores AC's cookies on this session. See
        # the "Threading model" note in the module docstring.
        self._session.headers.update(
            {
                "Api-Token": api_token,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )
        # Retry once on transient connection-phase failures.
        # `connect=1` fires before any bytes reach the server so it is safe
        # for all HTTP methods including POST/PUT.
        # `read=1` with `allowed_methods={"GET","HEAD"}` catches the more
        # common stale-pooled-socket case (firewall silently closed an idle
        # connection; urllib3 wraps the failed write as a ProtocolError and
        # classifies it as a read error). Scoped to idempotent reads only —
        # AC's subscribe/unsubscribe POSTs are not idempotent and replaying
        # them risks double-submitting.
        _retry = Retry(
            connect=1,
            read=1,
            redirect=False,
            status=False,
            allowed_methods=frozenset({"GET", "HEAD"}),
        )
        self._session.mount("https://", HTTPAdapter(max_retries=_retry))

    def make_request(
        self,
        endpoint: str,
        method: str = "GET",
        data: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        """
        Send a request to the ActiveCampaign API and return the parsed JSON.

        This is the only place in the module that talks to AC over the network.
        All higher-level helpers (fetch_ac_lists, find_or_create_ac_contact, etc.)
        go through here to have one place to handle errors and logging.

        Args:
            endpoint: API path (e.g. 'lists', 'contacts/123/contactLists').
            method: HTTP method ('GET', 'POST', 'PUT', etc.). Defaults to 'GET'.
            data: JSON body to send for POST/PUT requests. Pass None for GET.
            timeout: Seconds to wait for this one request. Defaults to the client's
                timeout. Pass a smaller number when a slow AC reply must not hold up
                something more important, like creating a new account.

        Returns:
            dict: The parsed JSON response from ActiveCampaign.

        Raises:
            NewsletterServiceError: For any failure (timeout, connection error,
                HTTP 4xx/5xx, or anything else unexpected). The error message
                includes the AC response body when possible — useful for
                debugging API errors and outages.
        """
        url: str = f"{self.base_url}/{endpoint.lstrip('/')}"
        kwargs: dict[str, Any] = {
            "method": method,
            "url": url,
            "timeout": timeout if timeout is not None else self.timeout,
        }
        if data is not None:
            kwargs["json"] = data

        try:
            response: requests.Response = self._session.request(**kwargs)
            response.raise_for_status()
            return response.json()

        except requests.exceptions.Timeout:
            raise NewsletterServiceError("ActiveCampaign API request timed out")

        except requests.exceptions.ConnectionError:
            raise NewsletterServiceError("Failed to connect to ActiveCampaign API")

        except requests.exceptions.HTTPError as e:
            # Build the most useful error message we can. AC normally returns
            # JSON with a 'message' or 'errors' field. If the body is not JSON
            # (e.g. an HTML error page during an outage), fall back to the raw
            # response text so we still see what AC sent.
            status_code: int | str = (
                e.response.status_code if e.response is not None else "unknown"
            )
            error_msg: str | list[str] = f"ActiveCampaign API error: {status_code}"
            if e.response is not None and e.response.text:
                try:
                    error_data: dict[str, Any] = e.response.json()
                    error_msg = (
                        error_data.get("message")
                        or error_data.get("errors")
                        or error_msg
                    )
                except json.JSONDecodeError:
                    error_msg = f"{error_msg} - {e.response.text}"
            raise NewsletterServiceError(error_msg)

        except Exception as e:
            # Truly unexpected (not a known requests exception). Log with the
            # full stack trace so we can diagnose the surprise after the fact.
            logger.exception(f"Unexpected error calling ActiveCampaign API: {e}")
            raise NewsletterServiceError(
                f"Unexpected error communicating with ActiveCampaign: {str(e)}"
            )


# Module-level singleton instance.
#
# Why we instantiate this eagerly at import time:
#   We want one ActiveCampaignClient (and one requests.Session inside it) shared
#   across the whole module. Sharing the Session means TCP/TLS connections to
#   AC's servers stay open between calls instead of being torn down and rebuilt
#   each time. Building a new HTTPS connection takes hundreds of milliseconds,
#   and the newsletter signup flow makes 5–10 AC calls back-to-back, so reusing
#   one connection saves real time on every signup.
#
# Why this is safe with gunicorn's preload_app=True:
#   This line runs in the parent gunicorn process when the app preloads. That's
#   safe because requests.Session() does NOT open any TCP connections at
#   construction time. It only opens them on the first .request() call. After
#   gunicorn forks worker processes, each worker opens its own connections
#   lazily, so we never share live sockets across processes.
#
# In pytest, the newsletter_client fixture in api/conftest.py replaces this with a
# fake client that refuses network calls, so the tests don't depend on the
# machine's credentials.
_client: ActiveCampaignClient | None = (
    ActiveCampaignClient(ACTIVECAMPAIGN_API_TOKEN, ACTIVECAMPAIGN_ACCOUNT_NAME)
    if ACTIVECAMPAIGN_API_TOKEN and ACTIVECAMPAIGN_ACCOUNT_NAME
    else None
)


def requires_newsletter_service(func):
    """Decorator: raises NewsletterServiceNotConfiguredError if AC credentials are not configured."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        if _client is None:
            raise NewsletterServiceNotConfiguredError(
                "Newsletter service not configured: "
                "ACTIVECAMPAIGN_API_TOKEN and ACTIVECAMPAIGN_ACCOUNT_NAME must be set"
            )
        return func(*args, **kwargs)

    return wrapper


def is_newsletter_service_configured() -> bool:
    """Returns True if AC credentials are set and the client is ready."""
    return _client is not None


def get_ac_client() -> ActiveCampaignClient:
    """
    Return the shared client.

    The other modules call this instead of importing `_client` directly. A direct
    import would copy the client into their own module, so when the test fixture in
    api/conftest.py swaps `_client` for a fake, they would keep using the real one.
    """
    # Always non-None here: callers are either @requires_newsletter_service public functions
    # (which check first) or private helpers that only run from those functions.
    assert _client is not None
    return _client
