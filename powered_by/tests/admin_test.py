"""
N-M11: the Powered by admin with its API key inline.

Tests whose name ends in known_gap_<id> assert the desired behaviour and fail today. They carry
the `failing` marker, so the default CI run (-m "not failing") leaves them out.
"""

from datetime import timedelta
from html.parser import HTMLParser

import pytest
from django.contrib import admin
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
            submission_source=SubmissionSource.FORMSTACK,
            submission_date=timezone.now().replace(microsecond=0),
            creator="Tova Levi",
            creator_email="tova@example.org",
            project_name="Tehillim Circle",
            project_link="https://tehillimcircle.org",
            project_desc="Psalms for a group.",
            sefaria_tools_used=["API"],
            tags=["Liturgy"],
            notes="Checked by staff.",
            request_not_to_publish=False,
            is_published=True,
        )
        self.api_project = ApiProject.objects.create(profile=self.listing)
        self.key = ApiKey.objects.create(
            project=self.api_project, label="Production", allowed_origins=["https://tehillimcircle.org"]
        )

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

    def test_admin_project_page_masks_keys(self):
        ApiKey.objects.create(project=self.api_project, label="Masked", key="sfr_abcdef1234567890")
        change = self.client.get(self.api_change_url()).content.decode()
        delete_response = self.client.get(admin_url("delete", self.api_project.pk, model="apiproject"))
        delete = delete_response.content.decode()

        self.assertIn("sfr_abcdef\u2026", change)
        self.assertNotIn("sfr_abcdef1234567890", change)
        # Keys are on_delete=PROTECT, so the delete page must render and list the keys by label, never by value.
        self.assertEqual(delete_response.status_code, 200)
        self.assertContains(delete_response, "Masked")
        self.assertNotIn("sfr_abcdef1234567890", delete)

    def test_masked_key_of_an_unsaved_key_is_a_dash(self):
        from powered_by.admin import ApiKeyInline

        inline = ApiKeyInline(ApiProject, admin.site)

        self.assertEqual(inline.masked_key(ApiKey(project=self.api_project)), "-")
        self.assertEqual(inline.masked_key(None), "-")
        self.assertEqual(inline.masked_key(self.key), self.key.key[:10] + "\u2026")

    def test_api_project_changelist_search_by_key_prefix_never_shows_the_key(self):
        other_profile = Project.objects.create(
            submission_source=SubmissionSource.DEVELOPER_SETTINGS,
            project_name="Other project",
            request_not_to_publish=False,
            is_published=True,
        )
        other = ApiProject.objects.create(profile=other_profile)
        ApiKey.objects.create(project=other, label="Other")

        response = self.client.get(admin_url("changelist", model="apiproject"), {"q": self.key.key[:10]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([p.pk for p in response.context["cl"].result_list], [self.api_project.pk])
        self.assertNotIn(self.key.key, response.content.decode())

    def test_api_project_search_with_a_full_key_never_echoes_the_hidden_part(self):
        # Staff paste a whole key from a support request. The changelist would render the query back into the search
        # box and its links, so the request is redirected to the shown prefix before anything renders.
        url = admin_url("changelist", model="apiproject")
        hidden = self.key.key[10:]

        response = self.client.get(url, {"q": self.key.key, "o": "1"})

        self.assertEqual(response.status_code, 302)
        self.assertNotIn(hidden, response["Location"])
        self.assertIn("q=" + self.key.key[:10], response["Location"])
        self.assertIn("o=1", response["Location"])

        followed = self.client.get(url, {"q": self.key.key}, follow=True)

        self.assertEqual(followed.status_code, 200)
        self.assertEqual([p.pk for p in followed.context["cl"].result_list], [self.api_project.pk])
        self.assertNotIn(hidden, followed.content.decode())

    def test_api_project_search_with_a_repeated_query_never_echoes_the_hidden_part(self):
        # Django searches the last q but keeps every q in the changelist's links, so a full key placed before a short
        # one must not slip past the redirect.
        url = admin_url("changelist", model="apiproject")
        hidden = self.key.key[10:]
        query = f"q={self.key.key}&q={self.key.key[:10]}"

        response = self.client.get(f"{url}?{query}")

        self.assertEqual(response.status_code, 302)
        self.assertNotIn(hidden, response["Location"])
        self.assertEqual(response["Location"].count("q="), 1)

        followed = self.client.get(f"{url}?{query}", follow=True)

        self.assertEqual(followed.status_code, 200)
        self.assertNotIn(hidden, followed.content.decode())

    def test_api_project_search_cannot_probe_past_the_shown_prefix(self):
        # Two keys share the 10 characters the admin shows and differ after them. A query that reaches into the hidden
        # part must not tell them apart, or staff could recover a key one character at a time.
        a_profile = Project.objects.create(
            submission_source=SubmissionSource.DEVELOPER_SETTINGS, project_name="Probe A", request_not_to_publish=False
        )
        b_profile = Project.objects.create(
            submission_source=SubmissionSource.DEVELOPER_SETTINGS, project_name="Probe B", request_not_to_publish=False
        )
        a = ApiProject.objects.create(profile=a_profile)
        b = ApiProject.objects.create(profile=b_profile)
        ApiKey.objects.create(project=a, label="A", key="sfr_qz7wx1AAAAAAAAAAAA")
        ApiKey.objects.create(project=b, label="B", key="sfr_qz7wx1BBBBBBBBBBBB")
        url = admin_url("changelist", model="apiproject")

        def found(query):
            return sorted(p.pk for p in self.client.get(url, {"q": query}, follow=True).context["cl"].result_list)

        both = sorted([a.pk, b.pk])
        self.assertEqual(found("sfr_qz7wx1"), both)
        self.assertEqual(found("sfr_qz7wx1A"), both)
        self.assertEqual(found("sfr_qz7wx1B"), both)
        self.assertEqual(found("sfr_qz7wx1ZZZZ"), both)

    def test_api_project_history_page_never_shows_the_key(self):
        # Rename the key through the admin form, so the history page has a real entry naming the key.
        data = self.api_change_form()
        data["api_keys-0-label"] = "Renamed"
        self.assertEqual(self.api_save(data).status_code, 302)

        response = self.client.get(admin_url("history", self.api_project.pk, model="apiproject"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Renamed")
        self.assertNotIn(self.key.key, response.content.decode())

    def test_N_M11_deleting_a_project_with_keys_is_refused_with_a_page(self):
        url = admin_url("delete", self.listing.pk)

        page = self.client.get(url)
        submitted = self.client.post(url, {"post": "yes"})

        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "protected")
        self.assertIn(submitted.status_code, (200, 302))
        self.assertTrue(Project.objects.filter(pk=self.listing.pk).exists())
        self.assertTrue(ApiKey.objects.filter(pk=self.key.pk).exists())

    def test_staff_can_soft_delete_an_api_project_and_revoke_its_keys(self):
        settings_made = Project.objects.create(
            submission_source=SubmissionSource.DEVELOPER_SETTINGS,
            project_name="Settings project",
            request_not_to_publish=False,
            is_published=True,
        )
        other = ApiProject.objects.create(profile=settings_made)
        other_key = ApiKey.objects.create(project=other, label="Other")

        response = self.client.post(
            admin_url("changelist", model="apiproject"),
            {
                "action": "soft_delete_and_revoke_keys",
                "_selected_action": [self.api_project.pk, other.pk],
            },
        )

        self.assertEqual(response.status_code, 302)
        for api_project, key in ((self.api_project, self.key), (other, other_key)):
            self.assertIsNotNone(ApiProject.objects.get(pk=api_project.pk).deleted_at)
            self.assertIsNotNone(ApiKey.objects.get(pk=key.pk).revoked_at)
        # The same rule as delete_project: the profile is unpublished, a claimed listing included.
        self.assertFalse(Project.objects.get(pk=self.listing.pk).is_published)
        self.assertFalse(Project.objects.get(pk=settings_made.pk).is_published)

    def test_soft_deleting_an_already_deleted_api_project_keeps_its_deletion_time(self):
        deleted_at = timezone.now() - timedelta(days=3)
        ApiProject.objects.filter(pk=self.api_project.pk).update(deleted_at=deleted_at)

        self.client.post(
            admin_url("changelist", model="apiproject"),
            {
                "action": "soft_delete_and_revoke_keys",
                "_selected_action": [self.api_project.pk],
            },
        )

        self.assertEqual(ApiProject.objects.get(pk=self.api_project.pk).deleted_at, deleted_at)

    def test_N_M11_clearing_revoked_at_does_not_bring_a_key_back_known_gap_N_M11(self):
        ApiKey.objects.filter(pk=self.key.pk).update(revoked_at=timezone.now())
        data = self.api_change_form()
        data["api_keys-0-revoked_at_0"] = ""
        data["api_keys-0-revoked_at_1"] = ""

        self.api_save(data)

        self.assertIsNotNone(ApiKey.objects.get(pk=self.key.pk).revoked_at)

    def stale_key_formset(self, data):
        """The admin's inline formset for the API project, validated now so it holds the key as it is now."""
        from django.test import RequestFactory

        from powered_by.admin import ApiKeyInline

        request = RequestFactory().post("/")
        request.user = self.staff
        inline = ApiKeyInline(ApiProject, admin.site)
        formset = inline.get_formset(request, self.api_project)(
            data, instance=ApiProject.objects.get(pk=self.api_project.pk)
        )
        self.assertTrue(formset.is_valid(), formset.errors)
        return formset

    def test_a_stale_admin_form_cannot_restore_a_key_revoked_after_it_was_built(self):
        data = self.api_change_form()
        data["api_keys-0-label"] = "Renamed in a stale form"
        formset = self.stale_key_formset(data)
        revoked_at = timezone.now() - timedelta(minutes=1)
        ApiKey.objects.filter(pk=self.key.pk).update(revoked_at=revoked_at)

        formset.save()

        self.assertEqual(ApiKey.objects.get(pk=self.key.pk).revoked_at, revoked_at)

    def test_a_stale_admin_form_can_still_revoke_an_active_key(self):
        data = self.api_change_form()
        data["api_keys-0-revoked_at_0"] = "2026-01-02"
        data["api_keys-0-revoked_at_1"] = "03:04:05"

        self.stale_key_formset(data).save()

        self.assertIsNotNone(ApiKey.objects.get(pk=self.key.pk).revoked_at)

    def test_a_stale_admin_save_cannot_widen_origins_an_owner_restricted_after_the_form_was_built(self):
        ApiKey.objects.filter(pk=self.key.pk).update(allowed_origins=[])
        data = self.api_change_form()  # rendered while the key allowed any origin
        restricted = ["https://restricted.example.org"]
        ApiKey.objects.filter(pk=self.key.pk).update(allowed_origins=restricted)
        data["api_keys-0-label"] = "Renamed in a stale form"

        self.stale_key_formset(data).save()

        saved = ApiKey.objects.get(pk=self.key.pk)
        self.assertEqual(saved.allowed_origins, restricted)
        self.assertEqual(saved.label, "Renamed in a stale form")

    def test_an_admin_can_still_change_origins_and_label_on_purpose(self):
        data = self.api_change_form()
        data["api_keys-0-allowed_origins"] = '["https://new.example.org"]'
        data["api_keys-0-label"] = "Changed"

        self.stale_key_formset(data).save()

        saved = ApiKey.objects.get(pk=self.key.pk)
        self.assertEqual(saved.allowed_origins, ["https://new.example.org"])
        self.assertEqual(saved.label, "Changed")

    def test_a_stale_admin_save_cannot_overwrite_a_label_changed_after_the_form_was_built(self):
        data = self.api_change_form()
        ApiKey.objects.filter(pk=self.key.pk).update(label="Owner's label")
        data["api_keys-0-allowed_origins"] = '["https://new.example.org"]'

        self.stale_key_formset(data).save()

        saved = ApiKey.objects.get(pk=self.key.pk)
        self.assertEqual(saved.label, "Owner's label")
        self.assertEqual(saved.allowed_origins, ["https://new.example.org"])

    def test_a_stale_admin_save_cannot_undelete_an_api_project_deleted_after_the_form_was_built(self):
        from powered_by.admin import ApiProjectAdmin

        stale = ApiProject.objects.get(pk=self.api_project.pk)
        deleted_at = timezone.now() - timedelta(minutes=1)
        ApiProject.objects.filter(pk=self.api_project.pk).update(deleted_at=deleted_at)

        ApiProjectAdmin(ApiProject, admin.site).save_model(None, stale, None, True)

        self.assertEqual(ApiProject.objects.get(pk=self.api_project.pk).deleted_at, deleted_at)

    @pytest.mark.failing
    def test_N_M11_a_sixth_active_key_cannot_be_added_known_gap_N_M11(self):
        for n in range(4):
            ApiKey.objects.create(project=self.api_project, label=f"Key {n}")
        data = self.api_change_form()
        total = int(data["api_keys-TOTAL_FORMS"])
        data["api_keys-TOTAL_FORMS"] = str(total + 1)
        data[f"api_keys-{total}-label"] = "Sixth"
        data[f"api_keys-{total}-allowed_origins"] = "[]"
        data[f"api_keys-{total}-project"] = str(self.api_project.pk)

        self.api_save(data)

        self.assertEqual(ApiKey.objects.filter(project=self.api_project, revoked_at__isnull=True).count(), 5)


def test_the_admin_module_does_not_import_sefaria_model_at_load():
    # Admin modules load at Django setup, including collectstatic in the image build, which has no Mongo.
    import ast

    import powered_by.admin as admin_module

    tree = ast.parse(open(admin_module.__file__).read())
    top_level = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom))]
    imported = {(node.module or "") + ":" + ",".join(alias.name for alias in node.names) for node in top_level}
    assert not any("developer" in name or "sefaria" in name for name in imported), imported
