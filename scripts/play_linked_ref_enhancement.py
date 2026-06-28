#!/usr/bin/env python3
"""
Playground for semantic search linked-ref enhancement.

Edit the constants below, then run:

    python scripts/play_linked_ref_enhancement.py

This does not start an HTTP server. It initializes Django, runs semantic search,
then calls the linked-ref enhancement helper directly.
"""
import os
import socket
import sys


# ---------------------------------------------------------------------------
# Edit these while tuning.
# ---------------------------------------------------------------------------

QUERY = "love thy neighbor"
LIMIT = 100
FILTERS = {"language": "en"}

# How many graph hops to inspect:
#   1 = links from semantic results
#   2 = links from semantic results, then links from those linked refs
LINKED_REFS_DEPTH = 1

# Append only refs that appear at least this many times in the link neighborhood.
MIN_LINK_COUNT = 2

SHOW_RESULT_TEXT = False
TEXT_PREVIEW_CHARS = 180

PGVECTOR_HOST = "localhost"
PGVECTOR_PORT = 15432


def setup_django():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if root not in sys.path:
        sys.path.insert(0, root)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

    import django
    django.setup()


def preview(text):
    text = " ".join((text or "").split())
    if len(text) <= TEXT_PREVIEW_CHARS:
        return text
    return f"{text[:TEXT_PREVIEW_CHARS]}..."


def main():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        if sock.connect_ex((PGVECTOR_HOST, PGVECTOR_PORT)) != 0:
            print(
                f"ERROR: pgvector port-forward is not listening on "
                f"{PGVECTOR_HOST}:{PGVECTOR_PORT}",
                file=sys.stderr,
            )
            print(
                "Start it with:\n"
                "  kubectl --context gke_production-deployment_us-east1-b_cluster-1 "
                "port-forward -n default svc/pgvector 15432:5432",
                file=sys.stderr,
            )
            sys.exit(1)

    setup_django()

    from semantic_search.linked_refs import get_linked_ref_enhancements
    from semantic_search.search import semantic_search

    print("Linked Ref Enhancement Playground")
    print("=" * 42)
    print(f"query: {QUERY!r}")
    print(f"limit: {LIMIT}")
    print(f"filters: {FILTERS}")
    print(f"linked_refs_depth: {LINKED_REFS_DEPTH}")
    print(f"min_link_count: {MIN_LINK_COUNT}")

    results = semantic_search(QUERY, filters=FILTERS, limit=LIMIT)
    enhancement = get_linked_ref_enhancements(
        results,
        link_depth=LINKED_REFS_DEPTH,
        min_link_count=MIN_LINK_COUNT,
    )

    print("\nSemantic Results")
    print("-" * 42)
    for i, result in enumerate(results, start=1):
        print(f"{i:>2}. {result.ref} [{result.index_title}, {result.language}]")
        print(f"    linked_refs: {len(result.linked_refs)}")
        if SHOW_RESULT_TEXT:
            print(f"    {preview(result.text)}")

    print("\nAppended Refs")
    print("-" * 42)
    if not enhancement.appended_refs:
        print("(none)")
    for i, ref in enumerate(enhancement.appended_refs, start=1):
        print(f"{i:>2}. {ref}  count={enhancement.ref_counts[ref]}")

    print("\nSummary")
    print("-" * 42)
    print(f"semantic_results: {len(results)}")
    print(f"appended_refs: {len(enhancement.appended_refs)}")


if __name__ == "__main__":
    main()
