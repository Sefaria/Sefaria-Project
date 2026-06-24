#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Embed Library to pgvector

Chunks and embeds the entire Sefaria library (every Index, every Version, every
language) using the patot semantic chunker + Gemini embedding pipeline, and upserts
the resulting chunks into a pgvector-backed Postgres table (`library_chunks`).

Designed to run as a sharded Kubernetes Indexed Job: each pod processes the subset of
indexes whose title hashes (mod --shard-count) into --shard-index. Resumable - on
restart, (index, language, version_title) combinations whose section refs are already
present in pgvector are skipped, so a restart does not re-embed (and re-bill Gemini
for) already-completed work.

Note: Logging is configured via sefaria.search.setup_logging() so output is visible
in `kubectl logs`.
"""

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from datetime import datetime

import django
django.setup()

from sefaria.model import *
from sefaria.search import setup_logging

import psycopg2
import psycopg2.pool
from psycopg2.extras import execute_values
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

from patot import ChunkerConfig, PatotChunker
from patot.records import SegmentRecord
from patot.pipeline import slugify
from patot.analytics import ChunkingRuntimeAnalytics

logger = logging.getLogger(__name__)

SEPARATOR_LINE = "=" * 60

# Thread-local storage: each worker thread gets its own PatotChunker.
thread_local = threading.local()
_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_semaphore: threading.Semaphore | None = None

# Arbitrary fixed key for serializing schema setup across concurrently-starting shards.
SCHEMA_ADVISORY_LOCK_KEY = 727274002

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS library_chunks (
    doc_id                  TEXT PRIMARY KEY,
    index_title             TEXT NOT NULL,
    ref                     TEXT NOT NULL,
    url                     TEXT NOT NULL,
    chunked_from_ref        TEXT NOT NULL,
    language                TEXT NOT NULL,
    version_title           TEXT NOT NULL,
    direction               TEXT NOT NULL,
    text                    TEXT NOT NULL,
    embedding               VECTOR(1536) NOT NULL,
    primary_category        TEXT,
    all_categories          TEXT[],
    is_primary              BOOLEAN,
    is_source               BOOLEAN,
    composition_date        JSONB,
    composition_place       TEXT,
    era_name                TEXT,
    pagerank                DOUBLE PRECISION,
    author_names            TEXT[],
    author_slugs            TEXT[],
    associated_topic_names  TEXT[],
    associated_topic_slugs  TEXT[],
    linked_refs             TEXT[],
    chunker_metadata        JSONB NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_chunks_resume
    ON library_chunks (index_title, language, version_title);
"""

UPSERT_SQL = """
INSERT INTO library_chunks
    (doc_id, index_title, ref, url, chunked_from_ref, language, version_title, direction, text, embedding,
     primary_category, all_categories, is_primary, is_source, composition_date, composition_place,
     era_name, pagerank, author_names, author_slugs, associated_topic_names, associated_topic_slugs,
     linked_refs, chunker_metadata, updated_at)
VALUES %s
ON CONFLICT (doc_id) DO UPDATE SET
    text = EXCLUDED.text,
    embedding = EXCLUDED.embedding,
    ref = EXCLUDED.ref,
    url = EXCLUDED.url,
    chunked_from_ref = EXCLUDED.chunked_from_ref,
    language = EXCLUDED.language,
    version_title = EXCLUDED.version_title,
    direction = EXCLUDED.direction,
    primary_category = EXCLUDED.primary_category,
    all_categories = EXCLUDED.all_categories,
    is_primary = EXCLUDED.is_primary,
    is_source = EXCLUDED.is_source,
    composition_date = EXCLUDED.composition_date,
    composition_place = EXCLUDED.composition_place,
    era_name = EXCLUDED.era_name,
    pagerank = EXCLUDED.pagerank,
    author_names = EXCLUDED.author_names,
    author_slugs = EXCLUDED.author_slugs,
    associated_topic_names = EXCLUDED.associated_topic_names,
    associated_topic_slugs = EXCLUDED.associated_topic_slugs,
    linked_refs = EXCLUDED.linked_refs,
    chunker_metadata = EXCLUDED.chunker_metadata,
    updated_at = now()
"""

UPSERT_TEMPLATE = (
    "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, "
    "%s, %s::text[], %s, %s, %s::jsonb, %s, "
    "%s, %s, %s::text[], %s::text[], %s::text[], %s::text[], "
    "%s::text[], %s::jsonb, now())"
)


class EmbeddingResult:
    """Track per-shard embedding progress, failures, and warnings. Thread-safe."""

    def __init__(self):
        self._lock = threading.Lock()
        self.start_time = datetime.now()
        self.indexes_processed = 0
        self.sections_embedded = 0
        self.chunks_written = 0
        self.sections_skipped_resume = 0
        self.sections_skipped_empty = 0
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
        "--shard-index", type=int,
        default=int(os.environ.get("JOB_COMPLETION_INDEX", 0)),
        help="This pod's shard index (defaults to JOB_COMPLETION_INDEX).",
    )
    parser.add_argument(
        "--shard-count", type=int,
        default=int(os.environ.get("SHARD_COUNT", 1)),
        help="Total number of shards (defaults to SHARD_COUNT env var, or 1).",
    )
    parser.add_argument(
        "--limit-indexes", type=int, default=None,
        help="Process only the first N indexes assigned to this shard (for smoke testing).",
    )
    parser.add_argument(
        "--threads", type=int,
        default=int(os.environ.get("SHARD_THREADS", 10)),
        help="Number of parallel threads for index processing within a shard (defaults to SHARD_THREADS env var, or 10).",
    )
    parser.add_argument(
        "--db-pool-size", type=int,
        default=int(os.environ.get("DB_POOL_SIZE", 50)),
        help="Max DB connections in the shared pool (defaults to DB_POOL_SIZE env var, or 50).",
    )
    parser.add_argument(
        "--max-versions", type=int, default=None,
        help="Skip indexes with more than N versions (debug flag to avoid high-version bottlenecks).",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging.")
    return parser.parse_args()


def shard_for_title(title: str, shard_count: int) -> int:
    """Stable (non-salted) hash so all shards agree on index->shard assignment."""
    return int(hashlib.sha256(title.encode("utf-8")).hexdigest(), 16) % shard_count


def _db_connect_kwargs() -> dict:
    return dict(
        host=os.environ.get("PGVECTOR_HOST", "pgvector.default.svc.cluster.local"),
        port=int(os.environ.get("PGVECTOR_PORT", 5432)),
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        dbname=os.environ.get("PGVECTOR_DB") or os.environ["POSTGRES_USER"],
    )


def get_db_connection():
    return psycopg2.connect(**_db_connect_kwargs())


@contextmanager
def pooled_conn():
    """Block until a connection is available, check it out, roll back and return it on exit."""
    _pool_semaphore.acquire()
    try:
        conn = _pool.getconn()
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
        finally:
            _pool.putconn(conn)
    finally:
        _pool_semaphore.release()


def ensure_schema(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_lock(%s)", (SCHEMA_ADVISORY_LOCK_KEY,))
        try:
            cur.execute(SCHEMA_SQL)
            conn.commit()
        finally:
            cur.execute("SELECT pg_advisory_unlock(%s)", (SCHEMA_ADVISORY_LOCK_KEY,))
            conn.commit()


def fetch_done_unit_refs(conn, index_title: str, language: str, version_title: str) -> set:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT chunked_from_ref FROM library_chunks "
            "WHERE index_title = %s AND language = %s AND version_title = %s",
            (index_title, language, version_title),
        )
        return {row[0] for row in cur.fetchall()}


def is_passage_based(index) -> bool:
    return index.get_primary_corpus() in {"Tanakh", "Bavli"}


def get_passages_for_index(index) -> list:
    prefix = re.escape(index.title)
    return list(PassageSet({"full_ref": {"$regex": fr"^{prefix} \d"}}))


def upsert_chunks(conn, rows: list):
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, rows, template=UPSERT_TEMPLATE)


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


def build_chunk_rows(unit_ref, lang: str, vtitle: str, index_title: str, chunker, result,
                     index_context: dict, version_context: dict) -> list:
    chunk_texts = [chunk.text for chunk in result.chunks]
    vectors = chunker.encoder(chunk_texts)

    unit_normal = unit_ref.normal()
    unit_slug = slugify(unit_normal)
    vtitle_slug = slugify(vtitle)

    rows = []
    for chunk_index, (chunk, vector) in enumerate(zip(result.chunks, vectors), start=1):
        chunk_hash = hashlib.sha256(
            f"{unit_normal}|{lang}|{vtitle}|{chunk_index}|{chunk.text}".encode("utf-8")
        ).hexdigest()[:12]
        doc_id = f"chunk_{lang}_{unit_slug}_{vtitle_slug}_{chunk_index}_{chunk_hash}"

        chunk_ref = chunk_ref_from_segments(chunk.source_segment_refs)
        chunk_context = get_chunk_context(chunk_ref)

        chunker_metadata = {
            "source_segment_refs": chunk.source_segment_refs,
            "chunk_kind": chunk.kind,
            "chunk_pass_number": chunk.pass_number,
            "chunk_token_count": chunk.token_count,
            "chunk_triggered": chunk.triggered,
            "chunk_score": chunk.score,
        }
        rows.append((
            doc_id, index_title, chunk_ref.normal(), chunk_ref.url(), unit_normal, version_context["language"], vtitle,
            version_context["direction"], chunk.text, vector,
            index_context["primary_category"], index_context["all_categories"],
            version_context["is_primary"], version_context["is_source"],
            json.dumps(index_context["composition_date"]), index_context["composition_place"],
            index_context["era_name"], chunk_context["pagerank"],
            index_context["author_names"], index_context["author_slugs"],
            chunk_context["associated_topic_names"], chunk_context["associated_topic_slugs"],
            chunk_context["linked_refs"], json.dumps(chunker_metadata),
        ))
    return rows


def _process_index(index, chunker, result_tracker: EmbeddingResult, get_units_for_version,
                   version_pbar=None):
    """
    Core per-index loop shared by section-based and passage-based processing.

    `get_units_for_version(version)` must return a list of (unit_ref, segment_records) pairs,
    where unit_ref is a Ref whose .normal() is used as the resume key and stored in library_chunks.ref.
    """
    index_context = get_index_context(index)

    for version in VersionSet({"title": index.title}):
        lang, vtitle = version.language, version.versionTitle
        version_context = get_version_context(version)

        with pooled_conn() as conn:
            already_done = fetch_done_unit_refs(conn, index.title, version_context["language"], vtitle)

        units = get_units_for_version(version)

        for unit_ref, segment_records in units:
            unit_normal = unit_ref.normal()
            if unit_normal in already_done:
                result_tracker.increment("sections_skipped_resume")
            elif not segment_records:
                result_tracker.increment("sections_skipped_empty")
            else:
                try:
                    chunk_result = chunker.chunk_segments(segment_records)
                    if not chunk_result.chunks:
                        result_tracker.increment("sections_skipped_empty")
                    else:
                        rows = build_chunk_rows(unit_ref, lang, vtitle, index.title, chunker, chunk_result,
                                                index_context, version_context)
                        with pooled_conn() as conn:
                            upsert_chunks(conn, rows)
                            conn.commit()
                        result_tracker.increment("sections_embedded")
                        result_tracker.increment("chunks_written", len(rows))
                        logger.debug(f"Embedded {unit_normal} ({lang}/{vtitle}): {len(rows)} chunk(s)")
                except Exception as e:
                    result_tracker.record_failure(index.title, lang, vtitle, unit_normal, e)

        if version_pbar is not None:
            version_pbar.update(1)
            version_pbar.set_postfix(index=index.title[:30], lang=lang)


def process_index(index, chunker, result_tracker: EmbeddingResult, version_pbar=None):
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
                           version_pbar=version_pbar)
            return

    section_refs = index.all_section_refs()
    if not section_refs:
        logger.debug(f"No section refs for index {index.title}, skipping")
        return

    def get_units_for_version(version):
        segment_records_by_section = collect_segment_records_by_section(version)
        return [(ref, segment_records_by_section.get(ref.normal(), [])) for ref in section_refs]

    _process_index(index, chunker, result_tracker, get_units_for_version,
                   version_pbar=version_pbar)


def thread_init(api_key: str, config):
    """Per-thread initializer: create a PatotChunker (DB connections come from the shared pool)."""
    thread_local.chunker = PatotChunker(api_key=api_key, config=config)


def main():
    args = parse_args()
    setup_logging(args.debug)

    if PatotChunker is None:
        raise SystemExit(
            "patot[chunking] extras are not installed (transformers/semantic-chunkers/semantic-router "
            "missing) - PatotChunker is unavailable. See requirements.txt for the patot dependency."
        )

    if args.shard_count < 1:
        raise SystemExit("--shard-count must be at least 1")
    if not (0 <= args.shard_index < args.shard_count):
        raise SystemExit(f"--shard-index ({args.shard_index}) must be in [0, {args.shard_count})")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("Missing GEMINI_API_KEY environment variable.")

    result = EmbeddingResult()

    logger.info(SEPARATOR_LINE)
    logger.info("EMBED LIBRARY TO PGVECTOR")
    logger.info(f"Shard {args.shard_index} of {args.shard_count}, threads={args.threads}, db_pool_size={args.db_pool_size}")
    logger.info(SEPARATOR_LINE)

    config = ChunkerConfig(
        debug=False,
        embedding_cache_enabled=True,
        embedding_cache_path="/tmp/patot/embedding_cache.sqlite",
        runtime_analytics=ChunkingRuntimeAnalytics(),
        extract_html_footnotes_to_segments=False,
    )

    schema_conn = get_db_connection()
    ensure_schema(schema_conn)
    schema_conn.close()

    global _pool, _pool_semaphore
    _pool = psycopg2.pool.ThreadedConnectionPool(1, args.db_pool_size, **_db_connect_kwargs())
    _pool_semaphore = threading.Semaphore(args.db_pool_size)

    all_indexes = library.all_index_records()
    shard_indexes = [idx for idx in all_indexes if shard_for_title(idx.title, args.shard_count) == args.shard_index]
    logger.info(f"This shard owns {len(shard_indexes)} of {len(all_indexes)} indexes")

    if args.limit_indexes is not None:
        shard_indexes = shard_indexes[:args.limit_indexes]
        logger.info(f"--limit-indexes set: processing only {len(shard_indexes)} index(es)")

    if args.max_versions is not None:
        before = len(shard_indexes)
        shard_indexes = [idx for idx in shard_indexes
                         if VersionSet({"title": idx.title}).count() <= args.max_versions]
        logger.info(f"--max-versions={args.max_versions}: excluded {before - len(shard_indexes)} index(es), "
                    f"{len(shard_indexes)} remaining")

    total_versions = sum(VersionSet({"title": idx.title}).count() for idx in shard_indexes)
    logger.info(f"Total versions in this shard: {total_versions}")

    with tqdm(total=total_versions, desc="versions", unit="ver", file=sys.stderr, disable=None) as version_pbar:
        def run_index(index):
            logger.info(f"Processing index: {index.title}")
            try:
                process_index(index, thread_local.chunker, result, version_pbar)
            except Exception as e:
                result.record_failure(index.title, "-", "-", "-", e)
            result.increment("indexes_processed")

        with ThreadPoolExecutor(
            max_workers=args.threads,
            initializer=thread_init,
            initargs=(api_key, config),
        ) as executor:
            futures = [executor.submit(run_index, index) for index in shard_indexes]
            completed = 0
            for future in as_completed(futures):
                future.result()
                completed += 1
                if completed % 10 == 0:
                    logger.info(result.get_summary())
                    logger.info(f"Analytics: {config.runtime_analytics.snapshot()}")

    logger.info(result.get_summary())
    logger.info(f"Final analytics: {config.runtime_analytics.snapshot()}")

    _pool.closeall()

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
