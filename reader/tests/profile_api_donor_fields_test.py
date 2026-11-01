import json

from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db

# Fields that decide who counts as a donor for Strapi targeting. Only trusted server code
# writes them: the donor webhooks (donor_status, became_donor_at) and the CRM sync
# (is_sustainer). A forged value would let a user see donor-only content.
TRUSTED_DONOR_FIELDS = {
    "donor_status": "donor",
    "became_donor_at": "not-a-date",
    "is_sustainer": True,
}


class ProfileApiIgnoresDonorFieldsTest(TestCase):
    """
    /api/profile is public to any logged-in user and copies every posted key onto the profile
    (UserProfile.update), so profile_api must drop the donor fields before that happens.

    For donor_status and became_donor_at there is a second guard: UserProfile.save() never
    writes them to an existing profile (DONOR_FIELDS_SAVE_WRITES_ONLY_ON_PROFILE_CREATION), so
    those cases pass even without profile_api's strip. They are kept because the rule tested
    is "a POST cannot change donor status", whichever layer enforces it. is_sustainer has only
    the strip.
    """

    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("donor-fields")
        purge_test_profiles(self.user)
        # Creates the stored profile, with its default values.
        UserProfile(id=self.user.id)

    def tearDown(self):
        purge_test_profiles(self.user)

    def stored_profile(self):
        return db.profiles.find_one({"id": self.user.id}) or {}

    def post_profile(self, payload):
        self.client.force_login(self.user)
        return self.client.post("/api/profile", {"json": json.dumps(payload)})

    def test_a_posted_donor_field_is_not_stored(self):
        for field, forged_value in TRUSTED_DONOR_FIELDS.items():
            with self.subTest(field=field):
                # The interface language rides along so the test cannot pass just because the
                # POST was rejected outright: it must be saved while the donor field is not.
                # Reset it each time, or after the first field it would already read "hebrew".
                db.profiles.update_one(
                    {"id": self.user.id},
                    {"$set": {"settings.interface_language": "english"}},
                )
                stored_before = self.stored_profile().get(field, "<absent>")

                self.post_profile(
                    {field: forged_value, "settings": {"interface_language": "hebrew"}}
                )

                stored_after = self.stored_profile()
                self.assertEqual(
                    stored_after.get("settings", {}).get("interface_language"), "hebrew"
                )
                self.assertEqual(stored_after.get(field, "<absent>"), stored_before)
