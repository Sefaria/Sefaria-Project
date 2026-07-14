"""Tests that the ES reindex job survives transient connection failures
instead of aborting the entire multi-hour run."""
import types

import pytest
from elastic_transport import ApiError, ConnectionTimeout
from elasticsearch.exceptions import ApiError as ESApiError

from sefaria.search import TextIndexer


def _make_es_api_error(status, message="es_rejected_execution_exception"):
    """Build a real elasticsearch.exceptions.ApiError with a given HTTP status,
    matching what elasticsearch's client actually raises on a whole-request rejection."""
    return ESApiError(message, meta=types.SimpleNamespace(status=status), body=None)


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


def test_flush_passes_bounded_max_chunk_bytes(monkeypatch):
    """A whole-request 429 happens because N parallel shards can each send up to the
    default 100MB chunk; the fix is to always cap max_chunk_bytes on the bulk() call."""
    from sefaria import search
    captured = {}

    def fake_bulk(client, actions, **kwargs):
        captured.update(kwargs)
        return (len(actions), [])
    monkeypatch.setattr(search, "bulk", fake_bulk)
    search.TextIndexer._bulk_actions = [{"_id": "x"}]
    search.TextIndexer._flush_bulk_actions([])
    assert "max_chunk_bytes" in captured
    assert captured["max_chunk_bytes"] == search.REINDEX_BULK_MAX_CHUNK_BYTES
    assert captured["max_chunk_bytes"] < 100 * 1024 * 1024


def test_flush_retries_and_succeeds_after_whole_request_429(monkeypatch):
    """A whole-request 429 (es_rejected_execution_exception) is raised by client.bulk()
    itself, not returned as a per-item failure inside a 200 response, so elasticsearch.helpers.bulk's
    own item-level retries never see it. _flush_bulk_actions must retry the same request itself."""
    from sefaria import search

    TextIndexer._bulk_actions = [{"_op_type": "index", "_id": "x"}]
    sleep_calls = []
    monkeypatch.setattr(search.pytime, "sleep", lambda s: sleep_calls.append(s))

    calls = []

    def flaky_bulk(client, actions, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise _make_es_api_error(429)
        return (len(list(actions)), [])
    monkeypatch.setattr(search, "bulk", flaky_bulk)

    result = TextIndexer._flush_bulk_actions([])

    assert result == 0
    assert len(calls) == 2
    assert TextIndexer._bulk_actions == []
    assert sleep_calls == [search.BULK_429_INITIAL_BACKOFF_SECONDS]


def test_flush_gives_up_after_429_retry_budget_exhausted(monkeypatch):
    """When ES keeps rejecting with 429 past the retry budget, the shard must fail loudly
    rather than silently dropping the batch or looping forever."""
    from sefaria import search

    TextIndexer._bulk_actions = [{"_op_type": "index", "_id": "x"}]
    monkeypatch.setattr(search.pytime, "sleep", lambda s: None)

    calls = []

    def always_429(client, actions, **kwargs):
        calls.append(1)
        raise _make_es_api_error(429)
    monkeypatch.setattr(search, "bulk", always_429)

    with pytest.raises(ESApiError):
        TextIndexer._flush_bulk_actions([])

    assert len(calls) == search.BULK_429_MAX_RETRIES + 1


def test_flush_propagates_non_429_api_error_without_retrying(monkeypatch):
    """A non-429 ApiError (a real mapping/query bug, say) must propagate on the first
    attempt - retrying it would just waste time on a request that can never succeed."""
    from sefaria import search

    TextIndexer._bulk_actions = [{"_op_type": "index", "_id": "x"}]
    sleep_calls = []
    monkeypatch.setattr(search.pytime, "sleep", lambda s: sleep_calls.append(s))

    calls = []

    def bad_request(client, actions, **kwargs):
        calls.append(1)
        raise _make_es_api_error(400, "mapping_parser_exception")
    monkeypatch.setattr(search, "bulk", bad_request)

    with pytest.raises(ESApiError):
        TextIndexer._flush_bulk_actions([])

    assert len(calls) == 1
    assert sleep_calls == []


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


def test_bulk_load_settings_disable_refresh_and_replicas(monkeypatch):
    from sefaria import search
    calls = {}
    monkeypatch.setattr(search.index_client, "put_settings",
                        lambda index, body: calls.update({"settings": body, "index": index}))
    search.set_index_bulk_load_settings("text-a")
    assert calls["settings"]["index"]["refresh_interval"] == "-1"
    assert calls["settings"]["index"]["number_of_replicas"] == 0


def test_shard_selection_is_deterministic_partition():
    from sefaria.search import TextIndexer
    # 20 fake groups with varied sizes; keys are (title, lang)
    vbi = {(f"Book{i}", "en"): list(range(i % 5 + 1)) for i in range(20)}
    N = 4
    shards = [TextIndexer._select_shard_groups(vbi, i, N) for i in range(N)]
    # 1. Partition: every group appears in exactly one shard, no loss, no dup
    seen = {}
    for s in shards:
        for k in s:
            assert k not in seen
            seen[k] = True
    assert set(seen) == set(vbi)
    # 2. Determinism: same call -> same result
    assert TextIndexer._select_shard_groups(vbi, 1, N) == shards[1]
    # 3. Balance: shard group-counts differ by at most 1
    counts = [len(s) for s in shards]
    assert max(counts) - min(counts) <= 1


def test_index_all_calls_select_shard_keys_when_sharding(monkeypatch):
    """When shard_index/shard_count are passed, index_all must select this shard's keys
    from metadata only (_select_shard_keys), not load the whole corpus first."""
    from sefaria.search import TextIndexer

    book_a = _FakeVersion("BookA", "v1", "en")
    all_versions = [book_a]

    TextIndexer._failed_versions = []
    TextIndexer._skipped_versions = []
    TextIndexer._bulk_actions = []

    monkeypatch.setattr(TextIndexer, "create_version_priority_map", classmethod(lambda cls: None))
    monkeypatch.setattr(TextIndexer, "create_terms_dict", classmethod(lambda cls: None))
    TextIndexer.version_priority_map = {
        (v.title, v.versionTitle, v.language): (i, None)
        for i, v in enumerate(all_versions)
    }
    monkeypatch.setattr(TextIndexer, "excluded_from_search", classmethod(lambda cls, v: False))
    monkeypatch.setattr("sefaria.search.Ref.clear_cache", lambda: None)

    # Stub _index_size_map so it doesn't call Mongo
    monkeypatch.setattr(TextIndexer, "_index_size_map", classmethod(lambda cls: {}))

    # Stub the metadata-only projection query so no real Mongo access happens
    monkeypatch.setattr(
        "sefaria.search.db.texts.find",
        lambda *a, **kw: [{"title": "BookA", "versionTitle": "v1", "language": "en"}],
    )

    get_all_versions_calls = []

    def fake_get_all_versions(cls, tries=0, versions=None, page=0, query=None):
        get_all_versions_calls.append(query)
        return list(all_versions)

    monkeypatch.setattr(TextIndexer, "get_all_versions", classmethod(fake_get_all_versions))

    # Capture calls to _select_shard_keys and return empty so the loop is a no-op
    shard_calls = []

    def fake_select(cls, keys, shard_index, shard_count, size_map=None):
        shard_calls.append({"shard_index": shard_index, "shard_count": shard_count})
        return set()

    monkeypatch.setattr(TextIndexer, "_select_shard_keys", classmethod(fake_select))
    monkeypatch.setattr("sefaria.search.bulk", lambda *a, **kw: (0, []))

    TextIndexer.index_all(index_name="text-b", debug=False, for_es=True, shard_index=0, shard_count=4)

    assert len(shard_calls) == 1
    assert shard_calls[0]["shard_index"] == 0
    assert shard_calls[0]["shard_count"] == 4
    # get_all_versions must be called with a title filter, not unfiltered - this is the
    # whole point of the fix: a shard must never load versions outside its own titles.
    assert len(get_all_versions_calls) == 1
    assert get_all_versions_calls[0] is not None
    assert "title" in get_all_versions_calls[0]


def test_select_shard_keys_partitions_disjoint_and_covering():
    """The bare-key snake selector must be a disjoint, covering partition across shards,
    same guarantee as _select_shard_groups, since a shard's title set is now computed
    from bare (title, lang) keys before any Version is loaded."""
    from sefaria.search import TextIndexer

    keys = {(f"Book{i}", "en") for i in range(23)}
    for N in [1, 2, 3, 4, 7]:
        shards = [TextIndexer._select_shard_keys(keys, i, N) for i in range(N)]
        seen = set()
        for s in shards:
            for k in s:
                assert k not in seen, f"key {k} assigned to more than one shard"
                seen.add(k)
        assert seen == keys


def test_select_shard_keys_agrees_with_select_shard_groups():
    """Regression guard: the refactor that extracted _snake_assign must not change the
    partition. Selecting from bare keys must yield the exact same assignment as
    selecting from a versions_by_index dict built from those same keys, given the
    same size_map."""
    from sefaria.search import TextIndexer

    vbi = {(f"Book{i}", "en"): list(range(i % 5 + 1)) for i in range(20)}
    keys = set(vbi.keys())
    size_map = {f"Book{i}": (5_000_000 if i < 3 else 10_000) for i in range(20)}
    N = 4

    for shard_index in range(N):
        from_groups = set(TextIndexer._select_shard_groups(vbi, shard_index, N, size_map).keys())
        from_keys = TextIndexer._select_shard_keys(keys, shard_index, N, size_map)
        assert from_groups == from_keys


@pytest.mark.parametrize("N", [1, 2, 3, 4, 7])
def test_shard_selection_partitions_disjoint_and_covering(N):
    """Every (title, lang) group must be assigned to exactly one shard, for any shard count."""
    from sefaria.search import TextIndexer
    vbi = {(f"Book{i}", "en"): list(range(i % 5 + 1)) for i in range(23)}
    shards = [TextIndexer._select_shard_groups(vbi, i, N) for i in range(N)]

    seen = {}
    for s in shards:
        for k in s:
            assert k not in seen, f"key {k} assigned to more than one shard"
            seen[k] = True
    assert set(seen) == set(vbi)


def test_shard_selection_balances_by_weight_not_just_count():
    """With realistic non-uniform weights, the snake distribution must keep per-shard
    total WEIGHT roughly even - this is the property that silently broke when
    _index_size_map raised AttributeError on every call and fed uniform weights in."""
    from sefaria.search import TextIndexer
    # A few huge titles alongside many small ones, mimicking real corpus skew.
    vbi = {(f"Book{i}", "en"): [i] for i in range(40)}
    size_map = {f"Book{i}": (5_000_000 if i < 4 else 10_000) for i in range(40)}
    N = 4

    shards = [TextIndexer._select_shard_groups(vbi, i, N, size_map) for i in range(N)]
    totals = [sum(size_map[k[0]] for k in s) for s in shards]

    assert min(totals) > 0
    ratio = max(totals) / min(totals)
    assert ratio < 2.0, f"shard weight totals too unbalanced: {totals}"


def test_shard_selection_falls_back_to_uniform_weights_without_raising(caplog):
    """An empty/failed size map must not raise - it should fall back to uniform
    weighting (by group size) and just warn."""
    from sefaria.search import TextIndexer
    vbi = {(f"Book{i}", "en"): list(range(i % 3 + 1)) for i in range(10)}
    N = 3

    result = TextIndexer._select_shard_groups(vbi, 0, N, size_map={})
    assert isinstance(result, dict)

    all_selected = {}
    for i in range(N):
        all_selected.update(TextIndexer._select_shard_groups(vbi, i, N, size_map={}))
    assert set(all_selected) == set(vbi)

    # Also confirm None is handled the same as {}
    result_none = TextIndexer._select_shard_groups(vbi, 0, N, size_map=None)
    assert result_none == result


def test_reindex_finalize_sanity_gate(monkeypatch):
    """reindex_finalize must raise ValueError with 'sanity' when new index has too few docs."""
    from sefaria import search

    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)

    counts = {"text-new": 500, "text-current": 1000}
    monkeypatch.setattr(search, "_index_doc_count", lambda name: counts.get(name, 0))

    put_alias_calls = []
    update_alias_calls = []
    monkeypatch.setattr(search.index_client, "put_alias",
                        lambda index, name: put_alias_calls.append((index, name)))
    monkeypatch.setattr(search.index_client, "update_aliases",
                        lambda body: update_alias_calls.append(body))

    with pytest.raises(ValueError, match="sanity"):
        search.reindex_finalize("text", min_doc_ratio=0.9)

    assert put_alias_calls == [], "put_alias must NOT be called when the sanity gate fails"
    assert update_alias_calls == [], "update_aliases must NOT be called when the sanity gate fails"


def test_reindex_finalize_fails_closed_on_unreadable_current(monkeypatch):
    """reindex_finalize must raise ValueError with 'sanity' when current index count cannot be read (None)."""
    from sefaria import search

    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)

    # current index returns None (transient read error); new index is healthy
    def fake_doc_count(name):
        if name == "text-current":
            return None  # unreadable
        return 900  # new index has plenty of docs

    monkeypatch.setattr(search, "_index_doc_count", fake_doc_count)

    put_alias_calls = []
    update_alias_calls = []
    monkeypatch.setattr(search.index_client, "put_alias",
                        lambda index, name: put_alias_calls.append((index, name)))
    monkeypatch.setattr(search.index_client, "update_aliases",
                        lambda body: update_alias_calls.append(body))

    with pytest.raises(ValueError, match="sanity"):
        search.reindex_finalize("text", min_doc_ratio=0.9)

    assert put_alias_calls == [], "put_alias must NOT be called when current count is unreadable"
    assert update_alias_calls == [], "update_aliases must NOT be called when current count is unreadable"


def test_restore_index_settings_refreshes_after_put(monkeypatch):
    """restore_index_settings must call put_settings with replicas key then refresh."""
    from sefaria import search

    put_settings_calls = []
    refresh_calls = []

    monkeypatch.setattr(search.index_client, "put_settings",
                        lambda index, body: put_settings_calls.append({"index": index, "body": body}))
    monkeypatch.setattr(search.index_client, "refresh",
                        lambda index: refresh_calls.append(index))

    search.restore_index_settings("text-a")

    assert len(put_settings_calls) == 1, "put_settings should be called exactly once"
    assert "number_of_replicas" in put_settings_calls[0]["body"]["index"]
    assert len(refresh_calls) == 1
    assert refresh_calls[0] == "text-a"


def test_reindex_finalize_success_calls_update_aliases_atomically(monkeypatch):
    from sefaria import search

    monkeypatch.setenv("REINDEX_ALLOW_SHARED_INDEX", "true")
    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 1000)
    monkeypatch.setattr(search.index_client, "exists", lambda index: False)
    monkeypatch.setattr(search, "clear_index", lambda name: None)

    update_alias_calls = []
    monkeypatch.setattr(search.index_client, "update_aliases",
                        lambda body: update_alias_calls.append(body))

    search.reindex_finalize("text", min_doc_ratio=0.9)

    assert len(update_alias_calls) == 1
    actions = update_alias_calls[0]["actions"]
    assert {"remove": {"index": "*", "alias": "text", "must_exist": False}} in actions
    assert {"add": {"index": "text-new", "alias": "text"}} in actions


def test_reindex_finalize_does_not_call_delete_alias(monkeypatch):
    """reindex_finalize must NOT call index_client.delete_alias (Finding 1: atomic swap removes outage window)."""
    from sefaria import search

    monkeypatch.setenv("REINDEX_ALLOW_SHARED_INDEX", "true")
    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 1000)
    monkeypatch.setattr(search.index_client, "exists", lambda index: False)
    monkeypatch.setattr(search, "clear_index", lambda name: None)
    monkeypatch.setattr(search.index_client, "update_aliases", lambda body: None)

    def fail_if_called(*args, **kwargs):
        pytest.fail("index_client.delete_alias must not be called by reindex_finalize")

    monkeypatch.setattr(search.index_client, "delete_alias", fail_if_called)

    # Must not raise AssertionError
    search.reindex_finalize("text", min_doc_ratio=0.9)


def test_reindex_finalize_empty_first_run_raises_value_error(monkeypatch):
    """When both new and current doc counts are 0 (first run with empty new index), refuse alias swap."""
    from sefaria import search

    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 0)

    update_alias_calls = []
    monkeypatch.setattr(search.index_client, "update_aliases",
                        lambda body: update_alias_calls.append(body))

    with pytest.raises(ValueError, match="empty"):
        search.reindex_finalize("text", min_doc_ratio=0.9)

    assert update_alias_calls == [], "update_aliases must NOT be called when both counts are zero"


def test_reindex_finalize_refuses_shared_alias_without_opt_in(monkeypatch):
    """reindex_finalize must raise ValueError when the alias is the shared default "text" and
    REINDEX_ALLOW_SHARED_INDEX is unset (guards against wildcard-stripping the alias from every
    index on a shared dev Elasticsearch cluster)."""
    from sefaria import search

    monkeypatch.delenv("REINDEX_ALLOW_SHARED_INDEX", raising=False)
    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 1000)

    update_alias_calls = []
    monkeypatch.setattr(search.index_client, "update_aliases",
                        lambda body: update_alias_calls.append(body))

    with pytest.raises(ValueError, match="shared"):
        search.reindex_finalize("text", min_doc_ratio=0.9)

    assert update_alias_calls == [], "update_aliases must NOT be called when the shared alias guard trips"


def test_reindex_finalize_proceeds_for_isolated_alias_without_opt_in(monkeypatch):
    """reindex_finalize must proceed past the shared-alias guard for an isolated (non-default)
    alias even when REINDEX_ALLOW_SHARED_INDEX is unset."""
    from sefaria import search

    monkeypatch.delenv("REINDEX_ALLOW_SHARED_INDEX", raising=False)
    names = {"new": "text-somecauldron-new", "current": "text-somecauldron-current", "alias": "text-somecauldron"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 1000)
    monkeypatch.setattr(search.index_client, "exists", lambda index: False)
    monkeypatch.setattr(search, "clear_index", lambda name: None)

    update_alias_calls = []
    monkeypatch.setattr(search.index_client, "update_aliases",
                        lambda body: update_alias_calls.append(body))

    search.reindex_finalize("text", min_doc_ratio=0.9)

    assert len(update_alias_calls) == 1


def test_reindex_finalize_proceeds_for_shared_alias_with_opt_in(monkeypatch):
    """reindex_finalize must proceed past the shared-alias guard when the alias is "text" and
    REINDEX_ALLOW_SHARED_INDEX=true (prod/preprod intentional opt-in)."""
    from sefaria import search

    monkeypatch.setenv("REINDEX_ALLOW_SHARED_INDEX", "true")
    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search, "restore_index_settings", lambda *a, **k: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 1000)
    monkeypatch.setattr(search.index_client, "exists", lambda index: False)
    monkeypatch.setattr(search, "clear_index", lambda name: None)

    update_alias_calls = []
    monkeypatch.setattr(search.index_client, "update_aliases",
                        lambda body: update_alias_calls.append(body))

    search.reindex_finalize("text", min_doc_ratio=0.9)

    assert len(update_alias_calls) == 1


def test_reindex_init_reuses_in_progress_index_with_docs(monkeypatch):
    from sefaria import search

    monkeypatch.setenv("REINDEX_ALLOW_SHARED_INDEX", "true")
    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search.index_client, "exists", lambda index: index == "text-new")

    create_calls = []
    bulk_setting_calls = []

    monkeypatch.setattr(search, "_index_doc_count", lambda name: 500)
    monkeypatch.setattr(search, "create_index",
                        lambda index_name, type, force=False: create_calls.append((index_name, force)))
    monkeypatch.setattr(search, "set_index_bulk_load_settings",
                        lambda index_name: bulk_setting_calls.append(index_name))

    search.reindex_init("text", debug=False)

    assert create_calls == []
    assert bulk_setting_calls == ["text-new"]


def test_reindex_init_creates_fresh_index_when_missing(monkeypatch):
    from sefaria import search

    monkeypatch.setenv("REINDEX_ALLOW_SHARED_INDEX", "true")
    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search.index_client, "exists", lambda index: False)

    create_calls = []
    monkeypatch.setattr(search, "create_index",
                        lambda index_name, type, force=False: create_calls.append((index_name, force)))
    monkeypatch.setattr(search, "set_index_bulk_load_settings", lambda index_name: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 0)

    search.reindex_init("text", debug=False)

    assert create_calls == [("text-new", False)]


def test_reindex_init_refuses_shared_alias_without_opt_in(monkeypatch):
    """reindex_init must raise ValueError and MUST NOT create/clear any index when the alias is
    the shared default "text" and REINDEX_ALLOW_SHARED_INDEX is unset. This is the fast-fail path:
    without it, a misconfigured cauldron would clear a shared prod-named index before the guard in
    reindex_finalize ever runs (hours later, after data is already destroyed)."""
    from sefaria import search

    monkeypatch.delenv("REINDEX_ALLOW_SHARED_INDEX", raising=False)
    names = {"new": "text-new", "current": "text-current", "alias": "text"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search.index_client, "exists", lambda index: False)

    create_calls = []
    monkeypatch.setattr(search, "create_index",
                        lambda index_name, type, force=False: create_calls.append((index_name, force)))
    monkeypatch.setattr(search, "set_index_bulk_load_settings", lambda index_name: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 0)

    with pytest.raises(ValueError, match="shared"):
        search.reindex_init("text", debug=False)

    assert create_calls == [], "create_index must NOT be called when the shared alias guard trips"


def test_reindex_init_proceeds_for_isolated_alias_without_opt_in(monkeypatch):
    """reindex_init must proceed past the shared-alias guard for an isolated (non-default) alias
    even when REINDEX_ALLOW_SHARED_INDEX is unset, and for a debug alias (e.g. "text-debug"),
    which is not a shared default and must still be allowed through."""
    from sefaria import search

    monkeypatch.delenv("REINDEX_ALLOW_SHARED_INDEX", raising=False)
    names = {"new": "text-debug-new", "current": "text-debug-current", "alias": "text-debug"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    monkeypatch.setattr(search.index_client, "exists", lambda index: False)

    create_calls = []
    monkeypatch.setattr(search, "create_index",
                        lambda index_name, type, force=False: create_calls.append((index_name, force)))
    monkeypatch.setattr(search, "set_index_bulk_load_settings", lambda index_name: None)
    monkeypatch.setattr(search, "_index_doc_count", lambda name: 0)

    search.reindex_init("text", debug=True)

    assert create_calls == [("text-debug-new", False)]
