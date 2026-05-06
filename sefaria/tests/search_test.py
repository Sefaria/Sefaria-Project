"""
Resilience tests for the Elasticsearch bulk flush path used by the weekly
full-reindex cronjob (sc-43948).

Background: a single `elastic_transport.ConnectionTimeout` mid-run was
abandoning ~5+ hours of indexing work because `helpers.bulk(...)` was
called bare and the exception propagated out of `TextIndexer.index_all`.
"""
from elastic_transport import ConnectionTimeout

from sefaria.search import TextIndexer


class _FakeVersion:
    def __init__(self, title, vt, lang):
        self.title = title
        self.versionTitle = vt
        self.language = lang


def _reset_indexer_state():
    TextIndexer._failed_versions = []
    TextIndexer._bulk_actions = [
        {"_op_type": "index", "_index": "text-b", "_id": "x"}
    ]


def test_flush_bulk_actions_records_failure_on_connection_timeout(monkeypatch):
    _reset_indexer_state()

    def boom(*args, **kwargs):
        raise ConnectionTimeout("Connection timed out")

    monkeypatch.setattr("sefaria.search.bulk", boom)

    versions = [_FakeVersion("Genesis", "JPS", "en"),
                _FakeVersion("Genesis", "Koren", "en")]

    n_failed = TextIndexer._flush_bulk_actions(versions)

    assert n_failed == 2, "every in-flight version must be re-classified as failed"
    assert len(TextIndexer._failed_versions) == 2
    assert {f["title"] for f in TextIndexer._failed_versions} == {"Genesis"}
    assert TextIndexer._failed_versions[0]["error_type"] == "ConnectionTimeout"
    assert "Bulk write failed:" in TextIndexer._failed_versions[0]["error"]
    assert TextIndexer._bulk_actions == [], "buffer must be cleared after failure"


def test_flush_bulk_actions_returns_zero_on_success(monkeypatch):
    _reset_indexer_state()
    monkeypatch.setattr("sefaria.search.bulk", lambda *a, **kw: (1, []))

    versions = [_FakeVersion("Genesis", "JPS", "en")]
    n_failed = TextIndexer._flush_bulk_actions(versions)

    assert n_failed == 0
    assert TextIndexer._failed_versions == []


def test_flush_bulk_actions_noop_when_no_actions(monkeypatch):
    TextIndexer._failed_versions = []
    TextIndexer._bulk_actions = []

    called = {"n": 0}

    def fake_bulk(*a, **kw):
        called["n"] += 1
        return (0, [])

    monkeypatch.setattr("sefaria.search.bulk", fake_bulk)

    n_failed = TextIndexer._flush_bulk_actions([_FakeVersion("X", "y", "en")])

    assert n_failed == 0
    assert called["n"] == 0, "should not invoke bulk() when there is nothing to flush"
