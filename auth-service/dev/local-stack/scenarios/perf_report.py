#!/usr/bin/env python3
"""
Helpers for the perf scenario scripts (perf-latency.sh, perf-revoke.sh, perf-replicas.sh). Each subcommand prints
result lines "pass <text>", "fail <text>" or "info <text>" that the script hands to lib.sh's pass/fail/info, or a
single value.

  perf_report.py envoy-quantiles < /stats?format=json   -> {"p50": .., "p90": .., "p99": .., "max": ..} (ms)
  perf_report.py prom-hist NAME < /metrics              -> {"n": .., "p50_le_ms": .., "p99_le_ms": ..}
  perf_report.py latency RESULTS.json                   -> result lines for the latency run
  perf_report.py revoke RESULTS.json                    -> result lines for the revoke-timing run
  perf_report.py reload-took < authsvc log               -> {"n": .., "p50_ms": .., "max_ms": .., "keys": ..}

Thresholds come from the environment (defaults in brackets):
  CLUSTER_ADDED_P50_MS [1.30], CLUSTER_ADDED_P99_MS [3.02]   the measured cluster baseline (POC, Varnish hit)
  LOCAL_ADDED_P99_BUDGET_MS [25]                             a local gate that only catches something pathological
  AUTHZ_TIMEOUT_MS [200]                                     the ext_authz timeout (Envoy fails open past it)
  NOTIFY_TARGET_MS [50], REVOKE_P50_BUDGET_MS [250], REVOKE_MAX_MS [2000]
  RELOAD_INTERVAL_S [60], FALLBACK_SLACK_S [5]
"""

import json
import math
import os
import re
import statistics
import sys


def env_f(name, default):
    return float(os.environ.get(name, default))


def say(kind, text):
    print("%s %s" % (kind, text))


def envoy_quantiles(doc):
    for stat in doc.get("stats", []):
        hist = stat.get("histograms")
        if not hist:
            continue
        qs = hist["supported_quantiles"]
        for cq in hist["computed_quantiles"]:
            vals = [v.get("cumulative") for v in cq["values"]]
            pick = dict(zip(qs, vals))
            return {"p50": pick.get(50), "p90": pick.get(90), "p99": pick.get(99), "max": pick.get(100)}
    return None


def prom_hist(text, name):
    """Upper bounds (ms) of the buckets holding p50 and p99, from a Prometheus histogram's cumulative buckets."""
    buckets = []
    count = 0
    for line in text.splitlines():
        m = re.match(r'^%s_bucket\{le="([^"]+)"\} (\S+)$' % re.escape(name), line)
        if m:
            le = math.inf if m.group(1) == "+Inf" else float(m.group(1))
            buckets.append((le, float(m.group(2))))
        m = re.match(r"^%s_count (\S+)$" % re.escape(name), line)
        if m:
            count = float(m.group(1))
    if not count:
        return {"n": 0, "p50_le_ms": None, "p99_le_ms": None}
    buckets.sort()

    def upper(q):
        for le, c in buckets:
            if c >= q * count:
                return None if le == math.inf else le * 1000
        return None

    return {"n": int(count), "p50_le_ms": upper(0.5), "p99_le_ms": upper(0.99)}


def reload_took(text):
    """'notify reload' and 'registry loaded' lines carry took=<duration>; returns ms stats and the key count."""
    vals = []
    keys = None
    for line in text.splitlines():
        if "notify reload" not in line:
            continue
        m = re.search(r'"took":"?([0-9.]+)(ns|µs|us|ms|s)"?|took=([0-9.]+)(ns|µs|us|ms|s)', line)
        if not m:
            continue
        num = float(m.group(1) or m.group(3))
        unit = m.group(2) or m.group(4)
        vals.append(num * {"ns": 1e-6, "µs": 1e-3, "us": 1e-3, "ms": 1.0, "s": 1000.0}[unit])
        k = re.search(r'"keys":(\d+)|keys=(\d+)', line)
        if k:
            keys = int(k.group(1) or k.group(2))
    if not vals:
        return {"n": 0, "p50_ms": None, "max_ms": None, "keys": keys}
    return {"n": len(vals), "p50_ms": round(statistics.median(vals), 2), "max_ms": round(max(vals), 2), "keys": keys}


def fmt(v, digits=2):
    return "-" if v is None else ("%.*f" % (digits, v))


def latency(res):
    base50, base99 = env_f("CLUSTER_ADDED_P50_MS", 1.30), env_f("CLUSTER_ADDED_P99_MS", 3.02)
    budget = env_f("LOCAL_ADDED_P99_BUDGET_MS", 25)
    timeout = env_f("AUTHZ_TIMEOUT_MS", 200)
    say("info", "PERF-L local numbers on one host; they do not replace the perf-cauldron run (release plan D6)")
    for mode, run in sorted(res.get("modes", {}).items()):
        arms = run.get("arms", {}).get("arms", {})
        for arm, v in arms.items():
            say(
                "info",
                "PERF-L %s %-4s n=%d p50=%s p90=%s p99=%s max=%s ms"
                % (mode, arm, v["n"], fmt(v["p50"]), fmt(v["p90"]), fmt(v["p99"]), fmt(v["max"])),
            )
            if v.get("checks_rate") == 1:
                say("pass", "PERF-L %s %s every response had the expected status" % (mode, arm))
            else:
                say("fail", "PERF-L %s %s unexpected statuses (checks rate %s)" % (mode, arm, v.get("checks_rate")))
        for arm, v in run.get("arms", {}).get("added", {}).items():
            say(
                "info",
                "PERF-L %s added by ext_authz (%s): p50 %+.2f ms (cluster +%.2f), p99 %+.2f ms (cluster +%.2f)"
                % (mode, arm, v["p50"], base50, v["p99"], base99),
            )
            if v["p99"] < budget:
                say(
                    "pass",
                    "PERF-L %s %s added p99 under the local %.0f ms budget (%+.2f ms)" % (mode, arm, budget, v["p99"]),
                )
            else:
                say(
                    "fail",
                    "PERF-L %s %s added p99 %+.2f ms, over the local %.0f ms budget" % (mode, arm, v["p99"], budget),
                )
        if not arms:
            say("fail", "PERF-L %s no k6 arms summary" % mode)
        env = run.get("envoy_authsvc_rq_ms")
        if not env or env.get("p99") is None:
            say("fail", "PERF-L %s no Envoy upstream_rq_time histogram for the auth service" % mode)
        else:
            say(
                "info",
                "PERF-L %s Envoy's view of the Check call (cluster.authsvc.upstream_rq_time): p50=%s p99=%s max=%s ms"
                % (mode, fmt(env["p50"]), fmt(env["p99"]), fmt(env["max"])),
            )
            ok = env["p99"] < timeout
            say(
                "pass" if ok else "fail",
                "PERF-L %s Check p99 as Envoy sees it %s ms vs the %.0f ms ext_authz timeout"
                % (mode, fmt(env["p99"]), timeout),
            )
        dec = run.get("authsvc_decision")
        if dec and dec.get("n"):
            say(
                "info",
                "PERF-L %s auth service in-process decision: n=%d p50<=%s ms p99<=%s ms (histogram bucket bounds)"
                % (mode, dec["n"], fmt(dec["p50_le_ms"], 3), fmt(dec["p99_le_ms"], 3)),
            )
        for name in ("ext_authz_error", "failure_mode_allowed"):
            delta = run.get("envoy_deltas", {}).get(name)
            if delta is None:
                say("fail", "PERF-L %s Envoy %s not recorded" % (mode, name))
            else:
                say(
                    "pass" if delta == 0 else "fail",
                    "PERF-L %s Envoy %s during the run: %d (want 0)" % (mode, name, delta),
                )
    if not res.get("modes"):
        say("fail", "PERF-L no mode was measured")
    direct = res.get("direct", {})
    g = direct.get("grpc")
    if g:
        say(
            "info",
            "PERF-L auth service direct over gRPC (%s/s, %d keys): n=%d p50=%s p99=%s p99.9=%s max=%s ms"
            % (
                direct.get("rate"),
                direct.get("keys", 0),
                g["n"],
                fmt(g["p50"]),
                fmt(g["p99"]),
                fmt(g["p999"]),
                fmt(g["max"]),
            ),
        )
        say(
            "pass" if g["p99"] < timeout else "fail",
            "PERF-L auth service p99 %s ms vs the %.0f ms ext_authz timeout" % (fmt(g["p99"]), timeout),
        )
        say(
            "pass" if direct.get("checks_rate") == 1 else "fail",
            "PERF-L every direct Check returned gRPC OK (rate %s)" % direct.get("checks_rate"),
        )
    elif "direct" in res:
        say("fail", "PERF-L the direct gRPC run produced no samples")


def revoke(res):
    target = env_f("NOTIFY_TARGET_MS", 50)
    p50_budget = env_f("REVOKE_P50_BUDGET_MS", 250)
    max_ms = env_f("REVOKE_MAX_MS", 2000)
    interval = env_f("RELOAD_INTERVAL_S", 60)
    slack = env_f("FALLBACK_SLACK_S", 5)
    keys = res.get("keys_in_registry")
    say(
        "info",
        "PERF-R local numbers; the cluster figure comes from the perf-cauldron run (registry at %s keys here)" % keys,
    )
    n = res.get("notify")
    if not n:
        say("fail", "PERF-R no NOTIFY run recorded")
    if n:
        for err in n.get("errors", []):
            say("fail", "PERF-R notify: %s" % err)
        r, c = n.get("revoke_to_deny"), n.get("create_to_allow")
        if c:
            say(
                "info",
                "PERF-R notify create-to-allow: n=%d p50=%s p90=%s max=%s ms"
                % (c["n"], fmt(c["p50"], 1), fmt(c["p90"], 1), fmt(c["max"], 1)),
            )
        if r:
            say(
                "info",
                "PERF-R notify revoke-to-deny: n=%d p50=%s p90=%s max=%s ms (target ~%.0f ms: the 50 ms coalescing window plus one reload)"
                % (r["n"], fmt(r["p50"], 1), fmt(r["p90"], 1), fmt(r["max"], 1), target),
            )
            say(
                "pass" if r["p50"] <= p50_budget else "fail",
                "PERF-R notify revoke-to-deny p50 %s ms (budget %.0f ms)" % (fmt(r["p50"], 1), p50_budget),
            )
            say(
                "pass" if r["max"] <= max_ms else "fail",
                "PERF-R notify revoke-to-deny max %s ms (budget %.0f ms)" % (fmt(r["max"], 1), max_ms),
            )
        else:
            say("fail", "PERF-R notify: no revoke was timed")
        codes = n.get("deny_codes", [])
        say(
            "pass" if codes == ["api_key_invalid"] else "fail",
            "PERF-R a revoked key's denial code: %s (want api_key_invalid)" % ",".join(codes),
        )
        rt = n.get("reload_took")
        if rt and rt.get("n"):
            say(
                "info",
                "PERF-R notify reload cost at %s keys: n=%d p50=%s max=%s ms"
                % (rt.get("keys"), rt["n"], fmt(rt["p50_ms"]), fmt(rt["max_ms"])),
            )
    f = res.get("fallback")
    if f:
        for err in f.get("errors", []):
            say("fail", "PERF-R fallback: %s" % err)
        if f.get("listener_backends") is not None:
            say(
                "pass" if f["listener_backends"] == 0 else "fail",
                "PERF-R fallback: no LISTEN backend with PG_NOTIFY_CHANNEL empty (%d)" % f["listener_backends"],
            )
        r = f.get("revoke_to_deny")
        if r:
            say(
                "info",
                "PERF-R fallback revoke-to-deny (each revoke right after a reload, so near the worst case): n=%d p50=%s max=%s ms vs RELOAD_INTERVAL %.0f s"
                % (r["n"], fmt(r["p50"], 1), fmt(r["max"], 1), interval),
            )
            say(
                "pass" if r["max"] <= (interval + slack) * 1000 else "fail",
                "PERF-R fallback: every revoke applied within the %.0f s periodic reload (+%.0f s slack): max %s ms"
                % (interval, slack, fmt(r["max"], 1)),
            )
            # With LISTEN off, nothing can apply a revoke before the next periodic reload; a fast deny means NOTIFY was still on.
            say(
                "pass" if r["p50"] >= 1000 else "fail",
                "PERF-R fallback: revoke-to-deny p50 %s ms is far above the NOTIFY figure (proves LISTEN was off)"
                % fmt(r["p50"], 1),
            )
        else:
            say("fail", "PERF-R fallback: no revoke was timed")


def main():
    cmd = sys.argv[1]
    if cmd == "envoy-quantiles":
        print(json.dumps(envoy_quantiles(json.load(sys.stdin))))
    elif cmd == "prom-hist":
        print(json.dumps(prom_hist(sys.stdin.read(), sys.argv[2])))
    elif cmd == "reload-took":
        print(json.dumps(reload_took(sys.stdin.read())))
    elif cmd == "latency":
        latency(json.load(open(sys.argv[2])))
    elif cmd == "revoke":
        revoke(json.load(open(sys.argv[2])))
    else:
        sys.exit("unknown subcommand %s" % cmd)


if __name__ == "__main__":
    main()
