"""
Turning an event into a donor with a guaranteed email address ("parse, don't validate").

After this step nothing checks `email is None` again: DonorWithResolvedEmailAddress cannot
exist without one.
"""

from typing import assert_never

from sefaria.donors.types import (
    DonationReceivedFromClassy,
    DonorEmailAddressCouldNotBeResolved,
    DonorWithResolvedEmailAddress,
    EventIndicatingPersonIsDonor,
    LookUpClassySupporterEmailAddress,
    NormalizedEmailAddress,
    PersonAsIdentifiedByClassy,
    UserBecameDonorAccordingToSalesforce,
)


def resolve_donor_email_address_for_event(
    event: EventIndicatingPersonIsDonor,
    look_up_classy_supporter_email_address: LookUpClassySupporterEmailAddress,
) -> DonorWithResolvedEmailAddress | DonorEmailAddressCouldNotBeResolved:
    match event:
        case UserBecameDonorAccordingToSalesforce(person=person):
            return DonorWithResolvedEmailAddress(person.email_address)
        case DonationReceivedFromClassy(
            person=PersonAsIdentifiedByClassy(email_address=NormalizedEmailAddress() as email_address)
        ):
            return DonorWithResolvedEmailAddress(email_address)
        case DonationReceivedFromClassy(
            person=PersonAsIdentifiedByClassy(email_address=None, classy_supporter_id=supporter_id)
        ):
            # The API call happens here, inside the Celery task, never in the endpoint: the
            # endpoint must answer GoFundMe Pro within 15 seconds, and a task can retry.
            return _resolve_through_classy_lookup(look_up_classy_supporter_email_address(supporter_id))
        case unreachable:
            assert_never(unreachable)


def _resolve_through_classy_lookup(
    lookup_result: NormalizedEmailAddress | DonorEmailAddressCouldNotBeResolved,
) -> DonorWithResolvedEmailAddress | DonorEmailAddressCouldNotBeResolved:
    match lookup_result:
        case NormalizedEmailAddress() as email_address:
            return DonorWithResolvedEmailAddress(email_address)
        case DonorEmailAddressCouldNotBeResolved() as failure:
            return failure
        case unreachable:
            assert_never(unreachable)
