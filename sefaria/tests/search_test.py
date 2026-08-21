"""Tests that the ES reindex job survives transient connection failures
instead of aborting the entire multi-hour run."""
import pytest
from elastic_transport import ApiError, ConnectionTimeout

import sefaria.search
from sefaria.search import (
    TextIndexer,
    _authored_index_titles,
    _build_authored_titles_map,
    make_topic_index_document,
)


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
