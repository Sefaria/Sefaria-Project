"""
Tests for the ES cascade hooks added in "chore: cascade changes to ES" —
the model dependency listeners (sefaria/model/dependencies.py) that keep the
`text`, `book` and `topic` search indices in sync on save/rename/delete, and
their single-doc helpers in sefaria/search.py.

Two layers:

* Layer 0 — pure unit tests: no Mongo, no ES. Guards and action-building only.
* Layer 1 — hook integration tests: real model machinery + real Mongo, with a
  dict-backed FakeES swapped in at the ES boundary (same approach as
  sefaria/tests/search_test.py). These exercise the notify wiring, subscription
  ordering, and cascade suppression that the commit relies on.
"""
import pytest
from unittest.mock import MagicMock

from elasticsearch.exceptions import NotFoundError

from django_topics.models import Topic as DjangoTopic, TopicPool, PoolType

import sefaria.model.dependencies as dependencies
import sefaria.search as search_module
from sefaria.model import Index, IndexSet, Version, Ref, TextChunk, VersionState, library
from sefaria.model.category import Category
from sefaria.model.schema import Term
from sefaria.model.topic import Topic, PersonTopic, AuthorTopic, TopicSet
from sefaria.search import TextIndexer, make_text_doc_id
from sefaria.system.exceptions import BookNameError


# --------------------------------------------------------------------------- #
#  Shared scaffolding                                                          #
# --------------------------------------------------------------------------- #

TEXT_INDEX = "text-test"
TOPIC_INDEX = "topic-test"
BOOK_INDEX = "book-test"
FAKE_INDEX_NAMES = {
    t: {"new": f"{t}-test-new", "current": f"{t}-test", "alias": t}
    for t in ("text", "sheet", "topic", "book")
}


class FakeES:
    """Dict-backed stand-in for the Elasticsearch client, keyed (index, id).
    Every call is appended to an ordered log so tests can assert sequencing."""

    def __init__(self):
        self.store = {}             # (index_name, id) -> document
        self.log = []               # ordered ("index"|"delete", index_name, id)
        self.fail_index_ids = set() # ids for which .index() raises

    def index(self, index, document=None, id=None, **kwargs):
        self.log.append(("index", index, id))
        if id in self.fail_index_ids:
            raise Exception(f"FakeES: simulated index failure for id {id}")
        self.store[(index, id)] = document

    def delete(self, index, id, **kwargs):
        self.log.append(("delete", index, id))
        if (index, id) not in self.store:
            raise NotFoundError("document not found", meta=None, body=None)
        del self.store[(index, id)]

    def apply_bulk(self, actions):
        """Applies bulk actions; return shape of elasticsearch.helpers.bulk."""
        actions = list(actions)
        for a in actions:
            self.index(a["_index"], document=a["_source"], id=a["_id"])
        return len(actions), []

    # test helpers
    def ids(self, index_name):
        return {doc_id for (idx, doc_id) in self.store if idx == index_name}

    def get(self, index_name, doc_id):
        return self.store.get((index_name, doc_id))


@pytest.fixture
def fake_es(monkeypatch):
    """Swap the ES boundary for a FakeES: the client, the alias-resolution call
    (the only helper that hits ES just to resolve index names), and the bulk
    helper used by index_book_docs."""
    fake = FakeES()
    monkeypatch.setattr(search_module, "es_client", fake)
    monkeypatch.setattr(
        search_module, "get_new_and_current_index_names",
        lambda type, debug=False: dict(FAKE_INDEX_NAMES[type]),
    )
    monkeypatch.setattr(
        search_module, "bulk",
        lambda client, actions, **kwargs: fake.apply_bulk(actions),
    )
    return fake


@pytest.fixture
def search_on(monkeypatch, fake_es):
    """Turn the cascade hooks on. Works because every hook does
    `from sefaria.settings import SEARCH_INDEX_ON_SAVE` at call time."""
    import sefaria.settings as sefaria_settings
    monkeypatch.setattr(sefaria_settings, "SEARCH_INDEX_ON_SAVE", True, raising=False)
    return fake_es


# --- dedicated test records ------------------------------------------------- #

TEST_BOOK = "Test ES Cascade Book"
TEST_BOOK_RENAMED = "Test ES Cascade Book Renamed"
TEST_VTITLE = "Test ES Cascade Version"
TEST_VTITLE_RENAMED = "Test ES Cascade Version Renamed"
TEST_SEGMENTS = ["First test segment.", "Second test segment.", "Third test segment."]
TEST_AUTHOR_SLUG = "test-es-cascade-author"
TEST_CAT_TERM = "Test ES Cascade Category"
TEST_CAT_TERM_RENAMED = "Test ES Cascade Category Renamed"


def _index_data(title, categories):
    return {
        "title": title,
        "categories": list(categories),
        "schema": {
            "titles": [
                {"lang": "en", "text": title, "primary": True},
                {"lang": "he", "text": "ספר בדיקה " + title[-2:], "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "sectionNames": ["Chapter", "Segment"],
            "addressTypes": ["Integer", "Integer"],
            "key": title,
        },
    }


def _delete_book_records(*titles):
    """Remove test Index records (under any of `titles`) if they exist.
    Called inside the fixtures' monkeypatched context, so any hook that fires
    hits the FakeES, never a real cluster."""
    deleted = False
    for title in titles:
        indx = Index().load({"title": title})
        if indx is not None:
            indx.delete()
            deleted = True
    if deleted:
        # A rename+delete cycle leaves the in-memory TocTree with detached
        # nodes; the next Index save then dies inside TocTree.update_title.
        # Reset it, as category_test.py does after its deletes.
        library.rebuild_toc()


def _delete_topic_records(*slugs):
    for slug in slugs:
        ts = TopicSet({"slug": slug})
        if ts.count() > 0:
            ts.delete()


def _put_in_library_pool(slug):
    """Give `slug` a real `library` TopicPool membership row in the test Postgres DB.

    The Mongo Topic and its pool membership are separate stores: a Topic can exist in
    Mongo without ever being curated into a pool, and that is the ordinary case (~35k of
    ~40k topics). The entity-search hooks index only pool members, so a test that expects
    a doc has to establish membership explicitly. Requires @pytest.mark.django_db."""
    pool, _ = TopicPool.objects.get_or_create(name=PoolType.LIBRARY.value)
    django_topic, _ = DjangoTopic.objects.get_or_create(slug=slug)
    django_topic.pools.add(pool)
    return django_topic


def _make_book(title=TEST_BOOK, categories=("Liturgy",), authors=None):
    data = _index_data(title, categories)
    if authors:
        data["authors"] = list(authors)
    book = Index(data)
    book.save()
    chunk = TextChunk(Ref(f"{title} 1"), "en", TEST_VTITLE)
    chunk.text = list(TEST_SEGMENTS)
    chunk.versionSource = "http://test.example.com"
    chunk.save()
    # A raw TextChunk.save() doesn't refresh VersionState (production flows go
    # through tracker, which does). all_segment_refs() — which the rename hooks
    # iterate — reads the version state, so refresh it explicitly.
    VersionState(title).refresh()
    return book


@pytest.fixture
def test_book(search_on):
    """A dedicated tiny book: depth-2 JaggedArrayNode, one English Version with
    three segments, filed under Liturgy. Created with the hooks live (so its
    book doc lands in FakeES) and removed in teardown while FakeES is still
    patched in."""
    _delete_book_records(TEST_BOOK, TEST_BOOK_RENAMED)
    book = _make_book()
    yield book
    _delete_book_records(TEST_BOOK, TEST_BOOK_RENAMED)


def _segment_doc_ids(title, vtitle=TEST_VTITLE, lang="en"):
    return {
        make_text_doc_id(r.normal(), vtitle, lang)
        for r in library.get_index(title).all_segment_refs()
    }


def _seed_segment_docs(fake, title, vtitle=TEST_VTITLE, lang="en"):
    """Pre-populate FakeES with the book's segment docs, bypassing the log so
    ordering assertions only see hook-driven operations."""
    for r in library.get_index(title).all_segment_refs():
        tref = r.normal()
        doc_id = make_text_doc_id(tref, vtitle, lang)
        fake.store[(TEXT_INDEX, doc_id)] = {"ref": tref, "version": vtitle, "lang": lang}


# --------------------------------------------------------------------------- #
#  Layer 0 — pure unit tests (no Mongo, no ES)                                 #
# --------------------------------------------------------------------------- #

class TestUnitGuards:

    def test_index_book_docs_builds_actions_and_skips_failures(self, monkeypatch):
        """One good record -> exactly one bulk action with the right _id;
        a raising builder and a None builder are skipped without aborting."""
        monkeypatch.setattr(
            search_module, "get_new_and_current_index_names",
            lambda type, debug=False: dict(FAKE_INDEX_NAMES[type]),
        )

        def fake_make(index, author_name_cache=None):
            if index == "bad":
                raise ValueError("boom")
            if index == "empty":
                return None
            return {"title_en": "Good Book"}

        monkeypatch.setattr(search_module, "make_book_index_document", fake_make)
        captured = {}

        def fake_bulk(client, actions, **kwargs):
            captured["actions"] = list(actions)
            return len(captured["actions"]), []

        monkeypatch.setattr(search_module, "bulk", fake_bulk)

        search_module.index_book_docs(["good", "bad", "empty"])

        assert len(captured["actions"]) == 1
        action = captured["actions"][0]
        assert action["_id"] == "Good Book"
        assert action["_index"] == BOOK_INDEX
        assert action["_source"] == {"title_en": "Good Book"}

    def test_index_book_docs_skips_bulk_when_no_actions(self, monkeypatch):
        monkeypatch.setattr(
            search_module, "get_new_and_current_index_names",
            lambda type, debug=False: dict(FAKE_INDEX_NAMES[type]),
        )
        monkeypatch.setattr(search_module, "make_book_index_document",
                            lambda index, author_name_cache=None: None)
        bulk_spy = MagicMock()
        monkeypatch.setattr(search_module, "bulk", bulk_spy)
        search_module.index_book_docs(["a", "b"])
        bulk_spy.assert_not_called()

    def test_index_ref_skips_empty_doc(self, monkeypatch):
        """An empty segment must be a no-op, not an es_client.index(document=False)
        call (which was previously a guaranteed exception)."""
        fake = FakeES()
        monkeypatch.setattr(search_module, "es_client", fake)

        class _FakeIndexRecord:
            categories = ["Liturgy"]
            def best_time_period(self):
                return None

        class _FakeOref:
            index = _FakeIndexRecord()
            def normal(self):
                return "Fake Book 1:1"
            def he_normal(self):
                return "ספר 1:1"

        class _FakeChunk:
            def __init__(self, *args, **kwargs):
                pass
            def ja(self):
                return self
            def flatten_to_string(self):
                return ""

        monkeypatch.setattr(search_module, "TextChunk", _FakeChunk)
        monkeypatch.setattr(TextIndexer, "get_ref_version_list",
                            classmethod(lambda cls, oref: []))
        monkeypatch.setattr(TextIndexer, "make_text_index_document",
                            classmethod(lambda cls, *args, **kwargs: False))

        TextIndexer.index_ref(TEXT_INDEX, _FakeOref(), TEST_VTITLE, "en", None, False)

        assert fake.log == []

    @pytest.mark.parametrize("bad_names", [None, {}, {"current": None}])
    def test_entity_helpers_bail_when_index_name_unresolvable(self, monkeypatch, bad_names):
        monkeypatch.setattr(search_module, "get_new_and_current_index_names",
                            lambda type, debug=False: bad_names)
        fake = FakeES()
        monkeypatch.setattr(search_module, "es_client", fake)
        bulk_spy = MagicMock()
        monkeypatch.setattr(search_module, "bulk", bulk_spy)

        search_module.index_topic_doc(object())
        search_module.delete_topic_doc("some-slug")
        search_module.index_book_doc(object())
        search_module.delete_book_doc("Some Book")
        search_module.index_book_docs([object()])

        assert fake.log == []
        bulk_spy.assert_not_called()

    def test_hooks_noop_when_search_index_on_save_off(self, monkeypatch):
        """Prod default is off: with the flag off, no hook may touch sefaria.search."""
        import sefaria.settings as sefaria_settings
        monkeypatch.setattr(sefaria_settings, "SEARCH_INDEX_ON_SAVE", False, raising=False)

        spied = [
            "index_book_doc", "delete_book_doc", "index_topic_doc",
            "delete_topic_doc", "index_book_docs", "delete_version",
            "get_new_and_current_index_names",
        ]
        spies = {}
        for name in spied:
            spies[name] = MagicMock()
            monkeypatch.setattr(search_module, name, spies[name])

        indx = MagicMock(title="Some Book")
        topic_obj = MagicMock(slug="some-slug")
        ver = MagicMock(title="Some Book", versionTitle="v", language="en")

        dependencies.process_index_save_in_book_search(indx)
        dependencies.process_index_delete_in_book_search(indx)
        dependencies.process_index_title_change_in_book_search(indx, old="A", new="B")
        dependencies.process_topic_save_in_topic_search(topic_obj)
        dependencies.process_topic_delete_in_topic_search(topic_obj)
        dependencies.process_category_path_change_in_book_search(None, old=["A"], new=["B"])
        dependencies.process_index_title_change_in_search(indx, old="A", new="B")
        dependencies.process_version_title_change_in_search(ver, old="v", new="w")

        for name, spy in spies.items():
            spy.assert_not_called()

    def test_category_hook_empty_new_path_guard(self, monkeypatch, search_on):
        """kwargs["new"] == [] must return without querying — an empty path
        prefix would match (and re-upsert) every book in the library."""
        spy = MagicMock()
        monkeypatch.setattr(search_module, "index_book_docs", spy)
        dependencies.process_category_path_change_in_book_search(None, old=["Liturgy"], new=[])
        spy.assert_not_called()


# --------------------------------------------------------------------------- #
#  Layer 1 — hook integration tests (real Mongo, fake ES)                      #
# --------------------------------------------------------------------------- #

class TestBookHooks:

    def test_book_save_and_delete(self, django_db_setup, django_db_blocker, search_on):
        """T2: creating an Index upserts its book doc (id = English title);
        deleting the Index removes it. Includes author_names denormalization."""
        fake = search_on
        with django_db_blocker.unblock():
            _delete_book_records(TEST_BOOK, TEST_BOOK_RENAMED)
            _delete_topic_records(TEST_AUTHOR_SLUG)
            author = AuthorTopic({
                "slug": TEST_AUTHOR_SLUG,
                "titles": [{"text": "Test ES Cascade Author", "primary": True, "lang": "en"}],
            })
            author.save()
            try:
                book = _make_book(authors=[author.slug])
                try:
                    doc = fake.get(BOOK_INDEX, TEST_BOOK)
                    assert doc is not None
                    assert doc["title_en"] == TEST_BOOK
                    assert doc["categories"] == ["Liturgy"]
                    assert doc["path"] == f"Liturgy/{TEST_BOOK}"
                    assert doc["authors"] == [author.slug]
                    assert "Test ES Cascade Author" in doc["author_names"]
                finally:
                    _delete_book_records(TEST_BOOK)
                assert fake.get(BOOK_INDEX, TEST_BOOK) is None
            finally:
                _delete_book_records(TEST_BOOK)
                author.delete()

    @pytest.mark.deep
    def test_book_rename_cascades_to_text_and_book_docs(self, search_on, test_book):
        """T1 (flagship): renaming an Index
        - deletes every old-title segment doc and indexes new-title ones for the
          version's versionTitle/language (delete_version(old_title=...) rewrite,
          and implicitly the subscription-order contract with
          process_index_title_change_in_versions — VersionSet({"title": new})
          must find the renamed versions);
        - swaps the book doc to the new id with the right path;
        - orders the book-doc delete before the book-doc upsert
          (attributeChange hooks fire before the save hook)."""
        fake = search_on
        old_ids = _segment_doc_ids(TEST_BOOK)
        _seed_segment_docs(fake, TEST_BOOK)
        assert old_ids <= fake.ids(TEXT_INDEX)

        indx = Index().load({"title": TEST_BOOK})
        indx.title = TEST_BOOK_RENAMED
        indx.save()

        # Old-title segment docs deleted, new-title docs indexed, same version/lang
        new_ids = _segment_doc_ids(TEST_BOOK_RENAMED)
        assert len(new_ids) == len(TEST_SEGMENTS)
        text_ids = fake.ids(TEXT_INDEX)
        assert not (text_ids & old_ids), "stale old-title segment docs remain"
        assert new_ids <= text_ids, "new-title segment docs missing"

        # Book doc moved to the new id with correct denormalized path
        assert fake.get(BOOK_INDEX, TEST_BOOK) is None
        new_doc = fake.get(BOOK_INDEX, TEST_BOOK_RENAMED)
        assert new_doc is not None
        assert new_doc["path"] == f"Liturgy/{TEST_BOOK_RENAMED}"

        # Ordering: stale book-doc delete precedes the new book-doc upsert
        delete_pos = max(i for i, op in enumerate(fake.log)
                         if op == ("delete", BOOK_INDEX, TEST_BOOK))
        index_pos = max(i for i, op in enumerate(fake.log)
                        if op == ("index", BOOK_INDEX, TEST_BOOK_RENAMED))
        assert delete_pos < index_pos

    def test_version_rename_reindexes_segments(self, search_on, test_book):
        """T6 (regression guard): the delete_text/delete_text_by_ref_string
        refactor didn't change the pre-existing 3-arg delete_version path."""
        fake = search_on
        old_ids = _segment_doc_ids(TEST_BOOK, vtitle=TEST_VTITLE)
        assert len(old_ids) == len(TEST_SEGMENTS)  # guard against passing vacuously
        _seed_segment_docs(fake, TEST_BOOK, vtitle=TEST_VTITLE)

        ver = Version().load({"title": TEST_BOOK, "versionTitle": TEST_VTITLE, "language": "en"})
        assert ver is not None
        ver.versionTitle = TEST_VTITLE_RENAMED
        ver.save()

        new_ids = _segment_doc_ids(TEST_BOOK, vtitle=TEST_VTITLE_RENAMED)
        text_ids = fake.ids(TEXT_INDEX)
        assert not (text_ids & old_ids), "stale old-versionTitle docs remain"
        assert new_ids <= text_ids, "new-versionTitle docs missing"

    def test_segment_failure_does_not_abort_rename(self, search_on, test_book, monkeypatch):
        """T7a: best-effort semantics. One segment failing to index mid-rename
        must not abort the rename; the other segments index and the failure is
        logged (per-segment warning + summary error)."""
        fake = search_on
        _seed_segment_docs(fake, TEST_BOOK, vtitle=TEST_VTITLE)
        logger_spy = MagicMock()
        monkeypatch.setattr(dependencies, "logger", logger_spy)

        segment_refs = [r.normal() for r in library.get_index(TEST_BOOK).all_segment_refs()]
        failing_ref = segment_refs[1]
        fake.fail_index_ids.add(make_text_doc_id(failing_ref, TEST_VTITLE_RENAMED, "en"))

        ver = Version().load({"title": TEST_BOOK, "versionTitle": TEST_VTITLE, "language": "en"})
        ver.versionTitle = TEST_VTITLE_RENAMED
        ver.save()  # must not raise

        text_ids = fake.ids(TEXT_INDEX)
        for tref in segment_refs:
            doc_id = make_text_doc_id(tref, TEST_VTITLE_RENAMED, "en")
            if tref == failing_ref:
                assert doc_id not in text_ids
            else:
                assert doc_id in text_ids, f"segment {tref} should have indexed despite the failure"

        assert logger_spy.warning.called
        summary_calls = [c for c in logger_spy.error.call_args_list
                         if c.kwargs.get("failed_count") == 1]
        assert summary_calls, "expected a summary error naming the one failed segment"
        assert failing_ref in [ref for ref in summary_calls[0].kwargs["failed_refs"]]


@pytest.mark.django_db
class TestTopicHooks:

    @pytest.mark.parametrize("klass, expected_subtype", [
        (Topic, "topic"),
        (PersonTopic, "topic"),
        (AuthorTopic, "author"),
    ])
    def test_topic_save_and_delete(self, search_on, klass, expected_subtype):
        """T3: save -> doc present (id = slug, correct subtype); delete -> gone.
        Parametrized over all three concrete classes to pin the exact-type
        dispatch fix: notify() dispatches on type(inst), so each subclass needs
        its own subscription — consolidating them would silently stop syncing
        authors."""
        fake = search_on
        slug = f"test-es-cascade-{klass.__name__.lower()}"
        _delete_topic_records(slug)
        _put_in_library_pool(slug)
        t = klass({
            "slug": slug,
            "titles": [{"text": f"Test ES Cascade {klass.__name__}", "primary": True, "lang": "en"}],
        })
        try:
            t.save()
            doc = fake.get(TOPIC_INDEX, t.slug)
            assert doc is not None
            assert doc["slug"] == t.slug
            assert doc["subtype"] == expected_subtype
        finally:
            t.delete()
        assert fake.get(TOPIC_INDEX, t.slug) is None

    def test_topic_delete_with_no_es_doc_is_absorbed(self, search_on):
        """T7b: deleting a topic that never made it into ES must absorb the
        NotFoundError (logged warning), not raise into the model delete flow."""
        fake = search_on
        slug = "test-es-cascade-missing-doc"
        _delete_topic_records(slug)
        _put_in_library_pool(slug)
        t = Topic({
            "slug": slug,
            "titles": [{"text": "Test ES Cascade Missing Doc", "primary": True, "lang": "en"}],
        })
        t.save()
        fake.store.clear()  # simulate: doc never indexed

        t.delete()  # must not raise

        assert ("delete", TOPIC_INDEX, t.slug) in fake.log
        assert TopicSet({"slug": slug}).count() == 0

    def test_topic_outside_library_pool_is_never_indexed(self, search_on):
        """Saving one of the ~35k uncurated topics must not publish it to live entity
        search. The full rebuild indexes only `library` pool members, so a save hook that
        upserts unconditionally leaks non-members into public results until the next
        weekly rebuild removes them again."""
        fake = search_on
        slug = "test-es-cascade-unpooled"
        _delete_topic_records(slug)
        # deliberately NOT added to the library pool
        t = Topic({
            "slug": slug,
            "titles": [{"text": "Test ES Cascade Unpooled", "primary": True, "lang": "en"}],
        })
        try:
            t.save()
            assert fake.get(TOPIC_INDEX, slug) is None
            assert ("index", TOPIC_INDEX, slug) not in fake.log
        finally:
            t.delete()

    def test_topic_dropped_from_library_pool_is_evicted_on_next_save(self, search_on):
        """Pool membership can be revoked after a topic was indexed. The save hook is the
        only thing that notices before the weekly rebuild, so a non-member save must
        delete the stale doc rather than merely skip it."""
        fake = search_on
        slug = "test-es-cascade-depooled"
        _delete_topic_records(slug)
        django_topic = _put_in_library_pool(slug)
        t = Topic({
            "slug": slug,
            "titles": [{"text": "Test ES Cascade Depooled", "primary": True, "lang": "en"}],
        })
        try:
            t.save()
            assert fake.get(TOPIC_INDEX, slug) is not None, "precondition: indexed while pooled"

            django_topic.pools.clear()  # curator removes it from the library pool
            t.save()

            assert fake.get(TOPIC_INDEX, slug) is None
            assert ("delete", TOPIC_INDEX, slug) in fake.log
        finally:
            t.delete()

    def test_pool_lookup_failure_leaves_the_doc_untouched(self, search_on, monkeypatch):
        """If the pool lookup itself fails (Postgres unreachable), neither publishing nor
        deleting is safe — both would act on a guess. The doc must be left exactly as it
        was for the rebuild to reconcile, and the model save must not raise."""
        fake = search_on
        slug = "test-es-cascade-pool-lookup-down"
        _delete_topic_records(slug)
        _put_in_library_pool(slug)
        real_lookup = search_module.is_library_pool_topic  # bound before try: the finally needs it
        t = Topic({
            "slug": slug,
            "titles": [{"text": "Test ES Cascade Pool Lookup Down", "primary": True, "lang": "en"}],
        })
        try:
            t.save()
            existing = fake.get(TOPIC_INDEX, slug)
            assert existing is not None, "precondition: indexed while the lookup worked"
            fake.log.clear()

            def boom(_slug):
                raise Exception("simulated Postgres outage")
            monkeypatch.setattr(search_module, "is_library_pool_topic", boom)

            t.save()  # must not raise

            assert fake.get(TOPIC_INDEX, slug) == existing
            assert fake.log == []
        finally:
            # Restore by re-patching, not monkeypatch.undo(): `monkeypatch` is one
            # instance per test, shared with the fake_es fixture, so undo() would also
            # rip out the FakeES and send the cleanup delete to a real cluster.
            monkeypatch.setattr(search_module, "is_library_pool_topic", real_lookup)
            t.delete()


class TestCategoryHooks:

    def test_category_path_change_reindexes_books(self, search_on, monkeypatch):
        """T5: renaming a category re-upserts its books' docs with the new
        categories/path — via the category hook ALONE. The cascaded Index saves
        use override_dependencies=True, so the per-Index save hook must never
        fire; the category hook exists precisely because it is those books'
        only path back into the `book` index."""
        fake = search_on
        book_title = "Test ES Cascade Categorized Book"

        terms = []
        for name in (TEST_CAT_TERM, TEST_CAT_TERM_RENAMED):
            if not Term().load({"name": name}):
                term = Term()
                term.name = name
                term.add_primary_titles(name, name[::-1])
                term.save()
                terms.append(term)

        cat = Category()
        cat.path = [TEST_CAT_TERM]
        cat.add_shared_term(TEST_CAT_TERM)
        try:
            cat.save()
            _delete_book_records(book_title)
            _make_book(title=book_title, categories=[TEST_CAT_TERM])
            assert fake.get(BOOK_INDEX, book_title)["categories"] == [TEST_CAT_TERM]

            save_hook_spy = MagicMock()
            monkeypatch.setattr(search_module, "index_book_doc", save_hook_spy)

            # pkeys_orig_values["path"] aliases self.path (a _set_pkeys reference,
            # not a copy), and change_key_name mutates path in place — which would
            # make save() see old == new and skip every path-change cascade. Rebind
            # path to a copy first, mirroring how the Category Editor's
            # tracker.update replaces the list outright.
            cat.path = list(cat.path)
            cat.change_key_name(TEST_CAT_TERM_RENAMED)
            cat.save()

            doc = fake.get(BOOK_INDEX, book_title)
            assert doc["categories"] == [TEST_CAT_TERM_RENAMED]
            assert doc["path"] == f"{TEST_CAT_TERM_RENAMED}/{book_title}"
            # The fix came from the category hook alone
            save_hook_spy.assert_not_called()
        finally:
            _delete_book_records(book_title)
            for path in ([TEST_CAT_TERM_RENAMED], [TEST_CAT_TERM]):
                leftover = Category().load({"path": path})
                if leftover:
                    leftover.delete()
            library.rebuild_toc()
            for term in terms:
                term.delete()

