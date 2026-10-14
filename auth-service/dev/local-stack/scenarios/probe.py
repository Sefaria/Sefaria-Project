#!/usr/bin/env python3
"""
Steady request loop for the drills: one request every --interval seconds (never concurrent), each written as
"<unix time> <status> <latency ms>" to --out, until --stop-file exists or --count requests are done.

  probe.py --port 20080 --path /api/knn-search [--key-file keys/x.hdr] --out f1.log --stop-file f1.stop
  probe.py --port 20083 --path /x --count 500 --interval 0 --out base.log --summary

A fresh connection per request by default, as each gateway client would open; --keepalive reuses one.
"""
import argparse
import http.client
import os
import time


def header_from(path):
    if not path:
        return {}
    name, value = open(path).read().strip().split(": ", 1)
    return {name: value}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--path", required=True)
    ap.add_argument("--key-file")
    ap.add_argument("--interval", type=float, default=0.1)
    ap.add_argument("--out", required=True)
    ap.add_argument("--stop-file")
    ap.add_argument("--count", type=int)
    ap.add_argument("--keepalive", action="store_true")
    ap.add_argument("--summary", action="store_true")
    args = ap.parse_args()
    headers = header_from(args.key_file)
    conn = None
    lat = []
    n = 0
    with open(args.out, "w", buffering=1) as out:
        while True:
            if args.stop_file and os.path.exists(args.stop_file):
                break
            if args.count is not None and n >= args.count:
                break
            t0 = time.time()
            status = 0
            try:
                if conn is None or not args.keepalive:
                    conn = http.client.HTTPConnection("127.0.0.1", args.port, timeout=5)
                conn.request("GET", args.path, headers=headers)
                resp = conn.getresponse()
                resp.read()
                status = resp.status
                if not args.keepalive:
                    conn.close()
            except Exception:
                conn = None
            ms = (time.time() - t0) * 1000
            lat.append(ms)
            out.write("%.3f %d %.2f\n" % (t0, status, ms))
            n += 1
            if args.interval:
                time.sleep(max(0.0, args.interval - (time.time() - t0)))
    if args.summary and lat:
        lat.sort()
        pick = lambda q: lat[min(len(lat) - 1, int(q * len(lat)))]
        print("n=%d p50=%.2f p90=%.2f p99=%.2f max=%.2f" % (len(lat), pick(0.5), pick(0.9), pick(0.99), lat[-1]))


if __name__ == "__main__":
    main()
