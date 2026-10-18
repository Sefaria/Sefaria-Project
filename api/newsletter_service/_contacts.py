"""ActiveCampaign contacts: lookup and creation, list memberships, and the learning-level custom field."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from sefaria.system.exceptions import InputError
from api.newsletter_service._ac_client import _get_client
from api.newsletter_service._errors import (
    ActiveCampaignError,
    NewsletterUpdateIncompleteError,
    wraps_ac_errors,
)
from api.newsletter_service._results import LearningLevelACResult
from api.newsletter_service._validation import (
    is_valid_learning_level,
    normalize_and_validate_email,
)

logger: logging.Logger = logging.getLogger(__name__)


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
    #       concurrently. Wait for the per-thread session fix described in the
    #       module docstring first: today every thread shares one session.
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
    Add and remove a contact from multiple lists, one AC request per list.

    Every list is tried even if an earlier one fails, and the error is raised at
    the end. When a user opts out, one failed list shouldn't stop the others from
    being removed.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        add_list_ids (list): List IDs to subscribe to
        remove_list_ids (list): List IDs to unsubscribe from

    Raises:
        NewsletterUpdateIncompleteError: If any list couldn't be updated, after all were tried
    """
    logger.info(
        f"Updating list memberships for contact {contact_id}: adding {add_list_ids}, removing {remove_list_ids}"
    )

    # TODO: Batch these calls. Same options as subscribe_contact_to_lists:
    #   (a) AC's `contact/sync` endpoint with `subscribe`/`unsubscribe` arrays —
    #       single round trip for both directions.
    #   (b) ThreadPoolExecutor for concurrent per-list calls.
    failed: list[str] = []
    for list_id in remove_list_ids:
        try:
            remove_contact_from_list(contact_id, list_id)
        except ActiveCampaignError as e:
            logger.warning(f"Failed to remove contact {contact_id} from list {list_id}: {e}")
            failed.append(f"remove from {list_id}")
    for list_id in add_list_ids:
        try:
            add_contact_to_list(contact_id, list_id)
        except ActiveCampaignError as e:
            logger.warning(f"Failed to add contact {contact_id} to list {list_id}: {e}")
            failed.append(f"add to {list_id}")

    if failed:
        raise NewsletterUpdateIncompleteError(
            f"Failed to update list memberships for contact {contact_id}: {', '.join(failed)}"
        )

    logger.info(f"List memberships updated for contact {contact_id}")


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
