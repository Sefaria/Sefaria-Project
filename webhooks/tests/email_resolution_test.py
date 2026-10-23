"""
Unit tests for sefaria/donors/email_resolution.py.

The Classy lookup is a plain function argument, so these tests pass small fake functions —
no mocking library, no network.
"""

from datetime import datetime, timezone

import pytest

from sefaria.donors.email_resolution import resolve_donor_email_address_for_event
from sefaria.donors.types import (
    DonationReceivedFromClassy,
    DonorEmailAddressCouldNotBeResolved,
    DonorWithResolvedEmailAddress,
    NormalizedEmailAddress,
    PersonAsIdentifiedByClassy,
    PersonAsIdentifiedBySalesforce,
    ReasonDonorEmailAddressCouldNotBeResolved as Reason,
    UserBecameDonorAccordingToSalesforce,
)

OCCURRED_AT = datetime(2026, 10, 22, tzinfo=timezone.utc)
DONOR_ADDRESS = NormalizedEmailAddress("donor@example.org")


def classy_event(email_address=None, supporter_id=5827):
    return DonationReceivedFromClassy(
        event_id_assigned_by_source="msg_1",
        occurred_at_according_to_source=OCCURRED_AT,
        person=PersonAsIdentifiedByClassy(
            classy_supporter_id=supporter_id, email_address=email_address
        ),
        classy_transaction_id=99,
    )


def lookup_that_must_not_be_called(supporter_id):
    raise AssertionError(
        "the lookup must not be called when the address is already known"
    )


# ============================================================================
# Salesforce
# ============================================================================


class TestSalesforceResolution:

    def test_uses_the_email_address_in_the_event(self):
        """Our payload contract requires an email, so resolution is pure."""
        event = UserBecameDonorAccordingToSalesforce(
            event_id_assigned_by_source="003:UserBecameDonor:x",
            occurred_at_according_to_source=OCCURRED_AT,
            person=PersonAsIdentifiedBySalesforce(DONOR_ADDRESS, "003", None),
        )
        assert resolve_donor_email_address_for_event(
            event, lookup_that_must_not_be_called
        ) == DonorWithResolvedEmailAddress(DONOR_ADDRESS)


# ============================================================================
# Classy
# ============================================================================


class TestClassyResolution:

    def test_uses_member_email_address_when_the_payload_has_it(self):
        """No API call when Classy already sent the address."""
        result = resolve_donor_email_address_for_event(
            classy_event(email_address=DONOR_ADDRESS), lookup_that_must_not_be_called
        )
        assert result == DonorWithResolvedEmailAddress(DONOR_ADDRESS)

    def test_falls_back_to_the_supporter_lookup(self):
        """Without an address in the payload, the supporter id is looked up."""
        looked_up = []

        def lookup(supporter_id):
            looked_up.append(supporter_id)
            return DONOR_ADDRESS

        assert resolve_donor_email_address_for_event(
            classy_event(), lookup
        ) == DonorWithResolvedEmailAddress(DONOR_ADDRESS)
        assert looked_up == [5827]

    @pytest.mark.parametrize("reason", list(Reason))
    def test_passes_through_why_the_lookup_failed(self, reason):
        """No email, not found, and API unconfigured all reach the caller unchanged."""
        failure = DonorEmailAddressCouldNotBeResolved(reason)
        assert (
            resolve_donor_email_address_for_event(
                classy_event(), lambda supporter_id: failure
            )
            == failure
        )

    def test_transient_lookup_errors_propagate(self):
        """A timeout must raise so the Celery task can retry it."""

        def lookup(supporter_id):
            raise TimeoutError("classy timed out")

        with pytest.raises(TimeoutError):
            resolve_donor_email_address_for_event(classy_event(), lookup)
