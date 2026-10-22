"""
N-M11: the Powered by admin with its API key inline.

Tests whose name ends in known_gap_<id> assert the desired behaviour and fail today. They carry
the `failing` marker, so the default CI run (-m "not failing") leaves them out.
"""
from html.parser import HTMLParser

import pytest
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from powered_by.models import ApiKey, ApiProject, Project, SubmissionSource
from reader.conftest import create_test_user, purge_test_profiles


class FormFields(HTMLParser):
    """The values a browser would submit for the admin change form."""

    def __init__(self):
        super().__init__()
        self.data = {}
        self._select = None
        self._textarea = None
        self._in_form = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "form" and attrs.get("id", "").endswith("_form"):
            self._in_form = True
        if not self._in_form:
            return
        name = attrs.get("name")
        if tag == "input" and name and attrs.get("type") not in ("submit", "button", "file"):
            if attrs.get("type") in ("checkbox", "radio"):
                if "checked" in attrs:
                    self.data[name] = attrs.get("value", "on")
            else:
                self.data[name] = attrs.get("value", "")
        elif tag == "select" and name:
            self._select = name
            self.data.setdefault(name, "")
        elif tag == "option" and self._select and "selected" in attrs:
            self.data[self._select] = attrs.get("value", "")
        elif tag == "textarea" and name:
            self._textarea = name
            self.data[name] = ""

    def handle_endtag(self, tag):
        if tag == "select":
            self._select = None
        elif tag == "textarea":
            self._textarea = None
        elif tag == "form":
            self._in_form = False

    def handle_data(self, data):
        if self._textarea:
            self.data[self._textarea] += data


def form_data(html):
    parser = FormFields()
    parser.feed(html)
    data = parser.data
    for name in list(data):
        if name.startswith("api_keys-__prefix__"):
            del data[name]
    data.pop("csrfmiddlewaretoken", None)
    return data


def admin_url(view, *args, model="project"):
    return reverse("admin:powered_by_" + model + "_" + view, args=args, urlconf="sefaria.urls_library")


def row(model, pk):
    return model.objects.filter(pk=pk).values().get()


class ProjectAdminTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.staff = create_test_user("pbadmin", superuser=True)
        purge_test_profiles(self.staff)
        self.client.force_login(self.staff)
        self.listing = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK, submission_date=timezone.now().replace(microsecond=0),
            creator="Tova Levi", creator_email="tova@example.org", project_name="Tehillim Circle",
            project_link="https://tehillimcircle.org", project_desc="Psalms for a group.",
            sefaria_tools_used=["API"], tags=["Liturgy"], notes="Checked by staff.", consent_to_display=True,
            is_published=True,
        )
        self.api_project = ApiProject.objects.create(profile=self.listing)
        self.key = ApiKey.objects.create(project=self.api_project, label="Production",
                                         allowed_origins=["https://tehillimcircle.org"])

    def tearDown(self):
        purge_test_profiles(self.staff)

    def change_url(self, project=None):
        return admin_url("change", (project or self.listing).pk)

    def change_form(self):
        response = self.client.get(self.change_url())
        self.assertEqual(response.status_code, 200)
        return form_data(response.content.decode())

    def save(self, data):
        return self.client.post(self.change_url(), data)

    def api_change_url(self):
        return admin_url("change", self.api_project.pk, model="apiproject")

    def api_change_form(self):
        response = self.client.get(self.api_change_url())
        self.assertEqual(response.status_code, 200)
        return form_data(response.content.decode())

    def api_save(self, data):
        return self.client.post(self.api_change_url(), data)

    def test_N_M11_the_changelist_renders(self):
        response = self.client.get(admin_url("changelist"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Tehillim Circle")

    def test_N_M11_the_change_form_renders_with_the_key_inline(self):
        response = self.client.get(self.api_change_url())

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Production")
        self.assertIn("api_keys-0-label", form_data(response.content.decode()))

    def test_N_M11_saving_a_formstack_row_unchanged_round_trips(self):
        project_before, key_before = row(Project, self.listing.pk), row(ApiKey, self.key.pk)

        response = self.save(self.change_form())

        self.assertEqual(response.status_code, 302, response.content.decode()[:2000])
        project_after = row(Project, self.listing.pk)
        project_before.pop("updated_at"), project_after.pop("updated_at")
        self.assertEqual(project_after, project_before)
        self.assertEqual(row(ApiKey, self.key.pk), key_before)

    def test_N_M11_an_invalid_origin_is_rejected(self):
        data = self.api_change_form()
        data["api_keys-0-allowed_origins"] = '["https://tehillimcircle.org/with/a/path"]'

        response = self.api_save(data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ApiKey.objects.get(pk=self.key.pk).allowed_origins, ["https://tehillimcircle.org"])

    def test_N_M11_deleting_a_project_with_keys_is_refused_with_a_page(self):
        url = admin_url("delete", self.listing.pk)

        page = self.client.get(url)
        submitted = self.client.post(url, {"post": "yes"})

        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "protected")
        self.assertIn(submitted.status_code, (200, 302))
        self.assertTrue(Project.objects.filter(pk=self.listing.pk).exists())
        self.assertTrue(ApiKey.objects.filter(pk=self.key.pk).exists())

    def test_N_M11_clearing_revoked_at_does_not_bring_a_key_back_known_gap_N_M11(self):
        ApiKey.objects.filter(pk=self.key.pk).update(revoked_at=timezone.now())
        data = self.api_change_form()
        data["api_keys-0-revoked_at_0"] = ""
        data["api_keys-0-revoked_at_1"] = ""

        self.api_save(data)

        self.assertIsNotNone(ApiKey.objects.get(pk=self.key.pk).revoked_at)

    @pytest.mark.failing
    def test_N_M11_a_sixth_active_key_cannot_be_added_known_gap_N_M11(self):
        for n in range(4):
            ApiKey.objects.create(project=self.api_project, label="Key {}".format(n))
        data = self.api_change_form()
        total = int(data["api_keys-TOTAL_FORMS"])
        data["api_keys-TOTAL_FORMS"] = str(total + 1)
        data["api_keys-{}-label".format(total)] = "Sixth"
        data["api_keys-{}-allowed_origins".format(total)] = "[]"
        data["api_keys-{}-project".format(total)] = str(self.api_project.pk)

        self.api_save(data)

        self.assertEqual(ApiKey.objects.filter(project=self.api_project, revoked_at__isnull=True).count(), 5)
