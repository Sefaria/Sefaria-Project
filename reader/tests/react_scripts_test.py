"""
Tests for which React UMD build base.html loads (REACT_DEV_MODE, defaulting to DEBUG).
"""
from pathlib import Path

import pytest
from django.conf import settings as django_settings
from django.template.loader import render_to_string
from django.test import RequestFactory
from sefaria.system.context_processors import global_settings


def _render_react_scripts(react_dev_mode):
    return render_to_string("elements/react_scripts.html", {"REACT_DEV_MODE": react_dev_mode})


def test_production_mode_loads_production_builds_from_cdn_and_fallback():
    html = _render_react_scripts(False)
    assert "unpkg.com/react@16/umd/react.production.min.js" in html
    assert "unpkg.com/react-dom@16/umd/react-dom.production.min.js" in html
    assert "/static/js/lib/react.production.min.js" in html
    assert "/static/js/lib/react-dom.production.min.js" in html
    assert "development" not in html


def test_dev_mode_loads_development_builds_from_cdn_and_fallback():
    html = _render_react_scripts(True)
    assert "unpkg.com/react@16/umd/react.development.js" in html
    assert "unpkg.com/react-dom@16/umd/react-dom.development.js" in html
    assert "/static/js/lib/react.development.js" in html
    assert "/static/js/lib/react-dom.development.js" in html
    assert "production.min" not in html


def test_react_dev_mode_follows_debug_when_unset(settings):
    if hasattr(django_settings, "REACT_DEV_MODE"):
        del settings.REACT_DEV_MODE
    request = RequestFactory().get("/")
    settings.DEBUG = True
    assert global_settings(request)["REACT_DEV_MODE"] is True
    settings.DEBUG = False
    assert global_settings(request)["REACT_DEV_MODE"] is False


def test_react_dev_mode_overrides_debug(settings):
    settings.DEBUG = True
    settings.REACT_DEV_MODE = False
    assert global_settings(RequestFactory().get("/"))["REACT_DEV_MODE"] is False


def test_base_template_uses_shared_react_partial():
    source = (Path(__file__).resolve().parents[2] / "templates" / "base.html").read_text()
    assert '{% include "elements/react_scripts.html" %}' in source
    assert "react.development" not in source
    assert "react-dom.development" not in source
