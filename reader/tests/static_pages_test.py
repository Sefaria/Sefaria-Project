"""
Tests for serve_static and the settings page.
"""
import json

import pytest
from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
from django.test import RequestFactory, TestCase
from django.conf import settings
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
from reader.conftest import create_test_user, page_props, purge_test_profiles
import reader.views as reader_views


@pytest.fixture
def factory():
    return RequestFactory()


def _make_request(factory, path, active_module, params=None):
    request = factory.get(path, params or {})
    request.active_module = active_module
    request.interfaceLang = "english"
    request.LANGUAGE_CODE = "en"
    request.user = AnonymousUser()
    return request


def test_voices_sidebar_page_redirects_to_library(factory):
    library_domain = settings.DOMAIN_MODULES.get("en", {}).get(LIBRARY_MODULE, "")
    request = _make_request(factory, "/about", VOICES_MODULE)
    response = reader_views.serve_static(request, "about", by_lang=True)
    assert response.status_code == 301
    assert library_domain in response["Location"]
    assert "/about" in response["Location"]


def test_voices_sidebar_page_preserves_query_params(factory):
    library_domain = settings.DOMAIN_MODULES.get("en", {}).get(LIBRARY_MODULE, "")
    request = _make_request(factory, "/terms", VOICES_MODULE, {"foo": "bar"})
    response = reader_views.serve_static(request, "terms")
    assert response.status_code == 301
    assert library_domain in response["Location"]
    assert "foo=bar" in response["Location"]


def test_library_sidebar_page_no_redirect(factory, monkeypatch):
    monkeypatch.setattr(reader_views, "render_template", lambda *a, **kw: HttpResponse())
    request = _make_request(factory, "/about", LIBRARY_MODULE)
    response = reader_views.serve_static(request, "about", by_lang=True)
    assert response.status_code not in (301, 302)


class SettingsPageTest(TestCase):
    """
    /settings/account and /settings/developer are one React page, behind a login.
    """
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("settings")
        purge_test_profiles(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def props_for(self, url):
        self.client.force_login(self.user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        return page_props(response.content.decode("utf-8"))

    def test_account_tab_renders_for_a_logged_in_user(self):
        props = self.props_for("/settings/account")

        self.assertEqual(props["initialSettingsTab"], "account")
        self.assertEqual(props["initialMenu"], "settings")
        self.assertIn("libraryAssistantEnabled", props["initialAccountSettings"])

    def test_developer_tab_renders_for_a_logged_in_user(self):
        props = self.props_for("/settings/developer")

        self.assertEqual(props["initialSettingsTab"], "developer")
        self.assertIsNone(props["initialDeveloperProjectId"])
        self.assertIsNone(props["initialDeveloperPoc"])

    def test_a_project_url_carries_its_id(self):
        props = self.props_for("/settings/developer/projects/abc123")

        self.assertEqual(props["initialSettingsTab"], "developer")
        self.assertEqual(props["initialDeveloperProjectId"], "abc123")

    def test_stored_mock_state_is_rendered_into_the_props(self):
        self.client.force_login(self.user)
        self.client.post("/api/developer-poc/state", json.dumps({"projects": []}),
                         content_type="application/json")

        self.assertEqual(self.props_for("/settings/developer")["initialDeveloperPoc"],
                         {"projects": []})

    def test_anonymous_users_are_redirected_to_login(self):
        for url in ("/settings/account", "/settings/developer"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 302)
            self.assertIn("/login", response["Location"])


class DeveloperPocStateApiTest(TestCase):
    """
    The mock developer state round-trips through the session.
    """
    databases = "__all__"
    url = "/api/developer-poc/state"

    def setUp(self):
        self.user = create_test_user("devpoc")
        purge_test_profiles(self.user)
        self.client.force_login(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def post(self, body):
        return self.client.post(self.url, body, content_type="application/json")

    def get(self):
        return json.loads(self.client.get(self.url).content)

    def test_unset_state_reads_as_null(self):
        self.assertIsNone(self.get())

    def test_post_then_get_returns_the_same_object(self):
        state = {"projects": [{"id": "p1", "keys": ["sfr_test_1"]}], "ssoOverride": True}

        response = self.post(json.dumps(state))

        self.assertEqual(json.loads(response.content), {"ok": True})
        self.assertEqual(self.get(), state)

    def test_delete_clears_the_state(self):
        self.post(json.dumps({"projects": []}))

        response = self.client.delete(self.url)

        self.assertEqual(json.loads(response.content), {"ok": True})
        self.assertIsNone(self.get())

    def test_a_non_object_body_is_rejected(self):
        self.assertEqual(self.post(json.dumps(["nope"])).status_code, 400)
        self.assertEqual(self.post("not json").status_code, 400)
        self.assertIsNone(self.get())

    def test_an_oversized_body_is_rejected(self):
        oversized = json.dumps({"blob": "x" * (64 * 1024)})

        self.assertEqual(self.post(oversized).status_code, 400)
        self.assertIsNone(self.get())

    def test_anonymous_users_are_redirected_to_login(self):
        self.client.logout()

        self.assertEqual(self.client.get(self.url).status_code, 302)
