# -*- coding: utf-8 -*-
"""
Tests for the DISABLE_AUTOCOMPLETER guards that support the standalone name
service.  The flag is strict: a disabled process neither builds completers
(no-op with a warning) nor serves them (accessors fail fast rather than
lazily building in-request); completion traffic belongs to the name service.

These tests touch no database: the guards return before any data access.
"""

import pytest

import sefaria.model.text as text_mod
from sefaria.model.text import library
from sefaria.system.exceptions import InputError


@pytest.fixture
def empty_completer_state():
    saved = (
        library._full_auto_completer,
        library._lexicon_auto_completer,
        library._cross_lexicon_auto_completer,
        library._full_auto_completer_is_ready,
        library._lexicon_auto_completer_is_ready,
        library._cross_lexicon_auto_completer_is_ready,
    )
    library._full_auto_completer = {}
    library._lexicon_auto_completer = {}
    library._cross_lexicon_auto_completer = None
    library._full_auto_completer_is_ready = False
    library._lexicon_auto_completer_is_ready = False
    library._cross_lexicon_auto_completer_is_ready = False
    yield
    (
        library._full_auto_completer,
        library._lexicon_auto_completer,
        library._cross_lexicon_auto_completer,
        library._full_auto_completer_is_ready,
        library._lexicon_auto_completer_is_ready,
        library._cross_lexicon_auto_completer_is_ready,
    ) = saved


@pytest.fixture
def autocompleter_disabled(monkeypatch, empty_completer_state):
    monkeypatch.setattr(text_mod, "DISABLE_AUTOCOMPLETER", True)


def test_build_methods_noop_when_disabled(autocompleter_disabled):
    library.build_full_auto_completer()
    library.build_lexicon_auto_completers()
    library.build_cross_lexicon_auto_completer()

    assert library._full_auto_completer == {}
    assert library._lexicon_auto_completer == {}
    assert library._cross_lexicon_auto_completer is None
    assert not library._full_auto_completer_is_ready
    assert not library._lexicon_auto_completer_is_ready
    assert not library._cross_lexicon_auto_completer_is_ready


def test_accessors_raise_when_disabled(autocompleter_disabled):
    with pytest.raises(RuntimeError):
        library.full_auto_completer("en")
    with pytest.raises(RuntimeError):
        library.lexicon_auto_completer("BDB Dictionary")
    with pytest.raises(RuntimeError):
        library.cross_lexicon_auto_completer()


def test_unknown_lexicon_does_not_trigger_rebuild(empty_completer_state):
    # Once the lexicon tries are built, an unrecognized lexicon name must raise
    # InputError instead of rebuilding all tries in-request.
    library._lexicon_auto_completer_is_ready = True
    with pytest.raises(InputError):
        library.lexicon_auto_completer("Not A Real Lexicon")


def test_name_service_urlconf_routes():
    from django.urls import get_resolver, Resolver404
    import reader.views as reader_views

    resolver = get_resolver("sefaria.urls_name")

    assert resolver.resolve("/api/name/Genesis").func == reader_views.name_api
    assert resolver.resolve("/api/words/completion/foo").func == reader_views.dictionary_completion_api
    assert resolver.resolve("/api/words/completion/foo/BDB").func == reader_views.dictionary_completion_api
    assert resolver.resolve("/api/opensearch-suggestions").func == reader_views.opensearch_suggestions_api
    assert resolver.resolve("/search-autocomplete-redirecter").func == reader_views.search_autocomplete_redirecter
    assert resolver.resolve("/healthz").func == reader_views.application_health_api_nonlibrary
    assert resolver.resolve("/healthz-rollout").func == reader_views.rollout_health_api

    # everything else stays on the web stack
    with pytest.raises(Resolver404):
        resolver.resolve("/api/texts/Genesis.1")
    with pytest.raises(Resolver404):
        resolver.resolve("/api/words/foo")
    with pytest.raises(Resolver404):
        resolver.resolve("/texts")
