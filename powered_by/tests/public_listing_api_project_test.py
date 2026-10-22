"""
The public Powered by listing against API projects, and the API project admin: a key's revoked_at
cannot be cleared, and only the change_tier permission moves a project to another tier.
"""
from django.contrib.auth.models import Permission, User
from django.test import TestCase
from django.utils import timezone

from powered_by.models import ApiKey, ApiProject, Project, SubmissionSource
from powered_by.tests.admin_test import admin_url, form_data


def make_profile(name, source=SubmissionSource.FORMSTACK, **overrides):
    fields = dict(
        submission_source=source, project_name=name, project_link="https://example.org",
        is_published=True, consent_to_display=True,
    )
    fields.update(overrides)
    return Project.objects.create(**fields)


class PublicListingApiProjectTest(TestCase):
    databases = "__all__"

    def listed_names(self):
        response = self.client.get("/api/powered-by")
        self.assertEqual(response.status_code, 200)
        return {project["project_name"] for project in response.json()["projects"]}

    def test_internal_project_never_listed(self):
        staff_made = make_profile("Internal Tool", SubmissionSource.MANUAL)
        ApiProject.objects.create(profile=staff_made, tier_id="internal")

        self.assertNotIn("Internal Tool", self.listed_names())

        self.client.force_login(User.objects.create_user(username="listingstaff", password="pw", is_staff=True))
        self.assertIn("Internal Tool", self.listed_names())

    def test_private_profile_with_live_project_is_not_listed(self):
        profile = make_profile("Private Tool", SubmissionSource.DEVELOPER_SETTINGS, consent_to_display=False)
        ApiProject.objects.create(profile=profile)

        self.assertNotIn("Private Tool", self.listed_names())

    def test_settings_created_profile_without_live_project_is_hidden(self):
        make_profile("Unclaimed Tool", SubmissionSource.DEVELOPER_SETTINGS)

        self.assertNotIn("Unclaimed Tool", self.listed_names())

    def test_settings_created_public_profile_with_live_project_is_listed(self):
        profile = make_profile("Owned Tool", SubmissionSource.DEVELOPER_SETTINGS)
        ApiProject.objects.create(profile=profile)

        self.assertIn("Owned Tool", self.listed_names())

    def test_legacy_profile_listed_with_or_without_project(self):
        make_profile("Legacy Plain")
        ApiProject.objects.create(profile=make_profile("Legacy Claimed"))
        ApiProject.objects.create(profile=make_profile("Legacy Internal"), tier_id="internal")

        names = self.listed_names()

        self.assertIn("Legacy Plain", names)
        self.assertIn("Legacy Claimed", names)
        self.assertNotIn("Legacy Internal", names)


class AdminApiProjectTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.profile = make_profile("Admin Tool")
        self.api_project = ApiProject.objects.create(profile=self.profile)
        self.key = ApiKey.objects.create(project=self.api_project, label="Production")

    def staff(self, username, *codenames):
        user = User.objects.create_user(username=username, password="pw", is_staff=True)
        for codename in ("change_apiproject", "change_apikey", *codenames):
            user.user_permissions.add(Permission.objects.get(codename=codename, content_type__app_label="powered_by"))
        return user

    def change_url(self):
        return admin_url("change", self.api_project.pk, model="apiproject")

    def change_form(self):
        response = self.client.get(self.change_url())
        self.assertEqual(response.status_code, 200)
        return form_data(response.content.decode())

    def test_admin_tier_editable_only_with_change_tier(self):
        self.client.force_login(self.staff("tiernoperm"))
        data = self.change_form()
        self.assertNotIn("tier", data)
        data["tier"] = "partner"

        response = self.client.post(self.change_url(), data)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(ApiProject.objects.get(pk=self.api_project.pk).tier_id, "developer")

        self.client.force_login(self.staff("tierperm", "change_tier"))
        data = self.change_form()
        data["tier"] = "partner"

        response = self.client.post(self.change_url(), data)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(ApiProject.objects.get(pk=self.api_project.pk).tier_id, "partner")

    def test_admin_cannot_unrevoke_a_key(self):
        self.client.force_login(self.staff("unrevoke"))
        ApiKey.objects.filter(pk=self.key.pk).update(revoked_at=timezone.now())
        data = self.change_form()
        data["api_keys-0-revoked_at_0"] = ""
        data["api_keys-0-revoked_at_1"] = ""

        response = self.client.post(self.change_url(), data)

        self.assertEqual(response.status_code, 302)
        self.assertIsNotNone(ApiKey.objects.get(pk=self.key.pk).revoked_at)
