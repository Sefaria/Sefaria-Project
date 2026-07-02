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
