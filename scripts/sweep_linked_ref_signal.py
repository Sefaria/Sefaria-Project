#!/usr/bin/env python3
"""
Collect linked-ref count distributions for semantic-search parameter sweeps.

Edit QUERIES, LIMITS, and LINK_DEPTHS below, then run:

    python scripts/sweep_linked_ref_signal.py

Local prerequisites are the same as the semantic search endpoint: Django
settings must have GEMINI_API_KEY configured and vector_db must be reachable.
For prod pgvector locally, start the port-forward first.
"""
import json
import os
import statistics
import sys
import time
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Edit these while tuning.
# ---------------------------------------------------------------------------

QUERIES = [
    "love thy neighbor",
    "honor your father and mother",
    "do not stand idly by the blood of your neighbor",
]

LIMITS = [5, 10, 20, 30, 50]
LINK_DEPTHS = [1]
FILTERS = {"language": "en"}

OUTPUT_PATH = "scripts/output/linked_ref_signal.jsonl"

# Set to None to write full distributions. Use an int while debugging.
MAX_COUNTS_TO_WRITE = None


def setup_django():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if root not in sys.path:
        sys.path.insert(0, root)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

    import django
    django.setup()


def percentile(sorted_values, pct):
    if not sorted_values:
        return 0
    index = (len(sorted_values) - 1) * pct
    lower = int(index)
    upper = min(lower + 1, len(sorted_values) - 1)
    if lower == upper:
        return sorted_values[lower]
    weight = index - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def summarize_counts(counts):
    values = sorted(counts.values())
    if not values:
        return {
            "num_candidate_linked_refs": 0,
            "max_count": 0,
            "second_max_count": 0,
            "mean_count": 0,
            "median_count": 0,
            "std_count": 0,
            "p90_count": 0,
            "p95_count": 0,
            "num_refs_count_ge_2": 0,
            "num_refs_count_ge_3": 0,
            "num_refs_count_ge_5": 0,
            "top_count_to_median_ratio": None,
            "top_count_to_p95_ratio": None,
            "top_z_score": None,
        }

    descending = sorted(values, reverse=True)
    max_count = descending[0]
    second_max_count = descending[1] if len(descending) > 1 else 0
    mean_count = statistics.mean(values)
    median_count = statistics.median(values)
    std_count = statistics.pstdev(values) if len(values) > 1 else 0
    p90_count = percentile(values, 0.90)
    p95_count = percentile(values, 0.95)

    return {
        "num_candidate_linked_refs": len(values),
        "max_count": max_count,
        "second_max_count": second_max_count,
        "mean_count": mean_count,
        "median_count": median_count,
        "std_count": std_count,
        "p90_count": p90_count,
        "p95_count": p95_count,
        "num_refs_count_ge_2": sum(1 for value in values if value >= 2),
        "num_refs_count_ge_3": sum(1 for value in values if value >= 3),
        "num_refs_count_ge_5": sum(1 for value in values if value >= 5),
        "top_count_to_median_ratio": max_count / median_count if median_count else None,
        "top_count_to_p95_ratio": max_count / p95_count if p95_count else None,
        "top_z_score": (max_count - mean_count) / std_count if std_count else None,
    }


def serialize_counts(counts):
    items = counts.most_common()
    if MAX_COUNTS_TO_WRITE is not None:
        items = items[:MAX_COUNTS_TO_WRITE]
    return dict(items)


def main():
    setup_django()

    from semantic_search.linked_refs import get_linked_ref_counts
    from semantic_search.search import semantic_search

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    total = len(QUERIES) * len(LIMITS) * len(LINK_DEPTHS)
    completed = 0
    started_at = datetime.now(timezone.utc).isoformat()

    print("Linked Ref Signal Sweep")
    print("=" * 42)
    print(f"queries: {len(QUERIES)}")
    print(f"limits: {LIMITS}")
    print(f"link_depths: {LINK_DEPTHS}")
    print(f"filters: {FILTERS}")
    print(f"output: {OUTPUT_PATH}")

    with open(OUTPUT_PATH, "w") as fout:
        for query in QUERIES:
            for limit in LIMITS:
                search_started = time.monotonic()
                results = semantic_search(query, filters=FILTERS, limit=limit)
                search_elapsed_ms = round((time.monotonic() - search_started) * 1000)

                for link_depth in LINK_DEPTHS:
                    links_started = time.monotonic()
                    counts = get_linked_ref_counts(results, link_depth=link_depth)
                    links_elapsed_ms = round((time.monotonic() - links_started) * 1000)
                    summary = summarize_counts(counts)

                    row = {
                        "collected_at": datetime.now(timezone.utc).isoformat(),
                        "run_started_at": started_at,
                        "query": query,
                        "semantic_limit": limit,
                        "linked_refs_depth": link_depth,
                        "filters": FILTERS,
                        "num_semantic_results": len(results),
                        "semantic_result_refs": [result.ref for result in results],
                        "search_elapsed_ms": search_elapsed_ms,
                        "link_collection_elapsed_ms": links_elapsed_ms,
                        "counts": serialize_counts(counts),
                        "summary": summary,
                    }
                    fout.write(json.dumps(row, ensure_ascii=False) + "\n")
                    fout.flush()

                    completed += 1
                    print(
                        f"[{completed}/{total}] "
                        f"limit={limit} depth={link_depth} "
                        f"candidates={summary['num_candidate_linked_refs']} "
                        f"max={summary['max_count']} "
                        f"query={query!r}"
                    )

    print("\nDone.")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
