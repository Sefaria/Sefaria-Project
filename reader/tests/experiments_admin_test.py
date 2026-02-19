import csv
import io
import uuid

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, RequestFactory
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage

from reader.admin import UserExperimentSettingsAdmin
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


class TestUploadCsvView(TestCase):
    databases = "__all__"
    multi_db = True

    def setUp(self):
        self.token = uuid.uuid4().hex
        self.admin_user = User.objects.create_superuser(
            username=f"admin-{self.token}",
            email=f"admin-{self.token}@example.com",
            password="password",
        )
        # Create a few "existing" users whose emails will appear in the CSV.
        self.existing_users = []
        for i in range(3):
            u = User.objects.create_user(
                username=f"csvuser-{i}-{self.token}",
                email=f"csvuser-{i}-{self.token}@example.com",
                password="password",
            )
            self.existing_users.append(u)
            db.profiles.delete_many({"id": u.id})

        self.nonexistent_emails = [
            f"nobody-{self.token}@example.com",
            f"ghost-{self.token}@example.com",
        ]

        self.model_admin = UserExperimentSettingsAdmin(
            model=UserExperimentSettings, admin_site=AdminSite()
        )

    def tearDown(self):
        for u in self.existing_users:
            db.profiles.delete_many({"id": u.id})
            UserExperimentSettings.objects.filter(user=u).delete()

    def _get_messages(self, request):
        return list(request._messages)

    def test_existing_users_get_experiments_enabled(self):
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

    def test_nonexistent_emails_reported_as_warnings(self):
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

    def test_mixed_existing_and_nonexistent(self):
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

    def test_blank_rows_and_whitespace_are_skipped(self):
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

    def test_case_insensitive_email_matching(self):
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

