"""
Evaluate KNN search quality against a ground-truth CSV.

For each row, embeds each of the 3 query types (stam, getting_wild, peyote),
queries the prod pgvector DB directly for the top 100 nearest neighbors, and
records what rank the target ref appears at.

Requires env vars: PGVECTOR_HOST, PGVECTOR_DB_PORT, POSTGRES_USER, POSTGRES_PASSWORD,
PGVECTOR_DB (defaults to pgvector), GEMINI_API_KEY.

Usage:
    ./run scripts/eval_knn_search_queries.py
"""
import csv
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import django
django.setup()

import psycopg2
from sefaria.model import Ref
from tqdm import tqdm

from semantic_search.query_embedding import embed_query

INPUT_CSV = "data/private/top_100_refs_eval_queries - top_100_refs_eval_queries.csv"
OUTPUT_CSV = "data/private/knn_search_eval_results.csv"
QUERY_TYPES = ["stam", "getting_wild", "peyote"]
LIMIT = 100

_local = threading.local()


def _get_conn():
    if not hasattr(_local, "conn") or _local.conn.closed:
        _local.conn = psycopg2.connect(
            host=os.environ.get("PGVECTOR_HOST", "localhost"),
            port=os.environ.get("PGVECTOR_DB_PORT", "5432"),
            dbname=os.environ.get("PGVECTOR_DB", "pgvector"),
            user=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
        )
        _local.conn.autocommit = True
    return _local.conn


def search_pgvector(embedding: list[float], limit: int = LIMIT) -> list[str]:
    conn = _get_conn()
    vec_literal = "[" + ",".join(str(x) for x in embedding) + "]"
    with conn.cursor() as cur:
        cur.execute(
            "SELECT ref FROM library_chunks ORDER BY embedding <=> %s::vector LIMIT %s",
            (vec_literal, limit),
        )
        return [row[0] for row in cur.fetchall()]


def ref_contains(result_ref_str: str, target_ref_str: str) -> bool:
    try:
        result_ref = Ref(result_ref_str)
        target_ref = Ref(target_ref_str)
        return result_ref.contains(target_ref) or result_ref == target_ref
    except Exception:
        return result_ref_str == target_ref_str


def find_rank(result_refs: list[str], target_ref: str) -> int | None:
    for i, rref in enumerate(result_refs):
        if ref_contains(rref, target_ref):
            return i + 1
    return None


def process_row(row: dict) -> dict:
    target_ref = row["ref"]
    result = dict(row)
    for qt in QUERY_TYPES:
        query_text = row[qt]
        try:
            embedding = embed_query(query_text)
            result_refs = search_pgvector(embedding)
            rank = find_rank(result_refs, target_ref)
            result[f"{qt}_rank"] = rank if rank is not None else ""
        except Exception as e:
            print(f"  WARNING: {qt} query failed for {target_ref}: {e}", file=sys.stderr)
            result[f"{qt}_rank"] = ""
    return result


def main():
    for var in ("POSTGRES_USER", "POSTGRES_PASSWORD", "GEMINI_API_KEY"):
        if not os.environ.get(var):
            print(f"ERROR: {var} env var is required", file=sys.stderr)
            sys.exit(1)

    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"Loaded {len(rows)} rows from {INPUT_CSV}")
    print(f"Querying pgvector at {os.environ.get('PGVECTOR_HOST', 'localhost')}:"
          f"{os.environ.get('PGVECTOR_DB_PORT', '5432')} with limit={LIMIT}")

    results: list[dict] = [{}] * len(rows)
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            pool.submit(process_row, row): i
            for i, row in enumerate(rows)
        }
        for future in tqdm(as_completed(futures), total=len(rows), desc="Evaluating"):
            idx = futures[future]
            results[idx] = future.result()

    output_fields = list(rows[0].keys()) + [f"{qt}_rank" for qt in QUERY_TYPES]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=output_fields)
        writer.writeheader()
        writer.writerows(results)

    found = {qt: 0 for qt in QUERY_TYPES}
    total = len(results)
    for r in results:
        for qt in QUERY_TYPES:
            if r[f"{qt}_rank"] != "":
                found[qt] += 1

    print(f"\nResults written to {OUTPUT_CSV}")
    print(f"\nHit rates (target found in top {LIMIT}):")
    for qt in QUERY_TYPES:
        print(f"  {qt}: {found[qt]}/{total} ({100*found[qt]/total:.1f}%)")

    ranks: dict[str, list[int]] = {qt: [] for qt in QUERY_TYPES}
    for r in results:
        for qt in QUERY_TYPES:
            if r[f"{qt}_rank"] != "":
                ranks[qt].append(int(r[f"{qt}_rank"]))

    print(f"\nMean rank (when found):")
    for qt in QUERY_TYPES:
        if ranks[qt]:
            print(f"  {qt}: {sum(ranks[qt])/len(ranks[qt]):.1f}")


if __name__ == "__main__":
    main()
