"""
Tests for serve_static and the settings page.
"""
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
        self.assertEqual(props["initialDeveloper"]["projects"], [])
        self.assertFalse(props["initialDeveloper"]["developerEnabled"])

    def test_a_project_url_carries_its_id(self):
        props = self.props_for("/settings/developer/projects/abc123")

        self.assertEqual(props["initialSettingsTab"], "developer")
        self.assertEqual(props["initialDeveloperProjectId"], "abc123")

    def test_anonymous_users_are_redirected_to_login(self):
        for url in ("/settings/account", "/settings/developer"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 302)
            self.assertIn("/login", response["Location"])
