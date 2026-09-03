import pytest

from sefaria.model.linker_editor_history import (
    LinkerEditorHistory,
    LinkerEditorHistorySet,
    log_linker_editor_action,
)
from sefaria.system.exceptions import InputError


def test_save_and_query_round_trip():
    entry = log_linker_editor_action(
        1, "add_match_template",
        {"title": "Berakhot", "node_key_path": "Berakhot", "term_slugs": ["bavli"], "scope": "combined"},
        index_title="Berakhot",
    )
    try:
        assert entry.uid == 1
        assert entry.action == "add_match_template"
        assert entry.index_title == "Berakhot"
        assert entry.params["term_slugs"] == ["bavli"]

        results = LinkerEditorHistorySet({"uid": 1, "index_title": "Berakhot"})
        assert any(r._id == entry._id for r in results)
    finally:
        entry.delete()


def test_slug_denormalized_field_optional():
    entry = log_linker_editor_action(1, "create_non_unique_term", {"titles": [], "slug": "foo"}, slug="foo")
    try:
        assert entry.slug == "foo"
        assert not hasattr(entry, "index_title")
    finally:
        entry.delete()


def test_requires_uid_action_params_created():
    with pytest.raises(InputError):
        LinkerEditorHistory({"action": "add_match_template", "params": {}}).save()


def test_rejects_unknown_action():
    with pytest.raises(InputError):
        LinkerEditorHistory({"uid": 1, "action": "not_a_real_action", "params": {}, "created": 0}).save()
