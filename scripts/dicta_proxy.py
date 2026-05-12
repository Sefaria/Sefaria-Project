#!/usr/bin/env python3
"""
Round-robin proxy for the Dicta parallels API.

Alternates requests between two upstream servers so load is spread evenly.
Point DICTA_PARALLELS_URL at this proxy, e.g.:
    DICTA_PARALLELS_URL=http://localhost:8765/parallels/api/findincorpus

Usage:
    python scripts/dicta_proxy.py [--port 8765]
"""
import argparse
import itertools
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, urlunparse, urlencode, parse_qs
import urllib.request
import urllib.error

UPSTREAMS = [
    "https://parallels-3-0a.loadbalancer.dicta.org.il",
    "https://parallels-3-0a-extra.loadbalancer.dicta.org.il",
]

_cycle = itertools.cycle(UPSTREAMS)
_lock = threading.Lock()


def _next_upstream() -> str:
    with _lock:
        return next(_cycle)


PASSTHROUGH_HEADERS = {
    "content-type",
    "accept",
    "accept-encoding",
    "user-agent",
}

HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
}


class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        upstream = fmt % args if args else fmt
        print(f"[proxy] {upstream}")

    def _proxy(self):
        upstream = _next_upstream()
        target_url = upstream + self.path
        print(f"[proxy] {self.command} {self.path} → {upstream}")

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(target_url, data=body, method=self.command)
        for key, val in self.headers.items():
            if key.lower() not in HOP_BY_HOP:
                req.add_header(key, val)

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self.send_response(resp.status)
                for key, val in resp.headers.items():
                    if key.lower() not in HOP_BY_HOP:
                        self.send_header(key, val)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())

    def do_GET(self):
        self._proxy()

    def do_POST(self):
        self._proxy()


def main():
    parser = argparse.ArgumentParser(description="Round-robin proxy for Dicta API")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    print(f"Dicta round-robin proxy listening on http://localhost:{args.port}")
    print(f"Upstreams: {UPSTREAMS}")
    HTTPServer(("", args.port), ProxyHandler).serve_forever()


if __name__ == "__main__":
    main()
