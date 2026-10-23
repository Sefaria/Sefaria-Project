"""
JSON codec for domain events, because Celery arguments must be JSON.

The same codec would be the storage format if an inbox is ever added (see dispatcher.py for
what that is).
"""

from datetime import datetime
from enum import Enum
from typing import assert_never

from sefaria.donors.types import (
    DonationReceivedFromClassy,
    EventIndicatingPersonIsDonor,
    NormalizedEmailAddress,
    PersonAsIdentifiedByClassy,
    PersonAsIdentifiedBySalesforce,
    UserBecameDonorAccordingToSalesforce,
)


class SerializedEventType(Enum):
    # Wire strings: changing one breaks messages already sitting in the queue during a deploy.
    DONATION_RECEIVED_FROM_CLASSY = "DonationReceivedFromClassy"
    USER_BECAME_DONOR_ACCORDING_TO_SALESFORCE = "UserBecameDonorAccordingToSalesforce"


def serialize_event(event: EventIndicatingPersonIsDonor) -> dict:
    common = {
        "event_id_assigned_by_source": event.event_id_assigned_by_source,
        "occurred_at_according_to_source": event.occurred_at_according_to_source.isoformat(),
    }
    match event:
        case DonationReceivedFromClassy(person=person):
            return {
                "event_type": SerializedEventType.DONATION_RECEIVED_FROM_CLASSY.value,
                **common,
                "classy_transaction_id": event.classy_transaction_id,
                "person": {
                    "classy_supporter_id": person.classy_supporter_id,
                    "email_address": person.email_address.value if person.email_address else None,
                },
            }
        case UserBecameDonorAccordingToSalesforce(person=person):
            return {
                "event_type": SerializedEventType.USER_BECAME_DONOR_ACCORDING_TO_SALESFORCE.value,
                **common,
                "person": {
                    "email_address": person.email_address.value,
                    "salesforce_contact_id": person.salesforce_contact_id,
                    "classy_supporter_id": person.classy_supporter_id,
                },
            }
        case unreachable:
            assert_never(unreachable)


def deserialize_event(serialized: dict) -> EventIndicatingPersonIsDonor:
    # Raises ValueError on an unknown event_type, so a message the worker can't understand
    # fails loudly instead of disappearing.
    event_type = SerializedEventType(serialized.get("event_type"))
    event_id = serialized["event_id_assigned_by_source"]
    occurred_at = datetime.fromisoformat(serialized["occurred_at_according_to_source"])
    person = serialized["person"]
    match event_type:
        case SerializedEventType.DONATION_RECEIVED_FROM_CLASSY:
            email_address = person["email_address"]
            return DonationReceivedFromClassy(
                event_id_assigned_by_source=event_id,
                occurred_at_according_to_source=occurred_at,
                person=PersonAsIdentifiedByClassy(
                    classy_supporter_id=person["classy_supporter_id"],
                    email_address=NormalizedEmailAddress(email_address) if email_address else None,
                ),
                classy_transaction_id=serialized["classy_transaction_id"],
            )
        case SerializedEventType.USER_BECAME_DONOR_ACCORDING_TO_SALESFORCE:
            return UserBecameDonorAccordingToSalesforce(
                event_id_assigned_by_source=event_id,
                occurred_at_according_to_source=occurred_at,
                person=PersonAsIdentifiedBySalesforce(
                    email_address=NormalizedEmailAddress(person["email_address"]),
                    salesforce_contact_id=person["salesforce_contact_id"],
                    classy_supporter_id=person["classy_supporter_id"],
                ),
            )
        case unreachable:
            assert_never(unreachable)
