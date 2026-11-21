"""Redirects for retired static pages."""

import pytest
from django.test import RequestFactory
from django.urls import resolve


@pytest.mark.parametrize("path", ["/app", "/app/"])
def test_app_redirects_to_mobile(settings, path):
    settings.ROOT_URLCONF = "sefaria.urls_library"

    request = RequestFactory().get(path, {"utm_source": "daf-yomi"})
    response = resolve(path).func(request)

    assert response.status_code == 301
    assert response["Location"] == "/mobile?utm_source=daf-yomi"
