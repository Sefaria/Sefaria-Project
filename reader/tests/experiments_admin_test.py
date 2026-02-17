import uuid

from django.contrib.auth.models import User
from django.test import TestCase

from reader.models import UserExperimentSettings, _set_user_experiments
from sefaria.system.database import db


class TestUserExperimentSettingsSync(TestCase):
    # pytest-django in this environment expects unittest classes to define this.
    databases = "__all__"
    multi_db = True

    def setUp(self):
        token = uuid.uuid4().hex
        self.user = User.objects.create_user(
            username=f"experiments-{token}",
            email=f"experiments-{token}@example.com",
            password="password",
        )
        db.profiles.delete_many({"id": self.user.id})

    def tearDown(self):
        db.profiles.delete_many({"id": self.user.id})

    def test_set_user_experiments_updates_profile_without_duplicates(self):
        self.assertEqual(db.profiles.count_documents({"id": self.user.id}), 0)
        self.assertEqual(UserExperimentSettings.objects.filter(user=self.user).count(), 0)

        _set_user_experiments(self.user, True)

        created_profile = db.profiles.find_one({"id": self.user.id})
        self.assertIsNotNone(created_profile)
        self.assertTrue(created_profile.get("experiments"))
        self.assertEqual(db.profiles.count_documents({"id": self.user.id}), 1)
        self.assertEqual(UserExperimentSettings.objects.filter(user=self.user).count(), 1)

        _set_user_experiments(self.user, False)

        updated_profile = db.profiles.find_one({"id": self.user.id})
        self.assertIsNotNone(updated_profile)
        self.assertFalse(updated_profile.get("experiments"))
        self.assertEqual(db.profiles.count_documents({"id": self.user.id}), 1)
        self.assertEqual(UserExperimentSettings.objects.filter(user=self.user).count(), 1)

    # Keep compatibility with older test node IDs.
    def test_user_experiment_settings_admin_updates_profile_without_duplicates(self):
        self.test_set_user_experiments_updates_profile_without_duplicates()


class UserExperimentSettingsSyncTests(TestUserExperimentSettingsSync):
    databases = "__all__"
    multi_db = True
