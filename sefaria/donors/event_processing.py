"""
The single entry point for "something told us this person donated".

The Celery task calls this. A future sustainer sync or bulk import can call it too, with no
webhook involved.
"""

from typing import assert_never

import structlog

from sefaria.donors.donor_recording import mark_existing_user_profile_as_donor
from sefaria.donors.email_resolution import resolve_donor_email_address_for_event
from sefaria.donors.types import (
    DonorEmailAddressCouldNotBeResolved,
    DonorWithResolvedEmailAddress,
    EventIndicatingPersonIsDonor,
    LookUpClassySupporterEmailAddress,
)

logger = structlog.get_logger(__name__)


def process_event_indicating_person_is_donor(
    event: EventIndicatingPersonIsDonor,
    look_up_classy_supporter_email_address: LookUpClassySupporterEmailAddress,
) -> None:
    match resolve_donor_email_address_for_event(event, look_up_classy_supporter_email_address):
        case DonorEmailAddressCouldNotBeResolved() as failure:
            logger.warning(
                "donor_email_address_unresolved",
                reason=failure.reason.value,
                event_id_assigned_by_source=event.event_id_assigned_by_source,
            )
        case DonorWithResolvedEmailAddress() as donor:
            mark_existing_user_profile_as_donor(donor, event)
        case unreachable:
            assert_never(unreachable)
