"""
Newsletter Service Module

Integrates with ActiveCampaign API to fetch and manage newsletter lists and metadata.
Handles all API communication with ActiveCampaign.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, TypedDict

import requests
from sefaria.local_settings import ACTIVECAMPAIGN_API_TOKEN, ACTIVECAMPAIGN_ACCOUNT_NAME
from sefaria.system.exceptions import InputError
from sefaria.model.user_profile import UserProfile

logger: logging.Logger = logging.getLogger(__name__)


# ========== Typed dict shapes for structured return values ==========

class NewsletterInfo(TypedDict):
    id: str
    stringid: str
    displayName: str
    icon: str
    language: str


class SubscribeResult(TypedDict):
    contact: dict[str, Any]
    all_subscriptions: list[str]


class UserSubscriptions(TypedDict):
    subscribed_newsletters: list[str]
    learning_level: int | None
    wants_marketing_emails: bool


class PreferencesResult(TypedDict):
    contact: dict[str, Any]
    subscribed_newsletters: list[str]


class LearningLevelACResult(TypedDict):
    contact_id: str
    email: str
    learning_level: int | None


class LearningLevelResult(TypedDict):
    email: str
    learning_level: int | None
    user_id: int | None
    message: str


class ActiveCampaignError(Exception):
    """Custom exception for ActiveCampaign API errors"""
    pass


# Module-level cache: maps AC custom field perstags to their numeric IDs.
# Populated on first call to get_ac_field_id_by_perstag(), persists for process lifetime.
_field_id_cache: dict[str, str] = {}


def get_ac_field_id_by_perstag(perstag: str) -> str:
    """
    Look up an ActiveCampaign custom field ID by its perstag.

    Fetches all fields on first call and caches the full mapping.
    Subsequent calls return from cache without an API call.

    Args:
        perstag (str): The perstag identifier (e.g., 'LEARNING_LEVEL')

    Returns:
        str: The numeric field ID as a string

    Raises:
        ActiveCampaignError: If field not found or API request fails
    """
    if perstag in _field_id_cache:
        return _field_id_cache[perstag]

    response: dict[str, Any] = _make_ac_request('fields?limit=100')
    fields: list[dict[str, Any]] = response.get('fields', [])

    for field in fields:
        _field_id_cache[field.get('perstag', '')] = field['id']

    if perstag not in _field_id_cache:
        raise ActiveCampaignError(f"Custom field with perstag '{perstag}' not found in ActiveCampaign")

    return _field_id_cache[perstag]


def _get_base_url() -> str:
    """
    Get the ActiveCampaign API base URL.

    Returns:
        str: Base URL for API calls
    """
    return f"https://{ACTIVECAMPAIGN_ACCOUNT_NAME}.api-us1.com/api/3"


def _make_ac_request(endpoint: str, method: str = 'GET', data: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Make a request to the ActiveCampaign API.

    Args:
        endpoint (str): API endpoint path (e.g., 'lists', 'personalizations')
        method (str): HTTP method (GET, POST, etc.)
        data (dict or None): JSON body payload for POST/PUT requests

    Returns:
        dict: Parsed JSON response

    Raises:
        ActiveCampaignError: If API request fails
    """
    url: str = f"{_get_base_url()}/{endpoint}"

    headers: dict[str, str] = {
        'Api-Token': ACTIVECAMPAIGN_API_TOKEN,
        'Accept': 'application/json',
    }

    if data is not None:
        headers['Content-Type'] = 'application/json'

    try:
        kwargs: dict[str, Any] = {'headers': headers, 'timeout': 10}
        if data is not None:
            kwargs['json'] = data
        response: requests.Response = requests.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        raise ActiveCampaignError("ActiveCampaign API request timed out")
    except requests.exceptions.ConnectionError:
        raise ActiveCampaignError("Failed to connect to ActiveCampaign API")
    except requests.exceptions.HTTPError as e:
        error_msg: str | list[str] = f"ActiveCampaign API error: {response.status_code}"
        if response.text:
            try:
                error_data: dict[str, Any] = response.json()
                error_msg = error_data.get('errors', [error_msg])
            except json.JSONDecodeError:
                error_msg += f" - {response.text}"
        raise ActiveCampaignError(error_msg)
    except Exception as e:
        logger.exception(f"Unexpected error calling ActiveCampaign API: {e}")
        raise ActiveCampaignError(f"Unexpected error: {str(e)}")


def get_all_lists() -> list[dict[str, Any]]:
    """
    Fetch all mailing lists from ActiveCampaign.

    Returns:
        list: List of list objects with 'id', 'stringid', and 'name' fields

    Raises:
        ActiveCampaignError: If API request fails
    """
    try:
        response: dict[str, Any] = _make_ac_request('lists?limit=100')
        lists: list[dict[str, Any]] = response.get('lists', [])
        logger.info(f"Retrieved {len(lists)} lists from ActiveCampaign")
        return lists
    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching lists: {e}")
        raise ActiveCampaignError(f"Error fetching lists: {str(e)}")


def get_all_personalization_variables() -> list[dict[str, Any]]:
    """
    Fetch all personalization variables from ActiveCampaign.

    Returns:
        list: List of personalization variable objects

    Raises:
        ActiveCampaignError: If API request fails
    """
    try:
        response: dict[str, Any] = _make_ac_request('personalizations?limit=100')
        variables: list[dict[str, Any]] = response.get('personalizations', [])
        logger.info(f"Retrieved {len(variables)} personalization variables from ActiveCampaign")
        return variables
    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching personalization variables: {e}")
        raise ActiveCampaignError(f"Error fetching personalization variables: {str(e)}")


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
    match: re.Match[str] | None = re.match(r'list_(\d+)_meta', tag)
    return int(match.group(1)) if match else None


def parse_metadata_from_variable(variable: dict[str, Any] | None) -> dict[str, Any] | None:
    """
    Parse metadata JSON from a personalization variable's content field.

    Args:
        variable (dict): Personalization variable object with 'content' field

    Returns:
        dict or None: Parsed metadata object, or None if parsing fails
    """
    if not variable or 'content' not in variable:
        return None

    content: str = variable.get('content', '')
    if not content:
        return None

    try:
        metadata: dict[str, Any] = json.loads(content)
        return metadata
    except json.JSONDecodeError as e:
        tag: str = variable.get('tag', 'UNKNOWN')
        logger.warning(f"Failed to parse JSON content for variable '{tag}': {e}")
        return None


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
    return [lst['id'] for lst in lists]


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
                "displayName": "Sefaria News",      # From personalization variable's 'name' field
                "icon": "news-and-resources.svg",   # From personalization variable's JSON content
                "language": "english"               # From personalization variable's JSON content
            }

    Raises:
        ActiveCampaignError: If API requests fail
    """
    # Fetch both lists and variables
    lists: list[dict[str, Any]] = get_all_lists()
    variables: list[dict[str, Any]] = get_all_personalization_variables()

    # Create a map of list ID -> list info for quick lookup
    lists_by_id: dict[str, dict[str, Any]] = {lst['id']: lst for lst in lists}

    # Filter variables by pattern and parse metadata
    metadata_variables: list[dict[str, Any]] = list(filter(
        lambda v: extract_list_id_from_tag(v.get('tag', '')) is not None,
        variables
    ))

    # Build variable map: list_id -> variable object (includes both metadata and name)
    variables_by_id: dict[str, dict[str, Any]] = {}
    for v in metadata_variables:
        list_id: str = str(extract_list_id_from_tag(v['tag']))
        metadata: dict[str, Any] | None = parse_metadata_from_variable(v)
        if metadata is not None:
            variables_by_id[list_id] = {
                'metadata': metadata,
                'name': v.get('name', '')
            }

    # Merge lists with metadata (only include lists with metadata)
    # Using walrus operator to check list exists while building newsletter
    newsletters: list[NewsletterInfo] = [
        {
            'id': list_item['id'],
            'stringid': list_item.get('stringid', ''),
            'displayName': variable_data['name'],
            'icon': variable_data['metadata'].get('icon', 'news-and-resources.svg'),
            'language': variable_data['metadata'].get('language', 'english'),
        }
        for list_id_str, variable_data in variables_by_id.items()
        if (list_item := lists_by_id.get(list_id_str))
    ]

    logger.info(f"Returning {len(newsletters)} newsletters with complete metadata")
    return newsletters


# ============================================================================
# Contact Management and Subscription Functions
# ============================================================================

def find_or_create_contact(email: str, first_name: str = '', last_name: str = '') -> dict[str, Any]:
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
    try:
        # Search for existing contact by email
        search_response: dict[str, Any] = _make_ac_request(f'contacts?filters[email]={email}')
        contacts: list[dict[str, Any]] = search_response.get('contacts', [])

        if contacts:
            # Contact exists, return the first one
            contact: dict[str, Any] = contacts[0]
            logger.info(f"Found existing contact with email {email}: ID {contact.get('id')}")
            return contact

        # Contact doesn't exist, create new one
        logger.info(f"Creating new contact with email {email}")
        contact_data: dict[str, dict[str, str]] = {
            'contact': {
                'email': email,
                'firstName': first_name,
            }
        }
        if last_name:
            contact_data['contact']['lastName'] = last_name

        # Make direct POST request with contact data
        url: str = f"{_get_base_url()}/contacts"
        headers: dict[str, str] = {
            'Api-Token': ACTIVECAMPAIGN_API_TOKEN,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        try:
            http_response: requests.Response = requests.post(url, json=contact_data, headers=headers, timeout=10)
            http_response.raise_for_status()
            result: dict[str, Any] = http_response.json()
            contact = result.get('contact', {})
            logger.info(f"Created new contact with email {email}: ID {contact.get('id')}")
            return contact
        except requests.exceptions.Timeout:
            raise ActiveCampaignError("ActiveCampaign API request timed out")
        except requests.exceptions.ConnectionError:
            raise ActiveCampaignError("Failed to connect to ActiveCampaign API")
        except requests.exceptions.HTTPError as e:
            error_msg: str | list[str] = f"ActiveCampaign API error: {http_response.status_code}"
            if http_response.text:
                try:
                    error_data: dict[str, Any] = http_response.json()
                    error_msg = error_data.get('errors', [error_msg])
                except json.JSONDecodeError:
                    error_msg += f" - {http_response.text}"
            raise ActiveCampaignError(error_msg)

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error finding or creating contact: {e}")
        raise ActiveCampaignError(f"Error finding or creating contact: {str(e)}")


def get_contact_list_memberships(contact_id: str | int, active_only: bool = False) -> list[str]:
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
    try:
        response: dict[str, Any] = _make_ac_request(f'contacts/{contact_id}/contactLists')
        contact_lists: list[dict[str, Any]] = response.get('contactLists', [])

        if active_only:
            # Filter to only active subscriptions (status=1)
            contact_lists = [cl for cl in contact_lists if str(cl.get('status', '')) == '1']

        # Extract list IDs from contact list objects
        list_ids: list[str] = [str(cl.get('list', cl.get('listid', ''))) for cl in contact_lists]
        list_ids = [lid for lid in list_ids if lid]  # Filter out empty strings

        logger.info(f"Contact {contact_id} memberships (active_only={active_only}): {len(list_ids)} lists: {list_ids}")
        return list_ids

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching contact list memberships: {e}")
        raise ActiveCampaignError(f"Error fetching contact list memberships: {str(e)}")


def get_contact_learning_level(contact_id: str | int) -> int | None:
    """
    Get a contact's learning level from ActiveCampaign custom fields.

    Reads the LEARNING_LEVEL custom field value for the given contact.

    Args:
        contact_id (str or int): ActiveCampaign contact ID

    Returns:
        int or None: Learning level (1-5) if set, None if empty/missing

    Raises:
        ActiveCampaignError: If API request fails
    """
    try:
        field_id: str = get_ac_field_id_by_perstag('LEARNING_LEVEL')
        response: dict[str, Any] = _make_ac_request(f'contacts/{contact_id}/fieldValues')
        field_values: list[dict[str, Any]] = response.get('fieldValues', [])

        for fv in field_values:
            if str(fv.get('field', '')) == str(field_id):
                raw_value: str = fv.get('value', '')
                if raw_value:
                    try:
                        return int(raw_value)
                    except (ValueError, TypeError):
                        logger.warning(f"Non-numeric LEARNING_LEVEL value for contact {contact_id}: {raw_value}")
                        return None
                return None

        return None

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching learning level for contact {contact_id}: {e}")
        raise ActiveCampaignError(f"Error fetching learning level: {str(e)}")


def map_stringids_to_list_ids(newsletter_stringids: list[str], newsletter_list: list[NewsletterInfo]) -> list[str]:
    """
    Convert newsletter stringids to ActiveCampaign list IDs.

    Args:
        newsletter_stringids (list): Array of newsletter stringids (e.g., ['sefaria_news', 'text_updates'])
        newsletter_list (list): List of newsletter objects from get_newsletter_list()

    Returns:
        list: Array of AC list IDs as strings

    Raises:
        ActiveCampaignError: If any stringid is not found in newsletter_list
    """
    try:
        # Build map of stringid -> list ID
        stringid_to_list_id: dict[str, str] = {nl['stringid']: nl['id'] for nl in newsletter_list}

        # Map input stringids to list IDs
        list_ids: list[str] = []
        invalid_ids: list[str] = []

        for stringid in newsletter_stringids:
            if stringid in stringid_to_list_id:
                list_ids.append(stringid_to_list_id[stringid])
            else:
                invalid_ids.append(stringid)

        if invalid_ids:
            error_msg: str = f"Invalid newsletter IDs: {', '.join(invalid_ids)}"
            logger.warning(error_msg)
            raise ActiveCampaignError(error_msg)

        logger.info(f"Mapped stringids {newsletter_stringids} to list IDs {list_ids}")
        return list_ids

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error mapping stringids to list IDs: {e}")
        raise ActiveCampaignError(f"Error mapping stringids to list IDs: {str(e)}")


def validate_newsletter_keys(newsletter_stringids: list[str], valid_newsletters: list[NewsletterInfo]) -> bool:
    """
    Validate that newsletter stringids exist in the list of valid newsletters.

    Args:
        newsletter_stringids (list): Array of stringids to validate
        valid_newsletters (list): List of valid newsletter objects from get_newsletter_list()

    Raises:
        ActiveCampaignError: If any stringid is invalid
    """
    try:
        valid_stringids: set[str] = {nl['stringid'] for nl in valid_newsletters}
        invalid_ids: list[str] = [sid for sid in newsletter_stringids if sid not in valid_stringids]

        if invalid_ids:
            error_msg: str = f"Invalid newsletter IDs: {', '.join(invalid_ids)}"
            logger.warning(error_msg)
            raise ActiveCampaignError(error_msg)

        logger.info(f"Newsletter keys {newsletter_stringids} validated successfully")
        return True

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error validating newsletter keys: {e}")
        raise ActiveCampaignError(f"Error validating newsletter keys: {str(e)}")


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
    try:
        contact_list_data: dict[str, dict[str, str | int]] = {
            'contactList': {
                'contact': str(contact_id),
                'list': str(list_id),
                'status': 1  # 1 = subscribed (required by AC API)
            }
        }

        url: str = f"{_get_base_url()}/contactLists"
        headers: dict[str, str] = {
            'Api-Token': ACTIVECAMPAIGN_API_TOKEN,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        http_response: requests.Response = requests.post(url, json=contact_list_data, headers=headers, timeout=10)
        http_response.raise_for_status()
        result: dict[str, Any] = http_response.json()
        contact_list: dict[str, Any] = result.get('contactList', {})

        logger.info(f"Added contact {contact_id} to list {list_id}")
        return contact_list

    except requests.exceptions.Timeout:
        raise ActiveCampaignError("ActiveCampaign API request timed out")
    except requests.exceptions.ConnectionError:
        raise ActiveCampaignError("Failed to connect to ActiveCampaign API")
    except requests.exceptions.HTTPError as e:
        error_msg: str | list[str] = f"ActiveCampaign API error: {http_response.status_code}"
        if http_response.text:
            try:
                error_data: dict[str, Any] = http_response.json()
                error_msg = error_data.get('errors', [error_msg])
            except json.JSONDecodeError:
                error_msg += f" - {http_response.text}"
        raise ActiveCampaignError(error_msg)
    except Exception as e:
        logger.exception(f"Error adding contact to list: {e}")
        raise ActiveCampaignError(f"Error adding contact to list: {str(e)}")


def subscribe_contact_to_lists(contact_id: str | int, list_ids: list[str]) -> None:
    """
    Subscribe a contact to multiple newsletter lists.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        list_ids (list): Array of AC list IDs to subscribe to

    Raises:
        ActiveCampaignError: If any subscription fails
    """
    try:
        logger.info(f"Subscribing contact {contact_id} to lists: {list_ids}")

        for list_id in list_ids:
            add_contact_to_list(contact_id, list_id)

        logger.info(f"Successfully subscribed contact {contact_id} to {len(list_ids)} lists")

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error subscribing contact to lists: {e}")
        raise ActiveCampaignError(f"Error subscribing contact to lists: {str(e)}")


def remove_contact_from_list(contact_id: str | int, list_id: str | int) -> dict[str, Any]:
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
    try:
        contact_list_data: dict[str, dict[str, str | int]] = {
            'contactList': {
                'contact': str(contact_id),
                'list': str(list_id),
                'status': 2  # 2 = unsubscribed
            }
        }

        url: str = f"{_get_base_url()}/contactLists"
        headers: dict[str, str] = {
            'Api-Token': ACTIVECAMPAIGN_API_TOKEN,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        http_response: requests.Response = requests.post(url, json=contact_list_data, headers=headers, timeout=10)
        http_response.raise_for_status()
        result: dict[str, Any] = http_response.json()
        contact_list: dict[str, Any] = result.get('contactList', {})

        logger.info(f"Removed contact {contact_id} from list {list_id}")
        return contact_list

    except requests.exceptions.Timeout:
        raise ActiveCampaignError("ActiveCampaign API request timed out")
    except requests.exceptions.ConnectionError:
        raise ActiveCampaignError("Failed to connect to ActiveCampaign API")
    except requests.exceptions.HTTPError as e:
        error_msg: str | list[str] = f"ActiveCampaign API error: {http_response.status_code}"
        if http_response.text:
            try:
                error_data: dict[str, Any] = http_response.json()
                error_msg = error_data.get('errors', [error_msg])
            except json.JSONDecodeError:
                error_msg += f" - {http_response.text}"
        raise ActiveCampaignError(error_msg)
    except Exception as e:
        logger.exception(f"Error removing contact from list: {e}")
        raise ActiveCampaignError(f"Error removing contact from list: {str(e)}")


def update_list_memberships(contact_id: str | int, add_list_ids: list[str], remove_list_ids: list[str]) -> None:
    """
    Atomically add and remove contact from multiple lists.

    Args:
        contact_id (str or int): ActiveCampaign contact ID
        add_list_ids (list): List IDs to subscribe to
        remove_list_ids (list): List IDs to unsubscribe from

    Raises:
        ActiveCampaignError: If any operation fails
    """
    try:
        logger.info(f"Updating list memberships for contact {contact_id}: adding {add_list_ids}, removing {remove_list_ids}")

        # Remove from old lists
        for list_id in remove_list_ids:
            remove_contact_from_list(contact_id, list_id)

        # Add to new lists
        for list_id in add_list_ids:
            add_contact_to_list(contact_id, list_id)

        logger.info(f"List memberships updated for contact {contact_id}")

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error updating list memberships: {e}")
        raise ActiveCampaignError(f"Error updating list memberships: {str(e)}")


def get_stringid_to_list_id_map(newsletter_list: list[NewsletterInfo]) -> dict[str, str]:
    """
    Create a mapping from newsletter stringids to ActiveCampaign list IDs.

    Args:
        newsletter_list (list): List of newsletter objects from get_newsletter_list()

    Returns:
        dict: {stringid: list_id, ...}
    """
    return {nl['stringid']: nl['id'] for nl in newsletter_list}


def get_list_id_to_stringid_map(newsletter_list: list[NewsletterInfo]) -> dict[str, str]:
    """
    Create a mapping from ActiveCampaign list IDs to newsletter stringids.

    Args:
        newsletter_list (list): List of newsletter objects from get_newsletter_list()

    Returns:
        dict: {list_id: stringid, ...}
    """
    return {nl['id']: nl['stringid'] for nl in newsletter_list}


def subscribe_with_union(email: str, first_name: str, last_name: str,
                         newsletter_stringids: list[str],
                         valid_newsletters: list[NewsletterInfo]) -> SubscribeResult:
    """
    Subscribe a contact to newsletters using union behavior (add to existing subscriptions).

    This function handles the complete subscription flow:
    1. Validates newsletter stringids
    2. Maps stringids to AC list IDs
    3. Finds or creates contact by email
    4. Gets existing list memberships
    5. Computes union of existing + new subscriptions
    6. Subscribes to all lists in union
    7. Returns final subscription state

    Args:
        email (str): Contact's email address
        first_name (str): Contact's first name
        last_name (str): Contact's last name (optional)
        newsletter_stringids (list): Array of newsletter stringids to add
        valid_newsletters (list): List of valid newsletters from get_newsletter_list()

    Returns:
        dict: {
            'contact': {...},  # Contact object
            'all_subscriptions': [...]  # Array of stringids for all current subscriptions
        }

    Raises:
        ActiveCampaignError: If any step fails
    """
    try:
        logger.info(f"Starting subscription flow for {email} with newsletters: {newsletter_stringids}")

        # Step 1: Validate stringids
        validate_newsletter_keys(newsletter_stringids, valid_newsletters)

        # Step 2: Map stringids to AC list IDs
        new_list_ids: set[str] = set(map_stringids_to_list_ids(newsletter_stringids, valid_newsletters))
        logger.info(f"Mapped to AC list IDs: {new_list_ids}")

        # Step 3: Find or create contact
        contact: dict[str, Any] = find_or_create_contact(email, first_name, last_name)
        contact_id: str = contact['id']

        # Step 4: Get existing subscriptions
        existing_list_ids: set[str] = set(get_contact_list_memberships(contact_id))
        logger.info(f"Contact has existing list IDs: {existing_list_ids}")

        # Step 5: Compute union
        final_list_ids: set[str] = existing_list_ids | new_list_ids
        logger.info(f"Union of existing + new list IDs: {final_list_ids}")

        # Step 6: Subscribe to all in union
        subscribe_contact_to_lists(contact_id, list(final_list_ids))

        # Step 7: Map back to stringids for response
        list_id_to_stringid: dict[str, str] = get_list_id_to_stringid_map(valid_newsletters)
        all_subscriptions: list[str] = sorted([
            stringid for lid in final_list_ids
            if (stringid := list_id_to_stringid.get(lid))
        ])

        logger.info(f"Subscription complete for {email}. All subscriptions: {all_subscriptions}")

        return {
            'contact': contact,
            'all_subscriptions': all_subscriptions
        }

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error in subscribe_with_union: {e}")
        raise ActiveCampaignError(f"Error in subscribe_with_union: {str(e)}")


def fetch_user_subscriptions_impl(email: str, valid_newsletters: list[NewsletterInfo],
                                  user: Any = None) -> UserSubscriptions:
    """
    Fetch current newsletter subscriptions for a user by email.

    Args:
        email (str): User's email address
        valid_newsletters (list): List of valid newsletters from get_newsletter_list()
        user: Django User object (optional, for reading UserProfile preferences)

    Returns:
        dict: {
            'subscribed_newsletters': [...],  # Array of stringids
            'learning_level': None,
            'wants_marketing_emails': bool  # From MongoDB UserProfile (default True)
        }

    Raises:
        ActiveCampaignError: If API request fails
    """
    try:
        logger.info(f"Fetching subscriptions for {email}")

        # Read preferences from MongoDB UserProfile for authenticated users
        wants_marketing_emails: bool = True  # Default for unauthenticated or new users
        profile_learning_level: int | None = None
        if user is not None and user.is_authenticated:
            try:
                profile: UserProfile = UserProfile(email=email, user_registration=True)
                if profile.id is not None:
                    wants_marketing_emails = getattr(profile, 'wants_marketing_emails', True)
                    profile_learning_level = getattr(profile, 'learning_level', None)
            except Exception as e:
                logger.warning(f"Could not load UserProfile for {email}: {e}")

        # Find contact by email
        response: dict[str, Any] = _make_ac_request(f'contacts?filters[email]={email}')
        contacts: list[dict[str, Any]] = response.get('contacts', [])

        if not contacts:
            # User not in ActiveCampaign yet — fall back to profile value
            logger.info(f"Contact {email} not found in ActiveCampaign")
            return {
                'subscribed_newsletters': [],
                'learning_level': profile_learning_level,
                'wants_marketing_emails': wants_marketing_emails,
            }

        contact: dict[str, Any] = contacts[0]
        contact_id: str = contact['id']
        logger.info(f"Found contact {contact_id} for email {email}")

        # Get list memberships (active only for accurate subscription state)
        existing_list_ids: list[str] = get_contact_list_memberships(contact_id, active_only=True)

        # Map to stringids
        list_id_to_stringid: dict[str, str] = get_list_id_to_stringid_map(valid_newsletters)
        subscribed_newsletters: list[str] = sorted([
            stringid for lid in existing_list_ids
            if (stringid := list_id_to_stringid.get(lid))
        ])

        logger.info(f"User {email} is subscribed to: {subscribed_newsletters}")

        # Fetch learning level from AC custom field; AC value takes priority over profile
        learning_level: int | None = profile_learning_level
        try:
            ac_learning_level: int | None = get_contact_learning_level(contact_id)
            if ac_learning_level is not None:
                learning_level = ac_learning_level
        except Exception as e:
            logger.warning(f"Could not fetch learning level from AC for {email}: {e}")

        return {
            'subscribed_newsletters': subscribed_newsletters,
            'learning_level': learning_level,
            'wants_marketing_emails': wants_marketing_emails,
        }

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching user subscriptions: {e}")
        raise ActiveCampaignError(f"Error fetching user subscriptions: {str(e)}")


def update_user_preferences_impl(email: str, first_name: str, last_name: str,
                                  selected_stringids: list[str],
                                  valid_newsletters: list[NewsletterInfo],
                                  marketing_opt_out: bool = False,
                                  user: Any = None) -> PreferencesResult:
    """
    Update user's newsletter preferences using REPLACE behavior (not union).

    Two modes of operation:
    - Normal (marketing_opt_out=False): Replaces managed list subscriptions with new selections.
      Unmanaged lists are not touched.
    - Opt-out (marketing_opt_out=True): Unsubscribes from ALL lists (managed + unmanaged).
      Sets wants_marketing_emails=False in MongoDB UserProfile.

    Args:
        email (str): User's email address
        first_name (str): User's first name
        last_name (str): User's last name
        selected_stringids (list): Array of newsletter stringids user is selecting NOW
        valid_newsletters (list): List of valid newsletters from get_newsletter_list()
        marketing_opt_out (bool): If True, unsubscribe from ALL lists (managed + unmanaged)
        user: Django User object (optional, for updating MongoDB UserProfile)

    Returns:
        dict: {
            'contact': {...},  # Contact object
            'subscribed_newsletters': [...]  # Array of selected stringids
        }

    Raises:
        ActiveCampaignError: If any step fails
    """
    try:
        logger.info(f"Updating preferences for {email} with selections: {selected_stringids}, "
                     f"marketing_opt_out: {marketing_opt_out}")

        # Find or create contact
        contact: dict[str, Any] = find_or_create_contact(email, first_name, last_name)
        contact_id: str = contact['id']

        if marketing_opt_out:
            # === OPT-OUT BRANCH: Unsubscribe from ALL lists ===
            logger.info(f"Marketing opt-out for {email}: unsubscribing from all lists")

            # Get ALL list IDs in the AC account (managed + unmanaged)
            all_list_ids: set[str] = set(get_all_ac_list_ids())

            # Get user's current active memberships
            active_list_ids: set[str] = set(get_contact_list_memberships(contact_id, active_only=True))

            # Only unsubscribe from lists the user is actually subscribed to
            lists_to_remove: set[str] = all_list_ids & active_list_ids
            logger.info(f"Unsubscribing from {len(lists_to_remove)} lists: {lists_to_remove}")

            update_list_memberships(contact_id, [], list(lists_to_remove))

            # Update wants_marketing_emails in MongoDB UserProfile
            _update_wants_marketing_emails(email, False)

            logger.info(f"Marketing opt-out complete for {email}")
            return {
                'contact': contact,
                'subscribed_newsletters': []
            }

        else:
            # === NORMAL BRANCH: REPLACE within managed lists only ===
            logger.info(f"Normal preference update for {email}")

            # Validate stringids against managed list
            validate_newsletter_keys(selected_stringids, valid_newsletters)

            # Map stringids to AC list IDs
            new_list_ids: set[str] = set(map_stringids_to_list_ids(selected_stringids, valid_newsletters))
            logger.info(f"Mapped selections to AC list IDs: {new_list_ids}")

            # Get managed list IDs (only diff against these)
            managed_list_ids: set[str] = set(nl['id'] for nl in valid_newsletters)

            # Get existing active subscriptions
            existing_list_ids: set[str] = set(get_contact_list_memberships(contact_id, active_only=True))
            logger.info(f"Contact has existing active list IDs: {existing_list_ids}")

            # Scope the diff to managed lists only (don't touch unmanaged lists)
            existing_managed: set[str] = existing_list_ids & managed_list_ids
            lists_to_add: set[str] = new_list_ids - existing_managed
            lists_to_remove_managed: set[str] = existing_managed - new_list_ids
            logger.info(f"Lists to add: {lists_to_add}, Lists to remove: {lists_to_remove_managed}")

            # Update list memberships (add and remove as needed)
            update_list_memberships(contact_id, list(lists_to_add), list(lists_to_remove_managed))

            # Update wants_marketing_emails in MongoDB UserProfile
            _update_wants_marketing_emails(email, True)

            logger.info(f"Preferences updated for {email}. New subscriptions: {selected_stringids}")

            return {
                'contact': contact,
                'subscribed_newsletters': sorted(selected_stringids)
            }

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error updating user preferences: {e}")
        raise ActiveCampaignError(f"Error updating user preferences: {str(e)}")


def _update_wants_marketing_emails(email: str, wants_marketing: bool) -> None:
    """
    Update the wants_marketing_emails flag in MongoDB UserProfile.

    Only updates if the user has an existing Sefaria account.

    Args:
        email (str): User email address
        wants_marketing (bool): New value for wants_marketing_emails
    """
    try:
        profile: UserProfile = UserProfile(email=email, user_registration=True)
        if profile.id is not None:
            profile.wants_marketing_emails = wants_marketing
            profile.save()
            logger.info(f"Updated wants_marketing_emails={wants_marketing} for {email}")
        else:
            logger.info(f"No UserProfile found for {email}, skipping wants_marketing_emails update")
    except Exception as e:
        logger.warning(f"Failed to update wants_marketing_emails for {email}: {e}")


# ============================================================================
# Learning Level Management
# ============================================================================

def update_learning_level_in_ac(email: str, learning_level: int | None) -> LearningLevelACResult:
    """
    Update a contact's learning level in ActiveCampaign.

    Learning level is stored as a custom field in AC for all users (with or without accounts).
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
        InputError: If learning_level is invalid
        ActiveCampaignError: If AC API call fails
    """
    # Validate learning_level
    if learning_level is not None:
        if not isinstance(learning_level, int) or learning_level < 1 or learning_level > 5:
            logger.warning(f"Invalid learning level {learning_level} for email {email}")
            raise InputError("Learning level must be an integer between 1 and 5, or null/None")

    logger.info(f"Updating learning level in AC for {email}: {learning_level}")

    try:
        # Find or create contact
        contact: dict[str, Any] = find_or_create_contact(email)
        contact_id: str = contact['id']

        # Look up the field ID dynamically by perstag (cached after first call)
        field_id: str = get_ac_field_id_by_perstag('LEARNING_LEVEL')

        payload: dict[str, dict[str, str]] = {
            'fieldValue': {
                'contact': contact_id,
                'field': field_id,
                'value': str(learning_level) if learning_level is not None else ''
            }
        }

        _make_ac_request('fieldValues', method='POST', data=payload)

        logger.info(f"Successfully updated learning level in AC for {email}")

        return {
            'contact_id': contact_id,
            'email': email,
            'learning_level': learning_level
        }

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error updating learning level in AC for {email}: {e}")
        raise ActiveCampaignError(f"Error updating learning level in AC: {str(e)}")


def update_learning_level_impl(email: str, learning_level: int | None) -> LearningLevelResult:
    """
    Update a user's learning level, handling both authenticated and unauthenticated users.

    For users WITH existing Sefaria accounts:
        - Updates their UserProfile in MongoDB (persistent storage)
        - Also updates AC for consistency across systems

    For users WITHOUT accounts:
        - Only updates AC (no profile to create)
        - AC custom field stores their learning level preference

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
    # Validate learning_level
    if learning_level is not None:
        if not isinstance(learning_level, int) or learning_level < 1 or learning_level > 5:
            logger.warning(f"Invalid learning level {learning_level} for {email}")
            raise InputError("Learning level must be an integer between 1 and 5, or null/None")

    logger.info(f"Updating learning level for {email}: {learning_level}")

    # Step 1: Try to load existing user profile using the standard UserProfile convention
    # Pass user_registration=True to prevent auto-creating a profile
    profile: UserProfile = UserProfile(email=email, user_registration=True)

    user_id: int | None = profile.id  # Will be None if no account exists for this email
    updated_profile: bool = False

    # Step 2: If account exists, update the UserProfile
    if user_id is not None:
        logger.info(f"Found existing user account for {email} (ID: {user_id})")

        try:
            profile.learning_level = learning_level
            profile.save()
            updated_profile = True
            logger.info(f"Updated UserProfile for user {user_id}")
        except Exception as e:
            logger.exception(f"Error updating UserProfile for {email}: {e}")
            # Don't raise - we can still update AC

    else:
        logger.info(f"No existing user account for {email}")

    # Step 3: Always update in ActiveCampaign (for logged-out users or consistency)
    # This ensures learning level is available in the newsletter system even without an account
    try:
        update_learning_level_in_ac(email, learning_level)
    except Exception as e:
        logger.exception(f"Error updating learning level in AC for {email}: {e}")
        raise

    message: str = 'Learning level updated successfully'
    if updated_profile:
        message += ' (and saved to profile)'

    return {
        'email': email,
        'learning_level': learning_level,
        'user_id': user_id,
        'message': message
    }
