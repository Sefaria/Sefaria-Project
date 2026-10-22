"""The managed newsletters: AC lists joined with their metadata, plus the cache in front of them."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping, Sequence
from typing import Any

from django.core.cache import cache

from sefaria.system.exceptions import InputError
from api.newsletter_service._ac_client import get_ac_client, requires_newsletter_service
from api.newsletter_service._errors import NewsletterListUnavailableError, reraise_as_newsletter_service_error
from api.newsletter_service._results import NewsletterInfo

logger: logging.Logger = logging.getLogger(__name__)


# The Redis key keeps its old value on purpose: renaming it would only leave the old
# entry behind, and notes on clearing this cache use this exact key.
NEWSLETTER_LIST_CACHE_KEY: str = "newsletter_list_from_ac"
NEWSLETTER_LIST_CACHE_TTL: int = 60 * 60  # 1 hour


# TODO: evaluate whether this can be cached
@reraise_as_newsletter_service_error
def fetch_ac_lists() -> list[dict[str, Any]]:
    """
    Fetch all mailing lists from ActiveCampaign.

    In product terms: every newsletter list in the account, including the unmanaged
    ones the sign-up page doesn't offer.

    Returns:
        list: List of newsletter list objects with 'id', 'stringid', and 'name' fields.

    Raises:
        NewsletterServiceError: If the API request fails.
    """
    response: dict[str, Any] = get_ac_client().make_request("lists?limit=100")
    lists: list[dict[str, Any]] = response.get("lists", [])
    logger.info(f"Retrieved {len(lists)} lists from ActiveCampaign")
    return lists


@reraise_as_newsletter_service_error
def fetch_ac_personalization_variables() -> list[dict[str, Any]]:
    """
    Fetch all personalization variables from ActiveCampaign.

    In product terms: the raw values that hold each managed newsletter's display
    data (icon, language, and whether it's the primary list).

    Returns:
        list: List of personalization variable objects

    Raises:
        NewsletterServiceError: If API request fails
    """
    response: dict[str, Any] = get_ac_client().make_request("personalizations?limit=100")
    variables: list[dict[str, Any]] = response.get("personalizations", [])
    logger.info(
        f"Retrieved {len(variables)} personalization variables from ActiveCampaign"
    )
    return variables


# Precompiled at module load so we don't pay the compile/cache-lookup cost
# on every call. fetch_ac_newsletters() runs this against every personalization
# variable AC returns
_LIST_META_TAG_RE: re.Pattern[str] = re.compile(r"list_(\d+)_meta")


def parse_list_id_from_meta_tag(tag: str | Any) -> int | None:
    """
    Extract list ID from a personalization variable tag using regex.

    In product terms: which newsletter a list_<id>_meta variable describes.

    Args:
        tag (str): Tag string like "list_1_meta" (lowercase from ActiveCampaign API)

    Returns:
        int or None: The extracted list ID, or None if tag doesn't match pattern

    Example:
        parse_list_id_from_meta_tag("list_1_meta") -> 1
        parse_list_id_from_meta_tag("list_999_meta") -> 999
        parse_list_id_from_meta_tag("invalid_tag") -> None
    """
    if not tag or not isinstance(tag, str):
        return None
    match: re.Match[str] | None = _LIST_META_TAG_RE.match(tag)
    return int(match.group(1)) if match else None


def parse_variable_metadata(
    variable: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Parse metadata JSON from a personalization variable's content field.

    In product terms: one newsletter's display data (icon, language, primary), read
    from JSON that someone typed into AC by hand.

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
    # object ([], "x", 5, true) would make fetch_ac_newsletters fail for every
    # list when it calls .get() on it, so skip just this one.
    if not isinstance(metadata, dict):
        logger.warning(f"JSON content for variable '{tag}' is not an object")
        return None
    return metadata


def fetch_all_ac_list_ids() -> list[str]:
    """
    Fetch all list IDs from ActiveCampaign (managed and unmanaged).

    In product terms: the IDs of every newsletter list, managed or not. A full
    marketing opt-out removes the person from all of them.

    Unlike fetch_ac_newsletters() which only returns lists with personalization metadata,
    this returns every list in the account. Used when opting out of all marketing emails
    to ensure unmanaged lists are also unsubscribed.

    Returns:
        list: List of AC list ID strings (e.g., ['1', '2', '3', '99'])

    Raises:
        NewsletterServiceError: If API request fails
    """
    lists: list[dict[str, Any]] = fetch_ac_lists()
    return [lst["id"] for lst in lists]


def _parse_newsletter_variable(v: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """
    Extract (list_id, variable_data) from a personalization variable, or None
    if either the tag doesn't match `list_{N}_meta` or the JSON content can't
    be parsed.

    In product terms: one metadata variable, turned into the ID of the newsletter it
    describes plus that newsletter's display data.

    Single-pass design: runs the regex exactly once per variable. The caller
    in fetch_ac_newsletters uses this as the only filter. No separate prefilter
    re-runs the regex.
    """
    list_id = parse_list_id_from_meta_tag(v.get("tag", ""))
    if list_id is None:
        return None
    metadata = parse_variable_metadata(v)
    if metadata is None:
        return None
    return str(list_id), {"metadata": metadata, "name": v.get("name", "")}


@requires_newsletter_service
def fetch_ac_newsletters() -> list[NewsletterInfo]:
    """
    Fetch all available newsletters with their metadata.

    In product terms: the newsletters the sign-up page offers. The flows use
    get_newsletters, the cached version.

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
        NewsletterServiceError: If API requests fail
    """
    # Fetch both lists and variables
    lists: list[dict[str, Any]] = fetch_ac_lists()
    variables: list[dict[str, Any]] = fetch_ac_personalization_variables()

    # Create a map of list ID -> list info for quick lookup
    lists_by_id: dict[str, dict[str, Any]] = {lst["id"]: lst for lst in lists}

    # Single-pass tag-match + metadata-parse via _parse_newsletter_variable.
    # Each variable runs the regex exactly once. Variables whose tag doesn't
    # match `list_{N}_meta` or whose JSON content fails to parse return None
    # and get dropped by filter(None, ...).
    variables_by_id: dict[str, dict[str, Any]] = dict(
        filter(None, map(_parse_newsletter_variable, variables))
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


def get_newsletters() -> list[NewsletterInfo]:
    """
    Get the managed newsletter list, caching non-empty ActiveCampaign responses.

    fetch_ac_newsletters() remains the raw ActiveCampaign fetch. This wrapper is
    used by both views and service flows that need current managed-list metadata
    for validation or display, so the cache boundary stays close to the data
    source rather than in one view module.
    """
    cached: list[NewsletterInfo] | None = cache.get(NEWSLETTER_LIST_CACHE_KEY)
    if cached is not None:
        return cached

    newsletters: list[NewsletterInfo] = fetch_ac_newsletters()
    if newsletters:
        cache.set(NEWSLETTER_LIST_CACHE_KEY, newsletters, NEWSLETTER_LIST_CACHE_TTL)
    return newsletters


def resolve_valid_newsletters(
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
        newsletters = get_newsletters()
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


@reraise_as_newsletter_service_error
def map_stringids_to_list_ids(
    newsletter_stringids: list[str], newsletter_list: Sequence[Mapping[str, Any]]
) -> list[str]:
    """
    Convert newsletter stringids to ActiveCampaign list IDs.

    In product terms: turns the newsletter names the page sends (stringids) into
    AC's numeric list IDs, and rejects any name that isn't a managed newsletter.

    Args:
        newsletter_stringids (list): Array of newsletter stringids (e.g., ['sefaria_news', 'text_updates'])
        newsletter_list (list): List of newsletter objects from fetch_ac_newsletters()

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
