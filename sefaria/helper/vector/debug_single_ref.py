#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Debug script: chunk and embed a single section ref, write output to a JSON file.

Shows exactly what would be upserted into the library_chunks pgvector table,
with embeddings truncated to their first 8 dimensions + L2 norm.

Usage:
    ./run sefaria/helper/vector/debug_single_ref.py "Genesis 1" [--lang en] [--vtitle "Sefaria Community Translation"] [--out /tmp/chunks.json] [--debug]
"""

import argparse
import json
import os
import sys
from datetime import datetime

import django
django.setup()

from sefaria.model import *
from sefaria.search import setup_logging

from patot import ChunkerConfig, PatotChunker
from patot.analytics import ChunkingRuntimeAnalytics

from sefaria.helper.vector.embed_library_to_pgvector import (
    collect_segment_records_by_section,
    get_index_context,
    get_version_context,
    build_chunk_rows,
)

# Column names matching the library_chunks table, in the same order as build_chunk_rows tuples.
_COLUMNS = [
    "doc_id", "index_title", "ref", "url", "language", "version_title",
    "direction", "text", "embedding",
    "primary_category", "all_categories", "is_primary", "is_source",
    "composition_date", "composition_place", "era_name", "pagerank",
    "author_names", "author_slugs",
    "associated_topic_names", "associated_topic_slugs",
    "linked_refs", "chunker_metadata",
]


def row_to_dict(row: tuple) -> dict:
    d = dict(zip(_COLUMNS, row))
    vector = d["embedding"]
    d["embedding"] = {
        "preview_dims_0_7": list(vector[:8]),
        "norm": sum(x * x for x in vector) ** 0.5,
        "total_dims": len(vector),
    }
    # composition_date and chunker_metadata arrive as JSON strings from build_chunk_rows
    for key in ("composition_date", "chunker_metadata"):
        if isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


def main():
    parser = argparse.ArgumentParser(description="Show exact pgvector rows for a single section ref.")
    parser.add_argument("ref", help="Section ref to process, e.g. 'Genesis 1'")
    parser.add_argument("--lang", default=None, help="Language filter (e.g. 'en', 'he'). Defaults to all versions.")
    parser.add_argument("--vtitle", default=None, help="Version title filter. Defaults to all versions.")
    parser.add_argument("--out", default="/tmp/debug_chunks.json", help="Output JSON file path.")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    setup_logging(args.debug)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("Missing GEMINI_API_KEY environment variable.")

    section_ref = Ref(args.ref)
    if not section_ref.is_section_level():
        raise SystemExit(f"'{args.ref}' is not a section-level ref. Try e.g. 'Genesis 1' or 'Berakhot 2a'.")

    index = section_ref.index
    version_filter = {"title": index.title}
    if args.lang:
        version_filter["language"] = args.lang
    if args.vtitle:
        version_filter["versionTitle"] = args.vtitle

    versions = list(VersionSet(version_filter))
    if not versions:
        raise SystemExit(f"No versions found for filter: {version_filter}")

    config = ChunkerConfig(
        debug=args.debug,
        embedding_cache_enabled=True,
        embedding_cache_path="/tmp/patot/embedding_cache.sqlite",
        runtime_analytics=ChunkingRuntimeAnalytics(),
        extract_html_footnotes_to_segments=False,
    )
    chunker = PatotChunker(api_key=api_key, config=config)
    index_context = get_index_context(index)

    output = {
        "ref": section_ref.normal(),
        "index_title": index.title,
        "generated_at": datetime.now().isoformat(),
        "table": "library_chunks",
        "rows": [],
    }

    for version in versions:
        version_context = get_version_context(version)
        segment_records_by_section = collect_segment_records_by_section(version)
        segment_records = segment_records_by_section.get(section_ref.normal(), [])

        if not segment_records:
            continue

        chunk_result = chunker.chunk_segments(segment_records)
        if not chunk_result.chunks:
            continue

        rows = build_chunk_rows(
            section_ref, version_context["language"], version.versionTitle, index.title,
            chunker, chunk_result, index_context, version_context,
        )
        output["rows"].extend(row_to_dict(row) for row in rows)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2, default=str)

    print(f"Wrote {len(output['rows'])} row(s) to {args.out}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
