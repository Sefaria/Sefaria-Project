"""
Recording donor status on a user's profile.

Split in two so the rule can be tested without a database:
  - build_update_pipeline_marking_profile_as_donor is the whole rule, as a pure function
    (same input, same output, no database access).
  - mark_existing_user_profile_as_donor does the database work through two small seams:
    find_user_id_by_email_creating_profile_if_missing and apply_update_to_user_profile. A
    seam is a function that tests can swap for a fake. A future sustainer sync or bulk import can call
    this same function without any webhook.

The rule is applied by Mongo in ONE atomic update (an update pipeline, so MongoDB 4.2+), never
as read-then-write in Python, because two Celery workers can process the Classy event and the
Salesforce follow-up for the same donation at the same moment.
"""

from datetime import datetime

import structlog

from sefaria.donors.types import (
    DonorStatus,
    DonorWithResolvedEmailAddress,
    EventIndicatingPersonIsDonor,
    NormalizedEmailAddress,
    as_utc_datetime,
)

logger = structlog.get_logger(__name__)


def build_update_pipeline_marking_profile_as_donor(occurred_at: datetime) -> list[dict]:
    # No current-status parameter yet: status only ever moves to DONOR. When refunds are
    # handled (a refund could move a donor back to NON_DONOR), this will need the current
    # status and the type of the incoming event.
    #
    # An update PIPELINE, not the $min update operator. Profiles store became_donor_at: null until
    # someone donates (UserProfile.to_mongo_dict writes the default), and the operator form compares
    # in BSON order, where null sorts below every date, so it would keep the null forever. The
    # aggregation $min skips null and missing values. It is still one atomic update, so two workers
    # handling the Classy event and the Salesforce follow-up for one donation converge on the
    # earliest date. Doing the comparison in Python would read then write, and the later writer
    # could leave the later date. Keeping the earliest date is also what lets retries, duplicates
    # and out-of-order deliveries all converge on one value.
    return [
        {
            "$set": {
                "donor_status": DonorStatus.DONOR.value,
                "became_donor_at": {
                    "$min": ["$became_donor_at", as_utc_datetime(occurred_at)]
                },
            }
        }
    ]


def mark_existing_user_profile_as_donor(
    donor: DonorWithResolvedEmailAddress, event: EventIndicatingPersonIsDonor
) -> None:
    user_id = find_user_id_by_email_creating_profile_if_missing(donor.email_address)
    if user_id is None:
        # The email address is deliberately not logged.
        logger.info(
            "donor_has_no_sefaria_account",
            event_id_assigned_by_source=event.event_id_assigned_by_source,
        )
        return
    update = build_update_pipeline_marking_profile_as_donor(
        event.occurred_at_according_to_source
    )
    if not apply_update_to_user_profile(user_id, update):
        # The profile document was there a moment ago (the lookup makes sure of it) and is gone
        # now, for example deleted by an admin in between. Without this warning the donation
        # would be dropped silently.
        logger.warning(
            "donor_profile_document_missing",
            user_id=user_id,
            event_id_assigned_by_source=event.event_id_assigned_by_source,
        )
        return
    logger.info(
        "user_profile_marked_as_donor",
        event_id_assigned_by_source=event.event_id_assigned_by_source,
        user_id=user_id,
    )


def most_recently_active_account(accounts):
    """
    Choose which of several Django accounts sharing one email address gets the donation.

    Production should never have two accounts on one address (the signup form rejects a taken
    one), but local and dev databases can, for example accounts made by hand or by scripts.
    Without this choice the donation would be dropped and logged as "no account", which is
    misleading when debugging. The account the person actually uses is the one they logged
    into most recently; an account that was never logged into is a leftover, so any logged-in
    account beats it, and among never-logged-in accounts the newest one wins.
    """
    # The tuple's first element sorts "has logged in" above "never has", so the second
    # element only ever compares two last_login values or two date_joined values, never a
    # None with a date.
    return max(
        accounts,
        key=lambda account: (
            account.last_login is not None,
            account.last_login or account.date_joined,
        ),
    )


def find_user_id_by_email_creating_profile_if_missing(
    email_address: NormalizedEmailAddress,
) -> int | None:
    """
    The id of the Sefaria account with this email address, or None when there is none. When
    an id is returned, that user's profile document exists, so the donor update has something
    to update.
    """
    # Imported here rather than at module top: importing sefaria.model builds the library,
    # which needs Mongo. Keeping it out of module scope lets the pure decision above be
    # imported (and tested) with no database at all.
    from django.contrib.auth.models import User
    from sefaria.model.user_profile import UserProfile

    # The Django account is looked up here rather than with UserProfile(email=...): that
    # constructor calls User.objects.get, and its bare `except` turns an address shared by
    # two accounts into a placeholder profile, which would be logged as "no account".
    accounts = list(User.objects.filter(email__iexact=email_address.value))
    if not accounts:
        return None
    account = most_recently_active_account(accounts)
    if len(accounts) > 1:
        # The address itself is deliberately not logged.
        logger.info(
            "donor_email_matches_multiple_accounts",
            account_count=len(accounts),
            chosen_user_id=account.id,
        )

    # Built only for its side effect, which is why this function doesn't just return account.id
    # without it. A Django account can have no profile document: environments that share one
    # user database keep separate profiles, and a profile is created the first time the user is
    # seen in this one. The constructor does that creation (the `if self.exists() and not
    # user_registration:` block in UserProfile.__init__). Without it the donor update would
    # match no document and the donation would be lost.
    UserProfile(user_obj=account)
    return account.id


def apply_update_to_user_profile(user_id: int, update: list[dict]) -> bool:
    """Apply a Mongo update pipeline to the user's profile. True when a profile document was matched."""
    from sefaria.system.database import db

    # update_one with a pipeline, not profile.save(): save() never writes the donor fields of an
    # existing profile (DONOR_FIELDS_SAVE_WRITES_ONLY_ON_PROFILE_CREATION in
    # sefaria/model/user_profile.py), so this is the only way they change. Bypassing save() loses nothing: UserProfile is not an
    # AbstractMongoRecord (no notify() callbacks), and save()'s side effects don't apply to
    # these fields.
    result = db.profiles.update_one({"id": user_id}, update)
    return result.matched_count == 1
