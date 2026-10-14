"""
Newsletter Service Module

Integrates with ActiveCampaign API to fetch and manage newsletter lists and metadata.
Handles all API communication with ActiveCampaign.

Threading model notes:

    In production gunicorn is used with multiple worker processes, each running
    multiple threads. That means the module-level `_client` defined
    below is shared across many threads inside a single worker process.

    `requests.Session` is safe to share across threads for `.request()` calls
    AS LONG AS the session's headers or cookies are modified after it has been
    constructed. The headers are set exactly once inside `NewsletterClient.__init__`
    and never touched again. Do NOT call
    `_client._session.headers.update(...)` or `_client._session.cookies.set(...)`
    after init time — that would introduce a race condition between threads.
"""

from __future__ import annotations

import functools
import json
import logging
import re
from collections.abc import Mapping, Sequence
from typing import Any, TypedDict
from urllib.parse import quote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email as django_validate_email

from sefaria.system.exceptions import InputError
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db

logger: logging.Logger = logging.getLogger(__name__)

NEWSLETTER_LIST_CACHE_KEY: str = "newsletter_list_from_ac"
NEWSLETTER_LIST_CACHE_TTL: int = 60 * 60  # 1 hour

# Read from Django settings, not from sefaria.local_settings directly. settings.py
# picks the right file for each environment (local_settings_ci.py in CI, the example
# file when there is no local_settings.py), and a direct import skips that choice.
# getattr keeps an older local_settings.py without these names working; the
# newsletter service is then just turned off.
ACTIVECAMPAIGN_API_TOKEN: str | None = getattr(settings, "ACTIVECAMPAIGN_API_TOKEN", None)
ACTIVECAMPAIGN_ACCOUNT_NAME: str | None = getattr(settings, "ACTIVECAMPAIGN_ACCOUNT_NAME", None)

type DisplayName = dict[str, str | None]

# ========== Typed dict shapes for structured return values ==========


class NewsletterInfo(TypedDict):
    """One managed newsletter with display metadata. Element of get_newsletter_list()."""

    id: str
    stringid: str
    displayName: DisplayName
    icon: str
    language: str
    primary: bool


class SubscribeResult(TypedDict):
    """Return shape of subscribe_with_union: the contact and the union of all current subscriptions."""

    contact: dict[str, Any]
    all_subscriptions: list[str]


class UserSubscriptions(TypedDict):
    """Return shape of fetch_user_subscriptions_impl: a user's full subscription state."""

    subscribed_newsletters: list[str]
    learning_level: int | None
    wants_marketing_emails: bool


class PreferencesResult(TypedDict):
    """Return shape of update_user_preferences_impl: the contact and the post-update subscription list."""

    contact: dict[str, Any]
    subscribed_newsletters: list[str]


class LearningLevelACResult(TypedDict):
    """Return shape of update_learning_level_in_ac: confirms what was written to AC."""

    contact_id: str
    email: str
    learning_level: int | None


class LearningLevelResult(TypedDict):
    """Return shape of update_learning_level_impl: combined outcome of AC + UserProfile updates."""

    email: str
    learning_level: int | None
    user_id: int | None
    message: str


class ActiveCampaignError(Exception):
    """Custom exception for ActiveCampaign API errors"""

    pass


class NewsletterListUnavailableError(ActiveCampaignError):
    """Raised when managed newsletter metadata cannot be loaded for a user flow."""

    pass


class NewsletterServiceNotConfiguredError(ActiveCampaignError):
    """
    Raised when the ActiveCampaign credentials aren't set (common in local dev and CI).
    The views answer 503 for it instead of the 500 a real AC failure gets. It's a
    subclass so code that already catches ActiveCampaignError still catches it.
    """

    pass


class InvalidEmailError(InputError):
    """
    Raised when an email address isn't valid. The person can fix this by correcting
    the address, so it carries a code the page uses to show a translated message.
    The page checks emails too, but its check accepts some addresses this one
    rejects (for example, Hebrew letters before the @).
    """

    code: str = "invalid_email"


def normalize_and_validate_email(email: str) -> str:
    """
    Return a trimmed email address or raise InvalidEmailError before any AC request.
    """
    if not isinstance(email, str):
        raise InvalidEmailError("Invalid email address.")

    normalized_email = email.strip()
    try:
        django_validate_email(normalized_email)
    except ValidationError:
        raise InvalidEmailError("Invalid email address.")
    return normalized_email


class NewsletterClient:
    """
    Client for talking to the ActiveCampaign (AC) API.

    What this class does:
        - Holds a single requests.Session so that multiple API calls reuse the
          same underlying TCP/TLS connection. This is much faster than opening
          a new connection for every call (a fresh HTTPS handshake adds hundreds
          of milliseconds of latency).
        - Sets the auth headers once, in __init__, so every request is
          authenticated without us repeating the headers each time.
        - Translates network/HTTP errors into a single ActiveCampaignError so
          callers only need to catch one exception type.

    Thread safety:
        After __init__ finishes, this instance is safe to share across threads.
        See the "Threading model" note at the top of this file. Do NOT add code
        that mutates self._session.headers or self._session.cookies later — that
        would create a race condition between threads sharing this client.
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
        # Set headers exactly once here. They are never mutated after this point
        # — see the thread-safety note in the module docstring.
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
        All higher-level helpers (get_all_lists, find_or_create_contact, etc.)
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
            ActiveCampaignError: For any failure (timeout, connection error,
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
            raise ActiveCampaignError("ActiveCampaign API request timed out")

        except requests.exceptions.ConnectionError:
            raise ActiveCampaignError("Failed to connect to ActiveCampaign API")

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
            raise ActiveCampaignError(error_msg)

        except Exception as e:
            # Truly unexpected (not a known requests exception). Log with the
            # full stack trace so we can diagnose the surprise after the fact.
            logger.exception(f"Unexpected error calling ActiveCampaign API: {e}")
            raise ActiveCampaignError(
                f"Unexpected error communicating with ActiveCampaign: {str(e)}"
            )


# Module-level singleton instance.
#
# Why we instantiate this eagerly at import time:
#   We want one NewsletterClient (and one requests.Session inside it) shared
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
_client: NewsletterClient | None = (
    NewsletterClient(ACTIVECAMPAIGN_API_TOKEN, ACTIVECAMPAIGN_ACCOUNT_NAME)
    if ACTIVECAMPAIGN_API_TOKEN and ACTIVECAMPAIGN_ACCOUNT_NAME
    else None
)


def requires_ac_client(func):
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


def wraps_ac_errors(func):
    """
    Wrap unexpected exceptions raised by `func` as ActiveCampaignError.

    Behavior:
        - `ActiveCampaignError` and `InputError` propagate unchanged so callers
          can still distinguish them. The lower layer (NewsletterClient.make_request)
          already logs ActiveCampaignError detail, so we don't re-log here.
        - Anything else (KeyError, TypeError, network errors that escaped the
          client, etc.) is logged with a full traceback via `logger.exception`
          and re-raised as ActiveCampaignError, so callers only need to handle
          one exception type.

    Composition:
        When combined with `@requires_ac_client`, put `@requires_ac_client`
        outermost (above) so its "not configured" ActiveCampaignError doesn't
        get re-wrapped — the pass-through clause below handles it harmlessly
        either way, but the outer placement reads more naturally.

        @requires_ac_client
        @wraps_ac_errors
        def my_service_fn(...): ...
    """

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (ActiveCampaignError, InputError):
            raise
        except Exception as e:
            logger.exception(f"Error in {func.__name__}: {e}")
            raise ActiveCampaignError(f"Error in {func.__name__}: {str(e)}")

    return wrapper


def is_newsletter_service_configured() -> bool:
    """Returns True if AC credentials are set and the client is ready."""
    return _client is not None


def _get_client() -> NewsletterClient:
    # Always non-None here: callers are either @requires_ac_client public functions
    # (which check first) or private helpers that only run from those functions.
    assert _client is not None
    return _client


# Module-level cache: maps AC custom field perstags (personalization tags) to their numeric IDs.
# Populated on first call to get_ac_field_id_by_perstag(), persists for process lifetime.
_field_id_cache: dict[str, str] = {}


def get_ac_field_id_by_perstag(perstag: str) -> str:
    """
    Look up an ActiveCampaign custom field ID by its perstag.

    Fetches all fields on first call and caches the full mapping.
    Subsequent calls return from cache without an API call.
    TODO: reconsider using actual cache in the future

    Args:
        perstag (str): The perstag identifier (e.g., 'LEARNING_LEVEL')

    Returns:
        str: The numeric field ID as a string

    Raises:
        ActiveCampaignError: If field not found or API request fails
    """
    if perstag in _field_id_cache:
        return _field_id_cache[perstag]

    response: dict[str, Any] = _get_client().make_request("fields?limit=100")
    fields: list[dict[str, Any]] = response.get("fields", [])

    _field_id_cache.update({f["perstag"]: f["id"] for f in fields if f.get("perstag")})

    if perstag not in _field_id_cache:
        raise ActiveCampaignError(
            f"Custom field with perstag '{perstag}' not found in ActiveCampaign"
        )

    return _field_id_cache[perstag]


# TODO: evaluate whether this can be cached
@wraps_ac_errors
def get_all_lists() -> list[dict[str, Any]]:
    """
    Fetch all mailing lists from ActiveCampaign.

    Returns:
        list: List of newsletter list objects with 'id', 'stringid', and 'name' fields.

    Raises:
        ActiveCampaignError: If the API request fails.
    """
    response: dict[str, Any] = _get_client().make_request("lists?limit=100")
    lists: list[dict[str, Any]] = response.get("lists", [])
    logger.info(f"Retrieved {len(lists)} lists from ActiveCampaign")
    return lists


@wraps_ac_errors
def get_all_personalization_variables() -> list[dict[str, Any]]:
    """
    Fetch all personalization variables from ActiveCampaign.

    Returns:
        list: List of personalization variable objects

    Raises:
        ActiveCampaignError: If API request fails
    """
    response: dict[str, Any] = _get_client().make_request("personalizations?limit=100")
    variables: list[dict[str, Any]] = response.get("personalizations", [])
    logger.info(
        f"Retrieved {len(variables)} personalization variables from ActiveCampaign"
    )
    return variables


# Precompiled at module load so we don't pay the compile/cache-lookup cost
# on every call. get_newsletter_list() runs this against every personalization
# variable AC returns
_LIST_META_TAG_RE: re.Pattern[str] = re.compile(r"list_(\d+)_meta")


def extract_list_id_from_tag(tag: str | Any) -> int | None:
    """
    Extract list ID from a personalization variable tag using regex.

    Args:
        tag (str): Tag string like "list_1_meta" (lowercase from ActiveCampaign API)

    Returns:
        int or None: The extracted list ID, or None if tag doesn't match pattern

    Example:
        extract_list_id_from_tag("list_1_meta") -> 1
        extract_list_id_from_tag("list_999_meta") -> 999
        extract_list_id_from_tag("invalid_tag") -> None
    """
    if not tag or not isinstance(tag, str):
        return None
    match: re.Match[str] | None = _LIST_META_TAG_RE.match(tag)
    return int(match.group(1)) if match else None


def parse_metadata_from_variable(
    variable: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Parse metadata JSON from a personalization variable's content field.

    Args:
        variable (dict): Personalization variable object with 'content' field

    Returns:
        dict or None: Parsed metadata object, or None if parsing fails or the
        JSON isn't an object
    """
    if not variable or "content" not in variable:
        return None

    content: str = variable.get("content", "")
    if not content:
        return None

    tag: str = variable.get("tag", "UNKNOWN")
    try:
        metadata: Any = json.loads(content)
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse JSON content for variable '{tag}': {e}")
        return None
    # The content is typed by hand in ActiveCampaign. Valid JSON that isn't an
    # object ([], "x", 5, true) would make get_newsletter_list fail for every
    # list when it calls .get() on it, so skip just this one.
    if not isinstance(metadata, dict):
        logger.warning(f"JSON content for variable '{tag}' is not an object")
        return None
    return metadata


def get_all_ac_list_ids() -> list[str]:
    """
    Fetch all list IDs from ActiveCampaign (managed and unmanaged).

    Unlike get_newsletter_list() which only returns lists with personalization metadata,
    this returns every list in the account. Used when opting out of all marketing emails
    to ensure unmanaged lists are also unsubscribed.

    Returns:
        list: List of AC list ID strings (e.g., ['1', '2', '3', '99'])

    Raises:
        ActiveCampaignError: If API request fails
    """
    lists: list[dict[str, Any]] = get_all_lists()
    return [lst["id"] for lst in lists]


def _parse_variable_entry(v: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """
    Extract (list_id, variable_data) from a personalization variable, or None
    if either the tag doesn't match `list_{N}_meta` or the JSON content can't
    be parsed.

    Single-pass design: runs the regex exactly once per variable. The caller
    in get_newsletter_list uses this as the only filter. No separate prefilter
    re-runs the regex.
    """
    list_id = extract_list_id_from_tag(v.get("tag", ""))
    if list_id is None:
        return None
    metadata = parse_metadata_from_variable(v)
    if metadata is None:
        return None
    return str(list_id), {"metadata": metadata, "name": v.get("name", "")}


@requires_ac_client
def get_newsletter_list() -> list[NewsletterInfo]:
    """
    Fetch all available newsletters with their metadata.

    This function:
    1. Fetches all lists from ActiveCampaign
    2. Fetches all personalization variables
    3. Filters variables by pattern list_{id}_meta (lowercase)
    4. Parses JSON metadata from variables
    5. Merges list info with metadata
    6. Returns only lists with complete metadata

    Returns:
        list: List of newsletter objects with structure:
            {
                "id": "1",                          # AC numeric list ID
                "stringid": "sefaria_news",         # From AC list object
                "displayName": {"en": "Sefaria News", "he": null},  # Bilingual display name from personalization variable
                "icon": "news-and-resources.svg",   # From personalization variable's JSON content
                "language": "english",              # From personalization variable's JSON content
                "primary": True                     # From personalization variable's JSON content; marks the general list
            }

    Raises:
        ActiveCampaignError: If API requests fail
    """
    # Fetch both lists and variables
    lists: list[dict[str, Any]] = get_all_lists()
    variables: list[dict[str, Any]] = get_all_personalization_variables()

    # Create a map of list ID -> list info for quick lookup
    lists_by_id: dict[str, dict[str, Any]] = {lst["id"]: lst for lst in lists}

    # Single-pass tag-match + metadata-parse via _parse_variable_entry.
    # Each variable runs the regex exactly once. Variables whose tag doesn't
    # match `list_{N}_meta` or whose JSON content fails to parse return None
    # and get dropped by filter(None, ...).
    variables_by_id: dict[str, dict[str, Any]] = dict(
        filter(None, map(_parse_variable_entry, variables))
    )

    # Merge lists with metadata (only include lists with metadata)
    # Using walrus operator to check list exists while building newsletter
    # Newsletter lists will have one display name in either English or Hebrew but not both
    newsletters: list[NewsletterInfo] = [
        {
            "id": list_item["id"],
            "stringid": list_item.get("stringid", ""),
            "displayName": (
                {"en": variable_data["name"], "he": None}
                if variable_data["metadata"].get("language", "english") == "english"
                else {"en": None, "he": variable_data["name"]}
            ),
            "icon": variable_data["metadata"].get("icon", "news-and-resources.svg"),
            "language": variable_data["metadata"].get("language", "english"),
            # Marks the general list, the one whose new subscribers get a
            # confirmation email. The metadata is typed by hand in ActiveCampaign,
            # so only a real JSON true counts: the string "false" would be truthy.
            "primary": variable_data["metadata"].get("primary") is True,
        }
        for list_id_str, variable_data in variables_by_id.items()
        if (list_item := lists_by_id.get(list_id_str))
    ]

    logger.info(f"Returning {len(newsletters)} newsletters with complete metadata")
    return newsletters


def get_cached_newsletter_list() -> list[NewsletterInfo]:
    """
    Get the managed newsletter list, caching non-empty ActiveCampaign responses.

    get_newsletter_list() remains the raw ActiveCampaign fetch. This wrapper is
    used by both views and service flows that need current managed-list metadata
    for validation or display, so the cache boundary stays close to the data
    source rather than in one view module.
    """
    cached: list[NewsletterInfo] | None = cache.get(NEWSLETTER_LIST_CACHE_KEY)
    if cached is not None:
        return cached

    newsletters: list[NewsletterInfo] = get_newsletter_list()
    if newsletters:
        cache.set(NEWSLETTER_LIST_CACHE_KEY, newsletters, NEWSLETTER_LIST_CACHE_TTL)
    return newsletters


def _resolve_valid_newsletters(
    valid_newsletters: Sequence[Mapping[str, Any]] | None = None,
) -> Sequence[Mapping[str, Any]]:
    """
    Return caller-provided newsletter metadata or load it through the service cache.

    The optional argument keeps unit tests and specialized callers able to inject a
    known list, but production flows should let the service own the cached lookup.
    """
    if valid_newsletters is not None:
        return valid_newsletters

    try:
        newsletters = get_cached_newsletter_list()
    except Exception as e:
        logger.exception(f"Error fetching cached newsletter list: {e}")
        raise NewsletterListUnavailableError(
            "Newsletter service is temporarily unavailable. Please try again later."
        )

    if not newsletters:
        logger.error(
            "Newsletter list is empty — ActiveCampaign may be unreachable or misconfigured"
        )
        raise NewsletterListUnavailableError(
            "Newsletter service is temporarily unavailable. Please try again later."
        )

    return newsletters


# ============================================================================
# Contact Management and Subscription Functions
# ============================================================================


@wraps_ac_errors
def find_or_create_contact(
    email: str, first_name: str = "", last_name: str = ""
) -> dict[str, Any]:
    """
    Find an existing contact by email or create a new one.

    Args:
        email (str): Contact's email address
        first_name (str): Contact's first name
        last_name (str): Contact's last name (optional)

    Returns:
        dict: Contact object with 'id', 'email', 'firstName', 'lastName' fields

    Raises:
        ActiveCampaignError: If API request fails
    """
    email = normalize_and_validate_email(email)

    # TODO: Replace this look-up-then-create pattern with AC's `contact/sync`
    # endpoint. `POST /api/3/contact/sync` upserts the contact in a single
    # round trip — returns existing if matched, creates if not. Saves the
    # second HTTP call on every new-user signup.
    #
    # Search for existing contact by email. The email must be URL-encoded —
    # AC's query parser otherwise decodes `+` in tagged addresses (e.g.
    # `foo+bar@gmail.com`) as a space, which would always miss and cause
    # us to create duplicate contacts.
    search_response: dict[str, Any] = _get_client().make_request(
        f"contacts?filters[email]={quote(email)}"
    )
    contacts: list[dict[str, Any]] = search_response.get("contacts", [])

    if contacts:
        # Contact exists, return the first one
        contact: dict[str, Any] = contacts[0]
        logger.info(
            f"Found existing contact with email {email}: ID {contact.get('id')}"
        )
        return contact

    # Contact doesn't exist, create new one
    logger.info(f"Creating new contact with email {email}")
    contact_data: dict[str, dict[str, str]] = {
        "contact": {
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
        }
    }

    result: dict[str, Any] = _get_client().make_request(
        "contacts", method="POST", data=contact_data
    )
    contact = result.get("contact", {})
    logger.info(f"Created new contact with email {email}: ID {contact.get('id')}")
    return contact


@wraps_ac_errors
def get_contact_list_memberships(
    contact_id: str | int, active_only: bool = False
) -> list[str]:
    """
    Get all list memberships for a contact.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        active_only (bool): If True, only return lists with status=1 (active subscriptions).
                            If False (default), return all memberships regardless of status.

    Returns:
        list: List of list IDs the contact is subscribed to (as strings)

    Raises:
        ActiveCampaignError: If API request fails
    """
    response: dict[str, Any] = _get_client().make_request(
        f"contacts/{contact_id}/contactLists"
    )
    contact_lists: list[dict[str, Any]] = response.get("contactLists", [])

    if active_only:
        # Filter to only active subscriptions (status=1)
        contact_lists = [cl for cl in contact_lists if str(cl.get("status", "")) == "1"]

    # Extract list IDs from contact list objects, dropping empty strings in one pass
    list_ids = [
        lid
        for cl in contact_lists
        if (lid := str(cl.get("list", cl.get("listid", ""))))
    ]

    logger.info(
        f"Contact {contact_id} memberships (active_only={active_only}): {len(list_ids)} lists: {list_ids}"
    )
    return list_ids


@wraps_ac_errors
def find_contact_id_by_email(email: str, timeout: float | None = None) -> str | None:
    """
    Look up an ActiveCampaign contact ID by email, without creating a contact.

    Use this when you only want to read. To add someone to AC, use
    find_or_create_contact instead.

    Args:
        email (str): Email address to look up
        timeout (float or None): Seconds to wait for AC; None uses the client default

    Returns:
        str or None: The contact ID, or None if AC has no contact for this email

    Raises:
        ActiveCampaignError: If API request fails
    """
    response: dict[str, Any] = _get_client().make_request(
        f"contacts?filters[email]={quote(email)}", timeout=timeout
    )
    contacts: list[dict[str, Any]] = response.get("contacts", [])
    return contacts[0]["id"] if contacts else None


@wraps_ac_errors
def get_contact_learning_level(
    contact_id: str | int, timeout: float | None = None
) -> int | None:
    """
    Get a contact's learning level from ActiveCampaign custom fields.

    Reads the LEARNING_LEVEL custom field value for the given contact.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        timeout (float or None): Seconds to wait for AC; None uses the client default

    Returns:
        int or None: Learning level (1-5) if set, None if empty/missing

    Raises:
        ActiveCampaignError: If API request fails
    """
    field_id: str = get_ac_field_id_by_perstag("LEARNING_LEVEL")
    response: dict[str, Any] = _get_client().make_request(
        f"contacts/{contact_id}/fieldValues", timeout=timeout
    )
    field_values: list[dict[str, Any]] = response.get("fieldValues", [])

    for fv in field_values:
        if str(fv.get("field", "")) == str(field_id):
            raw_value: str = fv.get("value", "")
            if raw_value:
                try:
                    return int(raw_value)
                except (ValueError, TypeError):
                    logger.warning(
                        f"Non-numeric LEARNING_LEVEL value for contact {contact_id}: {raw_value}"
                    )
                    return None
            return None

    return None


@wraps_ac_errors
def map_stringids_to_list_ids(
    newsletter_stringids: list[str], newsletter_list: Sequence[Mapping[str, Any]]
) -> list[str]:
    """
    Convert newsletter stringids to ActiveCampaign list IDs.

    Args:
        newsletter_stringids (list): Array of newsletter stringids (e.g., ['sefaria_news', 'text_updates'])
        newsletter_list (list): List of newsletter objects from get_newsletter_list()

    Returns:
        list: Array of AC list IDs as strings

    Raises:
        InputError: If any stringid is not found in newsletter_list
    """
    # Build the lookup once so validation and mapping use the same source of truth.
    stringid_to_list_id: dict[str, str] = {
        nl["stringid"]: nl["id"] for nl in newsletter_list
    }

    # Validate all inputs before mapping so callers get one complete error message.
    invalid_ids: list[str] = [
        stringid
        for stringid in newsletter_stringids
        if stringid not in stringid_to_list_id
    ]

    if invalid_ids:
        error_msg: str = f"Invalid newsletter IDs: {', '.join(invalid_ids)}"
        logger.warning(error_msg)
        raise InputError(error_msg)

    # Preserve the caller's ordering and duplicates in the returned AC list IDs.
    list_ids: list[str] = [
        stringid_to_list_id[stringid] for stringid in newsletter_stringids
    ]

    logger.info(f"Mapped stringids {newsletter_stringids} to list IDs {list_ids}")
    return list_ids


@wraps_ac_errors
def add_contact_to_list(contact_id: str | int, list_id: str | int) -> dict[str, Any]:
    """
    Add a contact to a newsletter list (idempotent operation).

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        list_id (str or int): ActiveCampaign list ID

    Returns:
        dict: Contact list relationship object

    Raises:
        ActiveCampaignError: If API request fails
    """
    contact_list_data: dict[str, dict[str, str | int]] = {
        "contactList": {
            "contact": str(contact_id),
            "list": str(list_id),
            "status": 1,  # 1 = subscribed (required by AC API)
        }
    }

    result: dict[str, Any] = _get_client().make_request(
        "contactLists", method="POST", data=contact_list_data
    )
    contact_list: dict[str, Any] = result.get("contactList", {})

    logger.info(f"Added contact {contact_id} to list {list_id}")
    return contact_list


@wraps_ac_errors
def subscribe_contact_to_lists(contact_id: str | int, list_ids: list[str]) -> None:
    """
    Subscribe a contact to multiple newsletter lists.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        list_ids (list): Array of AC list IDs to subscribe to

    Raises:
        ActiveCampaignError: If any subscription fails
    """
    logger.info(f"Subscribing contact {contact_id} to lists: {list_ids}")

    # TODO: Batch these calls. Two viable options:
    #   (a) Use AC's `contact/sync` endpoint with a `subscribe` array — one
    #       POST attaches the contact to multiple lists in a single round trip.
    #   (b) Wrap the per-list calls in a ThreadPoolExecutor so they run
    #       concurrently. NewsletterClient's requests.Session is thread-safe
    #       once headers are set (see module docstring), so this is safe today.
    for list_id in list_ids:
        add_contact_to_list(contact_id, list_id)

    logger.info(
        f"Successfully subscribed contact {contact_id} to {len(list_ids)} lists"
    )


@wraps_ac_errors
def remove_contact_from_list(
    contact_id: str | int, list_id: str | int
) -> dict[str, Any]:
    """
    Remove a contact from a newsletter list (unsubscribe).

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        list_id (str or int): ActiveCampaign list ID

    Returns:
        dict: Contact list relationship object with status=2 (unsubscribed)

    Raises:
        ActiveCampaignError: If API request fails
    """
    contact_list_data: dict[str, dict[str, str | int]] = {
        "contactList": {
            "contact": str(contact_id),
            "list": str(list_id),
            "status": 2,  # 2 = unsubscribed
        }
    }

    result: dict[str, Any] = _get_client().make_request(
        "contactLists", method="POST", data=contact_list_data
    )
    contact_list: dict[str, Any] = result.get("contactList", {})

    logger.info(f"Removed contact {contact_id} from list {list_id}")
    return contact_list


@wraps_ac_errors
def update_list_memberships(
    contact_id: str | int, add_list_ids: list[str], remove_list_ids: list[str]
) -> None:
    """
    Atomically add and remove contact from multiple lists.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        add_list_ids (list): List IDs to subscribe to
        remove_list_ids (list): List IDs to unsubscribe from

    Raises:
        ActiveCampaignError: If any operation fails
    """
    logger.info(
        f"Updating list memberships for contact {contact_id}: adding {add_list_ids}, removing {remove_list_ids}"
    )

    # TODO: Batch these calls. Same options as subscribe_contact_to_lists:
    #   (a) AC's `contact/sync` endpoint with `subscribe`/`unsubscribe` arrays —
    #       single round trip for both directions.
    #   (b) ThreadPoolExecutor for concurrent per-list calls.
    for list_id in remove_list_ids:
        remove_contact_from_list(contact_id, list_id)
    for list_id in add_list_ids:
        add_contact_to_list(contact_id, list_id)

    logger.info(f"List memberships updated for contact {contact_id}")


@requires_ac_client
@wraps_ac_errors
def subscribe_with_union(
    email: str,
    first_name: str,
    last_name: str,
    newsletter_stringids: list[str],
    valid_newsletters: Sequence[Mapping[str, Any]] | None = None,
) -> SubscribeResult:
    """
    Subscribe a contact to newsletters using union semantics.

    The *final state* after this call is the union of the contact's currently
    active list memberships and the newly-selected list IDs:

        final_active = currently_active ∪ newly_selected

    Implementation note:
        Do NOT issue a status:1 POST for lists the contact is
        already actively subscribed to. AC treats redundant status:1 POSTs as
        idempotent, but each one is still a separate HTTP round trip.

    Flow:
        1. Map stringids to AC list IDs (raises exception if any stringid is unknown).
        2. Find or create contact by email.
        3. Read existing *active* memberships (active_only=True).
        4. Compute to_add = newly_selected - currently_active.
        5. POST status:1 only for to_add.
        6. Return contact + the post-call active list as stringids.

    Args:
        email (str): Contact's email address
        first_name (str): Contact's first name
        last_name (str): Contact's last name (optional)
        newsletter_stringids (list): Array of newsletter stringids to add
        valid_newsletters (list): Optional injected newsletter metadata; defaults to cached service lookup.

    Returns:
        dict: {
            'contact': {...},  # Contact object
            'all_subscriptions': [...]  # Sorted stringids for all currently active subscriptions
                                        # post-call (previously-active ∪ newly added). Reflects
                                        # AC's real state — does NOT include status:2 memberships.
        }

    Raises:
        ActiveCampaignError: If any step fails
    """
    email = normalize_and_validate_email(email)
    logger.info(
        f"Starting subscription flow for {email} with newsletters: {newsletter_stringids}"
    )
    valid_newsletters = _resolve_valid_newsletters(valid_newsletters)

    # Step 1: Map stringids to AC list IDs. map_stringids_to_list_ids raises
    # InputError if any stringid isn't in valid_newsletters, so this
    # validates and maps in one pass.
    new_list_ids: set[str] = set(
        map_stringids_to_list_ids(newsletter_stringids, valid_newsletters)
    )
    logger.info(f"Mapped to AC list IDs: {new_list_ids}")

    # Step 2: Find or create contact
    contact: dict[str, Any] = find_or_create_contact(email, first_name, last_name)
    contact_id: str = contact["id"]

    # Step 3: Get current *active* subscriptions.
    # Use active_only=True so a list the user previously unsubscribed from
    # (status: 2) is treated as "not subscribed" and ends up in to_add below —
    # otherwise we'd silently skip resubscribing them.
    existing_active_list_ids: set[str] = set(
        get_contact_list_memberships(contact_id, active_only=True)
    )
    logger.info(f"Contact has existing active list IDs: {existing_active_list_ids}")

    # Step 4: Only subscribe to lists the user isn't already actively on.
    # This avoids redundant status:1 POSTs to AC for memberships that are already active
    to_add: set[str] = new_list_ids - existing_active_list_ids
    logger.info(f"Lists to newly subscribe to: {to_add}")

    # Step 5: Subscribe only to the genuinely new ones
    subscribe_contact_to_lists(contact_id, list(to_add))

    # Step 6: Map back to stringids for response.
    # final_list_ids reflects the post-call state: previously-active lists
    # plus the ones we just added.
    final_list_ids: set[str] = existing_active_list_ids | to_add
    list_id_to_stringid: dict[str, str] = {
        nl["id"]: nl["stringid"] for nl in valid_newsletters
    }
    all_subscriptions: list[str] = sorted(
        [
            stringid
            for lid in final_list_ids
            if (stringid := list_id_to_stringid.get(lid))
        ]
    )

    logger.info(
        f"Subscription complete for {email}. All subscriptions: {all_subscriptions}"
    )

    return {"contact": contact, "all_subscriptions": all_subscriptions}


@requires_ac_client
@wraps_ac_errors
def fetch_user_subscriptions_impl(
    email: str,
    valid_newsletters: Sequence[Mapping[str, Any]] | None = None,
    user: Any = None,
) -> UserSubscriptions:
    """
    Fetch current newsletter subscriptions for a user by email.

    Args:
        email (str): User's email address
        valid_newsletters (list): Optional injected newsletter metadata; defaults to cached service lookup.
        user: Django User object (optional, for reading UserProfile preferences)

    Returns:
        dict: {
            'subscribed_newsletters': [...],  # Array of stringids
            'learning_level': None,
            'wants_marketing_emails': bool  # From UserProfile; a stale opt-out is corrected and saved if AC has active memberships
        }

    Raises:
        ActiveCampaignError: If API request fails
    """
    email = normalize_and_validate_email(email)
    logger.info(f"Fetching subscriptions for {email}")

    # Read preferences from MongoDB UserProfile for authenticated users
    wants_marketing_emails: bool = True  # Default for unauthenticated or new users
    profile_learning_level: int | None = None
    profile: UserProfile | None = None
    if user is not None and user.is_authenticated:
        profile = _load_user_profile(email)
        if profile is not None:
            wants_marketing_emails = getattr(profile, "wants_marketing_emails", True)
            profile_learning_level = getattr(profile, "learning_level", None)

    contact_id: str | None = find_contact_id_by_email(email)

    if contact_id is None:
        # User not in ActiveCampaign yet — fall back to profile value
        logger.info(f"Contact {email} not found in ActiveCampaign")
        return {
            "subscribed_newsletters": [],
            "learning_level": profile_learning_level,
            "wants_marketing_emails": wants_marketing_emails,
        }

    logger.info(f"Found contact {contact_id} for email {email}")

    # Get list memberships (active only for accurate subscription state)
    existing_list_ids: list[str] = get_contact_list_memberships(
        contact_id, active_only=True
    )
    valid_newsletters = _resolve_valid_newsletters(valid_newsletters)

    # If the user previously opted out, but AC now shows any active membership,
    # the local opt-out flag is stale. Opt-out removes all AC lists, so any later
    # active list means the user opted back in through another channel.
    #
    # This has to happen here, not in the frontend: the list they joined may be
    # one this form doesn't manage, and only managed lists are sent to the
    # browser. It's saved, even though this is a read, so the profile records
    # that the user wants marketing emails again. The write only ever goes from
    # False to True, so repeating the request does no harm.
    if profile is not None and not wants_marketing_emails and existing_list_ids:
        logger.info(
            f"Correcting stale wants_marketing_emails=False for {email}; "
            f"found active AC list memberships: {existing_list_ids}"
        )
        _update_wants_marketing_emails(profile, True)
        wants_marketing_emails = True

    # Map to stringids, separating out the managed newsletter lists
    list_id_to_stringid: dict[str, str] = {
        nl["id"]: nl["stringid"] for nl in valid_newsletters
    }
    subscribed_newsletters: list[str] = sorted(
        [
            stringid
            for lid in existing_list_ids
            if (stringid := list_id_to_stringid.get(lid))
        ]
    )

    logger.info(f"User {email} is subscribed to: {subscribed_newsletters}")

    # Fetch learning level from AC custom field; AC value takes priority over profile.
    #
    # Why to always hit AC here even when MongoDB has a value:
    #   The AC learning_level field can be written from outside our control plane —
    #   AC's admin UI, AC automation flows, segmentation triggers, third-party
    #   integrations attached to the account, such as from Salesforce, or future external Sefaria forms that touch
    #   AC without updating MongoDB. Any of those can make AC the more recent
    #   source of truth while MongoDB stays stale. This is a freshness check
    learning_level: int | None = profile_learning_level
    try:
        ac_learning_level: int | None = get_contact_learning_level(contact_id)
        if ac_learning_level is not None:
            learning_level = ac_learning_level
    except Exception as e:
        logger.warning(f"Could not fetch learning level from AC for {email}: {e}")

    return {
        "subscribed_newsletters": subscribed_newsletters,
        "learning_level": learning_level,
        "wants_marketing_emails": wants_marketing_emails,
    }


@requires_ac_client
@wraps_ac_errors
def update_user_preferences_impl(
    email: str,
    first_name: str,
    last_name: str,
    selected_stringids: list[str],
    valid_newsletters: Sequence[Mapping[str, Any]] | None = None,
    marketing_opt_out: bool = False,
) -> PreferencesResult:
    """
    Update user's newsletter preferences using REPLACE behavior (not union).

    Two modes of operation:
    - Normal (marketing_opt_out=False): Replaces managed list subscriptions with new selections.
      Unmanaged lists are not touched.
    - Opt-out (marketing_opt_out=True): Unsubscribes from ALL lists (managed + unmanaged).
      Sets wants_marketing_emails=False in MongoDB UserProfile.

    The UserProfile is looked up by email (_load_user_profile), so this function
    does not need the Django user object — the email already pins us to one account.

    Args:
        email (str): User's email address
        first_name (str): User's first name
        last_name (str): User's last name
        selected_stringids (list): Array of newsletter stringids user is selecting NOW
        valid_newsletters (list): Optional injected newsletter metadata; defaults to cached service lookup.
        marketing_opt_out (bool): If True, unsubscribe from ALL lists (managed + unmanaged)

    Returns:
        dict: {
            'contact': {...},  # Contact object
            'subscribed_newsletters': [...]  # Array of selected stringids
        }

    Raises:
        InputError: If the email or a selected stringid isn't valid. Both are
            checked before anything is written to AC.
        ActiveCampaignError: If any step fails
    """
    email = normalize_and_validate_email(email)
    logger.info(
        f"Updating preferences for {email} with selections: {selected_stringids}, "
        f"marketing_opt_out: {marketing_opt_out}"
    )

    # Load UserProfile once at the top so both branches share the same instance.
    # Returns None if no Sefaria account exists for `email` — that's fine; the
    # AC mutations below still run, only the profile save becomes a no-op.
    profile: UserProfile | None = _load_user_profile(email)

    # Check the selections before writing anything to AC, so a request with an
    # unknown stringid doesn't create or rename a contact before it fails.
    # map_stringids_to_list_ids raises InputError if any stringid isn't valid, so
    # this validates and maps in one pass. Opting out ignores the selections.
    new_list_ids: set[str] = set()
    if not marketing_opt_out:
        valid_newsletters = _resolve_valid_newsletters(valid_newsletters)
        new_list_ids = set(
            map_stringids_to_list_ids(selected_stringids, valid_newsletters)
        )
        logger.info(f"Mapped selections to AC list IDs: {new_list_ids}")

    # Find or create contact
    contact: dict[str, Any] = find_or_create_contact(email, first_name, last_name)
    contact_id: str = contact["id"]

    if marketing_opt_out:
        # === OPT-OUT BRANCH: Unsubscribe from ALL lists ===
        logger.info(f"Marketing opt-out for {email}: unsubscribing from all lists")

        # Get ALL list IDs in the AC account (managed + unmanaged)
        all_list_ids: set[str] = set(get_all_ac_list_ids())

        # Get user's current active memberships
        active_list_ids: set[str] = set(
            get_contact_list_memberships(contact_id, active_only=True)
        )

        # Only unsubscribe from lists the user is actually subscribed to
        lists_to_remove: set[str] = all_list_ids & active_list_ids
        logger.info(
            f"Unsubscribing from {len(lists_to_remove)} lists: {lists_to_remove}"
        )

        update_list_memberships(contact_id, [], list(lists_to_remove))

        _update_wants_marketing_emails(profile, False)

        logger.info(f"Marketing opt-out complete for {email}")
        return {"contact": contact, "subscribed_newsletters": []}

    else:
        # === NORMAL BRANCH: REPLACE within managed lists only ===
        logger.info(f"Normal preference update for {email}")
        assert valid_newsletters is not None  # resolved above, before the contact write

        # Get managed list IDs (only diff against these)
        managed_list_ids: set[str] = set(nl["id"] for nl in valid_newsletters)

        # Get existing active subscriptions
        existing_list_ids: set[str] = set(
            get_contact_list_memberships(contact_id, active_only=True)
        )
        logger.info(f"Contact has existing active list IDs: {existing_list_ids}")

        # Scope the diff to managed lists only (don't touch unmanaged lists)
        existing_managed: set[str] = existing_list_ids & managed_list_ids
        lists_to_add: set[str] = new_list_ids - existing_managed
        lists_to_remove_managed: set[str] = existing_managed - new_list_ids
        logger.info(
            f"Lists to add: {lists_to_add}, Lists to remove: {lists_to_remove_managed}"
        )

        # Update list memberships (add and remove as needed)
        update_list_memberships(
            contact_id, list(lists_to_add), list(lists_to_remove_managed)
        )

        # Update wants_marketing_emails on the pre-loaded profile
        _update_wants_marketing_emails(profile, True)

        logger.info(
            f"Preferences updated for {email}. New subscriptions: {selected_stringids}"
        )

        return {
            "contact": contact,
            "subscribed_newsletters": sorted(selected_stringids),
        }


def _load_user_profile(email: str) -> UserProfile | None:
    """
    Look up the UserProfile for an email, but only if its Mongo profile document exists.

    Returns None when there's no Django user for `email`, and also when there is
    a Django user but no profile document (spam cleanup deletes the document and
    keeps the user, for example). Callers treat both the same way: they skip the
    profile and only update ActiveCampaign.

    Why not return a profile for that second case: `user_registration=True`
    stops UserProfile.__init__ from repairing a missing document, and that repair
    is what assigns the slug. Registration passes the flag too, but then calls
    assign_slug() itself. Saving the unrepaired profile here would insert a
    document with an empty slug, and nothing assigns one later because every
    future load finds the document. The newsletter endpoints can be used without
    logging in, so they shouldn't create profile documents anyway.

    Why this exists as a separate helper: the MongoDB lookup happens exactly
    once per call to the parent service function. Explicit loading at the
    call site makes the cost visible.
    """
    try:
        profile = UserProfile(email=email, user_registration=True)
        # `_id` is the Mongo document's id; it's None when no document was found.
        has_profile_document: bool = profile.id is not None and profile._id is not None
        return profile if has_profile_document else None
    except Exception as e:
        logger.warning(f"Could not load UserProfile for {email}: {e}")
        return None


def _update_wants_marketing_emails(
    profile: UserProfile | None, wants_marketing: bool
) -> None:
    """
    Set wants_marketing_emails on an already-loaded UserProfile and save.

    Accepts an already-loaded profile (or None for users without accounts) so
    the caller controls when the MongoDB read happens. If `profile` is None,
    this is a no-op — the user has no Sefaria account to update.

    Errors during save are logged at warning level and swallowed: a MongoDB
    hiccup should never fail the surrounding ActiveCampaign flow, since the
    AC mutations are the user-visible source of truth.
    """
    if profile is None:
        logger.info("No UserProfile in scope; skipping wants_marketing_emails update")
        return
    try:
        profile.wants_marketing_emails = wants_marketing
        profile.save()
        logger.info(
            f"Updated wants_marketing_emails={wants_marketing} for user {profile.id}"
        )
    except Exception as e:
        logger.warning(
            f"Failed to update wants_marketing_emails for user {profile.id}: {e}"
        )


# ============================================================================
# Learning Level Management
# ============================================================================


def is_valid_learning_level(value: object) -> bool:
    """
    True if value is a whole number from 1 to 5.

    JSON true/false arrive as Python True/False, and in Python bool is a kind of
    int (True == 1). So a plain isinstance(value, int) check would accept
    `"learningLevel": true` as level 1. We rule out bools first.
    """
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 5


@wraps_ac_errors
def update_learning_level_in_ac(
    email: str, learning_level: int | None
) -> LearningLevelACResult:
    """
    Update a contact's learning level in ActiveCampaign.

    Learning level is stored as a custom field in AC for all users (with or without Django accounts).
    This allows tracking learning level preferences even for users without Sefaria accounts.

    Args:
        email (str): Contact email address
        learning_level (int or None): Integer 1-5 representing learning level, or None

    Returns:
        dict: {
            'contact_id': str,
            'email': str,
            'learning_level': int or None
        }

    Raises:
        InputError: If learning_level is invalid (re-raised by @wraps_ac_errors)
        ActiveCampaignError: If AC API call fails
    """
    email = normalize_and_validate_email(email)

    # Validate learning_level. InputError is passed through unchanged by the
    # @wraps_ac_errors decorator so callers can distinguish bad input from AC failures.
    if learning_level is not None and not is_valid_learning_level(learning_level):
        logger.warning(f"Invalid learning level {learning_level} for email {email}")
        raise InputError(
            "Learning level must be an integer between 1 and 5, or null/None"
        )

    logger.info(f"Updating learning level in AC for {email}: {learning_level}")

    # Find or create contact
    contact: dict[str, Any] = find_or_create_contact(email)
    contact_id: str = contact["id"]

    # Look up the field ID dynamically by perstag (cached after first call)
    field_id: str = get_ac_field_id_by_perstag("LEARNING_LEVEL")

    payload: dict[str, dict[str, str]] = {
        "fieldValue": {
            "contact": contact_id,
            "field": field_id,
            "value": str(learning_level) if learning_level is not None else "",
        }
    }

    _get_client().make_request("fieldValues", method="POST", data=payload)

    logger.info(f"Successfully updated learning level in AC for {email}")

    return {"contact_id": contact_id, "email": email, "learning_level": learning_level}


@requires_ac_client
def update_learning_level_impl(
    email: str, learning_level: int | None
) -> LearningLevelResult:
    """
    Update a user's learning level, handling both authenticated and unauthenticated users.

    For users WITH existing Sefaria accounts:
        - Updates their UserProfile in MongoDB
        - Also updates AC for consistency across systems

    For users WITHOUT accounts:
        - Only updates AC (no profile to use or create)
        - AC custom field stores their learning level preference, which will sync with Salesforce

    Args:
        email (str): User email address
        learning_level (int or None): Integer 1-5 or None to unset

    Returns:
        dict: {
            'email': str,
            'learning_level': int or None,
            'user_id': int or None,  # Set if account exists, None if no account
            'message': str
        }

    Raises:
        InputError: If learning_level is invalid (not 1-5 or None)
        ActiveCampaignError: If AC update fails
    """
    email = normalize_and_validate_email(email)

    # Validate learning_level
    if learning_level is not None and not is_valid_learning_level(learning_level):
        logger.warning(f"Invalid learning level {learning_level} for {email}")
        raise InputError(
            "Learning level must be an integer between 1 and 5, or null/None"
        )

    logger.info(f"Updating learning level for {email}: {learning_level}")

    # Step 1: Try to load the user profile using the shared newsletter helper.
    profile: UserProfile | None = _load_user_profile(email)

    user_id: int | None = profile.id if profile is not None else None
    updated_profile: bool = False

    # Step 2: Always update in ActiveCampaign (for logged-out users or consistency)
    # This ensures learning level is available in the newsletter system even without an account.
    #
    # AC goes first so that a failed AC write leaves nothing changed and the error is accurate.
    # If AC succeeds and the profile save below fails, AC is ahead of the profile, which
    # fetch_user_subscriptions_impl already handles: it reads AC and lets AC's value win.
    try:
        update_learning_level_in_ac(email, learning_level)
    except Exception as e:
        logger.exception(f"Error updating learning level in AC for {email}: {e}")
        raise

    # Step 3: If account exists, update the UserProfile
    if profile is not None:
        logger.info(f"Found existing user account for {email} (ID: {user_id})")

        try:
            profile.learning_level = learning_level  # type: ignore[assignment]
            profile.save()
            updated_profile = True
            logger.info(f"Updated UserProfile for user {user_id}")
        except Exception as e:
            logger.exception(f"Error updating UserProfile for {email}: {e}")
            # Don't raise - AC already has the new value

    else:
        logger.info(f"No existing user account for {email}")

    message: str = "Learning level updated successfully"
    if updated_profile:
        message += " (and saved to profile)"

    return {
        "email": email,
        "learning_level": learning_level,
        "user_id": user_id,
        "message": message,
    }


# ============================================================================
# Learning Level Token (ties a logged-out learning-level save to a subscribe)
# ============================================================================

# The salt keeps these tokens separate from anything else Django signs with the
# same SECRET_KEY, so a signed value made for another purpose can't be used here.
LEARNING_LEVEL_TOKEN_SALT: str = "newsletter.learning-level"
LEARNING_LEVEL_TOKEN_MAX_AGE: int = 60 * 60 * 24  # 24 hours, in seconds


def make_learning_level_token(email: str) -> str:
    """
    Create a signed token that says "this email just subscribed".

    The subscribe endpoint returns it, and a logged-out visitor sends it back when
    they save their learning level. Without it, anyone could set the learning level
    for any email with a single request.

    The token is signed, not encrypted: anyone can read the email inside it, but
    nobody can change it or make a new one without our SECRET_KEY. It only goes back
    to the visitor who typed that email, so that's fine.
    """
    return signing.dumps({"email": email}, salt=LEARNING_LEVEL_TOKEN_SALT)


def read_learning_level_token(token: Any) -> str | None:
    """
    Return the email inside a learning-level token, or None if the token can't be trusted.

    None covers every bad case: no token, not a string, changed or made up (bad
    signature), older than LEARNING_LEVEL_TOKEN_MAX_AGE, or no valid email inside.
    """
    if not isinstance(token, str) or not token:
        return None
    try:
        payload: Any = signing.loads(
            token, salt=LEARNING_LEVEL_TOKEN_SALT, max_age=LEARNING_LEVEL_TOKEN_MAX_AGE
        )
    except signing.BadSignature:  # SignatureExpired is a kind of BadSignature
        return None
    email: Any = payload.get("email") if isinstance(payload, dict) else None
    try:
        return normalize_and_validate_email(email)
    except InputError:
        return None


# ============================================================================
# Learning Level at Registration
# ============================================================================

# Only used when Celery is off and the copy runs during registration (see
# api/tasks.py). The new user waits for those AC calls, so keep them short. If AC
# is slow, we skip the copy instead of making the user wait.
REGISTRATION_AC_TIMEOUT: float = 3


def get_learning_level_for_email(
    email: str, timeout: float | None = None
) -> int | None:
    """
    Read the learning level AC has stored for an email.

    Returns:
        int or None: The level (1-5), or None if AC has no contact for this email,
        no learning level for it, or a value outside 1-5.

    Raises:
        ActiveCampaignError: If AC can't be reached
    """
    contact_id: str | None = find_contact_id_by_email(email, timeout=timeout)
    if contact_id is None:
        return None
    learning_level: int | None = get_contact_learning_level(contact_id, timeout=timeout)
    if learning_level is not None and not 1 <= learning_level <= 5:
        logger.warning(f"Ignoring out-of-range AC learning level {learning_level} for {email}")
        return None
    return learning_level


def copy_learning_level_from_ac(uid: int, timeout: float | None = None) -> int | None:
    """
    Fill in a new account's learning level from ActiveCampaign.

    People can answer the newsletter learning-level question before they have a
    Sefaria account. That answer is only stored in AC, so after they register we
    copy it onto their new profile. This usually runs in a Celery task (see
    api/tasks.py), so registration never waits for AC.

    Only the learning_level field is written, and only while it's still empty.
    UserProfile.save() would overwrite the whole profile, which could undo a
    change the person made in the meantime (or put back an empty level).

    Args:
        uid (int): The new user's ID
        timeout (float or None): Seconds to wait for AC; None uses the client default

    Returns:
        int or None: The level that was copied, or None if nothing was copied

    Raises:
        ActiveCampaignError: If AC can't be reached (so the task can try again)
    """
    profile: UserProfile = UserProfile(id=uid)
    # Keep a level the profile already has. A "seed" account (created before the
    # person registered) may already have one saved from the newsletter page.
    if profile.id is None or profile.learning_level is not None:
        return None

    learning_level: int | None = get_learning_level_for_email(profile.email, timeout=timeout)
    if learning_level is None:
        return None

    # "learning_level": None also matches a profile with no learning_level field yet
    db.profiles.update_one(
        {"id": uid, "learning_level": None},
        {"$set": {"learning_level": learning_level}},
    )
    logger.info(f"Copied learning level {learning_level} from AC to user {uid}")
    return learning_level
