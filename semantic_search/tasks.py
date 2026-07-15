"""
Celery tasks for incremental pgvector updates.

Each task re-fetches the affected Sefaria object(s), recomputes the changed
fields using the same helpers used during bulk indexing, and issues a targeted
SQL UPDATE so that only the stale columns are touched.

New-section chunking (requires patot) is attempted when patot is importable
(i.e. when running in the embed-job container); otherwise a warning is logged
and the section will be indexed on the next bulk run.
"""
import logging

import structlog

from sefaria.celery_setup.app import app
from sefaria.model import (
    Index, IndexSet, Version, VersionSet, Ref, RefDataSet, RefData, Topic, CategorySet,
)
from sefaria.helper.vector.context import get_index_context, get_chunk_context, get_chunking_unit_ref
from semantic_search.embedder import GeminiEmbedder
from semantic_search.models import SemanticTextChunk

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Index-level tasks
# ---------------------------------------------------------------------------

@app.task(name="semantic_search.update_index_metadata")
def update_index_metadata(index_title: str) -> None:
    index = Index().load({"title": index_title})
    if not index:
        logger.warning("semantic_search.update_index_metadata: index not found", index_title=index_title)
        return
    fields = get_index_context(index)
    count = SemanticTextChunk.objects.update_index_metadata(index_title, fields)
    logger.info("semantic_search.update_index_metadata: updated", index_title=index_title, rows=count)


@app.task(name="semantic_search.update_index_title")
def update_index_title(old_title: str, new_title: str) -> None:
    count = SemanticTextChunk.objects.update_index_title(old_title, new_title)
    logger.info("semantic_search.update_index_title: updated", old_title=old_title, new_title=new_title, rows=count)


@app.task(name="semantic_search.delete_index_chunks")
def delete_index_chunks(index_title: str) -> None:
    count = SemanticTextChunk.objects.delete_by_index(index_title)
    logger.info("semantic_search.delete_index_chunks: deleted", index_title=index_title, rows=count)


# ---------------------------------------------------------------------------
# Version-level tasks
# ---------------------------------------------------------------------------

@app.task(name="semantic_search.update_version_title")
def update_version_title(index_title: str, old_vtitle: str, new_vtitle: str) -> None:
    count = SemanticTextChunk.objects.update_version_title(index_title, old_vtitle, new_vtitle)
    logger.info(
        "semantic_search.update_version_title: updated",
        index_title=index_title, old_vtitle=old_vtitle, new_vtitle=new_vtitle, rows=count,
    )


@app.task(name="semantic_search.update_version_attributes")
def update_version_attributes(index_title: str, vtitle: str) -> None:
    ver = Version().load({"title": index_title, "versionTitle": vtitle})
    if not ver:
        logger.warning(
            "semantic_search.update_version_attributes: version not found",
            index_title=index_title, vtitle=vtitle,
        )
        return
    fields = {
        "is_primary": bool(ver.isPrimary),
        "is_source": bool(ver.isSource),
        "direction": ver.direction,
    }
    count = SemanticTextChunk.objects.update_version_fields(index_title, vtitle, fields)
    logger.info(
        "semantic_search.update_version_attributes: updated",
        index_title=index_title, vtitle=vtitle, rows=count,
    )


@app.task(name="semantic_search.delete_version_chunks")
def delete_version_chunks(index_title: str, vtitle: str) -> None:
    count = SemanticTextChunk.objects.delete_by_version(index_title, vtitle)
    logger.info(
        "semantic_search.delete_version_chunks: deleted",
        index_title=index_title, vtitle=vtitle, rows=count,
    )


# ---------------------------------------------------------------------------
# Author topic tasks
# ---------------------------------------------------------------------------

@app.task(name="semantic_search.update_topic_slug")
def update_topic_slug(old_slug: str, new_slug: str) -> None:
    """
    When any topic's slug changes:
    1. Replace old_slug with new_slug in associated_topic_slugs for all chunks.
    2. If the topic is also an author (used in Index.authors), replace in author_slugs
       and refresh author_names for affected indexes.
    """
    # associated_topic_slugs
    assoc_count = SemanticTextChunk.objects.replace_associated_topic_slug(old_slug, new_slug)

    # author_slugs (covers the case where this topic is an author)
    # somewhat redundant given the next few lines but acts as a safety net in case the author hasn't been changed in mongo yet.
    author_count = SemanticTextChunk.objects.replace_author_slug(old_slug, new_slug)

    # Refresh author_names for all indexes that now carry new_slug as an author
    affected_indexes = IndexSet({"authors": new_slug})
    for index in affected_indexes:
        context = get_index_context(index)
        SemanticTextChunk.objects.update_index_metadata(index.title, {
            "author_names": context["author_names"],
            "author_slugs": context["author_slugs"],
        })

    logger.info(
        "semantic_search.update_topic_slug: updated",
        old_slug=old_slug, new_slug=new_slug,
        assoc_rows=assoc_count, author_rows=author_count,
    )


@app.task(name="semantic_search.update_author_topic_names")
def update_author_topic_names(author_slug: str) -> None:
    """
    When an author topic's primary title changes (name change, not slug change),
    refresh author_names for all indexes that use this author.
    """
    affected_indexes = IndexSet({"authors": author_slug})
    total = 0
    for index in affected_indexes:
        context = get_index_context(index)
        total += SemanticTextChunk.objects.update_index_metadata(index.title, {
            "author_names": context["author_names"],
        })
    logger.info("semantic_search.update_author_topic_names: updated", author_slug=author_slug, rows=total)


# ---------------------------------------------------------------------------
# Category tasks
# ---------------------------------------------------------------------------

@app.task(name="semantic_search.update_category_chunks")
def update_category_chunks(old_path: list) -> None:
    """Refresh primary_category and all_categories for all indexes under the changed category path."""
    affected_indexes = IndexSet({"categories.0": old_path[0]}) if old_path else IndexSet({})
    total = 0
    for index in affected_indexes:
        if index.categories[:len(old_path)] == old_path:
            context = get_index_context(index)
            total += SemanticTextChunk.objects.update_index_metadata(index.title, {
                "primary_category": context["primary_category"],
                "all_categories": context["all_categories"],
            })
    logger.info("semantic_search.update_category_chunks: updated", old_path=old_path, rows=total)


# ---------------------------------------------------------------------------
# Ref-derived metadata tasks (topic links, links, pagerank)
# ---------------------------------------------------------------------------

def _get_chunks_for_ref(ref_str: str, index_title: str) -> list[SemanticTextChunk]:
    """
    Find chunks that could contain `ref_str`: first by an exact match against chunker_metadata's
    source_segment_refs, falling back to every chunk in the same chunking unit (section, or
    passage for passage-based corpora like Tanakh/Bavli) if that comes up empty.
    """
    chunks = SemanticTextChunk.objects.get_chunks_containing_ref(index_title, ref_str)
    if chunks:
        return chunks
    try:
        oref = Ref(ref_str)
    except Exception:
        return []
    index = Index().load({"title": index_title})
    if not index:
        return []
    try:
        unit_normal = get_chunking_unit_ref(index, oref).normal()
    except Exception:
        return []
    return list(SemanticTextChunk.objects.filter(index_title=index_title, chunked_from_ref=unit_normal))


def _update_chunk_context_fields(chunks: list[SemanticTextChunk], fields_to_update: list[str]) -> int:
    """
    Recompute get_chunk_context() for each chunk and bulk-update the requested fields.
    `fields_to_update` must be a subset of ['associated_topic_names', 'associated_topic_slugs',
    'linked_refs', 'pagerank'].
    """
    if not chunks:
        return 0
    for chunk in chunks:
        try:
            ctx = get_chunk_context(Ref(chunk.ref))
        except Exception as exc:
            logger.warning(
                "semantic_search._update_chunk_context_fields: failed to recompute context",
                ref=chunk.ref, error=str(exc),
            )
            continue
        for field in fields_to_update:
            setattr(chunk, field, ctx[field])
    SemanticTextChunk.objects.bulk_update_chunks(chunks, fields_to_update)
    return len(chunks)


@app.task(name="semantic_search.update_ref_topic_links")
def update_ref_topic_links(ref_str: str, index_title: str) -> None:
    """Recompute associated_topic_names and associated_topic_slugs for chunks containing ref_str."""
    chunks = _get_chunks_for_ref(ref_str, index_title)
    count = _update_chunk_context_fields(
        chunks, ["associated_topic_names", "associated_topic_slugs"]
    )
    logger.info(
        "semantic_search.update_ref_topic_links: updated",
        ref=ref_str, index_title=index_title, chunks=count,
    )


@app.task(name="semantic_search.update_ref_links")
def update_ref_links(ref_str: str, index_title: str) -> None:
    """Recompute linked_refs for chunks containing ref_str."""
    chunks = _get_chunks_for_ref(ref_str, index_title)
    count = _update_chunk_context_fields(chunks, ["linked_refs"])
    logger.info(
        "semantic_search.update_ref_links: updated",
        ref=ref_str, index_title=index_title, chunks=count,
    )


_PAGERANK_CHANGE_THRESHOLD = 0.03


@app.task(name="semantic_search.update_ref_pagerank")
def update_ref_pagerank(ref_str: str, index_title: str, new_pagerank: float) -> None:
    """Update pagerank for chunks containing ref_str if the change exceeds the threshold."""
    chunks = _get_chunks_for_ref(ref_str, index_title)
    if not chunks:
        return
    # Only update if the stored value is significantly stale
    stored_pagerank = chunks[0].pagerank or 0.0
    if stored_pagerank and abs(new_pagerank - stored_pagerank) / stored_pagerank < _PAGERANK_CHANGE_THRESHOLD:
        return
    count = _update_chunk_context_fields(chunks, ["pagerank"])
    logger.info(
        "semantic_search.update_ref_pagerank: updated",
        ref=ref_str, index_title=index_title, chunks=count,
        old_pagerank=stored_pagerank, new_pagerank=new_pagerank,
    )


# ---------------------------------------------------------------------------
# Text + embedding sync (no re-chunking)
# ---------------------------------------------------------------------------

@app.task(name="semantic_search.sync_text_and_embedding")
def sync_text_and_embedding(index_title: str, language: str, vtitle: str, changed_refs: list[str]) -> None:
    """
    For each distinct chunking unit (section, or passage for passage-based corpora like Tanakh/Bavli)
    touched by changed_refs:
    - If existing chunks cover it: re-assemble text from source_segment_refs,
      re-call Gemini, and UPDATE text + embedding (no re-chunking).
    - If the unit has no chunks yet: call PatotChunker + embed + INSERT
      (requires patot; skipped with a warning if not installed).
    """
    from django.conf import settings
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        logger.warning("semantic_search.sync_text_and_embedding: GEMINI_API_KEY not set, skipping")
        return

    index = Index().load({"title": index_title})
    if not index:
        logger.warning("semantic_search.sync_text_and_embedding: index not found", index_title=index_title)
        return

    embedder = GeminiEmbedder(api_key=api_key)
    already_indexed = SemanticTextChunk.objects.get_indexed_unit_refs(index_title, language, vtitle)

    # Multiple changed_refs can fall in the same chunking unit (e.g. two segments in the same
    # section, or two segments in the same passage) - dedupe so each unit is only re-embedded
    # or re-chunked once.
    unit_refs_by_normal = {}
    for ref_str in changed_refs:
        try:
            oref = Ref(ref_str)
        except Exception as exc:
            logger.warning("semantic_search.sync_text_and_embedding: bad ref", ref=ref_str, error=str(exc))
            continue
        unit_ref = get_chunking_unit_ref(index, oref)
        unit_refs_by_normal.setdefault(unit_ref.normal(), unit_ref)

    for unit_normal, unit_ref in unit_refs_by_normal.items():
        if unit_normal in already_indexed:
            _reembed_existing_section(
                index_title, language, vtitle, unit_normal, embedder
            )
        else:
            _chunk_new_section(index, language, vtitle, unit_ref, embedder)


def _reembed_existing_section(
    index_title: str, language: str, vtitle: str, unit_normal: str, embedder: GeminiEmbedder
) -> None:
    """Re-embed all existing chunks for a chunking unit (section or passage) without re-chunking."""
    chunks = SemanticTextChunk.objects.get_chunks_for_section(index_title, language, vtitle, unit_normal)
    if not chunks:
        return

    updated = []
    for chunk in chunks:
        source_refs = chunk.chunker_metadata.get("source_segment_refs", [])
        if not source_refs:
            continue
        # Re-assemble text from current Version content
        segment_texts = []
        for seg_ref_str in source_refs:
            # Strip footnote pseudo-refs
            base_ref_str = seg_ref_str.split("::fn:")[0] if "::fn:" in seg_ref_str else seg_ref_str
            try:
                text = Ref(base_ref_str).text(lang=language, vtitle=vtitle).text
            except Exception:
                text = ""
            segment_texts.append(text if isinstance(text, str) else "")
        new_text = " ".join(t for t in segment_texts if t)
        if not new_text.strip():
            continue
        try:
            new_embedding = embedder.embed_text(new_text, "RETRIEVAL_DOCUMENT")
        except Exception as exc:
            logger.warning(
                "semantic_search._reembed_existing_section: embedding failed",
                index_title=index_title, ref=chunk.ref, error=str(exc),
            )
            continue
        chunk.text = new_text
        chunk.embedding = new_embedding
        updated.append(chunk)

    if updated:
        SemanticTextChunk.objects.bulk_update_chunks(updated, ["text", "embedding"])
    logger.info(
        "semantic_search._reembed_existing_section: reembedded",
        index_title=index_title, language=language, vtitle=vtitle,
        section=unit_normal, chunks=len(updated),
    )


def _chunk_new_section(
    index, language: str, vtitle: str, unit_ref: Ref, embedder: GeminiEmbedder
) -> None:
    """Chunk and embed a unit (section or passage) that has no pgvector chunks yet (requires patot)."""
    index_title = index.title
    unit_normal = unit_ref.normal()
    try:
        from patot import ChunkerConfig, PatotChunker
        from patot.records import SegmentRecord
    except ImportError:
        logger.warning(
            "semantic_search._chunk_new_section: patot not installed, skipping new section",
            index_title=index_title, section=unit_normal,
        )
        return

    from django.conf import settings
    from sefaria.helper.vector.context import get_version_context
    from sefaria.helper.vector.embed_library_to_pgvector import (
        build_chunk_data, collect_segment_text_by_ref,
    )

    ver = Version().load({"title": index_title, "versionTitle": vtitle, "language": language})
    if not ver:
        return

    api_key = getattr(settings, "GEMINI_API_KEY", None)
    config = ChunkerConfig(debug=False)
    chunker = PatotChunker(api_key=api_key, config=config)

    index_context = get_index_context(index)
    version_context = get_version_context(ver)

    # Build segment records the same way for a plain section ref or a (possibly multi-section)
    # passage ref: walk the unit's own segment refs against a flat {ref: text} map of the version.
    segment_text_by_ref = collect_segment_text_by_ref(ver)
    segment_records = [
        SegmentRecord(tref=r, text=segment_text_by_ref[r], segment_index=i)
        for i, r in enumerate(seg_ref.normal() for seg_ref in unit_ref.all_segment_refs())
        if r in segment_text_by_ref
    ]
    if not segment_records:
        return

    try:
        chunk_result = chunker.chunk_segments(segment_records)
    except Exception as exc:
        logger.warning(
            "semantic_search._chunk_new_section: chunking failed",
            index_title=index_title, section=unit_normal, error=str(exc),
        )
        return

    if not chunk_result.chunks:
        return

    chunk_data = build_chunk_data(
        unit_ref, language, vtitle, index_title, embedder,
        chunk_result, index_context, version_context,
    )
    SemanticTextChunk.objects.upsert(chunk_data)
    logger.info(
        "semantic_search._chunk_new_section: chunked and indexed",
        index_title=index_title, section=unit_normal, chunks=len(chunk_data),
    )
