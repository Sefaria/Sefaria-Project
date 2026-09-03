"""Tests that the ES reindex job survives transient connection failures
instead of aborting the entire multi-hour run."""
import types

import pytest
from elastic_transport import ApiError, ConnectionTimeout
from elasticsearch.exceptions import ApiError as ESApiError

import sefaria.search
from sefaria.search import (
    TextIndexer,
    _authored_index_titles,
    _build_authored_titles_map,
    make_topic_index_document,
)


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

    # After a hang/OOM postmortem, cls._current_title must name the last title touched -
    # here that's BookC, the last title the loop reached before index_all returned.
    assert TextIndexer._current_title == "BookC"


def test_mark_progress_updates_title_and_timestamp():
    """cls._mark_progress is what both the title loop and _flush_bulk_actions call to
    prove forward progress to the heartbeat thread."""
    TextIndexer._current_title = None
    TextIndexer._last_progress_monotonic = None

    TextIndexer._mark_progress("SomeBook")
    assert TextIndexer._current_title == "SomeBook"
    first_ts = TextIndexer._last_progress_monotonic
    assert first_ts is not None

    # Calling again without a title updates the timestamp but not the title - this is
    # exactly what _flush_bulk_actions does, since it doesn't know a "title" per se.
    TextIndexer._mark_progress()
    assert TextIndexer._current_title == "SomeBook"
    assert TextIndexer._last_progress_monotonic >= first_ts


def test_heartbeat_loop_warns_when_no_progress_between_polls(monkeypatch, caplog):
    """A wedged shard must SAY SO: if cls._last_progress_monotonic hasn't advanced
    between heartbeat polls, the heartbeat thread logs a WARNING naming the stuck title."""
    import logging as _logging
    from sefaria import search

    TextIndexer._current_title = "StuckBook"
    TextIndexer._last_progress_monotonic = 100.0

    # Drive the heartbeat loop directly (not via threading.Thread) for a deterministic test.
    # stop_event.wait is monkeypatched to return False exactly once (one heartbeat tick),
    # then True to end the loop.
    calls = iter([False, True])
    fake_stop_event = types.SimpleNamespace(wait=lambda timeout: next(calls))

    with caplog.at_level(_logging.WARNING, logger="sefaria.search"):
        TextIndexer._heartbeat_loop(fake_stop_event, shard_index=5, shard_count=8)

    warnings = [r for r in caplog.records if r.levelno == _logging.WARNING]
    assert len(warnings) == 1
    assert "StuckBook" in warnings[0].message
    assert "Shard 5/8" in warnings[0].message


def test_heartbeat_loop_silent_when_progress_advances(monkeypatch, caplog):
    """No WARNING when _mark_progress keeps advancing between polls - the happy path
    must stay quiet."""
    import logging as _logging

    TextIndexer._current_title = "MovingBook"
    TextIndexer._last_progress_monotonic = 100.0

    ticks = iter([False, True])

    def fake_wait(timeout):
        result = next(ticks)
        if not result:
            # Simulate progress happening during the heartbeat interval.
            TextIndexer._mark_progress("NextBook")
        return result

    fake_stop_event = types.SimpleNamespace(wait=fake_wait)

    with caplog.at_level(_logging.WARNING, logger="sefaria.search"):
        TextIndexer._heartbeat_loop(fake_stop_event, shard_index=None, shard_count=None)

    warnings = [r for r in caplog.records if r.levelno == _logging.WARNING]
    assert warnings == []


class _FakeAuthoredIndex:
    """An Index as seen by the authored_titles denormalization: primary titles + EN variants."""
    def __init__(self, title_en, title_he=None, variants_en=None, authors=None):
        self._title_en = title_en
        self._title_he = title_he
        self._variants_en = variants_en or []

        class _TG:
            def all_titles(_self, lang):
                if lang == "en":
                    return [self._title_en] + self._variants_en
                if lang == "he":
                    return [self._title_he] if self._title_he else []
                return []

        class _Nodes:
            title_group = _TG()

        self.nodes = _Nodes()
        if authors is not None:
            self.authors = authors

    def get_title(self, lang="en"):
        return self._title_he if lang == "he" else self._title_en

def test_authored_index_titles_include_english_variants():
    """An author must be findable by every title its book is findable by — incl. variants."""
    index = _FakeAuthoredIndex(
        "Guide for the Perplexed", "מורה נבוכים",
        variants_en=["Moreh Nevukhim", "The Guide to the Perplexed"],
    )
    en, he = _authored_index_titles(index)
    assert en == ["Guide for the Perplexed", "Moreh Nevukhim", "The Guide to the Perplexed"]
    assert he == ["מורה נבוכים"]


def test_authored_index_titles_missing_hebrew():
    en, he = _authored_index_titles(_FakeAuthoredIndex("Some Book"))
    assert en == ["Some Book"]
    assert he == []


def test_build_authored_titles_map_collects_variants_per_author(monkeypatch):
    indexes = [
        _FakeAuthoredIndex("Guide for the Perplexed", "מורה נבוכים",
                           variants_en=["Moreh Nevukhim"], authors=["rambam"]),
        _FakeAuthoredIndex("Mishneh Torah", "משנה תורה",
                           variants_en=["Yad HaChazakah"], authors=["rambam"]),
        _FakeAuthoredIndex("Unattributed Book"),  # no authors -> ignored
    ]
    monkeypatch.setattr(sefaria.search, "IndexSet", lambda *a, **k: iter(indexes))

    titles_map = _build_authored_titles_map()

    assert titles_map["rambam"]["en"] == [
        "Guide for the Perplexed", "Moreh Nevukhim", "Mishneh Torah", "Yad HaChazakah",
    ]
    assert titles_map["rambam"]["he"] == ["מורה נבוכים", "משנה תורה"]
    assert list(titles_map.keys()) == ["rambam"]


class _FakeAuthorTopic:
    slug = "rambam"
    subclass = "author"
    description = {"en": "", "he": ""}
    # numSources is deliberately still set here even though the builder no longer reads it:
    # it lets test_make_topic_index_document_omits_num_sources prove the omission is real
    # rather than an artifact of the fixture not having the attribute.
    numSources = 100

    def get_primary_title(self, lang):
        return "רמב\"ם" if lang == "he" else "Rambam"

    def get_titles(self, lang, with_disambiguation=False):
        return ["Rambam", "Maimonides"]

    def get_property(self, key):
        return {"era": "RI", "birthYear": 1138, "deathYear": 1204}.get(key)


def test_make_topic_index_document_authored_titles_include_variants(monkeypatch):
    """The per-topic fallback path (no precomputed map) must carry book title variants too."""
    indexes = [
        _FakeAuthoredIndex("Guide for the Perplexed", "מורה נבוכים",
                           variants_en=["Moreh Nevukhim", "Guide for the Perplexed"]),
    ]
    monkeypatch.setattr(sefaria.search, "IndexSet", lambda *a, **k: iter(indexes))

    doc = make_topic_index_document(_FakeAuthorTopic())

    # variants included, primary first, duplicate variant de-duped
    assert doc["authored_titles_en"] == ["Guide for the Perplexed", "Moreh Nevukhim"]
    assert doc["authored_titles_he"] == ["מורה נבוכים"]


def test_make_topic_index_document_authored_titles_from_map():
    titles_map = {"rambam": {"en": ["Mishneh Torah", "Yad HaChazakah", "Mishneh Torah"],
                             "he": ["משנה תורה"]}}
    doc = make_topic_index_document(_FakeAuthorTopic(), titles_map)
    assert doc["authored_titles_en"] == ["Mishneh Torah", "Yad HaChazakah"]
    assert doc["authored_titles_he"] == ["משנה תורה"]


def test_make_topic_index_document_omits_num_sources():
    """
    numSources is no longer indexed. The topic it is built from *does* carry the attribute
    (see _FakeAuthorTopic), so this asserts a deliberate omission, not a missing input.

    It backed the popularity function_score on relevance, which was never specced and was
    removed; nothing else in the entity pipeline reads it. Re-adding it means editing both
    put_topic_mapping and make_topic_index_document, plus a reindex.
    """
    doc = make_topic_index_document(_FakeAuthorTopic(), {"rambam": {"en": [], "he": []}})
    assert "numSources" not in doc


class _FakeYearAuthorTopic(_FakeAuthorTopic):
    """_FakeAuthorTopic with its year properties swapped out per test case."""

    def __init__(self, **properties):
        self._properties = properties

    def get_property(self, key):
        return self._properties.get(key)


class _FakePlainTopic:
    """A non-author topic: no year properties, so no sortYear."""
    slug = "prayer"
    subclass = "topic"
    description = {"en": "", "he": ""}

    def get_primary_title(self, lang):
        return "תפילה" if lang == "he" else "Prayer"

    def get_titles(self, lang, with_disambiguation=False):
        return ["Prayer"]

    def get_property(self, key):
        return None


@pytest.mark.parametrize("properties, expected", [
    # the ordinary case: a death year wins outright
    ({"birthYear": 1138, "deathYear": 1204}, 1204),
    # the bug this field exists to fix — a birth-year-only author used to sort on a missing
    # deathYear and land in the undated tail, even though their card displays 1138
    ({"birthYear": 1138}, 1138),
    ({"deathYear": 1204}, 1204),
    # years are free-form Topic properties, so numeric strings must coerce...
    ({"birthYear": "1138", "deathYear": "1204"}, 1204),
    # ...and unusable values must fall through to the next candidate rather than poison the sort
    ({"birthYear": 1138, "deathYear": ""}, 1138),
    ({"birthYear": 1138, "deathYear": "c. 1204"}, 1138),
    # BCE years are negative and year 0 is a real value: both must survive a truthiness-free check
    ({"deathYear": -50}, -50),
    ({"deathYear": 0}, 0),
])
def test_make_topic_index_document_sort_year(properties, expected):
    """
    sortYear is the single derived year the chronological sort keys on: deathYear, falling
    back to birthYear. The arch doc specced this fallback but the ES sort was a bare
    deathYear field sort, so it only ever happened client-side (and only within one page of
    hits). Deriving it at index time makes the server sort agree with the displayed year.
    """
    doc = make_topic_index_document(_FakeYearAuthorTopic(**properties),
                                    {"rambam": {"en": [], "he": []}})
    assert doc["sortYear"] == expected


@pytest.mark.parametrize("properties", [{}, {"birthYear": None, "deathYear": ""}])
def test_make_topic_index_document_omits_unusable_sort_year(properties):
    """
    An author with no usable year gets no sortYear key at all (_without_none drops it),
    rather than a null or a 0 that would sort as year zero. Such authors then trail via the
    sort clause's `missing: "_last"`, in both directions.
    """
    doc = make_topic_index_document(_FakeYearAuthorTopic(**properties),
                                    {"rambam": {"en": [], "he": []}})
    assert "sortYear" not in doc


@pytest.mark.parametrize("properties, expected", [
    # already ints: passed through untouched
    ({"birthYear": 1138, "deathYear": 1204}, {"birthYear": 1138, "deathYear": 1204}),
    # numeric strings coerce to the ints the `integer` mapping expects
    ({"birthYear": "1138", "deathYear": "1204"}, {"birthYear": 1138, "deathYear": 1204}),
    # unusable values are dropped entirely rather than sent as-is
    ({"birthYear": 1138, "deathYear": ""}, {"birthYear": 1138}),
    ({"birthYear": "c. 1138", "deathYear": "c. 1204"}, {}),
    # BCE years are negative and year 0 is real: neither may be dropped as falsy
    ({"birthYear": -100, "deathYear": 0}, {"birthYear": -100, "deathYear": 0}),
])
def test_make_topic_index_document_coerces_display_years(properties, expected):
    """
    birthYear/deathYear are mapped as `integer` (put_topic_mapping) but come from free-form
    Topic properties, so a value like '' or 'c. 1204' used to be indexed raw. ES rejects the
    *entire document* on a type mismatch, which silently dropped those authors from the
    index. They must be coerced like sortYear, and omitted when unparseable.
    """
    doc = make_topic_index_document(_FakeYearAuthorTopic(**properties),
                                    {"rambam": {"en": [], "he": []}})
    for field in ("birthYear", "deathYear"):
        if field in expected:
            assert doc[field] == expected[field]
        else:
            assert field not in doc


def test_make_topic_index_document_no_sort_year_on_plain_topics():
    """Only authors carry years; topics have no year sort at all (see ENTITY_SORTS)."""
    doc = make_topic_index_document(_FakePlainTopic())
    assert "sortYear" not in doc


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


def test_reindex_index_shard_dispatches_each_entity_type(monkeypatch):
    """reindex_index_shard must route each entity type to its own indexer function,
    the same dispatch that already exists (and is correct) in
    index_all_of_type_by_index_name - this is the seam where the phased reindex
    composition never learned about the entity types added on master."""
    from sefaria import search

    def names_for(entity_type):
        return {"new": f"{entity_type}-new", "current": f"{entity_type}-current", "alias": entity_type}

    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names_for(type))

    calls = {}
    monkeypatch.setattr(search, "index_topics", lambda index_name: calls.setdefault("topic", []).append(index_name))
    monkeypatch.setattr(search, "index_books", lambda index_name: calls.setdefault("book", []).append(index_name))
    monkeypatch.setattr(search, "index_categories", lambda index_name: calls.setdefault("category", []).append(index_name))

    for entity_type in ("topic", "book", "category"):
        search.reindex_index_shard(entity_type)

    assert calls == {
        "topic": ["topic-new"],
        "book": ["book-new"],
        "category": ["category-new"],
    }


def test_reindex_index_shard_entity_types_only_run_on_shard_zero(monkeypatch):
    """Entity corpora are small and indexed single-shot (D1) - under a sharded
    invocation only shard 0 should do the work, so N pods don't each rebuild the
    whole corpus (D2)."""
    from sefaria import search

    names = {"new": "topic-new", "current": "topic-current", "alias": "topic"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)
    calls = []
    monkeypatch.setattr(search, "index_topics", lambda index_name: calls.append(index_name))

    search.reindex_index_shard("topic", shard_index=3, shard_count=8)
    assert calls == [], "a non-zero shard index must skip entity indexing entirely"

    search.reindex_index_shard("topic", shard_index=0, shard_count=8)
    search.reindex_index_shard("topic", shard_index=None, shard_count=None)
    assert calls == ["topic-new", "topic-new"], "shard 0 and no-shard invocations must both index"


def test_index_all_of_type_composes_phases_for_entity_types(monkeypatch):
    """index_all_of_type must compose init -> shard -> finalize for an entity type in
    order, same as it already does for text/sheet, and must not raise."""
    from sefaria import search

    call_order = []
    monkeypatch.setattr(search, "reindex_init", lambda t, debug=False: call_order.append(("init", t)))
    monkeypatch.setattr(search, "reindex_index_shard", lambda t, debug=False: call_order.append(("shard", t)))
    monkeypatch.setattr(search, "reindex_finalize", lambda t, debug=False: call_order.append(("finalize", t)))

    search.index_all_of_type("topic")

    assert call_order == [("init", "topic"), ("shard", "topic"), ("finalize", "topic")]


def test_index_entities_attempts_all_types_then_raises(monkeypatch):
    """index_entities must keep its per-type isolation (a failure on one type does not
    stop the others from being attempted) but must raise a summary once all types have
    been attempted, naming the type(s) that failed (D3) - so a stale entity index is
    never silently reported as a successful reindex."""
    from sefaria import search

    calls = []

    def fake_index_all_of_type(entity_type, skip=0, debug=False):
        calls.append(entity_type)
        if entity_type == "book":
            raise RuntimeError("boom")

    monkeypatch.setattr(search, "index_all_of_type", fake_index_all_of_type)

    with pytest.raises(RuntimeError, match="book"):
        search.index_entities()

    assert calls == ["topic", "book", "category"], "all types must be attempted even though book fails"


def test_reindex_index_shard_still_rejects_unknown_type(monkeypatch):
    """Regression guard: a genuinely unknown type must still fail loudly."""
    from sefaria import search

    names = {"new": "bogus-new", "current": "bogus-current", "alias": "bogus"}
    monkeypatch.setattr(search, "get_new_and_current_index_names", lambda type, debug=False: names)

    with pytest.raises(ValueError, match="Unknown index type"):
        search.reindex_index_shard("bogus")


class TestSharedIndexGuardCoversEntities:
    """The shared-alias guard must cover topic/book/category, not just text/sheet.

    Entity indexes became reachable from a cauldron reindex once the orchestrator
    started rebuilding them (run_reindex_entities). Unlike text/sheet, they are not
    isolated per environment unless ISOLATE_SEARCH_INDEXES is on, so a cauldron with
    its own text/sheet names can still point at the shared entity aliases. Since
    reindex_finalize's alias swap does a wildcard `remove`, an unguarded entity
    reindex on the shared dev cluster would strip those aliases from every cauldron.
    """

    @pytest.mark.parametrize("alias", ["text", "sheet", "topic", "book", "category"])
    def test_rejects_every_shared_alias(self, alias, monkeypatch):
        from sefaria import search
        monkeypatch.delenv("REINDEX_ALLOW_SHARED_INDEX", raising=False)
        with pytest.raises(ValueError, match="shared default index"):
            search._assert_not_shared_index(alias, alias)

    @pytest.mark.parametrize("alias", ["text-mycauldron", "esreindexv2_text", "topic-mycauldron"])
    def test_allows_isolated_names(self, alias, monkeypatch):
        from sefaria import search
        monkeypatch.delenv("REINDEX_ALLOW_SHARED_INDEX", raising=False)
        search._assert_not_shared_index(alias, "text")  # must not raise

    @pytest.mark.parametrize("alias", ["text", "topic", "category"])
    def test_explicit_opt_in_still_permits_prod(self, alias, monkeypatch):
        """prod/preprod legitimately swap the shared aliases via allowSharedIndex: true."""
        from sefaria import search
        monkeypatch.setenv("REINDEX_ALLOW_SHARED_INDEX", "true")
        search._assert_not_shared_index(alias, alias)  # must not raise
