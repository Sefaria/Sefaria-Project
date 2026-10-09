import csv
import io
import uuid
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, RequestFactory
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage

from reader.admin import UserExperimentSettingsAdmin
from reader.conftest import create_test_user, purge_test_profiles
from reader.models import UserExperimentSettings, _set_user_experiments
from sefaria.system.database import db


@mock.patch("reader.models.dispatch_chatbot_opt_in_webhook")
class TestUserExperimentSettingsSync(TestCase):
    # pytest-django in this environment expects unittest classes to define this.
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("experiments")
        purge_test_profiles(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def test_set_user_experiments_updates_profile_without_duplicates(self, _mock_dispatch):
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

    def test_set_user_experiments_fires_webhook_on_change(self, mock_dispatch):
        mock_dispatch.reset_mock()
        _set_user_experiments(self.user, True)  # first call — created, fires
        self.assertEqual(mock_dispatch.call_count, 1)
        mock_dispatch.assert_called_with(self.user.email, True, "english")

        mock_dispatch.reset_mock()
        _set_user_experiments(self.user, True)  # same value — no fire
        mock_dispatch.assert_not_called()

        _set_user_experiments(self.user, False)  # changed — fires
        mock_dispatch.assert_called_once_with(self.user.email, False, "english")

    # Keep compatibility with older test node IDs.
    def test_user_experiment_settings_admin_updates_profile_without_duplicates(self, _mock_dispatch):
        self.test_set_user_experiments_updates_profile_without_duplicates()


class UserExperimentSettingsSyncTests(TestUserExperimentSettingsSync):
    databases = "__all__"


def _make_csv_bytes(emails):
    buf = io.StringIO()
    writer = csv.writer(buf)
    for email in emails:
        writer.writerow([email])
    return buf.getvalue().encode("utf-8")


def _build_post_request(admin_user, csv_bytes):
    factory = RequestFactory()
    uploaded = SimpleUploadedFile("emails.csv", csv_bytes, content_type="text/csv")
    request = factory.post("/fake-url/", {"csv_file": uploaded})
    request.user = admin_user
    # Django messages middleware isn't available in RequestFactory, so wire up
    # the fallback storage manually.
    setattr(request, "session", "session")
    setattr(request, "_messages", FallbackStorage(request))
    return request


@mock.patch("reader.models.dispatch_chatbot_opt_in_webhook")
class TestUploadCsvView(TestCase):
    databases = "__all__"

    def setUp(self):
        self.token = uuid.uuid4().hex
        self.admin_user = create_test_user("admin", superuser=True)
        # Create a few "existing" users whose emails will appear in the CSV.
        self.existing_users = [create_test_user(f"csvuser-{i}") for i in range(3)]
        purge_test_profiles(*self.existing_users)

        self.nonexistent_emails = [
            f"nobody-{self.token}@example.com",
            f"ghost-{self.token}@example.com",
        ]

        self.model_admin = UserExperimentSettingsAdmin(
            model=UserExperimentSettings, admin_site=AdminSite()
        )

    def tearDown(self):
        purge_test_profiles(*self.existing_users)
        for u in self.existing_users:
            UserExperimentSettings.objects.filter(user=u).delete()

    def _get_messages(self, request):
        return list(request._messages)

    def test_existing_users_get_experiments_enabled(self, _mock_dispatch):
        emails = [u.email for u in self.existing_users]
        request = _build_post_request(self.admin_user, _make_csv_bytes(emails))

        response = self.model_admin.upload_csv_view(request)

        self.assertEqual(response.status_code, 302)
        for u in self.existing_users:
            self.assertTrue(
                UserExperimentSettings.objects.filter(user=u, experiments=True).exists(),
                f"Experiments should be enabled for {u.email}",
            )

        msgs = self._get_messages(request)
        success_msgs = [m for m in msgs if m.level == 25]  # SUCCESS
        self.assertEqual(len(success_msgs), 1)
        self.assertIn(str(len(emails)), success_msgs[0].message)

    def test_nonexistent_emails_reported_as_warnings(self, _mock_dispatch):
        request = _build_post_request(
            self.admin_user, _make_csv_bytes(self.nonexistent_emails)
        )

        response = self.model_admin.upload_csv_view(request)

        self.assertEqual(response.status_code, 302)
        msgs = self._get_messages(request)
        warning_msgs = [m for m in msgs if m.level == 30]  # WARNING
        self.assertEqual(len(warning_msgs), 1)
        for email in self.nonexistent_emails:
            self.assertIn(email, warning_msgs[0].message)

        # No success message should be present.
        success_msgs = [m for m in msgs if m.level == 25]
        self.assertEqual(len(success_msgs), 0)

    def test_mixed_existing_and_nonexistent(self, _mock_dispatch):
        existing_emails = [u.email for u in self.existing_users]
        all_emails = existing_emails + self.nonexistent_emails
        request = _build_post_request(self.admin_user, _make_csv_bytes(all_emails))

        response = self.model_admin.upload_csv_view(request)

        self.assertEqual(response.status_code, 302)

        for u in self.existing_users:
            self.assertTrue(
                UserExperimentSettings.objects.filter(user=u, experiments=True).exists(),
            )

        msgs = self._get_messages(request)
        success_msgs = [m for m in msgs if m.level == 25]
        warning_msgs = [m for m in msgs if m.level == 30]
        self.assertEqual(len(success_msgs), 1)
        self.assertEqual(len(warning_msgs), 1)
        self.assertIn(str(len(existing_emails)), success_msgs[0].message)
        for email in self.nonexistent_emails:
            self.assertIn(email, warning_msgs[0].message)

    def test_blank_rows_and_whitespace_are_skipped(self, _mock_dispatch):
        email = self.existing_users[0].email
        csv_content = f"\n  {email}  \n\n  \n".encode("utf-8")
        uploaded = SimpleUploadedFile("emails.csv", csv_content, content_type="text/csv")
        factory = RequestFactory()
        request = factory.post("/fake-url/", {"csv_file": uploaded})
        request.user = self.admin_user
        setattr(request, "session", "session")
        setattr(request, "_messages", FallbackStorage(request))

        response = self.model_admin.upload_csv_view(request)

        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            UserExperimentSettings.objects.filter(
                user=self.existing_users[0], experiments=True
            ).exists(),
        )
        msgs = self._get_messages(request)
        warning_msgs = [m for m in msgs if m.level == 30]
        self.assertEqual(len(warning_msgs), 0)

    def test_csv_upload_fires_webhook_for_each_user(self, mock_dispatch):
        mock_dispatch.reset_mock()
        emails = [u.email for u in self.existing_users]
        request = _build_post_request(self.admin_user, _make_csv_bytes(emails))

        self.model_admin.upload_csv_view(request)

        self.assertEqual(mock_dispatch.call_count, len(emails))
        for u in self.existing_users:
            mock_dispatch.assert_any_call(u.email, True, "english")

    def test_case_insensitive_email_matching(self, _mock_dispatch):
        user = self.existing_users[0]
        upper_email = user.email.upper()
        request = _build_post_request(
            self.admin_user, _make_csv_bytes([upper_email])
        )

        response = self.model_admin.upload_csv_view(request)

        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            UserExperimentSettings.objects.filter(user=user, experiments=True).exists(),
        )

