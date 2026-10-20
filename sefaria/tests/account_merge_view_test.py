"""Admin form tests never merge real accounts or access application Mongo data."""
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


@pytest.fixture
def merge_form_env(db, monkeypatch):
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
    factory = RequestFactory()
    req = getattr(factory, method)("/admin/merge/accounts", data if data is not None else env.data)
    req.user = user if user is not None else env.operator
    req._dont_enforce_csrf_checks = not enforce_csrf
    return views.merge_accounts(req)


def payload(response):
    return json.loads(response.content)


def test_staff_get_renders_merge_form(merge_form_env):
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
def test_non_staff_cannot_open_or_submit_form(merge_form_env, method, anonymous):
    env = merge_form_env
    response = request(env, method=method, user=AnonymousUser() if anonymous else env.source)
    assert response.status_code == 302
    env.render.assert_not_called()
    env.merge.assert_not_called()


def test_staff_post_requires_csrf(merge_form_env):
    env = merge_form_env
    assert request(env, enforce_csrf=True).status_code == 403
    env.merge.assert_not_called()


def test_unsupported_http_method_is_rejected(merge_form_env):
    assert request(merge_form_env, method="delete").status_code == 405
    merge_form_env.merge.assert_not_called()


@pytest.mark.parametrize("field,value", [
    ("password", "wrong"), ("accounts_quiet", ""), ("confirmation", "merge"),
    ("profile_mode", "unknown"), ("source", ""), ("source", "not-an-email"),
    ("destination", ""), ("action", "delete"),
])
def test_invalid_submission_never_starts_merge(merge_form_env, field, value):
    env = merge_form_env
    response = request(env, {**env.data, field: value})
    assert response.status_code == 400
    assert payload(response)["retry_safe"] is True
    env.merge.assert_not_called()


def test_stale_staff_session_cannot_authorize_merge(merge_form_env):
    env = merge_form_env
    User.objects.filter(pk=env.operator.pk).update(is_staff=False)
    assert request(env).status_code == 403
    env.merge.assert_not_called()


def test_preview_resolves_case_insensitive_emails_without_mutating(merge_form_env):
    env = merge_form_env
    response = request(env, {**env.data, "action": "preview", "source": env.source.email.upper()})
    assert response.status_code == 200
    assert payload(response) == {
        "source": {"id": env.source.id, "email": env.source.email, "name": "Source"},
        "destination": {"id": env.destination.id, "email": env.destination.email, "name": "Personal"},
    }
    env.merge.assert_not_called()


def test_same_account_by_email_and_id_is_rejected(merge_form_env):
    env = merge_form_env
    response = request(env, {**env.data, "destination": str(env.source.id)})
    assert response.status_code == 400
    assert "different" in payload(response)["errors"]["destination"][0]["message"]
    env.merge.assert_not_called()


def test_missing_account_is_reported(merge_form_env):
    env = merge_form_env
    response = request(env, {**env.data, "source": "missing@example.com"})
    assert response.status_code == 400
    assert "Account not found" in payload(response)["errors"]["source"][0]["message"]
    env.merge.assert_not_called()


def test_duplicate_email_requires_an_explicit_user_id(merge_form_env):
    env = merge_form_env
    duplicate = User.objects.create_user(username="duplicate", email="different@example.com")
    User.objects.filter(pk=duplicate.pk).update(email=env.source.email)
    response = request(env)
    assert response.status_code == 400
    assert "user ID instead" in payload(response)["errors"]["source"][0]["message"]
    env.merge.assert_not_called()
    response = request(env, {**env.data, "source": str(env.source.id)})
    assert response.status_code == 200


def test_missing_profile_is_reported_without_creating_one(merge_form_env, monkeypatch):
    env = merge_form_env
    env.profiles.find_one.return_value = None
    profile_constructor = Mock(side_effect=AssertionError("Profile lookup must not create profiles"))
    monkeypatch.setattr(views, "UserProfile", profile_constructor)
    response = request(env, {**env.data, "action": "preview"})
    assert response.status_code == 400
    profile_constructor.assert_not_called()
    env.merge.assert_not_called()


@pytest.mark.parametrize("mode,fill,override", [("fill", True, False), ("override", False, True), ("none", False, False)])
def test_submit_calls_existing_merge_without_console_input(merge_form_env, mode, fill, override):
    env = merge_form_env
    response = request(env, {**env.data, "profile_mode": mode,
                             "source": str(env.source.id), "destination": str(env.destination.id)})
    assert response.status_code == 200
    env.merge.assert_called_once_with(env.source.id, env.destination.id,
                                     fill_in_profile_data=fill, override_profile_data=override, confirm=False)
    assert "Source account %s was deleted" % env.source.id in payload(response)["success"]


def test_admin_password_is_not_stripped(merge_form_env):
    env = merge_form_env
    env.operator.set_password(" password with spaces ")
    env.operator.save()
    assert request(env, {**env.data, "password": " password with spaces "}).status_code == 200


def test_merge_warnings_are_visible_in_success_response(merge_form_env):
    env = merge_form_env
    env.merge.return_value["warnings"] = ["CRM record needs manual review."]
    assert payload(request(env))["warnings"] == ["CRM record needs manual review."]


def test_late_input_error_is_safe_to_correct(merge_form_env):
    env = merge_form_env
    env.merge.side_effect = InputError("A profile disappeared before the merge started.")
    response = request(env)
    assert response.status_code == 400
    assert payload(response)["retry_safe"] is True


def test_partial_failure_is_not_presented_as_safe_to_retry(merge_form_env):
    env = merge_form_env
    env.merge.side_effect = RuntimeError("private database details")
    response = request(env)
    assert response.status_code == 500
    assert payload(response)["retry_safe"] is False
    assert "inspect both accounts" in payload(response)["error"]
    assert "private database details" not in response.content.decode()


@override_settings(ROOT_URLCONF="sefaria.urls_library")
def test_merge_url_and_template_use_vanilla_script():
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
