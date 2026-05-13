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
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

UPSTREAMS = [
    "https://parallels-3-0a.loadbalancer.dicta.org.il",
    "https://parallels-3-0a-extra.loadbalancer.dicta.org.il",
]

_cycle = itertools.cycle(UPSTREAMS)
_lock = threading.Lock()


def _next_upstream() -> str:
    with _lock:
        return next(_cycle)


# Headers we must not blindly forward: the outgoing http.client connection
# sets host/content-length itself, and hop-by-hop headers don't survive proxies.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
    "host", "content-length",
}


def _make_conn(upstream: str) -> http.client.HTTPConnection:
    parsed = urlparse(upstream)
    if parsed.scheme == "https":
        return http.client.HTTPSConnection(parsed.hostname, parsed.port or 443, timeout=60)
    return http.client.HTTPConnection(parsed.hostname, parsed.port or 80, timeout=60)


class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[proxy] {fmt % args if args else fmt}")

    def _proxy(self):
        upstream = _next_upstream()
        print(f"[proxy] {self.command} {self.path} → {upstream}")

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""

        fwd_headers = {
            k: v for k, v in self.headers.items()
            if k.lower() not in HOP_BY_HOP
        }

        conn = _make_conn(upstream)
        try:
            conn.request(self.command, self.path, body=body, headers=fwd_headers)
            resp = conn.getresponse()
            print(f"[proxy] ← {resp.status} {resp.reason}")

            self.send_response(resp.status)
            for key, val in resp.getheaders():
                if key.lower() not in HOP_BY_HOP:
                    self.send_header(key, val)
            self.end_headers()
            self.wfile.write(resp.read())
        except Exception as e:
            print(f"[proxy] error: {e}")
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())
        finally:
            conn.close()

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
