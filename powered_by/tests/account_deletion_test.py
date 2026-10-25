"""
N-M5: deleting an account (sefaria.utils.user.delete_user_account) with and without developer
projects, and when the powered_by deletion hook fails.

The whole class is `deep`: delete_user_account updates every sheet that lists the user in
`likes`, a scan of the full sheets collection that can outlast pymongo's socket timeout on a
loaded Mongo.
"""
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from powered_by.models import ApiKey, ApiProject, Project, SubmissionSource
from reader.conftest import create_test_user, purge_test_profiles
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.utils.user import delete_user_account


@pytest.mark.deep
@patch("sefaria.utils.user.CrmMediator", MagicMock())
class DeleteAccountTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("pbdelete")
        self.uid = self.user.id
        purge_test_profiles(self.uid)
        profile = UserProfile(id=self.uid)
        profile.settings["developer_enabled"] = True
        profile.save()
        assert db.profiles.find_one({"id": self.uid})

    def tearDown(self):
        purge_test_profiles(self.uid)

    def developer_project(self):
        profile = Project.objects.create(
            submission_source=SubmissionSource.DEVELOPER_SETTINGS, submission_date=timezone.now(),
            project_name="Daf Portal", project_link="https://dafportal.example.org",
            consent_to_display=True, is_published=True,
        )
        project = ApiProject.objects.create(profile=profile, owner=self.user)
        keys = [ApiKey.objects.create(project=project, label=label) for label in ("Production", "Staging")]
        return project, keys

    def claimed_listing(self):
        listing = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK, creator_email=self.user.email,
            project_name="Tehillim Circle", project_link="https://tehillimcircle.example.org",
            consent_to_display=True, is_published=True,
        )
        project = ApiProject.objects.create(profile=listing, owner=self.user)
        return listing, ApiKey.objects.create(project=project, label="Claimed")

    def assert_account_gone(self):
        self.assertFalse(User.objects.filter(id=self.uid).exists())
        self.assertIsNone(db.profiles.find_one({"id": self.uid}))

    @override_settings(DEVELOPER_SETTINGS_ENABLED=False)
    def test_N_M5_an_account_with_no_projects_is_deleted_with_the_flag_off(self):
        self.assertTrue(delete_user_account(self.uid, confirm=False))

        self.assert_account_gone()

    def test_N_M5_an_owners_keys_are_revoked_and_projects_soft_deleted(self):
        project, keys = self.developer_project()

        self.assertTrue(delete_user_account(self.uid, confirm=False))

        self.assert_account_gone()
        project.refresh_from_db()
        self.assertIsNotNone(project.deleted_at)
        self.assertIsNone(project.owner_id)
        profile = Project.objects.get(id=project.profile_id)
        self.assertFalse(profile.is_published)
        self.assertFalse(profile.consent_to_display)
        self.assertTrue(all(k.revoked_at for k in ApiKey.objects.filter(id__in=[k.id for k in keys])))

    def test_N_M5_a_claimed_listing_is_released_and_its_keys_revoked(self):
        listing, key = self.claimed_listing()

        self.assertTrue(delete_user_account(self.uid, confirm=False))

        self.assert_account_gone()
        project = ApiProject.objects.get(profile_id=listing.id)
        self.assertIsNone(project.owner_id)
        self.assertIsNotNone(project.deleted_at)
        listing.refresh_from_db()
        self.assertIsNone(listing.deleted_at)
        self.assertTrue(listing.consent_to_display and listing.is_published)
        self.assertIsNotNone(ApiKey.objects.get(id=key.id).revoked_at)

    def test_N_M5_a_failing_deletion_hook_leaves_no_half_deleted_account(self):
        self.developer_project()

        with patch("powered_by.developer.release_account_projects", side_effect=RuntimeError("hook failed")):
            try:
                with transaction.atomic():
                    delete_user_account(self.uid, confirm=False)
            except RuntimeError:
                pass

        user_exists = User.objects.filter(id=self.uid).exists()
        profile_exists = db.profiles.find_one({"id": self.uid}) is not None
        self.assertEqual((user_exists, profile_exists), (True, True) if user_exists else (False, False))
