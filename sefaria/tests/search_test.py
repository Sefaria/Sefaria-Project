"""Tests that the ES reindex job survives transient connection failures
instead of aborting the entire multi-hour run."""
import pytest
from elastic_transport import ApiError, ConnectionTimeout

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

    TextIndexer._failed_versions = []
    TextIndexer._skipped_versions = []
    TextIndexer._bulk_actions = []

    # Stub heavyweight setup so we only exercise the per-book flush loop
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

    def fake_index_version(cls, version, tries=0, action=None):
        cls._bulk_actions.append({"_op_type": "index", "_id": version.title})
    monkeypatch.setattr(
        TextIndexer, "index_version",
        classmethod(fake_index_version),
    )

    # BookA flush succeeds, BookB raises ConnectionTimeout, BookC should still flush
    bulk_calls = []

    def flaky_bulk(es_client, actions, **kwargs):
        actions = list(actions)
        bulk_calls.append([a["_id"] for a in actions])
        if len(bulk_calls) == 2:
            raise ConnectionTimeout("Connection timed out")
        return (len(actions), [])
    monkeypatch.setattr("sefaria.search.bulk", flaky_bulk)

    TextIndexer.index_all(index_name="text-b", debug=False, for_es=True)

    assert TextIndexer._bulk_actions == []
    assert len(bulk_calls) == 3
    assert bulk_calls[0] == ["BookA"]
    assert bulk_calls[2] == ["BookC"]

    assert len(TextIndexer._failed_versions) == 1
    fail = TextIndexer._failed_versions[0]
    assert fail["title"] == "BookB"
    assert fail["error_type"] == "ConnectionTimeout"


@pytest.mark.parametrize("bad_exc", [
    TypeError("programming bug"),
    ApiError("400 mapping_parser_exception", meta=None, body=None),
])
def test_flush_propagates_non_connection_errors(monkeypatch, bad_exc):
    """Programming errors and ES API errors must NOT be silently absorbed."""
    TextIndexer._failed_versions = []
    TextIndexer._bulk_actions = [{"_op_type": "index", "_id": "x"}]

    def boom(*args, **kwargs):
        raise bad_exc
    monkeypatch.setattr("sefaria.search.bulk", boom)

    versions = [_FakeVersion("BookA", "v1", "en")]
    with pytest.raises(type(bad_exc)):
        TextIndexer._flush_bulk_actions(versions)

    assert TextIndexer._failed_versions == []


def test_flush_passes_retry_kwargs(monkeypatch):
    from sefaria import search
    captured = {}
    def fake_bulk(client, actions, **kwargs):
        captured.update(kwargs)
        return (len(actions), [])
    monkeypatch.setattr(search, "bulk", fake_bulk)
    search.TextIndexer._bulk_actions = [{"_id": "x"}]
    search.TextIndexer._flush_bulk_actions([])
    assert captured["max_retries"] == 3
    assert captured["initial_backoff"] == 2
    assert captured["max_backoff"] == 60


def test_index_sheet_indexes_legacy_sheet_without_summary(monkeypatch):
    """Legacy sheets missing summary/dates must still index; only owner is required."""
    from sefaria import search
    from unittest.mock import MagicMock

    legacy_sheet = {"id": 7, "owner": 42, "title": "Old Sheet", "sources": []}

    # db.sheets returns a new Collection object on every access, so we must
    # replace search.db entirely with a mock rather than patching db.sheets.find_one.
    mock_db = MagicMock()
    mock_db.sheets.find_one.return_value = legacy_sheet
    monkeypatch.setattr(search, "db", mock_db)

    monkeypatch.setattr(search, "public_user_data",
                        lambda uid: {"name": "A", "imageUrl": "", "profileUrl": ""})
    monkeypatch.setattr(search, "user_link", lambda uid: "<a>A</a>")
    monkeypatch.setattr(search, "make_sheet_topics", lambda s: [])
    monkeypatch.setattr(search, "CollectionSet", lambda q: [])

    created = {}
    monkeypatch.setattr(search.es_client, "create",
                        lambda index, id, body: created.update({"id": id, "body": body}))

    result = search.index_sheet("sheet-a", 7)
    assert result is True
    assert created["id"] == 7
    assert created["body"]["summary"] is None  # legacy null is fine for ES


def test_index_sheet_returns_false_without_owner(monkeypatch):
    """A sheet with no owner must return False — owner is the only hard requirement."""
    from sefaria import search
    from unittest.mock import MagicMock

    ownerless_sheet = {"id": 99, "title": "No Owner Sheet", "sources": []}
    mock_db = MagicMock()
    mock_db.sheets.find_one.return_value = ownerless_sheet
    monkeypatch.setattr(search, "db", mock_db)

    result = search.index_sheet("sheet-a", 99)
    assert result is False
