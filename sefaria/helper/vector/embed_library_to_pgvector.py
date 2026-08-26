#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Embed Library to pgvector

Chunks and embeds the entire Sefaria library (every Index, every Version, every
language) using the patot semantic chunker + Gemini embedding pipeline, and upserts
the resulting rows into two pgvector-backed Postgres tables: `chunk_metadata` (metadata)
and `vectors` (text + embedding, FK'd to `chunk_metadata`).

Resumable - on restart, (index, language, version_title) combinations whose section
refs are already present in pgvector are skipped, so a restart does not re-embed
(and re-bill Gemini for) already-completed work.

Change-detected - at startup, every section/passage's current text is hashed and compared
against `section_text_cache` (a separate pgvector table, keyed on section/passage ref +
version + language). Units whose hash hasn't changed since the last run are skipped even on a
deliberate re-run (not just a crash restart), so a periodic re-index doesn't re-run the
chunker/embedder over the whole library every time - only over sections whose text actually
changed.

Note: Logging is configured via sefaria.search.setup_logging() so output is visible
in `kubectl logs`.
"""

import argparse
import hashlib
import logging
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import django
django.setup()

from django.conf import settings as django_settings
from sefaria.model import *
from sefaria.search import setup_logging
from semantic_search.embedder import GeminiEmbedder
from semantic_search.models import (
    ChunkMetadata, Vector, SectionTextCache, DEFAULT_CHUNKING_SCHEME_ID, DEFAULT_EMBEDDING_MODEL_ID,
)

import tqdm as _tqdm_module
import tqdm.auto as _tqdm_auto_module
from tqdm import tqdm

# Patot's internal tqdm bars hardcode disable=False and ignore TQDM_DISABLE.
# Patch the class before patot is imported so all tqdm instances respect the env var.
if os.environ.get("TQDM_DISABLE"):
    _orig_tqdm_init = _tqdm_module.tqdm.__init__
    def _patched_tqdm_init(self, *args, **kwargs):
        kwargs["disable"] = True
        _orig_tqdm_init(self, *args, **kwargs)
    _tqdm_module.tqdm.__init__ = _patched_tqdm_init
    _tqdm_auto_module.tqdm.__init__ = _patched_tqdm_init

# patot is an optional dependency, only present in the embedding job image (not the
# web/test image). Guard the import so this module can be imported (and its pure helpers
# tested) without patot installed; the `if PatotChunker is None` check in main() handles
# the runtime case.
try:
    from patot import ChunkerConfig, PatotChunker
    from patot.records import SegmentRecord
    from patot.analytics import ChunkingRuntimeAnalytics
except ModuleNotFoundError:
    ChunkerConfig = PatotChunker = SegmentRecord = ChunkingRuntimeAnalytics = None

logger = logging.getLogger(__name__)

SEPARATOR_LINE = "=" * 60

# Thread-local storage: each worker thread gets its own PatotChunker.
thread_local = threading.local()


class EmbeddingResult:
    """Track embedding progress, failures, and warnings. Thread-safe."""

    def __init__(self):
        self._lock = threading.Lock()
        self.start_time = datetime.now()
        self.indexes_processed = 0
        self.sections_embedded = 0
        self.chunks_written = 0
        self.sections_skipped_resume = 0
        self.sections_skipped_empty = 0
        self.chunks_metadata_refreshed = 0
        self.versions_skipped_no_existing_chunks = 0
        self.failures = []

    def increment(self, field: str, n: int = 1):
        with self._lock:
            setattr(self, field, getattr(self, field) + n)

    def record_failure(self, index_title, lang, vtitle, section_ref, error):
        with self._lock:
            self.failures.append({
                "index_title": index_title,
                "language": lang,
                "version_title": vtitle,
                "ref": section_ref,
                "error": str(error),
            })
        logger.error(
            f"Failed section - index: {index_title}, lang: {lang}, version: {vtitle}, "
            f"ref: {section_ref}, error: {error}"
        )

    def is_success(self) -> bool:
        return len(self.failures) == 0

    def get_summary(self) -> str:
        duration = datetime.now() - self.start_time
        lines = [
            SEPARATOR_LINE,
            "EMBED LIBRARY TO PGVECTOR SUMMARY",
            SEPARATOR_LINE,
            f"Duration: {duration}",
            f"Indexes processed: {self.indexes_processed}",
            f"Sections embedded: {self.sections_embedded}",
            f"Chunks written: {self.chunks_written}",
            f"Sections skipped (already done): {self.sections_skipped_resume}",
            f"Sections skipped (empty): {self.sections_skipped_empty}",
            f"Chunk metadata refreshed: {self.chunks_metadata_refreshed}",
            f"Versions skipped (no existing chunks): {self.versions_skipped_no_existing_chunks}",
            f"Failures: {len(self.failures)}",
        ]
        if self.failures:
            lines.append("-" * 40)
            for failure in self.failures[:20]:
                lines.append(
                    f"  - {failure['index_title']} {failure['ref']} "
                    f"({failure['language']}/{failure['version_title']}): {failure['error']}"
                )
            if len(self.failures) > 20:
                lines.append(f"  ... and {len(self.failures) - 20} more")
        lines.append(SEPARATOR_LINE)
        return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chunk and embed the Sefaria library into pgvector.")
    parser.add_argument(
        "--limit-indexes", type=int, default=None,
        help="Process only the first N indexes (for smoke testing).",
    )
    parser.add_argument(
        "--threads", type=int,
        default=int(os.environ.get("EMBED_THREADS", 10)),
        help="Number of parallel threads for index processing (defaults to EMBED_THREADS env var, or 10).",
    )
    parser.add_argument(
        "--max-versions", type=int, default=None,
        help="Skip indexes with more than N versions (debug flag to avoid high-version bottlenecks).",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging.")
    parser.add_argument(
        "--mode", choices=["full", "metadata-only"], default="full",
        help="'full' (default): chunk+embed via patot/Gemini, gated by resume-skip and "
             "text-hash change detection (today's behavior). 'metadata-only': skip "
             "chunking/embedding entirely (no patot, no Gemini, no GEMINI_API_KEY "
             "required) and instead refresh the metadata-derived fields on chunk_metadata "
             "rows that already exist in Postgres, for every index/version that has any - "
             "no hash pre-pass, no resume-skip; every existing chunk is refreshed every run.",
    )
    parser.add_argument(
        "--buffer-size", type=int,
        default=int(os.environ.get("EMBED_BUFFER_SIZE", 500)),
        help="Rows accumulated in memory before a single bulk upsert flush (defaults to "
             "EMBED_BUFFER_SIZE env var, or 500). In --mode=full this counts "
             "ChunkAndVector pairs (chunk_metadata + vector rows flushed together); in "
             "--mode=metadata-only it counts ChunkMetadata rows alone.",
    )
    return parser.parse_args()


def is_passage_based(index) -> bool:
    return index.get_primary_corpus() in {"Tanakh", "Bavli"}


def get_passages_for_index(index) -> list:
    prefix = re.escape(index.title)
    return list(PassageSet({"full_ref": {"$regex": fr"^{prefix} \d"}}))


def collect_segment_records_by_section(version) -> dict:
    """
    Walk through every segment of `version` once (via Version.walk_thru_contents) and
    group the resulting SegmentRecords by their section ref's normal form.

    This replaces issuing a separate `section_ref.text(lang=lang, vtitle=vtitle)` lookup
    per section, which is very expensive when repeated across every section of a version.
    """
    segment_records_by_section: dict = {}
    section_counters: dict = {}

    def collect(segment_str, tref, _he_tref, _version):
        oref = Ref(tref)
        section_normal = oref.section_ref().normal()
        segment_index = section_counters.get(section_normal, 0)
        section_counters[section_normal] = segment_index + 1
        if segment_str and segment_str.strip():
            segment_records_by_section.setdefault(section_normal, []).append(
                SegmentRecord(tref=oref.normal(), text=segment_str, segment_index=segment_index)
            )

    version.walk_thru_contents(collect)
    return segment_records_by_section


def collect_segment_text_by_ref(version) -> dict:
    """Walk version once and return a flat {segment_ref_normal: text} map."""
    segment_text_by_ref: dict = {}

    def collect(segment_str, tref, _he_tref, _version):
        if segment_str and segment_str.strip():
            segment_text_by_ref[tref] = segment_str

    version.walk_thru_contents(collect)
    return segment_text_by_ref


def time_period_to_dict(time_period) -> dict | None:
    if time_period is None:
        return None
    return {
        "start": getattr(time_period, "start", None),
        "end": getattr(time_period, "end", None),
        "startIsApprox": getattr(time_period, "startIsApprox", False),
        "endIsApprox": getattr(time_period, "endIsApprox", False),
    }


def get_index_context(index) -> dict:
    """Metadata derived from the Index, shared by every chunk produced from it."""
    composition_time_period = index.composition_time_period()
    era = composition_time_period.get_era() if composition_time_period else None
    composition_place = index.composition_place()
    authors = index.author_objects()

    return {
        "primary_category": index.get_primary_category(),
        "all_categories": index.categories,
        "composition_date": time_period_to_dict(composition_time_period),
        "composition_place": composition_place.primary_name("en") if composition_place else None,
        "era_name": era.primary_name("en") if era else None,
        "author_names": [author.get_primary_title("en") for author in authors],
        "author_slugs": [author.slug for author in authors],
    }


def get_version_context(version) -> dict:
    """Metadata derived from the Version, shared by every chunk produced from it."""
    return {
        "language": version.actualLanguage,
        "direction": version.direction,
        "is_primary": bool(version.isPrimary),
        "is_source": bool(version.isSource),
    }


def get_chunk_context(chunk_ref) -> dict:
    """Metadata derived from the chunk's Ref (single segment or range)."""
    pageranks = [ref_data.pagesheetrank for ref_data in RefDataSet.from_ref(chunk_ref)]
    pagerank = sum(pageranks) / len(pageranks) if pageranks else RefData.DEFAULT_PAGESHEETRANK

    seen_topic_pairs = set()
    topic_names = []
    topic_slugs = []
    for link in chunk_ref.topiclinkset(with_char_level_links=False):
        topic = Topic.init(link.toTopic)
        if not topic:
            continue
        pair = (topic.get_primary_title("en"), topic.slug)
        if pair not in seen_topic_pairs:
            seen_topic_pairs.add(pair)
            topic_names.append(pair[0])
            topic_slugs.append(pair[1])

    seen_linked_refs = set()
    linked_refs = []
    for link in chunk_ref.linkset():
        for ref_str in link.refs:
            if ref_str in seen_linked_refs:
                continue
            try:
                other_ref = Ref(ref_str)
            except Exception:
                continue
            if chunk_ref.contains(other_ref):
                continue
            seen_linked_refs.add(ref_str)
            linked_refs.append(ref_str)

    return {
        "pagerank": pagerank,
        "associated_topic_names": topic_names,
        "associated_topic_slugs": topic_slugs,
        "linked_refs": linked_refs,
    }


def chunk_ref_from_segments(source_segment_refs: list):
    """Build a Ref spanning the chunk's source segments (ranged if >1 segment).

    Footnote pseudo-refs (containing '::fn:') are not parseable by Sefaria's Ref
    class, so we strip them — using only the base segment part of the ref string.
    """
    def to_base_ref(r: str) -> str:
        return r.split("::fn:")[0] if "::fn:" in r else r

    base_refs = [to_base_ref(r) for r in source_segment_refs]
    # Deduplicate while preserving order (footnotes from the same segment produce duplicates).
    seen = set()
    unique_refs = []
    for r in base_refs:
        if r not in seen:
            seen.add(r)
            unique_refs.append(r)

    if len(unique_refs) == 1:
        return Ref(unique_refs[0])
    return Ref(unique_refs[0]).to(Ref(unique_refs[-1]))


@dataclass
class ChunkAndVector:
    """A built `ChunkMetadata` row paired with the text/embedding that will become its
    `Vector` row once the chunk has been upserted and has a real `.id`."""
    chunk: ChunkMetadata
    text: str
    embedding: list


class UpsertBuffer:
    """Thread-safe accumulate-then-flush buffer. Worker threads call add(items); once the
    accumulated size reaches batch_size, the buffer is atomically swapped out under a lock
    and flush_fn(batch) runs *outside* the lock, so a slow DB round-trip never blocks other
    threads' concurrent add() calls. Call flush_remaining() once, after all producer
    threads have finished, to flush whatever didn't reach the threshold."""

    def __init__(self, batch_size: int, flush_fn):
        self._batch_size = batch_size
        self._flush_fn = flush_fn
        self._lock = threading.Lock()
        self._buffer: list = []

    def add(self, items: list) -> None:
        if not items:
            return
        to_flush = None
        with self._lock:
            self._buffer.extend(items)
            if len(self._buffer) >= self._batch_size:
                to_flush, self._buffer = self._buffer, []
        if to_flush:
            self._flush_fn(to_flush)

    def flush_remaining(self) -> None:
        to_flush = None
        with self._lock:
            if self._buffer:
                to_flush, self._buffer = self._buffer, []
        if to_flush:
            self._flush_fn(to_flush)


def _flush_chunk_and_vector_batch(batch: list[ChunkAndVector], chunk_store: ChunkMetadata,
                                  vector_store: Vector) -> None:
    """Flush callback for `full`-mode's UpsertBuffer: chunk metadata first (surrogate `id`
    populated in-place via RETURNING on bulk_create/update_conflicts), then vectors, which
    need that id for their chunk_metadata_id FK."""
    chunk_store.upsert([b.chunk for b in batch])
    vector_store.upsert([
        Vector(chunk_metadata=b.chunk, embedding_model_id=DEFAULT_EMBEDDING_MODEL_ID,
               text=b.text, embedding=b.embedding)
        for b in batch
    ])


def build_chunk_data(unit_ref, lang: str, vtitle: str, index_title: str, embedder: GeminiEmbedder,
                     result, index_context: dict, version_context: dict) -> list[ChunkAndVector]:
    unit_normal = unit_ref.normal()

    # Chunks only share the same resulting ref when a single oversized segment was hard-split
    # into multiple pieces (patot's hard_max_split pass, `_apply_hard_max_pass` in
    # patot/chunker.py) - every other chunk's source_segment_refs (and therefore ref) is
    # disjoint from every other chunk in this unit. chunk_ordinal numbers pieces within such a
    # group (1-based, in patot's output order, which is already left-to-right); every other
    # chunk gets ordinal 1. This is what `chunk_metadata`'s UNIQUE (ref, version_title,
    # language, chunk_ordinal, chunking_scheme_id) constraint relies on.
    chunk_refs = [chunk_ref_from_segments(chunk.source_segment_refs) for chunk in result.chunks]
    ordinal_counters: dict[str, int] = {}
    chunk_ordinals = []
    for chunk_ref in chunk_refs:
        key = chunk_ref.normal()
        ordinal_counters[key] = ordinal_counters.get(key, 0) + 1
        chunk_ordinals.append(ordinal_counters[key])

    built = []
    for chunk, chunk_ref, chunk_ordinal in zip(result.chunks, chunk_refs, chunk_ordinals):
        vector = embedder.embed_text(chunk.text, "RETRIEVAL_DOCUMENT")
        chunk_context = get_chunk_context(chunk_ref)

        chunk_row = ChunkMetadata(
            index_title=index_title,
            version_title=vtitle,
            language=version_context["language"],
            ref=chunk_ref.normal(),
            url=chunk_ref.url(),
            chunked_from_ref=unit_normal,
            direction=version_context["direction"],
            chunk_ordinal=chunk_ordinal,
            chunking_scheme_id=DEFAULT_CHUNKING_SCHEME_ID,
            primary_category=index_context["primary_category"],
            all_categories=index_context["all_categories"],
            is_primary=version_context["is_primary"],
            is_source=version_context["is_source"],
            composition_date=index_context["composition_date"],
            composition_place=index_context["composition_place"],
            era_name=index_context["era_name"],
            pagerank=chunk_context["pagerank"],
            author_names=index_context["author_names"],
            author_slugs=index_context["author_slugs"],
            associated_topic_names=chunk_context["associated_topic_names"],
            associated_topic_slugs=chunk_context["associated_topic_slugs"],
            linked_refs=chunk_context["linked_refs"],
            chunker_metadata={
                "source_segment_refs": chunk.source_segment_refs,
                "chunk_kind": chunk.kind,
                "chunk_pass_number": chunk.pass_number,
                "chunk_token_count": chunk.token_count,
                "chunk_triggered": chunk.triggered,
                "chunk_score": chunk.score,
            },
        )
        built.append(ChunkAndVector(chunk=chunk_row, text=chunk.text, embedding=vector))
    return built


def hash_section_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def resolve_section_ref(tref: str, known_section_refs: set) -> Optional[str]:
    """
    Which of `known_section_refs` does `tref` (a raw segment ref string straight from
    Version.walk_thru_contents) fall under? A segment ref "is a superset of" its section ref,
    so strip trailing ':<address>' components off `tref` until what's left is a known section
    ref (almost always one strip) - this avoids parsing `tref` into a Ref, which is the
    expensive part collect_section_texts_by_ref needs to avoid when it's called for every
    segment in every version of the library.
    """
    candidate = tref
    while candidate not in known_section_refs:
        if ':' not in candidate:
            return None
        candidate = candidate.rsplit(':', 1)[0]
    return candidate


def collect_section_texts_by_ref(version, known_section_refs: set) -> dict:
    """Walk `version` once and return {section_ref_normal: concatenated_section_text}."""
    section_segments: dict = {}

    def collect(segment_str, tref, _he_tref, _version):
        if not segment_str or not segment_str.strip():
            return
        section_ref = resolve_section_ref(tref, known_section_refs)
        if section_ref is None:
            return
        section_segments.setdefault(section_ref, []).append(segment_str)

    version.walk_thru_contents(collect)
    return {ref: "\n".join(texts) for ref, texts in section_segments.items()}


def collect_all_section_refs(indexes) -> set:
    """Every normalized section ref across `indexes` - the universe collect_section_texts_by_ref
    buckets segments into."""
    refs = set()
    for index in indexes:
        for section_ref in index.all_section_refs():
            refs.add(section_ref.normal())
    return refs


def compute_current_unit_hashes(indexes, known_section_refs: set) -> dict:
    """
    {(unit_ref_normal, version_title, language): sha256(unit_text)} for every (index, version,
    unit) currently in the library, where unit_ref is the same resume key `chunk_store` already
    tracks via chunked_from_ref - a passage full_ref for passage-based indexes, a section ref
    otherwise. Used to detect, before running the chunker/embedder, which units' text actually
    changed since the last run.
    """
    hashes = {}
    for index in indexes:
        passages = get_passages_for_index(index) if is_passage_based(index) else []
        for version in VersionSet({"title": index.title}):
            lang, vtitle = version.language, version.versionTitle
            if passages:
                segment_text_by_ref = collect_segment_text_by_ref(version)
                for passage in passages:
                    text = "\n".join(
                        segment_text_by_ref[r] for r in passage.ref_list if r in segment_text_by_ref
                    )
                    if text:
                        unit_normal = Ref(passage.full_ref).normal()
                        hashes[(unit_normal, vtitle, lang)] = hash_section_text(text)
            else:
                for section_ref, text in collect_section_texts_by_ref(version, known_section_refs).items():
                    hashes[(section_ref, vtitle, lang)] = hash_section_text(text)
    return hashes


def _process_index(index, chunker, result_tracker: EmbeddingResult, get_units_for_version,
                   chunk_store: ChunkMetadata, buffer: UpsertBuffer, changed_units: set, version_pbar=None):
    """
    Core per-index loop shared by section-based and passage-based processing.

    `get_units_for_version(version)` must return a list of (unit_ref, segment_records) pairs,
    where unit_ref is a Ref whose .normal() is used as the resume key and stored in
    chunk_metadata.chunked_from_ref.

    `changed_units` is the set of (unit_ref_normal, version_title, language) keys whose text
    hash (see compute_current_unit_hashes) differs from - or is absent from - the last run's
    section_text_cache. A unit already in pgvector (`already_done`) is only skipped if its text
    also hasn't changed; otherwise a text edit would be silently skipped forever by the resume
    check alone.
    """
    index_context = get_index_context(index)

    for version in VersionSet({"title": index.title}):
        lang, vtitle = version.language, version.versionTitle
        version_context = get_version_context(version)

        already_done = chunk_store.get_indexed_unit_refs(index.title, version_context["language"], vtitle)

        units = get_units_for_version(version)

        for unit_ref, segment_records in units:
            unit_normal = unit_ref.normal()
            if unit_normal in already_done and (unit_normal, vtitle, lang) not in changed_units:
                result_tracker.increment("sections_skipped_resume")
            elif not segment_records:
                result_tracker.increment("sections_skipped_empty")
            else:
                try:
                    chunk_result = chunker.chunk_segments(segment_records)
                    if not chunk_result.chunks:
                        result_tracker.increment("sections_skipped_empty")
                    else:
                        built = build_chunk_data(unit_ref, lang, vtitle, index.title, thread_local.embedder,
                                                 chunk_result, index_context, version_context)
                        buffer.add(built)
                        result_tracker.increment("sections_embedded")
                        result_tracker.increment("chunks_written", len(built))
                        logger.debug(f"Embedded {unit_normal} ({lang}/{vtitle}): {len(built)} chunk(s)")
                except Exception as e:
                    result_tracker.record_failure(index.title, lang, vtitle, unit_normal, e)

        if version_pbar is not None:
            version_pbar.update(1)
            version_pbar.set_postfix(index=index.title[:30], lang=lang)


def process_index(index, chunker, result_tracker: EmbeddingResult, chunk_store: ChunkMetadata,
                  buffer: UpsertBuffer, changed_units: set, version_pbar=None):
    if is_passage_based(index):
        passages = get_passages_for_index(index)
        if not passages:
            logger.warning(f"No passages found for {index.title}, falling back to section-based")
        else:
            logger.info(f"Passage-based chunking for {index.title}: {len(passages)} passages")

            def get_units_for_version(version):
                segment_text_by_ref = collect_segment_text_by_ref(version)
                return [
                    (
                        Ref(passage.full_ref),
                        [SegmentRecord(tref=r, text=segment_text_by_ref[r], segment_index=i)
                         for i, r in enumerate(passage.ref_list) if r in segment_text_by_ref],
                    )
                    for passage in passages
                ]

            _process_index(index, chunker, result_tracker, get_units_for_version,
                           chunk_store=chunk_store, buffer=buffer,
                           changed_units=changed_units, version_pbar=version_pbar)
            return

    section_refs = index.all_section_refs()
    if not section_refs:
        logger.debug(f"No section refs for index {index.title}, skipping")
        return

    def get_units_for_version(version):
        segment_records_by_section = collect_segment_records_by_section(version)
        return [(ref, segment_records_by_section.get(ref.normal(), [])) for ref in section_refs]

    _process_index(index, chunker, result_tracker, get_units_for_version,
                   chunk_store=chunk_store, buffer=buffer,
                   changed_units=changed_units, version_pbar=version_pbar)


def build_refreshed_chunk_metadata(existing_row: ChunkMetadata, index_context: dict,
                                   version_context: dict) -> ChunkMetadata:
    """Brand-new ChunkMetadata instance (id left unset - bulk_create/update_conflicts only
    excludes the pk column from the INSERT when pk is unset on every passed-in instance;
    reusing an already-persisted instance here would make Django include an explicit id in
    the INSERT, colliding with the PRIMARY KEY constraint since the ON CONFLICT target is
    the ref/version_title/language/chunk_ordinal/chunking_scheme_id unique constraint, not
    the pk) for existing_row: recomputes metadata-derived fields via
    get_chunk_context(Ref(existing_row.ref)) plus the passed-in index/version context, and
    copies every unique-key + chunking-provenance field through unchanged. Raises on a bad
    ref/lookup - caller catches per-row so one bad ref doesn't abort the batch."""
    chunk_ref = Ref(existing_row.ref)
    chunk_context = get_chunk_context(chunk_ref)
    return ChunkMetadata(
        index_title=existing_row.index_title,
        version_title=existing_row.version_title,
        language=existing_row.language,
        ref=existing_row.ref,
        url=chunk_ref.url(),
        chunked_from_ref=existing_row.chunked_from_ref,
        direction=version_context["direction"],
        chunk_ordinal=existing_row.chunk_ordinal,
        chunking_scheme_id=existing_row.chunking_scheme_id,
        primary_category=index_context["primary_category"],
        all_categories=index_context["all_categories"],
        is_primary=version_context["is_primary"],
        is_source=version_context["is_source"],
        composition_date=index_context["composition_date"],
        composition_place=index_context["composition_place"],
        era_name=index_context["era_name"],
        pagerank=chunk_context["pagerank"],
        author_names=index_context["author_names"],
        author_slugs=index_context["author_slugs"],
        associated_topic_names=chunk_context["associated_topic_names"],
        associated_topic_slugs=chunk_context["associated_topic_slugs"],
        linked_refs=chunk_context["linked_refs"],
        chunker_metadata=existing_row.chunker_metadata,
    )


def process_index_metadata_only(index, result_tracker: EmbeddingResult, chunk_store: ChunkMetadata,
                                buffer: UpsertBuffer, version_pbar=None) -> None:
    """`metadata-only`-mode per-index loop: for every Version of `index`, fetch existing
    chunk_metadata rows for (index_title, version_title, language), recompute their
    metadata-derived fields, and feed refreshed rows into `buffer`. No chunking/embedding,
    no section_text_cache/resume check - every version with existing rows is refreshed
    every run; versions with none are skipped (nothing to refresh, never creates new
    chunks)."""
    index_context = get_index_context(index)

    for version in VersionSet({"title": index.title}):
        lang, vtitle = version.language, version.versionTitle
        version_context = get_version_context(version)

        existing_rows = chunk_store.filter(index_title=index.title, version_title=vtitle, language=lang)
        if not existing_rows:
            result_tracker.increment("versions_skipped_no_existing_chunks")
        else:
            refreshed = []
            for row in existing_rows:
                try:
                    refreshed.append(build_refreshed_chunk_metadata(row, index_context, version_context))
                except Exception as e:
                    result_tracker.record_failure(index.title, lang, vtitle, row.ref, e)
            if refreshed:
                buffer.add(refreshed)
                result_tracker.increment("chunks_metadata_refreshed", len(refreshed))

        if version_pbar is not None:
            version_pbar.update(1)
            version_pbar.set_postfix(index=index.title[:30], lang=lang)


def thread_init(api_key: str, config):
    """Per-thread initializer: create a PatotChunker and a GeminiEmbedder."""
    thread_local.chunker = PatotChunker(api_key=api_key, config=config)
    thread_local.embedder = GeminiEmbedder(api_key=api_key)


def main():
    args = parse_args()
    setup_logging(args.debug)
    full_mode = args.mode == "full"

    api_key = None
    config = None
    if full_mode:
        if PatotChunker is None:
            raise SystemExit(
                "patot[chunking] extras are not installed (transformers/semantic-chunkers/semantic-router "
                "missing) - PatotChunker is unavailable. See requirements.txt for the patot dependency."
            )

        api_key = django_settings.GEMINI_API_KEY
        if not api_key:
            raise SystemExit("GEMINI_API_KEY is not set in Django settings.")

        config = ChunkerConfig(
            debug=False,
            embedding_cache_enabled=True,
            embedding_cache_path="/tmp/patot/embedding_cache.sqlite",
            runtime_analytics=ChunkingRuntimeAnalytics(),
            extract_html_footnotes_to_segments=False,
        )

    result = EmbeddingResult()
    chunk_store = ChunkMetadata()
    vector_store = Vector()

    logger.info(SEPARATOR_LINE)
    logger.info("EMBED LIBRARY TO PGVECTOR")
    logger.info(f"mode={args.mode} threads={args.threads} buffer_size={args.buffer_size}")
    logger.info(SEPARATOR_LINE)

    all_indexes = library.all_index_records()
    logger.info(f"Total indexes: {len(all_indexes)}")

    if args.max_versions is not None:
        before = len(all_indexes)
        all_indexes = [idx for idx in all_indexes
                       if VersionSet({"title": idx.title}).count() <= args.max_versions]
        logger.info(f"--max-versions={args.max_versions}: excluded {before - len(all_indexes)} index(es), "
                    f"{len(all_indexes)} remaining")

    if args.limit_indexes is not None:
        all_indexes = all_indexes[:args.limit_indexes]
        logger.info(f"--limit-indexes set: processing only {len(all_indexes)} index(es)")

    changed_units = set()
    if full_mode:
        section_cache_store = SectionTextCache()
        cached_hashes = section_cache_store.all_hashes()
        logger.info(f"Loaded {len(cached_hashes)} cached section text hashes")

        logger.info("Computing current section/passage text hashes for change detection...")
        known_section_refs = collect_all_section_refs(all_indexes)
        current_hashes = compute_current_unit_hashes(all_indexes, known_section_refs)
        changed_units = {key for key, h in current_hashes.items() if cached_hashes.get(key) != h}
        logger.info(f"Text-hash pre-pass: {len(current_hashes)} units hashed, "
                    f"{len(changed_units)} changed or new since last run")

        section_cache_store.upsert([
            SectionTextCache(
                section_ref=section_ref,
                version_title=vtitle,
                language=lang,
                section_text_hash=current_hashes[(section_ref, vtitle, lang)],
            )
            for section_ref, vtitle, lang in changed_units
        ])

    if full_mode:
        buffer = UpsertBuffer(args.buffer_size,
                              lambda batch: _flush_chunk_and_vector_batch(batch, chunk_store, vector_store))
    else:
        buffer = UpsertBuffer(args.buffer_size, chunk_store.upsert)

    total_versions = sum(VersionSet({"title": idx.title}).count() for idx in all_indexes)
    logger.info(f"Total versions: {total_versions}")

    with tqdm(total=total_versions, desc="versions", unit="ver", file=sys.stderr, disable=None) as version_pbar:
        def run_index(index):
            logger.info(f"Processing index: {index.title}")
            try:
                if full_mode:
                    process_index(index, thread_local.chunker, result, chunk_store, buffer,
                                  changed_units, version_pbar)
                else:
                    process_index_metadata_only(index, result, chunk_store, buffer, version_pbar)
            except Exception as e:
                result.record_failure(index.title, "-", "-", "-", e)
            result.increment("indexes_processed")

        executor_kwargs = {"max_workers": args.threads}
        if full_mode:
            executor_kwargs["initializer"] = thread_init
            executor_kwargs["initargs"] = (api_key, config)

        with ThreadPoolExecutor(**executor_kwargs) as executor:
            futures = [executor.submit(run_index, index) for index in all_indexes]
            completed = 0
            for future in as_completed(futures):
                future.result()
                completed += 1
                if completed % 10 == 0:
                    logger.info(result.get_summary())
                    if full_mode:
                        logger.info(f"Analytics: {config.runtime_analytics.snapshot()}")

    buffer.flush_remaining()

    logger.info(result.get_summary())
    if full_mode:
        logger.info(f"Final analytics: {config.runtime_analytics.snapshot()}")

    if not result.is_success():
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        sys.exit(1)
