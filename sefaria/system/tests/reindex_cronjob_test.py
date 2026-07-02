"""Unit tests for reindex_elasticsearch_cronjob dispatch behavior."""
import importlib.util
import pathlib
import sys

import pytest

CRONJOB_PATH = pathlib.Path("scripts/scheduled/reindex_elasticsearch_cronjob.py")
spec = importlib.util.spec_from_file_location("reindex_elasticsearch_cronjob", CRONJOB_PATH)
cronjob = importlib.util.module_from_spec(spec)


def load_cronjob():
    spec.loader.exec_module(cronjob)
    return cronjob


def test_shard_mode_exits_nonzero_when_failed_versions_present(monkeypatch):
    mod = load_cronjob()
    monkeypatch.setattr(mod, "check_elasticsearch_connection", lambda: True)
    monkeypatch.setattr(mod, "setup_logging", lambda debug: None)
    monkeypatch.setattr(
        "sefaria.search.reindex_index_shard",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(mod.TextIndexer, "_failed_versions", [{"title": "X"}])
    monkeypatch.setattr(mod.TextIndexer, "_skipped_versions", [])

    with pytest.raises(SystemExit) as exc:
        mod.main(["--mode", "shard", "--shard-index", "0", "--shard-count", "4"])
    assert exc.value.code == 1


def test_shard_mode_exits_zero_when_no_failures(monkeypatch):
    mod = load_cronjob()
    monkeypatch.setattr(mod, "check_elasticsearch_connection", lambda: True)
    monkeypatch.setattr(mod, "setup_logging", lambda debug: None)
    monkeypatch.setattr(
        "sefaria.search.reindex_index_shard",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(mod.TextIndexer, "_failed_versions", [])
    monkeypatch.setattr(mod.TextIndexer, "_skipped_versions", [])

    with pytest.raises(SystemExit) as exc:
        mod.main(["--mode", "shard", "--shard-index", "0", "--shard-count", "4"])
    assert exc.value.code == 0


def test_shard_mode_requires_shard_params(monkeypatch):
    mod = load_cronjob()
    monkeypatch.setattr(mod, "check_elasticsearch_connection", lambda: True)
    monkeypatch.setattr(mod, "setup_logging", lambda debug: None)

    with pytest.raises(SystemExit) as exc:
        mod.main(["--mode", "shard"])
    assert exc.value.code == 1


def test_shard_mode_passes_debug_to_reindex_index_shard(monkeypatch):
    mod = load_cronjob()
    calls = []
    monkeypatch.setattr(mod, "check_elasticsearch_connection", lambda: True)
    monkeypatch.setattr(mod, "setup_logging", lambda debug: None)
    monkeypatch.setattr(
        "sefaria.search.reindex_index_shard",
        lambda t, shard_index=None, shard_count=None, debug=False: calls.append(debug),
    )
    monkeypatch.setattr(mod.TextIndexer, "_failed_versions", [])
    monkeypatch.setattr(mod.TextIndexer, "_skipped_versions", [])

    with pytest.raises(SystemExit):
        mod.main(["--mode", "shard", "--shard-index", "0", "--shard-count", "2", "--debug"])
    assert calls == [True]


def test_monolith_passes_debug_to_index_all(monkeypatch):
    mod = load_cronjob()
    calls = []
    monkeypatch.setattr(mod, "check_elasticsearch_connection", lambda: True)
    monkeypatch.setattr(mod, "setup_logging", lambda debug: None)
    monkeypatch.setattr(mod, "log_index_state", lambda *a, **k: None)
    monkeypatch.setattr(mod, "run_pagesheetrank_update", lambda result: True)
    monkeypatch.setattr(mod, "run_sheets_by_timestamp", lambda ts, result, debug=False: True)
    monkeypatch.setattr(
        "sefaria.search.index_all",
        lambda debug=False, skip=0: calls.append(debug),
    )
    monkeypatch.setattr(mod.TextIndexer, "_failed_versions", [])
    monkeypatch.setattr(mod.TextIndexer, "_skipped_versions", [])

    with pytest.raises(SystemExit):
        mod.main(["--mode", "monolith", "--debug"])
    assert calls == [True]
