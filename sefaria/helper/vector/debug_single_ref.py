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

from semantic_search.embedder import GeminiEmbedder
from sefaria.helper.vector.context import get_index_context, get_version_context
from sefaria.helper.vector.embed_library_to_pgvector import (
    collect_segment_records_by_section,
    build_chunk_data,
)


def chunk_to_dict(chunk) -> dict:
    embedding = list(chunk.embedding) if chunk.embedding is not None else []
    d = {
        "doc_id": chunk.doc_id,
        "index_title": chunk.index_title,
        "ref": chunk.ref,
        "url": chunk.url,
        "chunked_from_ref": chunk.chunked_from_ref,
        "language": chunk.language,
        "version_title": chunk.version_title,
        "direction": chunk.direction,
        "text": chunk.text,
        "embedding": {
            "preview_dims_0_7": embedding[:8],
            "norm": sum(x * x for x in embedding) ** 0.5,
            "total_dims": len(embedding),
        },
        "primary_category": chunk.primary_category,
        "all_categories": chunk.all_categories,
        "is_primary": chunk.is_primary,
        "is_source": chunk.is_source,
        "composition_date": chunk.composition_date,
        "composition_place": chunk.composition_place,
        "era_name": chunk.era_name,
        "pagerank": chunk.pagerank,
        "author_names": chunk.author_names,
        "author_slugs": chunk.author_slugs,
        "associated_topic_names": chunk.associated_topic_names,
        "associated_topic_slugs": chunk.associated_topic_slugs,
        "linked_refs": chunk.linked_refs,
        "chunker_metadata": chunk.chunker_metadata,
    }
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
    embedder = GeminiEmbedder(api_key=api_key)
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

        chunks = build_chunk_data(
            section_ref, version_context["language"], version.versionTitle, index.title,
            embedder, chunk_result, index_context, version_context,
        )
        output["rows"].extend(chunk_to_dict(c) for c in chunks)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2, default=str)

    print(f"Wrote {len(output['rows'])} row(s) to {args.out}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
