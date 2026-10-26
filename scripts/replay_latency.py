"""
Replay prod GET traffic against a target and measure latency, to compare a branch against baseline.

Does not need Django. Needs aiohttp (pip install aiohttp; deliberately not in requirements.txt).

Preprod runs on the production cluster and shares Mongo with prod, so the replay is read-only by construction
(only GETs, with an allowlist of routes audited for writes) and DB-state snapshots can't be used as a guard:
prod's own writes would change them.

Preprod web has 2 pods. Port-forward ONE pod (container port 80) and use the same pod for the whole comparison;
after deploying the branch the pods are replaced, so pick a fresh pod then. `localhost` is accepted as Host.

    kubectl -n preprod port-forward pod/<preprod-web-pod> 8000:80

    python scripts/replay_latency.py run --label baseline-1
    python scripts/replay_latency.py run --label baseline-2
    # deploy the branch to preprod, re-run the port-forward against a new pod, then:
    python scripts/replay_latency.py run --label branch-1
    python scripts/replay_latency.py run --label branch-2

    python scripts/replay_latency.py compare --baseline baseline-1 baseline-2 --candidate branch-1 branch-2
"""
import argparse
import asyncio
import json
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

REPLAY_FILE = Path("data/private/prod_get_replay.jsonl")
RESULTS_DIR = Path("data/private/replay_results")
PAGE_PREFIXES = {"topics", "texts", "collections", "calendars", "community", "visualize"}
MIN_COUNT_FOR_VERDICT = 100  # routes with fewer samples are reported but never decide go/no-go
REGRESSION_MARGIN = 0.10  # allowed p95 regression beyond the measured noise floor
MIN_OK_SHARE = 0.90  # runs with fewer 2xx/3xx than this are invalid, not "fast"


def route_key(url):
    """Group a URL into a route bucket, e.g. /api/v3/texts, /api/texts/versions, page:ref."""
    segments = [s for s in url.split("?")[0].split("/") if s]
    if not segments:
        return "page:home"
    if segments[0] == "api":
        if len(segments) > 2 and (segments[1] in {"v2", "v3"} or (segments[1] == "texts" and segments[2] == "versions")):
            return "/".join(["api"] + segments[1:3])
        return "/".join(["api"] + segments[1:2])
    return f"page:{segments[0]}" if segments[0] in PAGE_PREFIXES else "page:ref"


def load_replay(limit=None):
    rows = []
    with open(REPLAY_FILE) as fin:
        for line in fin:
            rows.append(json.loads(line)["url"])
            if limit and len(rows) >= limit:
                break
    return rows


async def replay_pass(urls, base_url, concurrency, host_header, timeout_s):
    """Replay urls in file order with `concurrency` workers. Returns a list of (url, status, seconds)."""
    import aiohttp

    headers = {"Host": host_header} if host_header else {}
    connector = aiohttp.TCPConnector(limit=concurrency)
    client_timeout = aiohttp.ClientTimeout(total=timeout_s)
    queue = asyncio.Queue()
    for url in urls:
        queue.put_nowait(url)
    results = []

    async def worker(session):
        while True:
            try:
                url = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            start = time.perf_counter()
            try:
                # no cookies, no redirect following: measure exactly the request in the file
                async with session.get(base_url + url, allow_redirects=False) as resp:
                    await resp.read()
                    status = resp.status
            except asyncio.TimeoutError:
                status = "timeout"
            except aiohttp.ClientError as e:
                status = f"error:{type(e).__name__}"
            results.append((url, status, time.perf_counter() - start))

    async with aiohttp.ClientSession(
        headers=headers, connector=connector, timeout=client_timeout, cookie_jar=aiohttp.DummyCookieJar()
    ) as session:
        await asyncio.gather(*(worker(session) for _ in range(concurrency)))
    return results


def percentile(sorted_values, p):
    if not sorted_values:
        return None
    idx = min(len(sorted_values) - 1, int(round(p / 100 * (len(sorted_values) - 1))))
    return sorted_values[idx]


def summarize(results):
    by_route = defaultdict(list)
    statuses = defaultdict(lambda: defaultdict(int))
    for url, status, secs in results:
        key = route_key(url)
        by_route[key].append(secs)
        statuses[key][str(status)] += 1
    by_route["ALL"] = [secs for _, _, secs in results]
    statuses["ALL"] = defaultdict(int)
    for _, status, _ in results:
        statuses["ALL"][str(status)] += 1

    summary = {}
    for key, values in by_route.items():
        values = sorted(values)
        summary[key] = {
            "count": len(values),
            "mean": statistics.fmean(values),
            "p50": percentile(values, 50),
            "p95": percentile(values, 95),
            "p99": percentile(values, 99),
            "statuses": dict(statuses[key]),
        }
    return summary


def cmd_run(args):
    urls = load_replay(args.limit)
    base_url = args.base_url.rstrip("/")
    print(f"{len(urls)} urls -> {base_url} at concurrency {args.concurrency}")

    if not args.no_warmup:
        print("warm-up pass (discarded)...")
        warm = asyncio.run(replay_pass(urls, base_url, args.concurrency, args.host_header, args.timeout))
        print(f"  warm-up done, {sum(1 for _, s, _ in warm if s == 200)}/{len(warm)} were 200")

    print("measured pass...")
    start = time.perf_counter()
    results = asyncio.run(replay_pass(urls, base_url, args.concurrency, args.host_header, args.timeout))
    wall = time.perf_counter() - start

    summary = summarize(results)
    out = {
        "label": args.label,
        "base_url": base_url,
        "concurrency": args.concurrency,
        "wall_seconds": wall,
        "throughput_rps": len(results) / wall,
        "summary": summary,
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RESULTS_DIR / f"{args.label}.json"
    out_path.write_text(json.dumps(out, indent=2))
    print_run(out)
    print(f"\nwrote {out_path}")


def print_run(run):
    print(f"\n{run['label']}: {run['throughput_rps']:.1f} req/s over {run['wall_seconds']:.0f}s")
    print(f"{'route':32} {'n':>6} {'p50':>8} {'p95':>8} {'p99':>8}  non-200")
    for key, s in sorted(run["summary"].items(), key=lambda kv: -kv[1]["count"]):
        non_200 = {k: v for k, v in s["statuses"].items() if k != "200"}
        print(f"{key:32} {s['count']:>6} {s['p50']*1000:>7.0f}ms {s['p95']*1000:>7.0f}ms {s['p99']*1000:>7.0f}ms  {non_200 or ''}")


def load_run(label):
    return json.loads((RESULTS_DIR / f"{label}.json").read_text())


def pooled(labels, key, metric):
    """Mean of a metric across repeated runs of the same configuration."""
    values = [load_run(l)["summary"][key][metric] for l in labels if key in load_run(l)["summary"]]
    return statistics.fmean(values) if values else None


def cmd_compare(args):
    if len(args.baseline) < 2:
        sys.exit("need at least 2 baseline runs to measure the noise floor")
    print(f"noise floor = relative p95 gap between baseline runs; verdict margin = noise + {REGRESSION_MARGIN:.0%}")
    print(f"{'route':32} {'n':>6} {'base p95':>9} {'cand p95':>9} {'delta':>8} {'noise':>7}  verdict")
    base_all = load_run(args.baseline[0])["summary"]
    failed = []
    for key in sorted(base_all, key=lambda k: -base_all[k]["count"]):
        base_p95 = pooled(args.baseline, key, "p95")
        cand_p95 = pooled(args.candidate, key, "p95")
        if base_p95 is None or cand_p95 is None:
            continue
        p95s = [load_run(l)["summary"][key]["p95"] for l in args.baseline]
        noise = (max(p95s) - min(p95s)) / base_p95
        delta = (cand_p95 - base_p95) / base_p95
        count = base_all[key]["count"]
        if count < MIN_COUNT_FOR_VERDICT:
            verdict = "n too small"
        elif delta > noise + REGRESSION_MARGIN:
            verdict = "REGRESSION"
            failed.append(key)
        else:
            verdict = "ok"
        print(f"{key:32} {count:>6} {base_p95*1000:>8.0f}ms {cand_p95*1000:>8.0f}ms {delta:>+7.1%} {noise:>6.1%}  {verdict}")

    print("\nstatus-code check (route=ALL):")
    invalid = []
    for role, labels in (("baseline", args.baseline), ("candidate", args.candidate)):
        for label in labels:
            all_stats = load_run(label)["summary"]["ALL"]
            ok_share = sum(v for k, v in all_stats["statuses"].items() if k.startswith(("2", "3"))) / all_stats["count"]
            print(f"  {role:9} {label}: {ok_share:.1%} 2xx/3xx  {all_stats['statuses']}")
            if ok_share < MIN_OK_SHARE:
                invalid.append(label)
    if invalid:
        sys.exit(f"\nINVALID: {', '.join(invalid)} have <{MIN_OK_SHARE:.0%} 2xx/3xx responses (bad port-forward?). Latency is meaningless.")
    print("\nNO-GO: " + ", ".join(failed) if failed else "\nGO: no route regressed beyond noise + margin")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="warm up, then replay and record latency")
    run.add_argument("--label", required=True, help="result name, e.g. baseline-1 or branch-1")
    run.add_argument("--base-url", default="http://localhost:8000", help="port-forwarded preprod web pod (kubectl port-forward pod/<pod> 8000:80)")
    run.add_argument("--host-header", help="Host header to send (not needed: preprod pods accept localhost)")
    run.add_argument("--concurrency", type=int, default=20)
    run.add_argument("--timeout", type=float, default=60)
    run.add_argument("--limit", type=int, help="only replay the first N urls (smoke test)")
    run.add_argument("--no-warmup", action="store_true")
    run.set_defaults(func=cmd_run)

    compare = sub.add_parser("compare", help="baseline runs vs candidate runs, with noise floor and verdict")
    compare.add_argument("--baseline", nargs="+", required=True)
    compare.add_argument("--candidate", nargs="+", required=True)
    compare.set_defaults(func=cmd_compare)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
