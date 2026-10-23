"""
Domain types for donor status.

Every type here is a frozen dataclass or an Enum, and the event types form tagged unions,
so code branches on them with `match` and closes each branch with `assert_never`. The point
is that nonsense cannot be constructed: there is no way to hand the profile-writing code a
donor without an email address, because DonorWithResolvedEmailAddress requires one.

This module imports ONLY the standard library. sefaria/model/user_profile.py imports it,
and webhook adapters import it at request time, so it must never pull in sefaria.model
(importing that connects to Mongo and builds the library, and would also be a circular import).
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum


class DonorStatus(Enum):
    """The persisted donor status. The values are the strings stored in Mongo and sent to the frontend."""

    DONOR = "donor"
    # Reserved for handling refunds later: nothing writes it yet, because neither source
    # reports "not a donor". Defining it now means the set of stored values won't have to
    # change when that work arrives.
    NON_DONOR = "non_donor"
    UNKNOWN = "unknown"

    @classmethod
    def from_stored_value(cls, stored_value: object) -> "DonorStatus":
        # A profile saved before this field existed has no value, and anything unrecognized is
        # treated the same way: page rendering reads this, and a bad value must never break it.
        try:
            return cls(stored_value)
        except ValueError:
            return cls.UNKNOWN


@dataclass(frozen=True)
class NormalizedEmailAddress:
    """An email address stripped and lowercased, so both sources match the same profile.

    Constructing one directly is for values that are already normalized (tests,
    deserialization). `parse` is the way in for raw input.
    """

    value: str

    @classmethod
    def parse(cls, raw: object) -> "NormalizedEmailAddress | None":
        if not isinstance(raw, str):
            return None
        normalized = raw.strip().lower()
        # Only a shape check, deliberately loose ("a@b@c" passes): the address is a lookup
        # key, never something we send mail to, so a stricter parser would only reject donors.
        local_part, at_sign, domain = normalized.partition("@")
        if not (local_part and at_sign and domain) or any(
            character.isspace() for character in normalized
        ):
            return None
        return cls(normalized)


def as_utc_datetime(moment: datetime) -> datetime:
    # pymongo in this codebase is not tz_aware, so datetimes read back from Mongo are naive
    # (but UTC by construction). Comparing naive with aware datetimes raises TypeError, so every
    # comparison goes through here first.
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


@dataclass(frozen=True)
class PersonAsIdentifiedByClassy:
    classy_supporter_id: int  # always present on a transaction
    email_address: (
        NormalizedEmailAddress | None
    )  # member_email_address, when Classy sends it


@dataclass(frozen=True)
class PersonAsIdentifiedBySalesforce:
    email_address: NormalizedEmailAddress  # required by our payload contract
    salesforce_contact_id: str
    classy_supporter_id: int | None  # present when NPSP linked the records


@dataclass(frozen=True)
class DonationReceivedFromClassy:
    event_id_assigned_by_source: str  # svix-id: the same across retries of one message
    occurred_at_according_to_source: datetime  # the transaction's updated_at
    person: PersonAsIdentifiedByClassy
    classy_transaction_id: int


@dataclass(frozen=True)
class UserBecameDonorAccordingToSalesforce:
    event_id_assigned_by_source: str  # our sourceEventId
    occurred_at_according_to_source: datetime  # occurredAt
    person: PersonAsIdentifiedBySalesforce


type EventIndicatingPersonIsDonor = DonationReceivedFromClassy | UserBecameDonorAccordingToSalesforce


@dataclass(frozen=True)
class DonorWithResolvedEmailAddress:
    email_address: NormalizedEmailAddress  # non-optional: resolution guarantees it


class ReasonDonorEmailAddressCouldNotBeResolved(Enum):
    CLASSY_SUPPORTER_HAS_NO_EMAIL_ADDRESS = "classy_supporter_has_no_email_address"
    CLASSY_SUPPORTER_NOT_FOUND = "classy_supporter_not_found"
    CLASSY_API_NOT_CONFIGURED = "classy_api_not_configured"


@dataclass(frozen=True)
class DonorEmailAddressCouldNotBeResolved:
    reason: ReasonDonorEmailAddressCouldNotBeResolved


# Returns the supporter's address, or why it couldn't be found. It RAISES on transient failures
# (timeouts, 5xx), so the Celery task can retry them. The domain receives this as an argument,
# which keeps any knowledge of Classy's HTTP API out of sefaria/donors/.
type LookUpClassySupporterEmailAddress = Callable[
    [int], NormalizedEmailAddress | DonorEmailAddressCouldNotBeResolved
]
