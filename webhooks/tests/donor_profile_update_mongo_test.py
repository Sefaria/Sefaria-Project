"""
Integration tests: the donor profile update, applied by REAL MongoDB.

donor_recording_test.py checks which update pipeline is built; these tests check what Mongo
actually does with it. Only real Mongo can show the part that matters most: profiles store
became_donor_at: null until a first donation, and in BSON order null sorts below every date.
So the plain `$min` update operator would keep the null forever, while the pipeline's
aggregation `$min` skips it. mongomock was considered and rejected: it compares with Python's
`<`, so on a stored null the operator form raises TypeError instead of silently keeping the
null, and it could not catch that regression.

Every test runs in its own throwaway database (scratch_donor_recording_<random>), which is
dropped afterwards, so no real profile is ever read or written. Requires a running MongoDB
(the one configured in local_settings.py), like views_test.py.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from sefaria.donors import donor_recording
from sefaria.donors.donor_recording import apply_update_to_user_profile, donor_profile_update_after_event
from sefaria.system import database

# Imported above, at collection time, so this is the real function. webhooks/conftest.py replaces
# donor_recording.apply_update_to_user_profile with a refusing stub for every test; the fixture
# below puts this real one back, pointed at the scratch database.
REAL_APPLY_UPDATE_TO_USER_PROFILE = apply_update_to_user_profile

USER_ID = 7
EARLIER = datetime(2026, 1, 1, tzinfo=timezone.utc)
EVENT = datetime(2026, 9, 15, 16, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 12, 1, tzinfo=timezone.utc)


def as_stored(moment):
    # pymongo here is not tz_aware, so dates come back as naive datetimes in UTC.
    return moment.astimezone(timezone.utc).replace(tzinfo=None)


@pytest.fixture
def scratch_profiles(monkeypatch):
    """A profiles collection in a throwaway database, with the real write seam pointed at it."""
    scratch_database_name = f"scratch_donor_recording_{uuid.uuid4().hex}"
    # Never drop anything that could be a real database.
    assert scratch_database_name.startswith("scratch_") and scratch_database_name != database.SEFARIA_DB
    scratch_database = database.client[scratch_database_name]
    # apply_update_to_user_profile imports `db` from sefaria.system.database when called, so
    # replacing the module attribute redirects its writes to the scratch database.
    monkeypatch.setattr(database, "db", scratch_database)
    monkeypatch.setattr(donor_recording, "apply_update_to_user_profile", REAL_APPLY_UPDATE_TO_USER_PROFILE)
    yield scratch_database.profiles
    database.client.drop_database(scratch_database_name)


def record_donation(occurred_at):
    return donor_recording.apply_update_to_user_profile(USER_ID, donor_profile_update_after_event(occurred_at))


def stored_profile(profiles):
    return profiles.find_one({"id": USER_ID}, {"_id": 0})


class TestFirstDonation:

    def test_replaces_the_stored_null(self, scratch_profiles):
        """The case the pipeline exists for: to_mongo_dict stores null, and the plain $min operator would keep it."""
        scratch_profiles.insert_one({"id": USER_ID, "donor_status": "unknown", "became_donor_at": None})

        assert record_donation(EVENT) is True

        assert stored_profile(scratch_profiles) == {"id": USER_ID, "donor_status": "donor", "became_donor_at": as_stored(EVENT)}

    def test_fills_in_a_missing_field(self, scratch_profiles):
        """Profiles saved before the donor fields existed have neither field."""
        scratch_profiles.insert_one({"id": USER_ID})

        record_donation(EVENT)

        assert stored_profile(scratch_profiles) == {"id": USER_ID, "donor_status": "donor", "became_donor_at": as_stored(EVENT)}


class TestLaterDeliveries:

    def test_keeps_an_earlier_stored_date(self, scratch_profiles):
        """A follow-up event (Classy's transaction.updated, the Salesforce sync) must not move the date later."""
        scratch_profiles.insert_one({"id": USER_ID, "donor_status": "donor", "became_donor_at": EARLIER})

        record_donation(EVENT)

        assert stored_profile(scratch_profiles)["became_donor_at"] == as_stored(EARLIER)

    def test_replaces_a_later_stored_date(self, scratch_profiles):
        """Deliveries can arrive out of order; an earlier event that arrives second still wins."""
        scratch_profiles.insert_one({"id": USER_ID, "donor_status": "donor", "became_donor_at": LATER})

        record_donation(EVENT)

        assert stored_profile(scratch_profiles)["became_donor_at"] == as_stored(EVENT)

    @pytest.mark.parametrize("arrival_order", [(EVENT, LATER), (LATER, EVENT)], ids=["in order", "out of order"])
    def test_any_arrival_order_converges_on_the_earliest_date(self, scratch_profiles, arrival_order):
        """The order Svix or Streamscript happen to deliver in makes no difference to the result."""
        scratch_profiles.insert_one({"id": USER_ID, "donor_status": "unknown", "became_donor_at": None})

        for occurred_at in arrival_order:
            record_donation(occurred_at)

        assert stored_profile(scratch_profiles)["became_donor_at"] == as_stored(EVENT)

    def test_a_repeated_delivery_changes_nothing(self, scratch_profiles):
        """Retries and duplicates are expected, and there is no processed-events table, so the update must be idempotent."""
        scratch_profiles.insert_one({"id": USER_ID, "donor_status": "unknown", "became_donor_at": None})
        record_donation(EVENT)
        after_first_delivery = stored_profile(scratch_profiles)

        record_donation(EVENT)

        assert stored_profile(scratch_profiles) == after_first_delivery


class TestWhatTheUpdateTouches:

    def test_leaves_every_other_field_alone(self, scratch_profiles):
        """Why update_one and not profile.save(): a setting the user saves at the same moment must survive."""
        scratch_profiles.insert_one({"id": USER_ID, "donor_status": "unknown", "became_donor_at": None,
                                     "settings": {"email_notifications": "daily"}, "slug": "someone"})

        record_donation(EVENT)

        profile = stored_profile(scratch_profiles)
        assert profile["settings"] == {"email_notifications": "daily"}
        assert profile["slug"] == "someone"

    def test_a_non_utc_event_date_is_stored_as_the_same_instant_in_utc(self, scratch_profiles):
        """Salesforce sends offsets other than Z; the stored date must be the same moment, not the same wall-clock time."""
        scratch_profiles.insert_one({"id": USER_ID, "donor_status": "unknown", "became_donor_at": None})
        eastern = EVENT.astimezone(timezone(timedelta(hours=-4)))

        record_donation(eastern)

        assert stored_profile(scratch_profiles)["became_donor_at"] == as_stored(EVENT)

    def test_reports_a_missing_profile_document_without_creating_one(self, scratch_profiles):
        """False lets the caller log donor_profile_document_missing; inserting a partial profile would hide the problem."""
        assert record_donation(EVENT) is False

        assert scratch_profiles.count_documents({}) == 0
