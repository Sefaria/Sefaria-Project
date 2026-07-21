"""
Tests for the linker editor backend (sefaria/helper/linker_editor.py and
sefaria/model/linker/nonuniqueterm_index.py).

Pure-logic and Redis-cache tests run anywhere. DB-backed tests are read-only.
The write round-trip (add/remove MatchTemplate with index.save()) is exercised by
manual/E2E verification rather than here, to avoid mutating shared index data.
"""
import pytest

from sefaria.helper import linker_editor as le
import sefaria.model.linker.nonuniqueterm_index as ni
from sefaria.system.exceptions import InputError


# ---------------------------------------------------------------------------
# Pure logic
# ---------------------------------------------------------------------------

def test_parse_node_key_path():
    assert le.parse_node_key_path("Berakhot.Intro") == ["Berakhot", "Intro"]
    assert le.parse_node_key_path("Berakhot") == ["Berakhot"]
    assert le.parse_node_key_path("") == []
    assert le.parse_node_key_path("A..B") == ["A", "B"]


def test_all_address_type_names():
    names = le.all_address_type_names()
    # A few known, currently-defined address types.
    for expected in ["Integer", "Talmud", "Perek", "Pasuk", "Amud"]:
        assert expected in names
    # 'Year' is commented out in schema.py and must not appear.
    assert "Year" not in names
    assert names == sorted(set(names))  # sorted + de-duped


def test_match_templates_equal():
    assert le._match_templates_equal({"term_slugs": ["a"]}, {"term_slugs": ["a"], "scope": "combined"})
    assert not le._match_templates_equal({"term_slugs": ["a"]}, {"term_slugs": ["a"], "scope": "alone"})
    assert not le._match_templates_equal({"term_slugs": ["a"]}, {"term_slugs": ["a", "b"]})


def test_normalize_scope():
    assert le._normalize_scope(None) == "combined"
    assert le._normalize_scope("alone") == "alone"
    with pytest.raises(InputError):
        le._normalize_scope("bogus")


# ---------------------------------------------------------------------------
# Redis usage index — surgical add/remove (cache only)
# ---------------------------------------------------------------------------

def test_usage_index_surgical_add_remove():
    entry = {
        "index_title": "__LE_TEST__",
        "node_key_path": ["__LE_TEST__"],
        "node_title": "Test",
        "struct_name": None,
        "term_slugs": ["__le_test_slug_a__", "__le_test_slug_b__"],
        "scope": "combined",
    }
    try:
        ni.add_usage_entry(entry)
        for slug in entry["term_slugs"]:
            usages = ni.get_term_usages(slug)
            assert any(u["index_title"] == "__LE_TEST__" for u in usages)

        # Idempotent: adding again does not duplicate.
        ni.add_usage_entry(entry)
        count = sum(1 for u in ni.get_term_usages("__le_test_slug_a__") if u["index_title"] == "__LE_TEST__")
        assert count == 1
    finally:
        ni.remove_usage_entry(entry)

    for slug in entry["term_slugs"]:
        assert not any(u["index_title"] == "__LE_TEST__" for u in ni.get_term_usages(slug))


# ---------------------------------------------------------------------------
# DB-backed, read-only
# ---------------------------------------------------------------------------

def test_get_node_by_key_path():
    from sefaria.model import library
    idx = library.get_index("Berakhot")
    root = le.get_node_by_key_path(idx, ["Berakhot"])
    assert root is not None and root.key == "Berakhot"
    # Tolerates omission of the leading root key.
    assert le.get_node_by_key_path(idx, []).key == "Berakhot"
    # Unknown key resolves to None.
    assert le.get_node_by_key_path(idx, ["Berakhot", "NoSuchChild"]) is None


def test_search_and_detail_non_unique_terms():
    results = le.search_non_unique_terms("bavli", 5)
    slugs = [t["slug"] for t in results]
    assert "bavli" in slugs

    detail = le.get_non_unique_term_detail("bavli")
    assert detail["slug"] == "bavli"
    assert len(detail["titles"]) > 0
    assert "usages" in detail

    with pytest.raises(InputError):
        le.get_non_unique_term_detail("__no_such_slug__")


def test_search_empty_query_returns_empty():
    assert le.search_non_unique_terms("", 5) == []
    assert le.search_non_unique_terms("   ", 5) == []
