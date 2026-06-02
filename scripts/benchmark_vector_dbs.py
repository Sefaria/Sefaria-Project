"""
Benchmark pgvector vs Qdrant latency using pre-embedded query vectors.

Usage:
    python scripts/benchmark_vector_dbs.py \\
        --queries queries.json \\
        [--top-k 10] \\
        [--base-url http://localhost:8000] \\
        [--runs 3]

queries.json format:
    [{"label": "some query text", "embedding": [0.1, 0.2, ...]}, ...]

Does NOT use Django — communicates purely via HTTP.
"""
import argparse
import json
import statistics
import time
import datetime
import sys
import requests

BACKENDS = ["pgvector", "qdrant"]

parser = argparse.ArgumentParser()
parser.add_argument("--queries", required=True, help="Path to queries JSON file")
parser.add_argument("--top-k", type=int, default=10)
parser.add_argument("--base-url", default="http://localhost:8000")
parser.add_argument("--runs", type=int, default=3, help="Repeat each query N times to warm up")
args = parser.parse_args()

with open(args.queries) as f:
    queries = json.load(f)

if not queries:
    print("No queries found in file.")
    sys.exit(1)

print(f"Loaded {len(queries)} queries. Running {args.runs} pass(es) each against {BACKENDS}.\n")

latencies = {b: [] for b in BACKENDS}
per_query_results = []

for run in range(args.runs):
    for q in queries:
        row = {"label": q.get("label", ""), "run": run}
        for backend in BACKENDS:
            url = f"{args.base_url}/api/v3/vector-search/{backend}"
            payload = {"embedding": q["embedding"], "top_k": args.top_k}
            t0 = time.perf_counter()
            resp = requests.post(url, json=payload, timeout=30)
            elapsed_ms = (time.perf_counter() - t0) * 1000
            resp.raise_for_status()
            latencies[backend].append(elapsed_ms)
            row[backend] = {"latency_ms": round(elapsed_ms, 2), "top_ref": resp.json()["results"][0]["ref"] if resp.json()["results"] else None}
        per_query_results.append(row)


def stats(vals):
    vals_sorted = sorted(vals)
    n = len(vals_sorted)
    return {
        "mean": statistics.mean(vals_sorted),
        "p50": vals_sorted[int(n * 0.50)],
        "p95": vals_sorted[int(n * 0.95)],
        "p99": vals_sorted[min(int(n * 0.99), n - 1)],
        "runs": n,
    }


print(f"{'Backend':<12} {'Mean':>8} {'P50':>8} {'P95':>8} {'P99':>8} {'Runs':>6}")
print("-" * 52)
for backend in BACKENDS:
    s = stats(latencies[backend])
    print(f"{backend:<12} {s['mean']:>7.1f}ms {s['p50']:>7.1f}ms {s['p95']:>7.1f}ms {s['p99']:>7.1f}ms {s['runs']:>6}")

timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
out_path = f"benchmark_results_{timestamp}.json"
with open(out_path, "w") as f:
    json.dump({"summary": {b: stats(latencies[b]) for b in BACKENDS}, "queries": per_query_results}, f, indent=2)
print(f"\nFull results written to {out_path}")
