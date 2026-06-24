"""
Benchmark the entity-search query change (reader/views.py -> search_poc_api).

Compares the ORIGINAL single best_fields multi_match against the NEW compound
query (best_fields + phrase_prefix, wrapped in function_score on numSources),
firing both bodies directly at Elasticsearch so Django / serialization noise is
excluded. Uses request_cache=False so repeated identical queries aren't served
from the ES request cache.

Run:  python scripts/bench_entity_search.py
      python scripts/bench_entity_search.py --iters 100 --profile
"""
import django
django.setup()

import time
import argparse
import statistics

from sefaria.helper.search import get_elasticsearch_client
from sefaria.settings import SEARCH_INDEX_NAME_TOPIC, SEARCH_INDEX_NAME_BOOK

# Same field boosts the endpoint uses.
FIELDS = [
    "title_en^3", "title_he^3",
    "titleVariants^2",
    "description_en", "description_he",
]

# Representative query set. Short prefixes are the phrase_prefix worst case.
QUERIES = [
    ("topic", "Mo"),      # short prefix - worst case for phrase_prefix expansion
    ("topic", "Mos"),
    ("topic", "Moses"),   # full token
    ("topic", "Be"),      # short prefix, common
    ("topic", "משה"),     # Hebrew
    ("book",  "Ge"),      # short prefix
    ("book",  "Genesis"), # full title
    ("book",  "Rambam"),  # author_names path
]


def old_query(query, fields, filters):
    """Original: single best_fields multi_match."""
    return {
        "bool": {
            "must": {
                "multi_match": {
                    "query": query,
                    "fields": fields,
                    "type": "best_fields",
                }
            },
            "filter": filters,
        }
    }


def new_query(query, fields, filters):
    """New: best_fields + phrase_prefix in a should, wrapped in function_score."""
    text_query = {
        "bool": {
            "should": [
                {"multi_match": {"query": query, "fields": fields,
                                 "type": "best_fields", "boost": 2}},
                {"multi_match": {"query": query, "fields": fields,
                                 "type": "phrase_prefix"}},
            ]
        }
    }
    return {
        "bool": {
            "must": {
                "function_score": {
                    "query": text_query,
                    "field_value_factor": {
                        "field": "numSources", "modifier": "log1p", "missing": 1,
                    },
                    "boost_mode": "multiply",
                }
            },
            "filter": filters,
        }
    }


def index_and_fields(entity_type):
    if entity_type == "book":
        return SEARCH_INDEX_NAME_BOOK, FIELDS + ["author_names^2"], []
    subtype = "author" if entity_type == "author" else "topic"
    return SEARCH_INDEX_NAME_TOPIC, FIELDS, [{"term": {"subtype": subtype}}]


def time_query(es, index, body, iters, warmup):
    """Return list of ES-reported `took` (ms) over `iters` runs, post-warmup."""
    for _ in range(warmup):
        es.search(index=index, query=body, size=100, request_cache=False)
    tooks = []
    for _ in range(iters):
        resp = es.search(index=index, query=body, size=100, request_cache=False)
        tooks.append(resp["took"])
    return tooks, resp["hits"]["total"]["value"]


def pct(values, p):
    if not values:
        return float("nan")
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round((p / 100.0) * (len(s) - 1)))))
    return s[k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--iters", type=int, default=50)
    ap.add_argument("--warmup", type=int, default=5)
    ap.add_argument("--profile", action="store_true",
                    help="dump ES profile for the new query on the worst-case prefix")
    args = ap.parse_args()

    es = get_elasticsearch_client()

    # Index size context - performance regressions scale with index size.
    print("=== index sizes ===")
    for idx in (SEARCH_INDEX_NAME_TOPIC, SEARCH_INDEX_NAME_BOOK):
        try:
            c = es.count(index=idx)["count"]
        except Exception as e:
            c = f"err: {e}"
        print(f"  {idx}: {c} docs")
    print(f"\niters={args.iters} warmup={args.warmup} (ES `took` ms, request_cache=False)\n")

    header = f"{'type':5} {'query':10} {'hits':>5} | {'old p50':>8} {'old p95':>8} | {'new p50':>8} {'new p95':>8} | {'p50 Δ':>7} {'p95 Δ':>7}"
    print(header)
    print("-" * len(header))

    for entity_type, q in QUERIES:
        index, fields, filters = index_and_fields(entity_type)
        try:
            old_t, _ = time_query(es, index, old_query(q, fields, filters), args.iters, args.warmup)
            new_t, hits = time_query(es, index, new_query(q, fields, filters), args.iters, args.warmup)
        except Exception as e:
            print(f"{entity_type:5} {q:10}  ERROR: {e}")
            continue
        o50, o95 = pct(old_t, 50), pct(old_t, 95)
        n50, n95 = pct(new_t, 50), pct(new_t, 95)
        print(f"{entity_type:5} {q:10} {hits:>5} | {o50:>8} {o95:>8} | {n50:>8} {n95:>8} | "
              f"{n50 - o50:>+7} {n95 - o95:>+7}")

    if args.profile:
        print("\n=== ES profile: new query, worst-case short prefix (topic 'Mo') ===")
        index, fields, filters = index_and_fields("topic")
        resp = es.search(index=index, query=new_query("Mo", fields, filters),
                         size=100, request_cache=False, profile=True)
        # Surface just the per-query rewrite + total time per shard.
        for shard in resp["profile"]["shards"]:
            for search in shard["searches"]:
                for qd in search["query"]:
                    nanos = qd.get("time_in_nanos", 0)
                    print(f"  {qd['type']:30} {nanos/1e6:8.3f} ms  {qd.get('description','')[:60]}")


if __name__ == "__main__":
    main()
