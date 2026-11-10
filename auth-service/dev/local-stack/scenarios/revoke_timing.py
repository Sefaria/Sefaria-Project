#!/usr/bin/env python3
"""
Create-to-allow and revoke-to-deny timing on the drill stack (perf-revoke.sh runs it).

Each trial inserts a live key on the drill project and commits, then polls the gated path through Envoy until it
answers 200; then sets revoked_at and commits, and polls until it answers 401 with code api_key_invalid. Both
times run from the moment the commit returned, so they cover the trigger's NOTIFY, the auth service's 50 ms
coalescing window, the full registry reload and Envoy's next Check. The writes are the same row changes the
Django writer makes (powered_by.developer.create_key and revoke_key), so the same triggers fire.

--batch creates every trial's key first and waits for all of them, then revokes them one at a time, each
right after the previous deny. Use it when only the periodic reload can apply changes: each revoke then lands
just after a reload, so it measures close to the worst case (about one RELOAD_INTERVAL).

Prints one JSON document: per-trial times in ms and p50/max per measure. Key values are never printed; each key's
label is printed with a 4-character prefix of the value at most.

  revoke_timing.py --pg-port 55439 --gw-port 20080 --trials 20
  revoke_timing.py --pg-port 55439 --gw-port 20080 --trials 3 --batch --poll 0.02 --timeout 90
"""

import argparse
import http.client
import json
import secrets
import statistics
import string
import sys
import time

import psycopg2

PROJECT_ID = 9001
ALPHABET = string.ascii_letters + string.digits


def poll(port, path, key, want, timeout, interval):
    """Polls until the gated path answers `want`; returns (seconds waited, last status, last body) or None."""
    t0 = time.monotonic()
    conn = None
    status, body = 0, b""
    while time.monotonic() - t0 < timeout:
        try:
            if conn is None:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", path, headers={"x-api-key": key})
            resp = conn.getresponse()
            body = resp.read()
            status = resp.status
        except (OSError, http.client.HTTPException):
            conn = None
            status = 0
        if status == want:
            elapsed = time.monotonic() - t0
            if conn is not None:
                conn.close()
            return elapsed, status, body
        time.sleep(interval)
    if conn is not None:
        conn.close()
    return None


def deny_code(body):
    try:
        return json.loads(body).get("code") or "-"
    except (ValueError, AttributeError):
        return "-"


def stats(values):
    if not values:
        return None
    ordered = sorted(values)
    return {
        "n": len(ordered),
        "p50": round(statistics.median(ordered), 1),
        "p90": round(ordered[min(len(ordered) - 1, int(0.9 * len(ordered)))], 1),
        "max": round(ordered[-1], 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pg-port", type=int, required=True)
    ap.add_argument("--gw-port", type=int, required=True)
    ap.add_argument("--path", default="/api/knn-search")
    ap.add_argument("--trials", type=int, default=20)
    ap.add_argument("--poll", type=float, default=0.005, help="seconds between gateway polls")
    ap.add_argument("--timeout", type=float, default=10.0, help="seconds to wait for each transition")
    ap.add_argument("--gap", type=float, default=0.2, help="seconds between trials (past the 50 ms coalescing window)")
    ap.add_argument("--batch", action="store_true")
    ap.add_argument("--label", default="perf-revoke")
    args = ap.parse_args()

    db = psycopg2.connect(
        host="127.0.0.1", port=args.pg_port, user="postgres", password="postgres", dbname="sefaria_auth"
    )
    db.autocommit = False
    cur = db.cursor()
    cur.execute("SELECT id FROM api_project WHERE profile_id = %s AND deleted_at IS NULL", (PROJECT_ID,))
    row = cur.fetchone()
    if not row:
        sys.exit("revoke_timing: the drill project has no api_project row (run drill_up first)")
    api_project = row[0]
    db.commit()

    def create(label):
        value = "sfr_d11" + "".join(secrets.choice(ALPHABET) for _ in range(32))
        cur.execute(
            "INSERT INTO powered_by_apikey (id, key, label, allowed_origins, created_at, project_id)"
            " VALUES (gen_random_uuid(), %s, %s, '[]'::jsonb, now(), %s)",
            (value, label, api_project),
        )
        db.commit()
        return value

    def revoke(value):
        cur.execute("UPDATE powered_by_apikey SET revoked_at = now() WHERE key = %s AND revoked_at IS NULL", (value,))
        db.commit()

    trials = []
    errors = []
    run = secrets.token_hex(3)
    labels = ["%s-%s-%02d" % (args.label, run, i) for i in range(args.trials)]

    if args.batch:
        values = [create(lbl) for lbl in labels]
        # every key allowed by the same reload; time the first and wait for the rest
        for lbl, value in zip(labels, values):
            got = poll(args.gw_port, args.path, value, 200, args.timeout, args.poll)
            trials.append(
                {
                    "label": lbl,
                    "prefix": value[:4],
                    "create_to_allow_ms": None if got is None else round(got[0] * 1000, 1),
                }
            )
            if got is None:
                errors.append("%s: never allowed within %.0f s" % (lbl, args.timeout))
        for trial, value in zip(trials, values):
            revoke(value)
            got = poll(args.gw_port, args.path, value, 401, args.timeout, args.poll)
            if got is None:
                errors.append("%s: never denied within %.0f s" % (trial["label"], args.timeout))
                trial["revoke_to_deny_ms"] = None
                continue
            trial["revoke_to_deny_ms"] = round(got[0] * 1000, 1)
            trial["deny_code"] = deny_code(got[2])
    else:
        for lbl in labels:
            value = create(lbl)
            trial = {"label": lbl, "prefix": value[:4]}
            got = poll(args.gw_port, args.path, value, 200, args.timeout, args.poll)
            trial["create_to_allow_ms"] = None if got is None else round(got[0] * 1000, 1)
            if got is None:
                errors.append("%s: never allowed within %.0f s" % (lbl, args.timeout))
                revoke(value)
                trials.append(trial)
                continue
            time.sleep(args.gap)
            revoke(value)
            got = poll(args.gw_port, args.path, value, 401, args.timeout, args.poll)
            if got is None:
                errors.append("%s: never denied within %.0f s" % (lbl, args.timeout))
                trial["revoke_to_deny_ms"] = None
            else:
                trial["revoke_to_deny_ms"] = round(got[0] * 1000, 1)
                trial["deny_code"] = deny_code(got[2])
            trials.append(trial)
            time.sleep(args.gap)

    out = {
        "trials": trials,
        "create_to_allow": stats([t["create_to_allow_ms"] for t in trials if t.get("create_to_allow_ms") is not None]),
        "revoke_to_deny": stats([t["revoke_to_deny_ms"] for t in trials if t.get("revoke_to_deny_ms") is not None]),
        "deny_codes": sorted({t.get("deny_code", "-") for t in trials if t.get("revoke_to_deny_ms") is not None}),
        "poll_interval_ms": args.poll * 1000,
        "batch": args.batch,
        "errors": errors,
    }
    print(json.dumps(out, indent=2))
    db.close()
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
