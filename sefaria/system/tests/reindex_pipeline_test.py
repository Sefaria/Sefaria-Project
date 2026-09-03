"""Tests for shared reindex pipeline helpers."""
import importlib.util
import pathlib

import pytest

spec = importlib.util.spec_from_file_location(
    "reindex_pipeline",
    pathlib.Path("scripts/scheduled/reindex_pipeline.py"),
)
pipeline = importlib.util.module_from_spec(spec)


def load_pipeline():
    spec.loader.exec_module(pipeline)
    return pipeline


def test_run_reindex_entities_rebuilds_all_entity_types(monkeypatch):
    """The orchestrator path must rebuild topic/book/category too.

    #3510 (Multi-Entity Search Results) added these index types on master, where the
    weekly CronJob entrypoint is reindex_elasticsearch_cronjob.py -> index_all() ->
    index_entities(). This branch repoints the CronJob at reindex_orchestrator.py,
    which never calls index_all() -- so without this helper the entity aliases would
    silently keep pointing at stale indexes while the job still exits 0.
    """
    mod = load_pipeline()
    calls = []
    monkeypatch.setattr("sefaria.search.index_entities",
                        lambda debug=False: calls.append(("entities", debug)))

    mod.run_reindex_entities(debug=True)

    assert calls == [("entities", True)]


def test_run_reindex_entities_propagates_failure(monkeypatch):
    """index_entities attempts every type then raises a summary; do not swallow it.

    6b2de5392 deliberately made this raise so "a stale entity index is never silently
    reported as a successful reindex". The catch-and-log convention elsewhere in this
    module applies to catch-up/queue-clear, which are cheap re-runs of already-durable
    work -- not to a whole entity corpus being stale.
    """
    mod = load_pipeline()

    def boom(debug=False):
        raise RuntimeError("Entity indexing failed for: topic, book")

    monkeypatch.setattr("sefaria.search.index_entities", boom)

    with pytest.raises(RuntimeError, match="topic, book"):
        mod.run_reindex_entities()


def test_run_reindex_finalize_all_runs_catch_up_and_clears_queue(monkeypatch):
    mod = load_pipeline()
    calls = []

    monkeypatch.setattr("sefaria.search.reindex_finalize", lambda t, debug=False: calls.append(("finalize", t, debug)))
    monkeypatch.setattr("sefaria.search.reindex_index_shard", lambda t, debug=False: calls.append(("shard", t, debug)))
    monkeypatch.setattr(mod, "run_sheets_catch_up", lambda ts, debug=False: calls.append(("catch_up", ts, debug)))
    monkeypatch.setattr(mod, "clear_index_queue", lambda: calls.append("clear_queue") or 0)

    mod.run_reindex_finalize_all(
        debug=True,
        sheet_catch_up_timestamp="2026-01-01T00:00:00",
        clear_queue=True,
    )

    assert calls == [
        ("finalize", "text", True),
        ("shard", "sheet", True),
        ("finalize", "sheet", True),
        ("catch_up", "2026-01-01T00:00:00", True),
        "clear_queue",
    ]


def test_run_sheets_catch_up_raises_on_string_error(monkeypatch):
    mod = load_pipeline()
    monkeypatch.setattr(
        "sefaria.search.index_sheets_by_timestamp",
        lambda timestamp, debug=False: "database error",
    )

    with pytest.raises(RuntimeError, match="Sheet catch-up failed"):
        mod.run_sheets_catch_up("2026-01-01T00:00:00")


def test_index_all_of_type_reaches_entity_dispatch_without_stubbing_reindex_index_shard(monkeypatch):
    """The discriminating test: exercises sefaria.search.index_all_of_type for an entity
    type with reindex_index_shard left as the REAL function - unlike every other test in
    this repo, which monkeypatches reindex_index_shard directly and so never exercises
    its dispatch. Before the entity-type dispatch fix, reindex_index_shard's `else` branch
    raises ValueError("Unknown index type: topic") here; the whole test suite was green
    with the bug live because nothing else reaches this composition unmocked."""
    from sefaria import search

    names = {"new": "topic-new", "current": "topic-current", "alias": "topic"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    # Stub the phases on either side of reindex_index_shard so this stays a unit test -
    # reindex_index_shard itself is intentionally left unpatched.
    monkeypatch.setattr(search, "reindex_init", lambda type, debug=False: names)
    monkeypatch.setattr(search, "reindex_finalize", lambda type, debug=False: None)

    index_topics_calls = []
    monkeypatch.setattr(search, "index_topics", lambda index_name: index_topics_calls.append(index_name))

    search.index_all_of_type("topic")

    assert index_topics_calls == ["topic-new"]
