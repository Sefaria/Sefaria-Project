"""The subscription flows the newsletter views call: subscribe, fetch, and update preferences."""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any

from api.newsletter_service._ac_client import requires_newsletter_service
from api.newsletter_service._catalog import (
    fetch_all_ac_list_ids,
    map_stringids_to_list_ids,
    resolve_valid_newsletters,
)
from api.newsletter_service._contacts import (
    add_ac_contact_to_lists,
    fetch_ac_contact_list_ids,
    fetch_ac_learning_level_by_contact_id,
    find_ac_contact_id_by_email,
    find_or_create_ac_contact,
    update_ac_list_memberships,
)
from api.newsletter_service._errors import NewsletterUpdateIncompleteError, reraise_as_newsletter_service_error
from api.newsletter_service._profiles import load_existing_profile_by_email, save_wants_marketing_emails
from api.newsletter_service._results import (
    AddSubscriptionsResult,
    ReplacePreferencesResult,
    UserSubscriptions,
)
from api.newsletter_service._validation import normalize_and_validate_email

if TYPE_CHECKING:
    from sefaria.model.user_profile import UserProfile

logger: logging.Logger = logging.getLogger(__name__)


@requires_newsletter_service
@reraise_as_newsletter_service_error
def add_newsletter_subscriptions(
    email: str,
    first_name: str,
    last_name: str,
    newsletter_stringids: list[str],
    valid_newsletters: Sequence[Mapping[str, Any]] | None = None,
) -> AddSubscriptionsResult:
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
        NewsletterServiceError: If any step fails
    """
    email = normalize_and_validate_email(email)
    logger.info(
        f"Starting subscription flow for {email} with newsletters: {newsletter_stringids}"
    )
    valid_newsletters = resolve_valid_newsletters(valid_newsletters)

    # Step 1: Map stringids to AC list IDs. map_stringids_to_list_ids raises
    # InputError if any stringid isn't in valid_newsletters, so this
    # validates and maps in one pass.
    new_list_ids: set[str] = set(
        map_stringids_to_list_ids(newsletter_stringids, valid_newsletters)
    )
    logger.info(f"Mapped to AC list IDs: {new_list_ids}")

    # Step 2: Find or create contact
    contact: dict[str, Any] = find_or_create_ac_contact(email, first_name, last_name)
    contact_id: str = contact["id"]

    # Step 3: Get current *active* subscriptions.
    # Use active_only=True so a list the user previously unsubscribed from
    # (status: 2) is treated as "not subscribed" and ends up in to_add below —
    # otherwise we'd silently skip resubscribing them.
    existing_active_list_ids: set[str] = set(
        fetch_ac_contact_list_ids(contact_id, active_only=True)
    )
    logger.info(f"Contact has existing active list IDs: {existing_active_list_ids}")

    # Step 4: Only subscribe to lists the user isn't already actively on.
    # This avoids redundant status:1 POSTs to AC for memberships that are already active
    to_add: set[str] = new_list_ids - existing_active_list_ids
    logger.info(f"Lists to newly subscribe to: {to_add}")

    # Step 5: Subscribe only to the genuinely new ones
    add_ac_contact_to_lists(contact_id, list(to_add))

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


@requires_newsletter_service
@reraise_as_newsletter_service_error
def fetch_user_subscriptions(
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
        NewsletterServiceError: If API request fails
    """
    email = normalize_and_validate_email(email)
    logger.info(f"Fetching subscriptions for {email}")

    # Read preferences from MongoDB UserProfile for authenticated users
    wants_marketing_emails: bool = True  # Default for unauthenticated or new users
    profile_learning_level: int | None = None
    profile: UserProfile | None = None
    if user is not None and user.is_authenticated:
        profile = load_existing_profile_by_email(email)
        if profile is not None:
            wants_marketing_emails = getattr(profile, "wants_marketing_emails", True)
            profile_learning_level = getattr(profile, "learning_level", None)

    contact_id: str | None = find_ac_contact_id_by_email(email)

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
    existing_list_ids: list[str] = fetch_ac_contact_list_ids(
        contact_id, active_only=True
    )
    valid_newsletters = resolve_valid_newsletters(valid_newsletters)

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
        save_wants_marketing_emails(profile, True)
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
        ac_learning_level: int | None = fetch_ac_learning_level_by_contact_id(contact_id)
        if ac_learning_level is not None:
            learning_level = ac_learning_level
    except Exception as e:
        logger.warning(f"Could not fetch learning level from AC for {email}: {e}")

    return {
        "subscribed_newsletters": subscribed_newsletters,
        "learning_level": learning_level,
        "wants_marketing_emails": wants_marketing_emails,
    }


@requires_newsletter_service
@reraise_as_newsletter_service_error
def replace_user_preferences(
    email: str,
    first_name: str,
    last_name: str,
    selected_stringids: list[str],
    valid_newsletters: Sequence[Mapping[str, Any]] | None = None,
    marketing_opt_out: bool = False,
) -> ReplacePreferencesResult:
    """
    Update user's newsletter preferences using REPLACE behavior (not union).

    Two modes of operation:
    - Normal (marketing_opt_out=False): Replaces managed list subscriptions with new selections.
      Unmanaged lists are not touched.
    - Opt-out (marketing_opt_out=True): Unsubscribes from ALL lists (managed + unmanaged).
      Sets wants_marketing_emails=False in MongoDB UserProfile.

    The UserProfile is looked up by email (load_existing_profile_by_email), so this function
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
        NewsletterServiceError: If any step fails
    """
    email = normalize_and_validate_email(email)
    logger.info(
        f"Updating preferences for {email} with selections: {selected_stringids}, "
        f"marketing_opt_out: {marketing_opt_out}"
    )

    # Load UserProfile once at the top so both branches share the same instance.
    # Returns None if no Sefaria account exists for `email` — that's fine; the
    # AC mutations below still run, only the profile save becomes a no-op.
    profile: UserProfile | None = load_existing_profile_by_email(email)

    # Check the selections before writing anything to AC, so a request with an
    # unknown stringid doesn't create or rename a contact before it fails.
    # map_stringids_to_list_ids raises InputError if any stringid isn't valid, so
    # this validates and maps in one pass. Opting out ignores the selections.
    new_list_ids: set[str] = set()
    if not marketing_opt_out:
        valid_newsletters = resolve_valid_newsletters(valid_newsletters)
        new_list_ids = set(
            map_stringids_to_list_ids(selected_stringids, valid_newsletters)
        )
        logger.info(f"Mapped selections to AC list IDs: {new_list_ids}")

    # Find or create contact
    contact: dict[str, Any] = find_or_create_ac_contact(email, first_name, last_name)
    contact_id: str = contact["id"]

    if marketing_opt_out:
        # === OPT-OUT BRANCH: Unsubscribe from ALL lists ===
        logger.info(f"Marketing opt-out for {email}: unsubscribing from all lists")

        # Get ALL list IDs in the AC account (managed + unmanaged)
        all_list_ids: set[str] = set(fetch_all_ac_list_ids())

        # Get user's current active memberships
        active_list_ids: set[str] = set(
            fetch_ac_contact_list_ids(contact_id, active_only=True)
        )

        # Only unsubscribe from lists the user is actually subscribed to
        lists_to_remove: set[str] = all_list_ids & active_list_ids
        logger.info(
            f"Unsubscribing from {len(lists_to_remove)} lists: {lists_to_remove}"
        )

        # Remove the lists first and save the opt-out only once they're all
        # gone. wants_marketing_emails describes whether the user gets marketing
        # emails, so it shouldn't say False while they're still on a list.
        # Saving first wouldn't keep the choice anyway: fetch_user_subscriptions
        # reads False plus an active list as "signed up again elsewhere" and
        # sets it back to True.
        #
        # update_ac_list_memberships tries every list and raises if any failed. The
        # user gets an error, the form keeps their choice, and they can submit
        # again. If only the save fails, that's reported too; submitting again
        # finds no active lists and just retries the save.
        update_ac_list_memberships(contact_id, [], list(lists_to_remove))

        if not save_wants_marketing_emails(profile, False):
            raise NewsletterUpdateIncompleteError(
                f"Unsubscribed {email} from all lists, but couldn't save the opt-out to their profile"
            )

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
            fetch_ac_contact_list_ids(contact_id, active_only=True)
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
        update_ac_list_memberships(
            contact_id, list(lists_to_add), list(lists_to_remove_managed)
        )

        # Update wants_marketing_emails on the pre-loaded profile
        save_wants_marketing_emails(profile, True)

        logger.info(
            f"Preferences updated for {email}. New subscriptions: {selected_stringids}"
        )

        return {
            "contact": contact,
            "subscribed_newsletters": sorted(selected_stringids),
        }
