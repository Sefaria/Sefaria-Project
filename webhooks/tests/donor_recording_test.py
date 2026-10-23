"""
Unit tests for sefaria/donors/donor_recording.py.

The decision (build_update_pipeline_marking_profile_as_donor) is pure and tested directly.
The shell (mark_existing_user_profile_as_donor) is tested with the fake_profile_store fixture
patched over its two seams, so no Mongo or Postgres is involved — the autouse guard in
webhooks/conftest.py makes any unpatched seam fail loudly.
"""

from dataclasses import dataclass, field
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone

import pytest
from structlog.testing import capture_logs

from sefaria.donors import donor_recording
from sefaria.donors.donor_recording import (
    build_update_pipeline_marking_profile_as_donor,
    mark_existing_user_profile_as_donor,
    most_recently_active_account,
)
from sefaria.donors.types import (
    DonorWithResolvedEmailAddress,
    NormalizedEmailAddress,
    PersonAsIdentifiedBySalesforce,
    UserBecameDonorAccordingToSalesforce,
)

MIDDLE = datetime(2026, 6, 1, tzinfo=timezone.utc)
DONOR_ADDRESS = NormalizedEmailAddress("donor@example.org")


def salesforce_event(occurred_at=MIDDLE):
    return UserBecameDonorAccordingToSalesforce(
        event_id_assigned_by_source="003:UserBecameDonor:2026-10-22T14:03:11.000Z",
        occurred_at_according_to_source=occurred_at,
        person=PersonAsIdentifiedBySalesforce(
            email_address=DONOR_ADDRESS,
            salesforce_contact_id="003",
            classy_supporter_id=None,
        ),
    )


# ============================================================================
# build_update_pipeline_marking_profile_as_donor — the pure decision
# ============================================================================


class TestBuildUpdatePipelineMarkingProfileAsDonor:

    def test_sets_donor_status_and_keeps_the_earliest_date_with_aggregation_min(self):
        """One $set stage makes the user a donor and lets Mongo keep the earliest date atomically."""
        assert build_update_pipeline_marking_profile_as_donor(MIDDLE) == [
            {
                "$set": {
                    "donor_status": "donor",
                    "became_donor_at": {"$min": ["$became_donor_at", MIDDLE]},
                }
            }
        ]

    def test_is_a_pipeline_because_the_operator_form_keeps_a_stored_null(self):
        """
        The update PIPELINE form is required: profiles store became_donor_at: null until someone
        donates, and the $min update operator compares in BSON order (null below every date), so it
        would keep that null forever. The aggregation $min over "$became_donor_at" skips null and
        missing values.
        """
        update = build_update_pipeline_marking_profile_as_donor(MIDDLE)
        assert isinstance(update, list)
        assert update[0]["$set"]["became_donor_at"]["$min"][0] == "$became_donor_at"
        assert not any("$min" in stage for stage in update)

    def test_naive_event_date_is_read_as_utc(self):
        """Mongo compares dates by instant, so a naive date is made UTC-aware before it is sent."""
        decided_date = build_update_pipeline_marking_profile_as_donor(
            datetime(2026, 6, 1)
        )[0]["$set"]["became_donor_at"]["$min"][1]
        assert decided_date == MIDDLE
        assert decided_date.tzinfo is timezone.utc

    def test_aware_non_utc_event_date_is_converted_to_utc(self):
        """An offset timestamp keeps its instant; only the zone changes."""
        eastern = datetime(2026, 5, 31, 20, 0, tzinfo=timezone(timedelta(hours=-4)))
        decided_date = build_update_pipeline_marking_profile_as_donor(eastern)[0][
            "$set"
        ]["became_donor_at"]["$min"][1]
        assert decided_date == datetime(2026, 6, 1, tzinfo=timezone.utc)
        assert decided_date.tzinfo is timezone.utc


# ============================================================================
# mark_existing_user_profile_as_donor — the imperative shell
# ============================================================================


@dataclass
class FakeProfileStore:
    """Stands in for both seams: records every lookup and update, and returns what the test chose."""

    user_id_to_find: int | None = None
    update_matches_a_document: bool = True
    looked_up_addresses: list = field(default_factory=list)
    updates: list = field(default_factory=list)


@pytest.fixture
def fake_profile_store(monkeypatch):
    store = FakeProfileStore(user_id_to_find=7)

    def find_user_id_by_email_creating_profile_if_missing(email_address):
        store.looked_up_addresses.append(email_address)
        return store.user_id_to_find

    def apply_update_to_user_profile(user_id, update):
        store.updates.append((user_id, update))
        return store.update_matches_a_document

    monkeypatch.setattr(
        donor_recording,
        "find_user_id_by_email_creating_profile_if_missing",
        find_user_id_by_email_creating_profile_if_missing,
    )
    monkeypatch.setattr(
        donor_recording, "apply_update_to_user_profile", apply_update_to_user_profile
    )
    return store


class TestMarkExistingUserProfileAsDonor:

    def test_sends_the_decided_update_for_the_found_profile(self, fake_profile_store):
        """The seam receives exactly (user id, the pure update pipeline)."""
        mark_existing_user_profile_as_donor(
            DonorWithResolvedEmailAddress(DONOR_ADDRESS), salesforce_event(MIDDLE)
        )

        assert fake_profile_store.updates == [
            (7, build_update_pipeline_marking_profile_as_donor(MIDDLE))
        ]

    def test_does_nothing_when_no_account_exists(self, fake_profile_store):
        """A donor with no Sefaria account is only logged; remembering them until they sign up isn't built yet."""
        fake_profile_store.user_id_to_find = None

        with capture_logs() as logs:
            mark_existing_user_profile_as_donor(
                DonorWithResolvedEmailAddress(DONOR_ADDRESS), salesforce_event()
            )

        assert fake_profile_store.updates == []
        assert "donor@example.org" not in repr(logs)

    def test_looks_up_the_profile_by_the_resolved_email_address(
        self, fake_profile_store
    ):
        """The seam receives the normalized address, not a raw string."""
        mark_existing_user_profile_as_donor(
            DonorWithResolvedEmailAddress(DONOR_ADDRESS), salesforce_event()
        )

        assert fake_profile_store.looked_up_addresses == [DONOR_ADDRESS]

    def test_warns_when_the_profile_document_is_missing(self, fake_profile_store):
        """A matched-nothing update would otherwise drop the donation silently; log it, without the address."""
        fake_profile_store.update_matches_a_document = False

        with capture_logs() as logs:
            mark_existing_user_profile_as_donor(
                DonorWithResolvedEmailAddress(DONOR_ADDRESS), salesforce_event()
            )

        assert any(
            entry.items()
            >= {
                "event": "donor_profile_document_missing",
                "log_level": "warning",
                "user_id": 7,
                "event_id_assigned_by_source": "003:UserBecameDonor:2026-10-22T14:03:11.000Z",
            }.items()
            for entry in logs
        )
        assert "user_profile_marked_as_donor" not in repr(logs)
        assert "donor@example.org" not in repr(logs)


def account(user_id, last_login=None, date_joined=MIDDLE):
    """A stand-in for a Django User: only the fields most_recently_active_account reads."""
    return SimpleNamespace(id=user_id, last_login=last_login, date_joined=date_joined)


class TestMostRecentlyActiveAccount:

    def test_a_single_account_is_chosen(self):
        """The common case: one account per address, so there is nothing to choose between."""
        assert most_recently_active_account([account(1)]).id == 1

    def test_the_latest_login_wins(self):
        """The account the person actually uses is the one they logged into last."""
        accounts = [
            account(1, last_login=MIDDLE),
            account(2, last_login=MIDDLE + timedelta(days=1)),
        ]

        assert most_recently_active_account(accounts).id == 2

    def test_any_logged_in_account_beats_a_never_logged_in_one(self):
        """A never-used leftover loses even when it joined later — the local duplicate that prompted this."""
        never_logged_in_but_newer = account(14, date_joined=MIDDLE + timedelta(days=30))
        logged_in = account(15, last_login=MIDDLE, date_joined=MIDDLE)

        assert (
            most_recently_active_account([never_logged_in_but_newer, logged_in]).id
            == 15
        )

    def test_among_never_logged_in_accounts_the_newest_wins(self):
        """With no login to go on, the most recently created account is the best guess."""
        accounts = [
            account(1, date_joined=MIDDLE),
            account(2, date_joined=MIDDLE + timedelta(days=1)),
        ]

        assert most_recently_active_account(accounts).id == 2
