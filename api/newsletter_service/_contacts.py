"""ActiveCampaign contacts: lookup and creation, list memberships, and the learning-level custom field."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from sefaria.system.exceptions import InputError
from api.newsletter_service._ac_client import get_ac_client
from api.newsletter_service._errors import (
    NewsletterServiceError,
    NewsletterUpdateIncompleteError,
    reraise_as_newsletter_service_error,
)
from api.newsletter_service._results import ACLearningLevelResult
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

    In product terms: finds where AC stores a per-person setting, such as the
    learning level.

    Fetches all fields on first call and caches the full mapping.
    Subsequent calls return from cache without an API call.
    TODO: reconsider using actual cache in the future

    Args:
        perstag (str): The perstag identifier (e.g., 'LEARNING_LEVEL')

    Returns:
        str: The numeric field ID as a string

    Raises:
        NewsletterServiceError: If field not found or API request fails
    """
    if perstag in _field_id_cache:
        return _field_id_cache[perstag]

    response: dict[str, Any] = get_ac_client().make_request("fields?limit=100")
    fields: list[dict[str, Any]] = response.get("fields", [])

    _field_id_cache.update({f["perstag"]: f["id"] for f in fields if f.get("perstag")})

    if perstag not in _field_id_cache:
        raise NewsletterServiceError(
            f"Custom field with perstag '{perstag}' not found in ActiveCampaign"
        )

    return _field_id_cache[perstag]


# ============================================================================
# Contacts, list memberships, and the learning-level field
# ============================================================================


@reraise_as_newsletter_service_error
def find_or_create_ac_contact(
    email: str, first_name: str = "", last_name: str = ""
) -> dict[str, Any]:
    """
    Find an existing contact by email or create a new one.

    In product terms: the subscriber record for an email address. It's created the
    first time someone subscribes or saves a setting.

    Args:
        email (str): Contact's email address
        first_name (str): Contact's first name
        last_name (str): Contact's last name (optional)

    Returns:
        dict: Contact object with 'id', 'email', 'firstName', 'lastName' fields

    Raises:
        NewsletterServiceError: If API request fails
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
    search_response: dict[str, Any] = get_ac_client().make_request(
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

    result: dict[str, Any] = get_ac_client().make_request(
        "contacts", method="POST", data=contact_data
    )
    contact = result.get("contact", {})
    logger.info(f"Created new contact with email {email}: ID {contact.get('id')}")
    return contact


@reraise_as_newsletter_service_error
def fetch_ac_contact_list_ids(
    contact_id: str | int, active_only: bool = False
) -> list[str]:
    """
    Fetch the IDs of the lists a contact belongs to.

    In product terms: which newsletters a person is on. With active_only=True, only
    the ones they still receive. Without it, also the ones they unsubscribed from.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        active_only (bool): If True, only return lists with status=1 (active subscriptions).
                            If False (default), return all memberships regardless of status.

    Returns:
        list: List of list IDs the contact is subscribed to (as strings)

    Raises:
        NewsletterServiceError: If API request fails
    """
    response: dict[str, Any] = get_ac_client().make_request(
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


@reraise_as_newsletter_service_error
def find_ac_contact_id_by_email(email: str, timeout: float | None = None) -> str | None:
    """
    Look up an ActiveCampaign contact ID by email, without creating a contact.

    In product terms: whether this email has ever subscribed to anything, without
    signing it up.

    Use this when you only want to read. To add someone to AC, use
    find_or_create_ac_contact instead.

    Args:
        email (str): Email address to look up
        timeout (float or None): Seconds to wait for AC; None uses the client default

    Returns:
        str or None: The contact ID, or None if AC has no contact for this email

    Raises:
        NewsletterServiceError: If API request fails
    """
    response: dict[str, Any] = get_ac_client().make_request(
        f"contacts?filters[email]={quote(email)}", timeout=timeout
    )
    contacts: list[dict[str, Any]] = response.get("contacts", [])
    return contacts[0]["id"] if contacts else None


@reraise_as_newsletter_service_error
def fetch_ac_learning_level_by_contact_id(
    contact_id: str | int, timeout: float | None = None
) -> int | None:
    """
    Fetch a contact's learning level from its ActiveCampaign custom field.

    In product terms: the learning level the person picked, as AC has it. Unlike
    fetch_ac_learning_level_by_email, this doesn't drop values outside 1-5.

    Reads the LEARNING_LEVEL custom field value for the given contact.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        timeout (float or None): Seconds to wait for AC; None uses the client default

    Returns:
        int or None: Learning level (1-5) if set, None if empty/missing

    Raises:
        NewsletterServiceError: If API request fails
    """
    field_id: str = get_ac_field_id_by_perstag("LEARNING_LEVEL")
    response: dict[str, Any] = get_ac_client().make_request(
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


@reraise_as_newsletter_service_error
def add_ac_contact_to_list(contact_id: str | int, list_id: str | int) -> dict[str, Any]:
    """
    Add a contact to a newsletter list (idempotent operation).

    In product terms: subscribe a person to one newsletter.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        list_id (str or int): ActiveCampaign list ID

    Returns:
        dict: Contact list relationship object

    Raises:
        NewsletterServiceError: If API request fails
    """
    contact_list_data: dict[str, dict[str, str | int]] = {
        "contactList": {
            "contact": str(contact_id),
            "list": str(list_id),
            "status": 1,  # 1 = subscribed (required by AC API)
        }
    }

    result: dict[str, Any] = get_ac_client().make_request(
        "contactLists", method="POST", data=contact_list_data
    )
    contact_list: dict[str, Any] = result.get("contactList", {})

    logger.info(f"Added contact {contact_id} to list {list_id}")
    return contact_list


@reraise_as_newsletter_service_error
def add_ac_contact_to_lists(contact_id: str | int, list_ids: list[str]) -> None:
    """
    Subscribe a contact to multiple newsletter lists.

    In product terms: subscribe a person to several newsletters.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        list_ids (list): Array of AC list IDs to subscribe to

    Raises:
        NewsletterServiceError: If any subscription fails
    """
    logger.info(f"Subscribing contact {contact_id} to lists: {list_ids}")

    # TODO: Batch these calls. Two viable options:
    #   (a) Use AC's `contact/sync` endpoint with a `subscribe` array — one
    #       POST attaches the contact to multiple lists in a single round trip.
    #   (b) Wrap the per-list calls in a ThreadPoolExecutor so they run
    #       concurrently. Wait for the per-thread session fix described in the
    #       module docstring first: today every thread shares one session.
    for list_id in list_ids:
        add_ac_contact_to_list(contact_id, list_id)

    logger.info(
        f"Successfully subscribed contact {contact_id} to {len(list_ids)} lists"
    )


@reraise_as_newsletter_service_error
def unsubscribe_ac_contact_from_list(
    contact_id: str | int, list_id: str | int
) -> dict[str, Any]:
    """
    Unsubscribe a contact from a newsletter list.

    In product terms: unsubscribe a person from one newsletter. AC keeps the
    membership and marks it unsubscribed (status 2) instead of deleting it.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        list_id (str or int): ActiveCampaign list ID

    Returns:
        dict: Contact list relationship object with status=2 (unsubscribed)

    Raises:
        NewsletterServiceError: If API request fails
    """
    contact_list_data: dict[str, dict[str, str | int]] = {
        "contactList": {
            "contact": str(contact_id),
            "list": str(list_id),
            "status": 2,  # 2 = unsubscribed
        }
    }

    result: dict[str, Any] = get_ac_client().make_request(
        "contactLists", method="POST", data=contact_list_data
    )
    contact_list: dict[str, Any] = result.get("contactList", {})

    logger.info(f"Removed contact {contact_id} from list {list_id}")
    return contact_list


@reraise_as_newsletter_service_error
def update_ac_list_memberships(
    contact_id: str | int, add_list_ids: list[str], remove_list_ids: list[str]
) -> None:
    """
    Add and remove a contact from multiple lists, one AC request per list.

    In product terms: subscribe a person to some newsletters and unsubscribe them
    from others, trying every one even when some fail.

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

    # TODO: Batch these calls. Same options as add_ac_contact_to_lists:
    #   (a) AC's `contact/sync` endpoint with `subscribe`/`unsubscribe` arrays —
    #       single round trip for both directions.
    #   (b) ThreadPoolExecutor for concurrent per-list calls.
    failed: list[str] = []
    for list_id in remove_list_ids:
        try:
            unsubscribe_ac_contact_from_list(contact_id, list_id)
        except NewsletterServiceError as e:
            logger.warning(f"Failed to remove contact {contact_id} from list {list_id}: {e}")
            failed.append(f"remove from {list_id}")
    for list_id in add_list_ids:
        try:
            add_ac_contact_to_list(contact_id, list_id)
        except NewsletterServiceError as e:
            logger.warning(f"Failed to add contact {contact_id} to list {list_id}: {e}")
            failed.append(f"add to {list_id}")

    if failed:
        raise NewsletterUpdateIncompleteError(
            f"Failed to update list memberships for contact {contact_id}: {', '.join(failed)}"
        )

    logger.info(f"List memberships updated for contact {contact_id}")


@reraise_as_newsletter_service_error
def set_ac_learning_level(
    email: str, learning_level: int | None
) -> ACLearningLevelResult:
    """
    Set a contact's learning level in ActiveCampaign.

    In product terms: save the learning level a person picked. AC stores it whether
    or not they have a Sefaria account.

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
        InputError: If learning_level is invalid (re-raised by @reraise_as_newsletter_service_error)
        NewsletterServiceError: If AC API call fails
    """
    email = normalize_and_validate_email(email)

    # Validate learning_level. InputError is passed through unchanged by the
    # @reraise_as_newsletter_service_error decorator so callers can distinguish bad input from AC failures.
    if learning_level is not None and not is_valid_learning_level(learning_level):
        logger.warning(f"Invalid learning level {learning_level} for email {email}")
        raise InputError(
            "Learning level must be an integer between 1 and 5, or null/None"
        )

    logger.info(f"Updating learning level in AC for {email}: {learning_level}")

    # Find or create contact
    contact: dict[str, Any] = find_or_create_ac_contact(email)
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

    get_ac_client().make_request("fieldValues", method="POST", data=payload)

    logger.info(f"Successfully updated learning level in AC for {email}")

    return {"contact_id": contact_id, "email": email, "learning_level": learning_level}


def fetch_ac_learning_level_by_email(
    email: str, timeout: float | None = None
) -> int | None:
    """
    Read the learning level AC has stored for an email.

    In product terms: the learning level saved for an email, if it's a valid level
    (1-5). Used to copy it to a new account.

    Returns:
        int or None: The level (1-5), or None if AC has no contact for this email,
        no learning level for it, or a value outside 1-5.

    Raises:
        NewsletterServiceError: If AC can't be reached
    """
    contact_id: str | None = find_ac_contact_id_by_email(email, timeout=timeout)
    if contact_id is None:
        return None
    learning_level: int | None = fetch_ac_learning_level_by_contact_id(contact_id, timeout=timeout)
    if learning_level is not None and not 1 <= learning_level <= 5:
        logger.warning(f"Ignoring out-of-range AC learning level {learning_level} for {email}")
        return None
    return learning_level
