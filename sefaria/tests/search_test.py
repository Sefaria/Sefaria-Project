"""
Regression test for sc-43948.

Bug: a single `elastic_transport.ConnectionTimeout` mid-run was abandoning
the entire ~6h Elasticsearch full-reindex job — every book queued after
the timeout was skipped, and the prior books that DID flush successfully
weren't aliased to the live index.

This test drives `TextIndexer.index_all` with three books, makes the second
book's bulk flush raise `ConnectionTimeout`, and asserts that:
  * the third book is still flushed (run did not abort)
  * only the failed book is recorded in `_failed_versions`
  * the failure is attributed to `ConnectionTimeout`
"""
from elastic_transport import ConnectionTimeout

from sefaria.search import TextIndexer


class _FakeIndex:
    def __init__(self, title):
        self.title = title

    def best_time_period(self):
        class _TP:
            start = 0
        return _TP()


class _FakeVersion:
    def __init__(self, title, vt, lang):
        self.title = title
        self.versionTitle = vt
        self.language = lang
        self._index = _FakeIndex(title)

    def get_index(self):
        return self._index


def test_index_all_continues_past_bulk_connection_timeout(monkeypatch):
    book_a = _FakeVersion("BookA", "v1", "en")
    book_b = _FakeVersion("BookB", "v1", "en")
    book_c = _FakeVersion("BookC", "v1", "en")
    all_versions = [book_a, book_b, book_c]

    # Reset class-level state that index_all relies on.
    TextIndexer._failed_versions = []
    TextIndexer._skipped_versions = []
    TextIndexer._bulk_actions = []

    # Stub out the heavyweight setup: priority map, terms dict, Ref cache,
    # and the version source. We just want to exercise the per-book loop.
    monkeypatch.setattr(
        TextIndexer, "create_version_priority_map",
        classmethod(lambda cls: None),
    )
    monkeypatch.setattr(
        TextIndexer, "create_terms_dict",
        classmethod(lambda cls: None),
    )
    monkeypatch.setattr(
        TextIndexer, "get_all_versions",
        classmethod(lambda cls: list(all_versions)),
    )
    TextIndexer.version_priority_map = {
        (v.title, v.versionTitle, v.language): (i, None)
        for i, v in enumerate(all_versions)
    }
    monkeypatch.setattr(
        TextIndexer, "excluded_from_search",
        classmethod(lambda cls, v: False),
    )
    monkeypatch.setattr("sefaria.search.Ref.clear_cache", lambda: None)

    # `index_version` normally builds a doc and appends to `_bulk_actions`.
    # For the test, just append a marker so `bulk()` has something to flush.
    def fake_index_version(cls, version, tries=0, action=None):
        cls._bulk_actions.append({"_op_type": "index", "_id": version.title})
    monkeypatch.setattr(
        TextIndexer, "index_version",
        classmethod(fake_index_version),
    )

    # Flaky bulk: succeed for BookA, fail for BookB (the regression case),
    # succeed for BookC. If the fix is wrong, BookC never gets flushed.
    bulk_calls = []

    def flaky_bulk(es_client, actions, **kwargs):
        actions = list(actions)
        bulk_calls.append([a["_id"] for a in actions])
        if len(bulk_calls) == 2:
            raise ConnectionTimeout("Connection timed out")
        return (len(actions), [])
    monkeypatch.setattr("sefaria.search.bulk", flaky_bulk)

    # Act — must not raise.
    TextIndexer.index_all(index_name="text-b", debug=False, for_es=True)

    # Assert — the run continued past the timeout.
    assert len(bulk_calls) == 3, (
        f"expected 3 bulk flushes (one per book) but got {len(bulk_calls)}; "
        f"the timeout in book 2 aborted the rest of the run"
    )
    assert bulk_calls[0] == ["BookA"]
    assert bulk_calls[2] == ["BookC"], "BookC must still flush after BookB's timeout"

    # Only BookB's version should be in the failed list, attributed to
    # ConnectionTimeout — not BookA (succeeded) or BookC (succeeded after).
    assert len(TextIndexer._failed_versions) == 1
    fail = TextIndexer._failed_versions[0]
    assert fail["title"] == "BookB"
    assert fail["error_type"] == "ConnectionTimeout"
    assert "Bulk write failed:" in fail["error"]
