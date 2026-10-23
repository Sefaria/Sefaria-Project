"""
Unit tests for sefaria/donors/event_processing.py — resolution followed by recording.
"""

from datetime import datetime, timezone

from structlog.testing import capture_logs

from sefaria.donors import event_processing
from sefaria.donors.event_processing import process_event_indicating_person_is_donor
from sefaria.donors.types import (
    DonationReceivedFromClassy,
    DonorEmailAddressCouldNotBeResolved,
    DonorWithResolvedEmailAddress,
    NormalizedEmailAddress,
    PersonAsIdentifiedByClassy,
    ReasonDonorEmailAddressCouldNotBeResolved as Reason,
)

EVENT = DonationReceivedFromClassy(
    event_id_assigned_by_source="msg_1",
    occurred_at_according_to_source=datetime(2026, 10, 22, tzinfo=timezone.utc),
    person=PersonAsIdentifiedByClassy(classy_supporter_id=5827, email_address=None),
    classy_transaction_id=99,
)


# ============================================================================
# process_event_indicating_person_is_donor
# ============================================================================


class TestProcessEventIndicatingPersonIsDonor:

    def test_marks_the_profile_when_the_address_resolves(self, monkeypatch):
        """A resolved donor is handed to the recording step together with its event."""
        recorded = []
        monkeypatch.setattr(
            event_processing,
            "mark_existing_user_profile_as_donor",
            lambda donor, event: recorded.append((donor, event)),
        )

        process_event_indicating_person_is_donor(
            EVENT, lambda supporter_id: NormalizedEmailAddress("donor@example.org")
        )

        assert recorded == [
            (
                DonorWithResolvedEmailAddress(
                    NormalizedEmailAddress("donor@example.org")
                ),
                EVENT,
            )
        ]

    def test_logs_and_stops_when_the_address_cannot_be_resolved(self, monkeypatch):
        """Unresolvable is a final answer: logged with its reason, nothing recorded, nothing raised."""
        recorded = []
        monkeypatch.setattr(
            event_processing,
            "mark_existing_user_profile_as_donor",
            lambda donor, event: recorded.append(donor),
        )

        with capture_logs() as logs:
            process_event_indicating_person_is_donor(
                EVENT,
                lambda supporter_id: DonorEmailAddressCouldNotBeResolved(
                    Reason.CLASSY_SUPPORTER_NOT_FOUND
                ),
            )

        assert recorded == []
        assert {
            "event": "donor_email_address_unresolved",
            "reason": "classy_supporter_not_found",
            "event_id_assigned_by_source": "msg_1",
            "log_level": "warning",
        } in logs
