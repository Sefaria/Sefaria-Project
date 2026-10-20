"""
Account merge view tests.

These tests cover the staff web form at /admin/merge/accounts: who may use it,
how the form is checked, how accounts are looked up, and what JSON the page
gets back. They never merge real accounts or read application Mongo data:
merge_user_accounts() and the profiles collection are both mocked.

If you're testing what the merge itself does to the data, write the test in
sefaria/utils/tests/user_integration_test.py. For a pure helper used by the
merge, use sefaria/utils/tests/user_test.py.
"""
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from django.contrib.auth.models import AnonymousUser, User
from django.http import HttpResponse
from django.template import Context, Engine
from django.test import RequestFactory, override_settings
from django.urls import resolve, reverse

from sefaria import views
from sefaria.forms import SefariaMergeAccountsForm
from sefaria.system.exceptions import InputError
from sefaria.utils import user as user_utils
from sefaria.utils.user import MergeNotStartedError


# ============================================================================
# Fixtures and helpers
# ============================================================================

@pytest.fixture
def merge_form_env(db, monkeypatch):
    """
    A staff operator, two accounts to merge, and a valid form submission.

    The SQL users are real; pytest-django removes them when the test ends.
    Everything else is mocked so no test can change real data:
        - merge_user_accounts returns a successful result without merging
        - views.db.profiles says every account has a profile
        - render_template returns a plain response instead of rendering React
    `data` is a complete, valid POST; tests change one field to test one rule.
    """
    operator = User.objects.create_user(username="merge-admin", email="admin@example.com",
                                        password="admin-password", is_staff=True)
    source = User.objects.create_user(username="merge-source", email="source@example.com", first_name="Source")
    destination = User.objects.create_user(username="merge-destination", email="personal@example.com",
                                           first_name="Personal")
    merge = Mock(return_value={"from_uid": source.id, "into_uid": destination.id, "warnings": []})
    monkeypatch.setattr(user_utils, "merge_user_accounts", merge)
    profiles = Mock()
    profiles.find_one.return_value = {"_id": "synthetic-profile"}
    monkeypatch.setattr(views, "db", SimpleNamespace(profiles=profiles))
    render = Mock(return_value=HttpResponse("form page"))
    monkeypatch.setattr(views, "render_template", render)
    data = {"source": source.email, "destination": destination.email, "profile_mode": "fill",
            "password": "admin-password", "accounts_quiet": "on", "confirmation": "MERGE", "action": "merge"}
    return SimpleNamespace(operator=operator, source=source, destination=destination, merge=merge,
                           profiles=profiles, render=render, data=data)


def request(env, data=None, method="post", user=None, enforce_csrf=False):
    """Call the view directly, as the operator unless another user is given."""
    factory = RequestFactory()
    req = getattr(factory, method)("/admin/merge/accounts", data if data is not None else env.data)
    req.user = user if user is not None else env.operator
    req._dont_enforce_csrf_checks = not enforce_csrf
    return views.merge_accounts(req)


def payload(response):
    return json.loads(response.content)


# ============================================================================
# Who can use the form
# ============================================================================

class TestAccess:
    """Only an active staff member, with a CSRF token and a GET or POST, reaches the form."""

    def test_staff_get_renders_merge_form(self, merge_form_env):
        """Staff see the form, and the page is never cached"""
        env = merge_form_env
        response = request(env, method="get")
        assert response.status_code == 200
        assert "no-store" in response["Cache-Control"]
        assert env.render.call_args.args[1] == "merge-accounts.html"
        assert isinstance(env.render.call_args.args[3]["form"], SefariaMergeAccountsForm)
        assert views.merge_accounts._non_atomic_requests == {"default"}
        env.merge.assert_not_called()

    @pytest.mark.parametrize("anonymous", [False, True])
    @pytest.mark.parametrize("method", ["get", "post"])
    @override_settings(ROOT_URLCONF="sefaria.urls_library")
    def test_non_staff_cannot_open_or_submit_form(self, merge_form_env, method, anonymous):
        """Logged-out users and non-staff users are redirected away"""
        env = merge_form_env
        response = request(env, method=method, user=AnonymousUser() if anonymous else env.source)
        assert response.status_code == 302
        env.render.assert_not_called()
        env.merge.assert_not_called()

    def test_staff_post_requires_csrf(self, merge_form_env):
        """A POST without a CSRF token is refused"""
        env = merge_form_env
        assert request(env, enforce_csrf=True).status_code == 403
        env.merge.assert_not_called()

    def test_unsupported_http_method_is_rejected(self, merge_form_env):
        """Methods other than GET and POST are refused"""
        assert request(merge_form_env, method="delete").status_code == 405
        merge_form_env.merge.assert_not_called()

    def test_stale_staff_session_cannot_authorize_merge(self, merge_form_env):
        """Staff access is checked in the database on each POST, not taken from the session"""
        env = merge_form_env
        User.objects.filter(pk=env.operator.pk).update(is_staff=False)
        assert request(env).status_code == 403
        env.merge.assert_not_called()


# ============================================================================
# Checking the submission
# ============================================================================

class TestFormChecks:
    """A submission with any problem returns 400 and never starts a merge."""

    @pytest.mark.parametrize("field,value", [
        ("password", "wrong"), ("accounts_quiet", ""), ("confirmation", "merge"),
        ("profile_mode", "unknown"), ("source", ""), ("source", "not-an-email"),
        ("destination", ""), ("action", "delete"),
    ])
    def test_invalid_submission_never_starts_merge(self, merge_form_env, field, value):
        """Each invalid field is rejected, and the page is told it is safe to fix and resend"""
        env = merge_form_env
        response = request(env, {**env.data, field: value})
        assert response.status_code == 400
        assert payload(response)["retry_safe"] is True
        env.merge.assert_not_called()

    def test_admin_password_is_not_stripped(self, merge_form_env):
        """Spaces at the start or end of the password are part of it"""
        env = merge_form_env
        env.operator.set_password(" password with spaces ")
        env.operator.save()
        assert request(env, {**env.data, "password": " password with spaces "}).status_code == 200


class TestAccountLookup:
    """Accounts are found by user ID or email, and problems are reported per field."""

    def test_preview_resolves_case_insensitive_emails_without_mutating(self, merge_form_env):
        """Preview finds accounts by email in any letter case and changes nothing"""
        env = merge_form_env
        response = request(env, {**env.data, "action": "preview", "source": env.source.email.upper()})
        assert response.status_code == 200
        assert payload(response) == {
            "source": {"id": env.source.id, "email": env.source.email, "name": "Source"},
            "destination": {"id": env.destination.id, "email": env.destination.email, "name": "Personal"},
        }
        env.merge.assert_not_called()

    def test_same_account_by_email_and_id_is_rejected(self, merge_form_env):
        """The same account given once by email and once by ID is caught"""
        env = merge_form_env
        response = request(env, {**env.data, "destination": str(env.source.id)})
        assert response.status_code == 400
        assert "different" in payload(response)["errors"]["destination"][0]["message"]
        env.merge.assert_not_called()

    def test_missing_account_is_reported(self, merge_form_env):
        """An email with no account is reported on that field"""
        env = merge_form_env
        response = request(env, {**env.data, "source": "missing@example.com"})
        assert response.status_code == 400
        assert "Account not found" in payload(response)["errors"]["source"][0]["message"]
        env.merge.assert_not_called()

    def test_duplicate_email_requires_an_explicit_user_id(self, merge_form_env):
        """An email shared by two accounts must be replaced with a user ID"""
        env = merge_form_env
        duplicate = User.objects.create_user(username="duplicate", email="different@example.com")
        User.objects.filter(pk=duplicate.pk).update(email=env.source.email)
        response = request(env)
        assert response.status_code == 400
        assert "user ID instead" in payload(response)["errors"]["source"][0]["message"]
        env.merge.assert_not_called()
        response = request(env, {**env.data, "source": str(env.source.id)})
        assert response.status_code == 200

    @pytest.mark.parametrize("field", ["source", "destination"])
    def test_operator_cannot_merge_their_own_account(self, merge_form_env, field):
        """Staff can't merge their own account: it would delete it or remove their admin access"""
        env = merge_form_env
        response = request(env, {**env.data, field: env.operator.email})
        assert response.status_code == 400
        assert "your own account" in payload(response)["errors"][field][0]["message"]
        env.merge.assert_not_called()

    def test_missing_profile_is_reported_without_creating_one(self, merge_form_env, monkeypatch):
        """An account without a profile is reported, and the check doesn't create one"""
        env = merge_form_env
        env.profiles.find_one.return_value = None
        profile_constructor = Mock(side_effect=AssertionError("Profile lookup must not create profiles"))
        monkeypatch.setattr(views, "UserProfile", profile_constructor)
        response = request(env, {**env.data, "action": "preview"})
        assert response.status_code == 400
        profile_constructor.assert_not_called()
        env.merge.assert_not_called()


# ============================================================================
# Running the merge
# ============================================================================

class TestMergeResult:
    """The view calls the same merge as the command line and reports the outcome."""

    @pytest.mark.parametrize("mode,fill,override", [
        ("fill", True, False), ("override", False, True), ("none", False, False),
    ])
    def test_submit_calls_existing_merge_without_console_input(self, merge_form_env, mode, fill, override):
        """Each profile mode maps to the merge's two booleans, with the console prompt turned off"""
        env = merge_form_env
        response = request(env, {**env.data, "profile_mode": mode,
                                 "source": str(env.source.id), "destination": str(env.destination.id)})
        assert response.status_code == 200
        env.merge.assert_called_once_with(env.source.id, env.destination.id,
                                         fill_in_profile_data=fill, override_profile_data=override, confirm=False)
        assert "Source account %s was deleted" % env.source.id in payload(response)["success"]

    def test_merge_warnings_are_visible_in_success_response(self, merge_form_env):
        """Follow-up warnings from the merge are passed on to the page"""
        env = merge_form_env
        env.merge.return_value["warnings"] = ["CRM record needs manual review."]
        assert payload(request(env))["warnings"] == ["CRM record needs manual review."]

    def test_merge_that_did_not_start_is_safe_to_correct(self, merge_form_env):
        """MergeNotStartedError means nothing changed, so the page may resend"""
        env = merge_form_env
        env.merge.side_effect = MergeNotStartedError("A profile disappeared before the merge started.")
        response = request(env)
        assert response.status_code == 400
        assert payload(response)["retry_safe"] is True

    def test_other_input_errors_are_not_presented_as_safe_to_retry(self, merge_form_env):
        """A plain InputError may come from partway through the merge, so the page stays locked"""
        env = merge_form_env
        env.merge.side_effect = InputError("raised by library code during the transfer")
        response = request(env)
        assert response.status_code == 500
        assert payload(response)["retry_safe"] is False

    def test_partial_failure_is_not_presented_as_safe_to_retry(self, merge_form_env):
        """Any other error may mean data moved, so the page stays locked and hides details"""
        env = merge_form_env
        env.merge.side_effect = RuntimeError("private database details")
        response = request(env)
        assert response.status_code == 500
        assert payload(response)["retry_safe"] is False
        assert "inspect both accounts" in payload(response)["error"]
        assert "private database details" not in response.content.decode()


# ============================================================================
# URL and template
# ============================================================================

class TestUrlAndTemplate:
    """The URL is wired up and the template loads the plain JavaScript form script."""

    @override_settings(ROOT_URLCONF="sefaria.urls_library")
    def test_merge_url_and_template_use_vanilla_script(self):
        """The URL resolves to the view, and the page has the form, CSRF token, and script"""
        assert reverse("merge/accounts") == "/admin/merge/accounts"
        assert resolve("/admin/merge/accounts").func == views.merge_accounts
        # Render the real form template against a tiny base so this test does not
        # require React SSR, application profiles, analytics, or remote resources.
        template = Path(__file__).resolve().parents[2] / "templates" / "merge-accounts.html"
        templates = {"base.html": "{% block content %}{% endblock %}{% block js %}{% endblock %}",
                     "merge-accounts.html": template.read_text()}
        engine = Engine(loaders=[("django.template.loaders.locmem.Loader", templates)], libraries={
            "i18n": "django.templatetags.i18n", "static": "django.templatetags.static",
        })
        html = engine.get_template("merge-accounts.html").render(Context({
            "form": SefariaMergeAccountsForm(), "csrf_token": "test-csrf-token",
        }))
        assert 'action="/admin/merge/accounts"' in html
        assert 'name="csrfmiddlewaretoken"' in html
        assert 'id="merge-accounts-status"' in html
        assert "js/account-merge.js" in html


# ============================================================================
# Links from the Django admin
# ============================================================================

class TestAdminLinks:
    """Staff can reach the merge page from the Django admin without knowing its URL."""

    @pytest.fixture
    def admin_client(self, client, merge_form_env):
        """A test client logged in as a superuser, so every admin page is visible."""
        env = merge_form_env
        env.operator.is_superuser = True
        env.operator.save()
        client.force_login(env.operator)
        return client

    @override_settings(ROOT_URLCONF="sefaria.urls_library")
    def test_admin_index_links_to_merge_page(self, admin_client):
        """The admin home page links to the merge form"""
        response = admin_client.get(reverse("admin:index"))
        assert response.status_code == 200
        assert 'href="/admin/merge/accounts"' in response.content.decode()

    @override_settings(ROOT_URLCONF="sefaria.urls_library")
    def test_user_page_links_to_merge_with_that_user_as_source(self, admin_client, merge_form_env):
        """A user's admin page links to the merge form with that user filled in as the source"""
        source = merge_form_env.source
        response = admin_client.get(reverse("admin:auth_user_change", args=[source.id]))
        assert response.status_code == 200
        assert f'href="/admin/merge/accounts?source={source.id}"' in response.content.decode()

    def test_source_in_the_link_fills_in_the_form(self, merge_form_env):
        """Opening the merge page with ?source= fills in only the source field"""
        env = merge_form_env
        request(env, data={"source": str(env.source.id)}, method="get")
        form = env.render.call_args.args[3]["form"]
        assert form["source"].value() == str(env.source.id)
        assert form["destination"].value() is None
        env.merge.assert_not_called()
