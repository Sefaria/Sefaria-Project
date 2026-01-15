import types

import pytest
from django.test import RequestFactory

from reader import views
from remote_config.keys import ENABLE_SITE_MAINTENANCE_MODE, SITE_MAINTENANCE_MESSAGE


@pytest.fixture
def rf():
    return RequestFactory()


@pytest.fixture
def maintenance_config():
    return {
        ENABLE_SITE_MAINTENANCE_MODE: views.MAINTENANCE_MODE_VALIDATION_NUMBER,
        SITE_MAINTENANCE_MESSAGE: "We are upgrading the library. Please check back soon.",
    }


def _stub_dependencies(monkeypatch, config):
    # Avoid the heavy default base_props behavior in tests.
    monkeypatch.setattr(views, "base_props", lambda request: {})
    monkeypatch.setattr(
        views.remoteConfigCache,
        "get",
        lambda key, default=None: config.get(key, default),
    )


def _build_request(rf, is_staff):
    request = rf.get("/")
    request.user = types.SimpleNamespace(is_staff=is_staff, is_authenticated=False)
    # These are normally set by middleware (e.g., LanguageSettingsMiddleware).
    # `render_template()` uses `render(request, ...)` which runs context processors
    # that expect them to exist.
    request.interfaceLang = "english"
    request.contentLang = "bilingual"
    request.translation_language_preference = None
    request.version_preferences_by_corpus = {}
    return request

@pytest.mark.django_db
def test_non_staff_sees_maintenance_page(monkeypatch, rf, maintenance_config):
    _stub_dependencies(monkeypatch, maintenance_config)
    request = _build_request(rf, is_staff=False)

    response = views.render_template(
        request,
        template_name="elements/loading.html",
        template_context={"foo": "bar"},
    )

    assert response.status_code == 503
    content = response.content.decode()
    assert "Scheduled Maintenance" in content
    assert maintenance_config[SITE_MAINTENANCE_MESSAGE] in content

@pytest.mark.django_db
def test_staff_bypasses_maintenance(monkeypatch, rf, maintenance_config):
    _stub_dependencies(monkeypatch, maintenance_config)
    request = _build_request(rf, is_staff=True)

    response = views.render_template(
        request,
        template_name="elements/loading.html",
        template_context={"foo": "bar"},
    )

    assert response.status_code == 200
    body = response.content.decode()
    assert "Scheduled Maintenance" not in body
    assert "Loading..." in body
