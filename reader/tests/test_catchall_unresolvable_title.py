"""
A reader URL whose first path segment is not a book title must answer 404,
also when it carries a version param such as ?vhe=<version>/notes.
"""

import pytest
from django.http import Http404
from django.test import RequestFactory

from reader.views import _get_normalized_versions, catchall
from sefaria.system.exceptions import InputError


class UnresolvableTitleRef:
    """Stands in for Ref when the title cannot be resolved."""

    def __init__(self, *args, **kwargs):
        raise InputError("Could not find title in reference")

    @staticmethod
    def instantiate_ref_with_legacy_parse_fallback(tref):
        raise InputError("Could not find title in reference")


def test_catchall_answers_404_for_unresolvable_title_with_version_param(monkeypatch):
    monkeypatch.setattr("reader.views.Ref", UnresolvableTitleRef)
    request = RequestFactory().get("/undefined", {"vhe": "Sefat emet, Piotrków, 1905-1908/notes"})

    with pytest.raises(Http404):
        catchall(request, "undefined")


def test_normalized_versions_are_empty_for_unresolvable_title(monkeypatch):
    monkeypatch.setattr("reader.views.Ref", UnresolvableTitleRef)

    assert _get_normalized_versions("undefined", None, "Sefat emet, Piotrków, 1905-1908/notes") == [
        None,
        None,
    ]


class LegacyOnlyTitleRef:
    """Stands in for Ref when only the legacy or partial fallback resolves the title."""

    @staticmethod
    def instantiate_ref_with_legacy_parse_fallback(tref):
        return LegacyOnlyTitleRef()

    def version_list(self):
        return [
            {
                "versionTitle": "Sefat emet, Piotrków, 1905-1908",
                "language": "he",
                "languageFamilyName": "hebrew",
                "direction": "rtl",
            }
        ]


def test_normalized_versions_match_a_title_only_the_fallback_parser_accepts(monkeypatch):
    monkeypatch.setattr("reader.views.Ref", LegacyOnlyTitleRef)

    assert _get_normalized_versions("Sefat emet 1:1", None, "Sefat_emet,_Piotrków,_1905-1908") == [
        None,
        "hebrew|Sefat_emet,_Piotrków,_1905-1908",
    ]
