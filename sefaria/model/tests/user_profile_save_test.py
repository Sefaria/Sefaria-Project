"""
UserProfile.save() against REAL MongoDB: what it writes, and what it leaves alone.

save() updates an existing profile with $set of its fields, except the donor fields, which it
writes only when it creates the document (FIELDS_ONLY_DONOR_RECORDING_WRITES). These tests pin
both halves: the donor webhook's update survives a save from a request that loaded the profile
earlier, and every other field is still written exactly as before.

Each test uses a user id far above any real one and deletes its profile document afterwards, so
no real profile is read or written. There is no Django user with that id, which UserProfile
handles by falling back to placeholder names.
"""

import random
from datetime import datetime

import pytest

from sefaria.model.user_profile import FIELDS_ONLY_DONOR_RECORDING_WRITES, UserProfile
from sefaria.system.database import db

DONATED_AT = datetime(2026, 9, 15, 16, 0)   # naive UTC, as pymongo returns it


@pytest.fixture
def unused_user_id():
    user_id = random.randrange(10 ** 12, 2 * 10 ** 12)
    assert db.profiles.find_one({"id": user_id}) is None
    yield user_id
    db.profiles.delete_many({"id": user_id})


def stored_profile(user_id):
    # Asserted here so a missing document fails as "no profile stored", not as a TypeError on
    # the first subscript in the test.
    stored = db.profiles.find_one({"id": user_id}, {"_id": 0})
    assert stored is not None, f"no profile document for user {user_id}"
    return stored


def create_stored_profile(user_id, **fields):
    db.profiles.insert_one({"id": user_id, "slug": f"save-test-{user_id}", "bio": "",
                            "donor_status": "unknown", "became_donor_at": None, **fields})


def mark_donor_the_way_the_webhook_does(user_id):
    db.profiles.update_one({"id": user_id}, {"$set": {"donor_status": "donor", "became_donor_at": DONATED_AT}})


class TestDonorFieldsSurviveSave:

    def test_a_donation_recorded_after_loading_survives_the_save(self, unused_user_id):
        """The race this design exists for: a request loads the profile, the webhook marks a donor, the request saves."""
        create_stored_profile(unused_user_id)
        profile = UserProfile(id=unused_user_id)
        mark_donor_the_way_the_webhook_does(unused_user_id)

        profile.bio = "Edited while the donation was being recorded"
        profile.save()

        stored = stored_profile(unused_user_id)
        assert (stored["donor_status"], stored["became_donor_at"]) == ("donor", DONATED_AT)
        assert stored["bio"] == "Edited while the donation was being recorded"

    def test_changing_the_donor_attributes_on_the_object_does_not_write_them(self, unused_user_id):
        """Only the webhook path changes donor status; code that sets the attribute and saves changes nothing."""
        create_stored_profile(unused_user_id)
        profile = UserProfile(id=unused_user_id)

        profile.donor_status = "donor"
        profile.save()

        assert stored_profile(unused_user_id)["donor_status"] == "unknown"


class TestEverythingElseIsStillWritten:

    def test_every_other_field_is_stored_as_to_mongo_dict_gives_it(self, unused_user_id):
        """The switch from replace_one to $set must not change what the other fields store."""
        create_stored_profile(unused_user_id)
        profile = UserProfile(id=unused_user_id)
        profile.bio = "New bio"
        profile.position = "Teacher"
        profile.settings = {**profile.settings, "email_notifications": "weekly"}
        profile.pinned_sheets = [1, 2]

        profile.save()

        expected = {name: value for name, value in profile.to_mongo_dict().items()
                    if name not in FIELDS_ONLY_DONOR_RECORDING_WRITES}
        stored = stored_profile(unused_user_id)
        assert {name: stored[name] for name in expected} == expected

    def test_a_field_another_writer_set_is_kept(self, unused_user_id):
        """The spam dashboard sets "reviewed" with $set; a replace used to delete it on the user's next save."""
        create_stored_profile(unused_user_id)
        profile = UserProfile(id=unused_user_id)
        db.profiles.update_one({"id": unused_user_id}, {"$set": {"reviewed": True}})

        profile.save()

        assert stored_profile(unused_user_id)["reviewed"] is True


class TestCreatingTheDocument:

    def test_a_new_profile_starts_as_unknown(self, unused_user_id):
        """Creation is the one save that writes the donor fields: nobody can have donated yet."""
        profile = UserProfile(id=unused_user_id)
        assert profile._id is None

        profile.save()

        stored = stored_profile(unused_user_id)
        assert (stored["donor_status"], stored["became_donor_at"]) == ("unknown", None)

    def test_a_document_deleted_since_loading_is_recreated_with_its_donor_fields(self, unused_user_id):
        """$setOnInsert: when the update has to recreate the document, the donor fields are written too."""
        create_stored_profile(unused_user_id)
        profile = UserProfile(id=unused_user_id)
        db.profiles.delete_many({"id": unused_user_id})

        profile.save()

        stored = stored_profile(unused_user_id)
        assert (stored["donor_status"], stored["became_donor_at"]) == ("unknown", None)
