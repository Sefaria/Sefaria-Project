#!/usr/bin/env python3
"""A stand-in for the two Django endpoints staging-smoke.sh's legacy apikey write uses, as sourcesheets/views.py
collections_api answers them: POST /api/collections with an apikey in the form body (no session) creates a private
collection; DELETE /api/collections/<slug> needs the owner's session and a CSRF token whose cookie and X-CSRFToken header
match (Django's CsrfViewMiddleware), plus an Origin; GET /api/collections/<slug> finds it or not. Every other path is 404.

    legacy_api_stub.py --key-file F --session-file F --port-file F --log F

Binds an ephemeral port on 127.0.0.1 and writes it to --port-file. --log records, one JSON object per request, the
method, path, whether the key arrived in the POST body, and what was created or deleted (never the key itself).
"""

import argparse
import json
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

parser = argparse.ArgumentParser()
parser.add_argument("--key-file", required=True)
parser.add_argument("--session-file", required=True)
parser.add_argument("--port-file", required=True)
parser.add_argument("--log", required=True)
args = parser.parse_args()
KEY = open(args.key_file).read().strip()
SESSION = open(args.session_file).read().strip()
COLLECTIONS = {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, code, body, entry):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        with open(args.log, "a") as log:
            log.write(json.dumps({"method": self.command, "path": self.path, **entry}) + "\n")

    def cookies(self):
        out = {}
        for part in (self.headers.get("Cookie") or "").split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                out[k] = v
        return out

    def do_POST(self):
        if self.path != "/api/collections":
            return self.reply(404, {"error": "not found"}, {})
        form = parse_qs(self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode())
        key = (form.get("apikey") or [""])[0]
        if "sessionid" in self.cookies():
            return self.reply(403, {"error": "the stub expects no session on the apikey POST"}, {"session": True})
        if not key:
            return self.reply(200, {"error": "You must be logged in to create a new collection."}, {"key": "none"})
        if key != KEY:
            return self.reply(200, {"error": "Unrecognized API key."}, {"key": "unknown"})
        name = json.loads(form["json"][0])["name"]
        slug = secrets.token_urlsafe(6)
        COLLECTIONS[slug] = name
        return self.reply(
            200, {"status": "ok", "collection": {"name": name, "slug": slug}}, {"key": "valid", "created": slug}
        )

    def do_DELETE(self):
        slug = self.path.rsplit("/", 1)[-1]
        cookies = self.cookies()
        if cookies.get("sessionid") != SESSION:
            return self.reply(200, {"error": "You must be logged in"}, {"deleted": None, "why": "session"})
        token = cookies.get("csrftoken")
        if not token or self.headers.get("X-CSRFToken") != token or not self.headers.get("Origin"):
            return self.reply(403, {"error": "CSRF verification failed"}, {"deleted": None, "why": "csrf"})
        if COLLECTIONS.pop(slug, None) is None:
            return self.reply(200, {"error": f"Collection with the slug `{slug}` does not exist"}, {"deleted": None})
        return self.reply(200, {"status": "ok"}, {"deleted": slug})

    def do_GET(self):
        if not self.path.startswith("/api/collections/"):
            return self.reply(404, {"error": "not found"}, {})
        slug = self.path.rsplit("/", 1)[-1]
        if slug in COLLECTIONS:
            return self.reply(200, {"name": COLLECTIONS[slug], "slug": slug}, {"found": True})
        return self.reply(200, {"error": f"No collection with slug '{slug}'"}, {"found": False})

    def do_OPTIONS(self):
        self.reply(404, {"error": "not found"}, {})


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
with open(args.port_file, "w") as f:
    f.write(str(server.server_address[1]))
server.serve_forever()
