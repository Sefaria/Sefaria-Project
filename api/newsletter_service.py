"""
Newsletter Service Module

Integrates with ActiveCampaign API to fetch and manage newsletter lists and metadata.
Handles all API communication with ActiveCampaign.
"""

import json
import logging
import re
import requests
from sefaria.local_settings import ACTIVECAMPAIGN_API_TOKEN, ACTIVECAMPAIGN_ACCOUNT_NAME
from sefaria.system.exceptions import InputError
from sefaria.model.user_profile import UserProfile

logger = logging.getLogger(__name__)


class ActiveCampaignError(Exception):
    """Custom exception for ActiveCampaign API errors"""
    pass


def _get_base_url():
    """
    Get the ActiveCampaign API base URL.

    Returns:
        str: Base URL for API calls
    """
    return f"https://{ACTIVECAMPAIGN_ACCOUNT_NAME}.api-us1.com/api/3"


def _make_ac_request(endpoint, method='GET'):
    """
    Make a request to the ActiveCampaign API.

    Args:
        endpoint (str): API endpoint path (e.g., 'lists', 'personalizations')
        method (str): HTTP method (GET, POST, etc.)

    Returns:
        dict: Parsed JSON response

    Raises:
        ActiveCampaignError: If API request fails
    """
    url = f"{_get_base_url()}/{endpoint}"

    headers = {
        'Api-Token': ACTIVECAMPAIGN_API_TOKEN,
        'Accept': 'application/json',
    }

    try:
        response = requests.request(method, url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        raise ActiveCampaignError("ActiveCampaign API request timed out")
    except requests.exceptions.ConnectionError:
        raise ActiveCampaignError("Failed to connect to ActiveCampaign API")
    except requests.exceptions.HTTPError as e:
        error_msg = f"ActiveCampaign API error: {response.status_code}"
        if response.text:
            try:
                error_data = response.json()
                error_msg = error_data.get('errors', [error_msg])
            except json.JSONDecodeError:
                error_msg += f" - {response.text}"
        raise ActiveCampaignError(error_msg)
    except Exception as e:
        logger.exception(f"Unexpected error calling ActiveCampaign API: {e}")
        raise ActiveCampaignError(f"Unexpected error: {str(e)}")


def get_all_lists():
    """
    Fetch all mailing lists from ActiveCampaign.

    Returns:
        list: List of list objects with 'id', 'stringid', and 'name' fields

    Raises:
        ActiveCampaignError: If API request fails
    """
    try:
        response = _make_ac_request('lists')
        lists = response.get('lists', [])
        logger.info(f"Retrieved {len(lists)} lists from ActiveCampaign")
        return lists
    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching lists: {e}")
        raise ActiveCampaignError(f"Error fetching lists: {str(e)}")


def get_all_personalization_variables():
    """
    Fetch all personalization variables from ActiveCampaign.

    Returns:
        list: List of personalization variable objects

    Raises:
        ActiveCampaignError: If API request fails
    """
    try:
        response = _make_ac_request('personalizations')
        variables = response.get('personalizations', [])
        logger.info(f"Retrieved {len(variables)} personalization variables from ActiveCampaign")
        return variables
    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching personalization variables: {e}")
        raise ActiveCampaignError(f"Error fetching personalization variables: {str(e)}")


def extract_list_id_from_tag(tag):
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
    match = re.match(r'list_(\d+)_meta', tag)
    return int(match.group(1)) if match else None


def parse_metadata_from_variable(variable):
    """
    Parse metadata JSON from a personalization variable's content field.

    Args:
        variable (dict): Personalization variable object with 'content' field

    Returns:
        dict or None: Parsed metadata object, or None if parsing fails
    """
    if not variable or 'content' not in variable:
        return None

    content = variable.get('content', '')
    if not content:
        return None

    try:
        metadata = json.loads(content)
        return metadata
    except json.JSONDecodeError as e:
        tag = variable.get('tag', 'UNKNOWN')
        logger.warning(f"Failed to parse JSON content for variable '{tag}': {e}")
        return None


def get_newsletter_list():
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
                "emoji": "📚",                      # From personalization variable's JSON content
                "language": "english"               # From personalization variable's JSON content
            }

    Raises:
        ActiveCampaignError: If API requests fail
    """
    # Fetch both lists and variables
    lists = get_all_lists()
    variables = get_all_personalization_variables()

    # Create a map of list ID -> list info for quick lookup
    lists_by_id = {lst['id']: lst for lst in lists}

    # Filter variables by pattern and parse metadata
    metadata_variables = list(filter(
        lambda v: extract_list_id_from_tag(v.get('tag', '')) is not None,
        variables
    ))

    # Build variable map: list_id -> variable object (includes both metadata and name)
    variables_by_id = {}
    for v in metadata_variables:
        list_id = str(extract_list_id_from_tag(v['tag']))
        metadata = parse_metadata_from_variable(v)
        if metadata is not None:
            variables_by_id[list_id] = {
                'metadata': metadata,
                'name': v.get('name', '')
            }

    # Merge lists with metadata (only include lists with metadata)
    # Using walrus operator to check list exists while building newsletter
    newsletters = [
        {
            'id': list_item['id'],
            'stringid': list_item.get('stringid', ''),
            'displayName': variable_data['name'],
            'emoji': variable_data['metadata'].get('emoji', ''),
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

def find_or_create_contact(email, first_name, last_name):
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
        response = _make_ac_request(f'contacts?filters[email]={email}')
        contacts = response.get('contacts', [])

        if contacts:
            # Contact exists, return the first one
            contact = contacts[0]
            logger.info(f"Found existing contact with email {email}: ID {contact.get('id')}")
            return contact

        # Contact doesn't exist, create new one
        logger.info(f"Creating new contact with email {email}")
        contact_data = {
            'contact': {
                'email': email,
                'firstName': first_name,
            }
        }
        if last_name:
            contact_data['contact']['lastName'] = last_name

        # Make direct POST request with contact data
        url = f"{_get_base_url()}/contacts"
        headers = {
            'Api-Token': ACTIVECAMPAIGN_API_TOKEN,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        try:
            response = requests.post(url, json=contact_data, headers=headers, timeout=10)
            response.raise_for_status()
            result = response.json()
            contact = result.get('contact', {})
            logger.info(f"Created new contact with email {email}: ID {contact.get('id')}")
            return contact
        except requests.exceptions.Timeout:
            raise ActiveCampaignError("ActiveCampaign API request timed out")
        except requests.exceptions.ConnectionError:
            raise ActiveCampaignError("Failed to connect to ActiveCampaign API")
        except requests.exceptions.HTTPError as e:
            error_msg = f"ActiveCampaign API error: {response.status_code}"
            if response.text:
                try:
                    error_data = response.json()
                    error_msg = error_data.get('errors', [error_msg])
                except json.JSONDecodeError:
                    error_msg += f" - {response.text}"
            raise ActiveCampaignError(error_msg)

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error finding or creating contact: {e}")
        raise ActiveCampaignError(f"Error finding or creating contact: {str(e)}")


def get_contact_list_memberships(contact_id):
    """
    Get all list memberships for a contact.

    Args:
        contact_id (str or int): ActiveCampaign contact ID

    Returns:
        list: List of list IDs the contact is subscribed to (as strings)

    Raises:
        ActiveCampaignError: If API request fails
    """
    try:
        response = _make_ac_request(f'contacts/{contact_id}/contactLists')
        contact_lists = response.get('contactLists', [])

        # Extract list IDs from contact list objects
        list_ids = [str(cl.get('list', cl.get('listid', ''))) for cl in contact_lists]
        list_ids = [lid for lid in list_ids if lid]  # Filter out empty strings

        logger.info(f"Contact {contact_id} is subscribed to {len(list_ids)} lists: {list_ids}")
        return list_ids

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching contact list memberships: {e}")
        raise ActiveCampaignError(f"Error fetching contact list memberships: {str(e)}")


def map_stringids_to_list_ids(newsletter_stringids, newsletter_list):
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
        stringid_to_list_id = {nl['stringid']: nl['id'] for nl in newsletter_list}

        # Map input stringids to list IDs
        list_ids = []
        invalid_ids = []

        for stringid in newsletter_stringids:
            if stringid in stringid_to_list_id:
                list_ids.append(stringid_to_list_id[stringid])
            else:
                invalid_ids.append(stringid)

        if invalid_ids:
            error_msg = f"Invalid newsletter IDs: {', '.join(invalid_ids)}"
            logger.warning(error_msg)
            raise ActiveCampaignError(error_msg)

        logger.info(f"Mapped stringids {newsletter_stringids} to list IDs {list_ids}")
        return list_ids

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error mapping stringids to list IDs: {e}")
        raise ActiveCampaignError(f"Error mapping stringids to list IDs: {str(e)}")


def validate_newsletter_keys(newsletter_stringids, valid_newsletters):
    """
    Validate that newsletter stringids exist in the list of valid newsletters.

    Args:
        newsletter_stringids (list): Array of stringids to validate
        valid_newsletters (list): List of valid newsletter objects from get_newsletter_list()

    Raises:
        ActiveCampaignError: If any stringid is invalid
    """
    try:
        valid_stringids = {nl['stringid'] for nl in valid_newsletters}
        invalid_ids = [sid for sid in newsletter_stringids if sid not in valid_stringids]

        if invalid_ids:
            error_msg = f"Invalid newsletter IDs: {', '.join(invalid_ids)}"
            logger.warning(error_msg)
            raise ActiveCampaignError(error_msg)

        logger.info(f"Newsletter keys {newsletter_stringids} validated successfully")
        return True

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error validating newsletter keys: {e}")
        raise ActiveCampaignError(f"Error validating newsletter keys: {str(e)}")


def add_contact_to_list(contact_id, list_id):
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
        contact_list_data = {
            'contactList': {
                'contact': str(contact_id),
                'list': str(list_id)
            }
        }

        url = f"{_get_base_url()}/contactLists"
        headers = {
            'Api-Token': ACTIVECAMPAIGN_API_TOKEN,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        response = requests.post(url, json=contact_list_data, headers=headers, timeout=10)
        response.raise_for_status()
        result = response.json()
        contact_list = result.get('contactList', {})

        logger.info(f"Added contact {contact_id} to list {list_id}")
        return contact_list

    except requests.exceptions.Timeout:
        raise ActiveCampaignError("ActiveCampaign API request timed out")
    except requests.exceptions.ConnectionError:
        raise ActiveCampaignError("Failed to connect to ActiveCampaign API")
    except requests.exceptions.HTTPError as e:
        error_msg = f"ActiveCampaign API error: {response.status_code}"
        if response.text:
            try:
                error_data = response.json()
                error_msg = error_data.get('errors', [error_msg])
            except json.JSONDecodeError:
                error_msg += f" - {response.text}"
        raise ActiveCampaignError(error_msg)
    except Exception as e:
        logger.exception(f"Error adding contact to list: {e}")
        raise ActiveCampaignError(f"Error adding contact to list: {str(e)}")


def subscribe_contact_to_lists(contact_id, list_ids):
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


def remove_contact_from_list(contact_id, list_id):
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
        contact_list_data = {
            'contactList': {
                'contact': str(contact_id),
                'list': str(list_id),
                'status': 2  # 2 = unsubscribed
            }
        }

        url = f"{_get_base_url()}/contactLists"
        headers = {
            'Api-Token': ACTIVECAMPAIGN_API_TOKEN,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

        response = requests.post(url, json=contact_list_data, headers=headers, timeout=10)
        response.raise_for_status()
        result = response.json()
        contact_list = result.get('contactList', {})

        logger.info(f"Removed contact {contact_id} from list {list_id}")
        return contact_list

    except requests.exceptions.Timeout:
        raise ActiveCampaignError("ActiveCampaign API request timed out")
    except requests.exceptions.ConnectionError:
        raise ActiveCampaignError("Failed to connect to ActiveCampaign API")
    except requests.exceptions.HTTPError as e:
        error_msg = f"ActiveCampaign API error: {response.status_code}"
        if response.text:
            try:
                error_data = response.json()
                error_msg = error_data.get('errors', [error_msg])
            except json.JSONDecodeError:
                error_msg += f" - {response.text}"
        raise ActiveCampaignError(error_msg)
    except Exception as e:
        logger.exception(f"Error removing contact from list: {e}")
        raise ActiveCampaignError(f"Error removing contact from list: {str(e)}")


def update_list_memberships(contact_id, add_list_ids, remove_list_ids):
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


def get_stringid_to_list_id_map(newsletter_list):
    """
    Create a mapping from newsletter stringids to ActiveCampaign list IDs.

    Args:
        newsletter_list (list): List of newsletter objects from get_newsletter_list()

    Returns:
        dict: {stringid: list_id, ...}
    """
    return {nl['stringid']: nl['id'] for nl in newsletter_list}


def get_list_id_to_stringid_map(newsletter_list):
    """
    Create a mapping from ActiveCampaign list IDs to newsletter stringids.

    Args:
        newsletter_list (list): List of newsletter objects from get_newsletter_list()

    Returns:
        dict: {list_id: stringid, ...}
    """
    return {nl['id']: nl['stringid'] for nl in newsletter_list}


def subscribe_with_union(email, first_name, last_name, newsletter_stringids, valid_newsletters):
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
        new_list_ids = set(map_stringids_to_list_ids(newsletter_stringids, valid_newsletters))
        logger.info(f"Mapped to AC list IDs: {new_list_ids}")

        # Step 3: Find or create contact
        contact = find_or_create_contact(email, first_name, last_name)
        contact_id = contact.get('id')

        # Step 4: Get existing subscriptions
        existing_list_ids = set(get_contact_list_memberships(contact_id))
        logger.info(f"Contact has existing list IDs: {existing_list_ids}")

        # Step 5: Compute union
        final_list_ids = existing_list_ids | new_list_ids
        logger.info(f"Union of existing + new list IDs: {final_list_ids}")

        # Step 6: Subscribe to all in union
        subscribe_contact_to_lists(contact_id, list(final_list_ids))

        # Step 7: Map back to stringids for response
        list_id_to_stringid = get_list_id_to_stringid_map(valid_newsletters)
        all_subscriptions = sorted([list_id_to_stringid.get(lid) for lid in final_list_ids
                                    if list_id_to_stringid.get(lid)])

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


def fetch_user_subscriptions_impl(email, valid_newsletters):
    """
    Fetch current newsletter subscriptions for a user by email.

    Args:
        email (str): User's email address
        valid_newsletters (list): List of valid newsletters from get_newsletter_list()

    Returns:
        dict: {
            'subscribed_newsletters': [...],  # Array of stringids
            'learning_level': None
        }

    Raises:
        ActiveCampaignError: If API request fails
    """
    try:
        logger.info(f"Fetching subscriptions for {email}")

        # Find contact by email
        response = _make_ac_request(f'contacts?filters[email]={email}')
        contacts = response.get('contacts', [])

        if not contacts:
            # User not in ActiveCampaign yet
            logger.info(f"Contact {email} not found in ActiveCampaign")
            return {
                'subscribed_newsletters': [],
                'learning_level': None
            }

        contact = contacts[0]
        contact_id = contact.get('id')
        logger.info(f"Found contact {contact_id} for email {email}")

        # Get list memberships
        existing_list_ids = get_contact_list_memberships(contact_id)

        # Map to stringids
        list_id_to_stringid = get_list_id_to_stringid_map(valid_newsletters)
        subscribed_newsletters = sorted([
            list_id_to_stringid.get(lid)
            for lid in existing_list_ids
            if list_id_to_stringid.get(lid)
        ])

        logger.info(f"User {email} is subscribed to: {subscribed_newsletters}")

        return {
            'subscribed_newsletters': subscribed_newsletters,
            'learning_level': None
        }

    except ActiveCampaignError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching user subscriptions: {e}")
        raise ActiveCampaignError(f"Error fetching user subscriptions: {str(e)}")


def update_user_preferences_impl(email, first_name, last_name, selected_stringids, valid_newsletters):
    """
    Update user's newsletter preferences using REPLACE behavior (not union).

    This function replaces the user's subscriptions entirely with their new selections.

    Args:
        email (str): User's email address
        first_name (str): User's first name
        last_name (str): User's last name
        selected_stringids (list): Array of newsletter stringids user is selecting NOW
        valid_newsletters (list): List of valid newsletters from get_newsletter_list()

    Returns:
        dict: {
            'contact': {...},  # Contact object
            'subscribed_newsletters': [...]  # Array of selected stringids
        }

    Raises:
        ActiveCampaignError: If any step fails
    """
    try:
        logger.info(f"Updating preferences for {email} with selections: {selected_stringids}")

        # Step 1: Validate stringids
        validate_newsletter_keys(selected_stringids, valid_newsletters)

        # Step 2: Map stringids to AC list IDs
        new_list_ids = set(map_stringids_to_list_ids(selected_stringids, valid_newsletters))
        logger.info(f"Mapped selections to AC list IDs: {new_list_ids}")

        # Step 3: Find or create contact
        contact = find_or_create_contact(email, first_name, last_name)
        contact_id = contact.get('id')

        # Step 4: Get existing subscriptions
        existing_list_ids = set(get_contact_list_memberships(contact_id))
        logger.info(f"Contact has existing list IDs: {existing_list_ids}")

        # Step 5: Calculate differences for replace behavior
        lists_to_add = new_list_ids - existing_list_ids
        lists_to_remove = existing_list_ids - new_list_ids
        logger.info(f"Lists to add: {lists_to_add}, Lists to remove: {lists_to_remove}")

        # Step 6: Update list memberships (add and remove as needed)
        update_list_memberships(contact_id, list(lists_to_add), list(lists_to_remove))

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


# ============================================================================
# Learning Level Management
# ============================================================================

def update_learning_level_in_ac(email, learning_level):
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
        contact = find_or_create_contact(email)
        contact_id = contact['id']

        # Update contact's learning_level custom field in AC
        # Using fieldValue endpoint for custom field updates
        payload = {
            'fieldValue': {
                'contact': contact_id,
                'field': 'learning_level',  # Custom field name in AC
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


def update_learning_level_impl(email, learning_level):
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
    profile = UserProfile(email=email, user_registration=True)

    user_id = profile.id  # Will be None if no account exists for this email
    updated_profile = False

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

    message = 'Learning level updated successfully'
    if updated_profile:
        message += ' (and saved to profile)'

    return {
        'email': email,
        'learning_level': learning_level,
        'user_id': user_id,
        'message': message
    }
