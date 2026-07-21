"""
End-to-end integration tests for the pgvector incremental-update dependency hooks.

Unlike semantic_search_test.py (pure unit tests, everything mocked at the ORM
boundary), these tests drive the *real* event chain:

    Mongo model save/delete/attributeChange
        -> sefaria.model.dependencies subscription
        -> semantic_search.pgvector_dependencies callback
        -> semantic_search.tasks Celery task (run eagerly, in-process)
        -> UPDATE/DELETE against the live `library_chunks` Postgres table

Every test builds a throwaway Index (+ Version, Topic, AuthorTopic, Link,
RefData, RefTopicLink) in Mongo, seeds matching SemanticTextChunk rows in
pgvector with deliberately-stale values, fires one model event, and asserts the
pgvector rows were corrected by the task the hook dispatched.

Requirements to actually run (otherwise the whole module self-skips):
  * A reachable pgvector Postgres with the `library_chunks` table. Connection is
    read from PGVECTOR_* env vars (same defaults as local_settings.py).
  * A Mongo the Sefaria models can write to (the normal test Mongo).

Not covered here: the text+embedding sync path (sync_text_and_embedding /
_reembed_existing_section / _chunk_new_unit), which needs a Gemini API key and
patot. Those are exercised separately in the embed-job container.

Marked `deep` (excluded from `pytest -m "not deep"`) since it requires a live pgvector
Postgres and Mongo, and drives real model saves/deletes rather than mocks.

Run with:  pytest semantic_search/tests/pgvector_dependencies_integration_test.py -v
"""
import os
import uuid

import pytest

from sefaria.model import (
    Index, IndexSet, Version, VersionSet, Ref,
    Link, LinkSet, RefData, RefDataSet,
    Topic, TopicSet, AuthorTopic,
    RefTopicLink, RefTopicLinkSet,
    Term, library,
)

pytestmark = pytest.mark.deep

# A unique per-run tag so parallel/leftover data never collides and cleanup is targeted.
RUN_TAG = uuid.uuid4().hex[:8]
DOC_ID_PREFIX = f"pgv-int-{RUN_TAG}-"
GENERATED_BY = f"pgv_int_test_{RUN_TAG}"
EMBEDDING = [0.0] * 1536


# ---------------------------------------------------------------------------
# Module-level enablement: re-register the vector_db alias (sefaria/conftest.py
# pops it for the rest of the suite), run Celery tasks eagerly, and skip the
# whole module unless the pgvector table is actually reachable.
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def pgvector_available(django_db_blocker):
    from django.conf import settings
    from django.db import connections

    settings.DATABASES["vector_db"] = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("PGVECTOR_DB", "pgvector"),
        "USER": os.environ.get("PGVECTOR_USER", "pgvector"),
        "PASSWORD": os.environ.get("PGVECTOR_PASSWORD", "dTHfOi45xshNohC7qBch3xzZs3KJllC2"),
        "HOST": os.environ.get("PGVECTOR_HOST", "localhost"),
        "PORT": os.environ.get("PGVECTOR_DB_PORT", "5433"),
    }
    # Bust ConnectionHandler's cached view of DATABASES so the re-added alias is live.
    connections.__dict__.pop("settings", None)
    if hasattr(connections, "_settings"):
        connections._settings = settings.DATABASES

    # Confirm the table is reachable; skip cleanly if not (e.g. plain CI box).
    with django_db_blocker.unblock():
        try:
            with connections["vector_db"].cursor() as cur:
                cur.execute("SELECT 1 FROM library_chunks LIMIT 1")
        except Exception as exc:  # noqa: BLE001 - any failure means "not available"
            pytest.skip(f"pgvector library_chunks not reachable: {exc}")

    # Run the tasks the hooks dispatch synchronously, in-process, and let their
    # exceptions surface as test failures instead of being swallowed by a worker.
    from sefaria.celery_setup.app import app
    prev_eager = app.conf.task_always_eager
    prev_propagate = app.conf.task_eager_propagates
    app.conf.task_always_eager = True
    app.conf.task_eager_propagates = True

    # Version renames would otherwise attempt an ES reindex; keep tests off the network.
    from sefaria import settings as sefaria_settings
    prev_search = getattr(sefaria_settings, "SEARCH_INDEX_ON_SAVE", False)
    sefaria_settings.SEARCH_INDEX_ON_SAVE = False

    yield

    app.conf.task_always_eager = prev_eager
    app.conf.task_eager_propagates = prev_propagate
    sefaria_settings.SEARCH_INDEX_ON_SAVE = prev_search


@pytest.fixture(autouse=True)
def _unblock_db(django_db_blocker):
    """Allow ORM access to the (unmanaged) vector_db for the duration of each test."""
    with django_db_blocker.unblock():
        yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chunk(*, doc_id, index_title, ref, chunked_from_ref, version_title, **overrides):
    """Build a SemanticTextChunk row with sensible (often deliberately-stale) defaults."""
    from semantic_search.models import SemanticTextChunk
    fields = dict(
        doc_id=doc_id,
        index_title=index_title,
        ref=ref,
        url=ref.replace(" ", "_").replace(":", "."),
        chunked_from_ref=chunked_from_ref,
        language="en",
        version_title=version_title,
        direction="ltr",
        text="seed text",
        embedding=EMBEDDING,
        primary_category="STALE_PRIMARY",
        all_categories=["STALE_CAT"],
        is_primary=False,
        is_source=True,
        composition_date=None,
        composition_place=None,
        era_name=None,
        pagerank=1.0,
        author_names=["Stale Author"],
        author_slugs=[],
        associated_topic_names=[],
        associated_topic_slugs=[],
        linked_refs=[],
        chunker_metadata={"source_segment_refs": [ref]},
    )
    fields.update(overrides)
    return SemanticTextChunk(**fields)


def _fetch(doc_id):
    from semantic_search.models import SemanticTextChunk
    return SemanticTextChunk.objects.get(doc_id=doc_id)


def _chunks_for_index(index_title):
    from semantic_search.models import SemanticTextChunk
    return list(SemanticTextChunk.objects.filter(index_title=index_title))


def _delete_test_chunks():
    from semantic_search.models import SemanticTextChunk
    SemanticTextChunk.objects.filter(doc_id__startswith=DOC_ID_PREFIX).delete()


# ---------------------------------------------------------------------------
# Seed fixture: a fresh index/version/topics + two pgvector chunks per test.
# ---------------------------------------------------------------------------

class Seed:
    def __init__(self):
        # A fresh per-test tag so every test gets a *distinct* Index title. These tests share one
        # process-wide `library` singleton; reusing a single title across tests leaves the shared
        # TocTree with an orphaned node after the title-change test, so the next test's
        # index.save() blows up in TocTree.update_title -> node.replace (assert parent). Distinct
        # titles per test sidestep that entirely (lookup misses -> a fresh node is added).
        u = uuid.uuid4().hex[:8]
        self.index_title = f"Zzz Pgv Int {u}"
        self.new_index_title = f"Zzz Pgv Renamed {u}"
        self.version_title = "Pgv Int Test Version"
        self.section_ref = f"{self.index_title} 1"
        self.seg1_ref = f"{self.index_title} 1:1"
        self.seg2_ref = f"{self.index_title} 1:2"
        self.author_slug = f"pgv-int-author-{u}"
        self.author_new_slug = f"pgv-int-author-new-{u}"
        self.topic_slug = f"pgv-int-topic-{u}"
        self.topic_new_slug = f"pgv-int-topic-new-{u}"
        self.doc1 = f"{DOC_ID_PREFIX}{u}-1"
        self.doc2 = f"{DOC_ID_PREFIX}{u}-2"


@pytest.fixture
def seed(pgvector_available, _unblock_db):
    from semantic_search.models import SemanticTextChunk

    s = Seed()

    # --- Mongo: author topic, plain topic, index, version ---
    AuthorTopic({
        "slug": s.author_slug,
        "titles": [{"text": "Old Author Name", "primary": True, "lang": "en"}],
    }).save()
    Topic({
        "slug": s.topic_slug,
        "titles": [{"text": "Pgv Int Topic", "primary": True, "lang": "en"}],
    }).save()

    index = Index({
        "title": s.index_title,
        "categories": ["Musar"],
        "authors": [s.author_slug],
        "schema": {
            "titles": [
                {"lang": "en", "text": s.index_title, "primary": True},
                {"lang": "he", "text": s.index_title[::-1], "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "sectionNames": ["Section", "Line"],
            "addressTypes": ["Integer", "Integer"],
            "key": s.index_title,
        },
    })
    index.save()

    version = Version({
        "title": s.index_title,
        "versionTitle": s.version_title,
        "versionSource": "https://www.sefaria.org",
        "language": "en",
        "chapter": [["Text of line one.", "Text of line two."]],
    })
    version.save()

    # --- pgvector: two chunks (one per segment) with stale metadata ---
    chunks = [
        _make_chunk(
            doc_id=s.doc1, index_title=s.index_title, ref=s.seg1_ref,
            chunked_from_ref=s.section_ref, version_title=s.version_title,
            author_slugs=[s.author_slug], author_names=["Old Author Name"],
            associated_topic_slugs=[s.topic_slug], associated_topic_names=["Pgv Int Topic"],
        ),
        _make_chunk(
            doc_id=s.doc2, index_title=s.index_title, ref=s.seg2_ref,
            chunked_from_ref=s.section_ref, version_title=s.version_title,
        ),
    ]
    SemanticTextChunk.objects.bulk_create(chunks)

    try:
        yield s
    finally:
        # pgvector first (independent of Mongo), then Mongo objects.
        _delete_test_chunks()
        LinkSet({"generated_by": GENERATED_BY}).delete()
        RefTopicLinkSet({"toTopic": s.topic_slug}).delete()
        RefDataSet({"ref": {"$regex": "^Zzz Pgv "}}).delete()
        for title in (s.index_title, s.new_index_title):
            existing = Index().load({"title": title})
            if existing:
                existing.delete()
        VersionSet({"versionTitle": s.version_title}).delete()
        for slug in (s.author_slug, s.author_new_slug, s.topic_slug, s.topic_new_slug):
            ts = TopicSet({"slug": slug})
            if ts.count():
                ts.delete()


# ---------------------------------------------------------------------------
# Index events
# ---------------------------------------------------------------------------

class TestIndexHooks:
    def test_index_save_refreshes_metadata(self, seed):
        """Index.save() -> update_index_metadata: category/primary_category corrected."""
        index = library.get_index(seed.index_title)
        index.save()

        for chunk in _chunks_for_index(seed.index_title):
            assert chunk.all_categories == ["Musar"]
            assert chunk.primary_category == "Musar"

    def test_index_title_change_rewrites_refs(self, seed):
        """Index title change -> update_index_title: index_title/ref/url/chunked_from_ref spliced."""
        index = library.get_index(seed.index_title)
        index.title = seed.new_index_title
        index.save()

        chunks = _chunks_for_index(seed.new_index_title)
        assert len(chunks) == 2
        new_prefix = seed.new_index_title.replace(" ", "_")
        for chunk in chunks:
            assert chunk.index_title == seed.new_index_title
            assert chunk.ref.startswith(seed.new_index_title + " ")
            assert chunk.chunked_from_ref.startswith(seed.new_index_title + " ")
            assert chunk.url.startswith(new_prefix + ".")
        # No rows left under the old title.
        assert _chunks_for_index(seed.index_title) == []

    def test_index_delete_removes_chunks(self, seed):
        """Index.delete() -> delete_index_chunks: all chunks for the index removed."""
        assert len(_chunks_for_index(seed.index_title)) == 2
        library.get_index(seed.index_title).delete()
        assert _chunks_for_index(seed.index_title) == []


# ---------------------------------------------------------------------------
# Version events
# ---------------------------------------------------------------------------

class TestVersionHooks:
    def test_version_save_refreshes_attributes(self, seed):
        """Version.save() -> update_version_attributes: is_primary/is_source/direction corrected."""
        version = Version().load({"title": seed.index_title, "versionTitle": seed.version_title})
        version.save()

        for chunk in _chunks_for_index(seed.index_title):
            # en, first version -> isPrimary True, isSource False, direction ltr (Version._normalize)
            assert chunk.is_primary is True
            assert chunk.is_source is False
            assert chunk.direction == "ltr"

    def test_version_title_change_rewrites_version_title(self, seed):
        """versionTitle change -> update_version_title: version_title column rewritten."""
        new_vtitle = "Pgv Int Renamed Version"
        version = Version().load({"title": seed.index_title, "versionTitle": seed.version_title})
        version.versionTitle = new_vtitle
        version.save()

        try:
            for chunk in _chunks_for_index(seed.index_title):
                assert chunk.version_title == new_vtitle
        finally:
            # Rename back so the seed teardown (keyed on the original vtitle) still cleans up.
            v = Version().load({"title": seed.index_title, "versionTitle": new_vtitle})
            if v:
                v.versionTitle = seed.version_title
                v.save()

    def test_version_delete_removes_chunks(self, seed):
        """Version.delete() -> delete_version_chunks: chunks for that version removed."""
        assert len(_chunks_for_index(seed.index_title)) == 2
        version = Version().load({"title": seed.index_title, "versionTitle": seed.version_title})
        version.delete()
        assert _chunks_for_index(seed.index_title) == []


# ---------------------------------------------------------------------------
# Topic events
# ---------------------------------------------------------------------------

class TestTopicHooks:
    def test_topic_slug_change_updates_associated_slugs(self, seed):
        """Topic slug change -> update_topic_slug: associated_topic_slugs array_replace'd."""
        topic = Topic().load({"slug": seed.topic_slug})
        topic.slug = seed.topic_new_slug
        topic.save()

        chunk1 = _fetch(seed.doc1)
        assert seed.topic_new_slug in chunk1.associated_topic_slugs
        assert seed.topic_slug not in chunk1.associated_topic_slugs
        # The chunk that never had the topic is untouched.
        assert _fetch(seed.doc2).associated_topic_slugs == []

    def test_author_topic_save_refreshes_author_names(self, seed):
        """AuthorTopic.save() -> update_author_topic_names: author_names re-pulled from Mongo."""
        author = AuthorTopic().load({"slug": seed.author_slug})
        author.title_group.add_title("New Author Name", "en", primary=True, replace_primary=True)
        author.save()

        chunk1 = _fetch(seed.doc1)  # only doc1 carries this author in author_slugs
        assert chunk1.author_names == ["New Author Name"]

    def test_author_topic_save_without_title_change_is_noop(self, seed):
        """A save that doesn't change the author's primary English title (e.g. the numSources
        bump when a RefTopicLink is added) must NOT enqueue update_author_topic_names."""
        from semantic_search.models import SemanticTextChunk
        # Seed a deliberately-stale value so a stray task run would be observable as a correction.
        SemanticTextChunk.objects.filter(doc_id=seed.doc1).update(author_names=["STALE - keep me"])

        author = AuthorTopic().load({"slug": seed.author_slug})
        author.numSources = getattr(author, "numSources", 0) + 1  # non-title attribute
        author.save()

        # Title never changed, so the stale value is left untouched (task did not fire).
        assert _fetch(seed.doc1).author_names == ["STALE - keep me"]


# ---------------------------------------------------------------------------
# RefTopicLink / Link / RefData events (recomputed via get_chunk_context)
# ---------------------------------------------------------------------------

class TestRefDerivedHooks:
    def test_ref_topic_link_save_updates_associated_topics(self, seed):
        """RefTopicLink.save() -> update_ref_topic_links: chunk containing the ref gains the topic."""
        # Start from a chunk with no associated topics to make the change unambiguous.
        from semantic_search.models import SemanticTextChunk
        SemanticTextChunk.objects.filter(doc_id=seed.doc1).update(
            associated_topic_slugs=[], associated_topic_names=[]
        )

        RefTopicLink({
            "toTopic": seed.topic_slug,
            "ref": seed.seg1_ref,
            "linkType": "about",
            "dataSource": "sefaria",
        }).save()

        chunk1 = _fetch(seed.doc1)
        assert seed.topic_slug in chunk1.associated_topic_slugs
        # Chunk for the *other* segment (no topic link) is untouched.
        assert _fetch(seed.doc2).associated_topic_slugs == []

    def test_link_save_updates_linked_refs(self, seed):
        """Link.save() -> update_ref_links: linked_refs recomputed for the containing chunk."""
        Link({
            "refs": [seed.seg1_ref, "Genesis 1:1"],
            "type": "reference",
            "auto": True,
            "generated_by": GENERATED_BY,
        }).save()

        chunk1 = _fetch(seed.doc1)
        assert "Genesis 1:1" in chunk1.linked_refs
        assert _fetch(seed.doc2).linked_refs == []

    def test_ref_data_save_updates_pagerank(self, seed):
        """RefData.save() -> update_ref_pagerank: pagerank refreshed when the change clears threshold."""
        RefData({"ref": seed.seg1_ref, "pagesheetrank": 100.0}).save()

        chunk1 = _fetch(seed.doc1)
        assert chunk1.pagerank == pytest.approx(100.0)
        # Untouched segment keeps its seeded value.
        assert _fetch(seed.doc2).pagerank == pytest.approx(1.0)

    def test_ref_data_save_below_threshold_is_noop(self, seed):
        """A sub-threshold pagerank change must NOT rewrite the chunk (avoids library-wide churn)."""
        # Seeded pagerank is 1.0; 1.02 is a 2% change, under PAGESHEETRANK_CHANGE_THRESHOLD (0.03).
        RefData({"ref": seed.seg1_ref, "pagesheetrank": 1.02}).save()
        assert _fetch(seed.doc1).pagerank == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Category path change (self-contained: needs its own Term + Category)
# ---------------------------------------------------------------------------

class TestCategoryHook:
    def test_category_path_change_splices_all_categories(self, pgvector_available, _unblock_db):
        """Category path change -> update_category_chunks: all_categories prefix spliced in place."""
        from sefaria.model import Category
        from semantic_search.models import SemanticTextChunk

        leaf = f"Zzz Pgv Cat {RUN_TAG}"
        leaf_renamed = f"Zzz Pgv Cat Renamed {RUN_TAG}"
        old_path = ["Musar", leaf]
        new_path = ["Musar", leaf_renamed]
        doc_id = f"{DOC_ID_PREFIX}cat"

        term = Term()
        term.name = leaf
        term.add_primary_titles(leaf, leaf[::-1])
        term.save()

        # A category renamed through the shared-title path needs a Term for the *new* leaf too:
        # Category.change_key_name looks it up when the primary attribute (path) changes.
        term_renamed = Term()
        term_renamed.name = leaf_renamed
        term_renamed.add_primary_titles(leaf_renamed, leaf_renamed[::-1])
        term_renamed.save()

        cat = Category()
        cat.path = old_path
        cat.add_shared_term(leaf)
        cat.save()
        library.rebuild_toc()

        SemanticTextChunk.objects.bulk_create([
            _make_chunk(
                doc_id=doc_id, index_title=f"Zzz Cat Book {RUN_TAG}",
                ref=f"Zzz Cat Book {RUN_TAG} 1:1", chunked_from_ref=f"Zzz Cat Book {RUN_TAG} 1",
                version_title="v", primary_category="Musar", all_categories=list(old_path),
            )
        ])

        try:
            # Rename the way the Category Editor does: load the old path, then feed a new path +
            # origPath through load_from_dict so _set_derived_attributes -> change_key_name updates
            # lastPath / sharedTitle / path[-1] together and fires the `path` attributeChange the
            # hook listens for. Assigning `.path` directly (and nothing else) trips
            # Category._validate (lastPath / primary title still stale) before the hook can run.
            Category().update(
                {"path": old_path},
                {"path": new_path, "sharedTitle": leaf_renamed, "origPath": old_path},
            )

            chunk = _fetch(doc_id)
            assert chunk.all_categories == new_path
            # Top-level unchanged -> primary_category left alone.
            assert chunk.primary_category == "Musar"
        finally:
            SemanticTextChunk.objects.filter(doc_id=doc_id).delete()
            for p in (new_path, old_path):
                c = Category().load({"path": p})
                if c:
                    c.delete()
            for name in (leaf, leaf_renamed):
                t = Term().load({"name": name})
                if t:
                    t.delete()
            library.rebuild_toc()
