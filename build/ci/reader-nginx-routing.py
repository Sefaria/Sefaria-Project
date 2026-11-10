#!/usr/bin/env python3
"""
Who answers which request at nginx, for the new reader's chart modes (reader-next/docs/DEPLOYMENT.md). Local, no cluster:

  python3 build/ci/reader-nginx-routing.py            # every mode below; exit 1 on any unexpected route
  python3 build/ci/reader-nginx-routing.py --table    # also print the routing table per mode

For each mode it renders the chart (helm template), takes the nginx config out of the ConfigMap, substitutes the variables the
container's entrypoint substitutes, points the cluster-only upstreams at two local stubs ("varnish" on :18040, "reader" on :13000),
runs `nginx -t` and then nginx itself on :18080, and asks it for a set of paths with and without the cookie reader_version=next.
Needs helm and nginx on PATH (and nothing but the standard library). Ports are fixed; nothing else may listen on them.
"""
import http.server
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHART = os.path.join(ROOT, "helm-chart", "sefaria")
NGINX_PORT, VARNISH_PORT, READER_PORT = 18080, 18040, 13000
ENV = "t"
LIBRARY = f"www.{ENV}.cauldron.sefaria.org"
VOICES = f"voices.{ENV}.cauldron.sefaria.org"

# (path, host, who answers without the cookie, who answers with reader_version=next) per mode; "307" = a redirect from nginx itself
OPTIN = [
    ("/Genesis.1", LIBRARY, "varnish", "reader"),
    ("/texts", LIBRARY, "varnish", "reader"),
    ("/topics/light", LIBRARY, "varnish", "reader"),  # LIBRARY_ONLY_PREFIXES: the client's on the Library host
    ("/login", LIBRARY, "varnish", "reader"),
    ("/activity/Genesis.1/en/The_Koren_Jerusalem_Bible", LIBRARY, "varnish", "reader"),  # rendered by the client under a Django prefix
    ("/activity", LIBRARY, "varnish", "varnish"),
    ("/settings/account", LIBRARY, "varnish", "varnish"),
    ("/admin/", LIBRARY, "varnish", "varnish"),
    ("/logout", LIBRARY, "varnish", "varnish"),
    ("/sefaria.js", LIBRARY, "varnish", "varnish"),
    ("/data.js", LIBRARY, "varnish", "varnish"),
    ("/healthz", LIBRARY, "varnish", "varnish"),
    ("/favicon.ico", LIBRARY, "varnish", "varnish"),
    ("/site.webmanifest", LIBRARY, "varnish", "varnish"),
    ("/manifest.json", LIBRARY, "varnish", "varnish"),
    ("/llms.txt", LIBRARY, "varnish", "varnish"),
    ("/.well-known/apple-app-site-association", LIBRARY, "varnish", "varnish"),
    ("/api/v3/texts/Genesis.1", LIBRARY, "varnish", "varnish"),
    ("/static/js/x.js", LIBRARY, "static", "static"),
    ("/robots.txt", LIBRARY, "static", "static"),
    ("/sheets/1", LIBRARY, "307", "307"),  # the Voices module redirects stay first
    ("/profile/x", LIBRARY, "307", "307"),
    ("/assets/index-x.js", LIBRARY, "reader", "reader"),  # optin: the reader's bundles, cookie or not (an open page's lazy chunks)
    ("/Genesis.1", VOICES, "varnish", "varnish"),  # the Voices server block never sees the reader
    ("/topics/light", VOICES, "varnish", "varnish"),
]
ASSETS = "/assets/index-x.js"
MODES = {
    "legacy": ([], [(p, h, "varnish", "varnish") if p == ASSETS else (p, h, a, a) for p, h, a, _ in OPTIN]),
    "optin": (["--set", "nodejs.mode=optin"], OPTIN),
    # the kill switch: the cookie changes nothing; the reader's bundles still come from it
    "optin-killed": (["--set", "nodejs.mode=optin", "--set", "reader.optin.enabled=false"], [(p, h, a, a) for p, h, a, _ in OPTIN]),
    "reader": (["--set", "nodejs.mode=reader"], [(p, h, b, b) for p, h, _, b in OPTIN]),
}


class Stub(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        self.posted = self.rfile.read(int(self.headers.get("content-length") or 0)).decode()
        self.do_GET()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        body = f"{self.server.name} {self.path} body={getattr(self, 'posted', '')} xfh={self.headers.get('x-forwarded-host')}".encode()
        self.send_response(200)
        self.send_header("content-type", "text/plain")
        self.send_header("x-stub", self.server.name)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def log_message(self, *a):
        pass


def stub(name, port):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Stub)
    srv.name = name
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def literal_block(manifest, key):
    """The value of `key: |` in the ConfigMap's data (a YAML literal block, indented 4), without a YAML library."""
    lines = manifest.split("\n")
    start = lines.index(f"  {key}: |") + 1
    body = []
    for line in lines[start:]:
        if line.strip() and not line.startswith("    "):
            break
        body.append(line[4:])
    return "\n".join(body).rstrip("\n") + "\n"


def render(args, work):
    out = subprocess.run(["helm", "template", "t", CHART, "--set", f"deployEnv={ENV}", "--show-only", "templates/configmap/nginx.yaml", *args],
                         check=True, capture_output=True, text=True).stdout
    conf = literal_block(out, "nginx.template.conf")
    subst = {"ENV_NAME": ENV, "VARNISH_HOST": "127.0.0.1", "SEARCH_HOST": "127.0.0.1", "RELEASE_TAG": "1",
             "STRAPI_LOCATION": "https://strapi.example", "ELASTIC_AUTH_HEADER": "eDp5"}
    for k, v in subst.items():
        conf = conf.replace("${%s}" % k, v)
    conf = conf.replace("server 127.0.0.1:8040;", f"server 127.0.0.1:{VARNISH_PORT};")
    conf = re.sub(r"server (node|reader)-%s:3000;" % ENV, f"server 127.0.0.1:{READER_PORT};", conf)
    conf = conf.replace("user www-data;", "").replace("resolver 8.8.8.8 8.8.4.4;", "")
    conf = conf.replace("/var/log/nginx/error.log", f"{work}/error.log").replace("/var/run/nginx.pid", f"{work}/nginx.pid")
    conf = conf.replace("access_log /dev/stdout structured;", f"access_log {work}/access.log structured;")
    conf = re.sub(r"listen 80;", f"listen {NGINX_PORT};", conf).replace("listen [::]:80;", "")
    conf = conf.replace("alias /app/", f"alias {work}/app/")
    os.makedirs(f"{work}/app/static/js", exist_ok=True)
    open(f"{work}/app/robots.txt", "w").write("static robots")
    open(f"{work}/app/static/js/x.js", "w").write("static x.js")
    open(f"{work}/nginx.conf", "w").write(conf)
    return f"{work}/nginx.conf"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def fetch(path, host, cookie, method="GET", headers=None):
    req = urllib.request.Request(f"http://127.0.0.1:{NGINX_PORT}{path}", method=method, data=b"x=1" if method == "POST" else None,
                                 headers={"Host": host, **({"Cookie": "reader_version=next"} if cookie else {}), **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=15) as r:
            return r.headers.get("x-stub") or "static", r.read().decode()
    except urllib.error.HTTPError as e:
        return str(e.code), ""


def ask(path, host, cookie, method="GET"):
    """Who answered: "varnish" or "reader" (the stubs), "static" (nginx's own files), or nginx's own status code."""
    return fetch(path, host, cookie, method)[0]


def wait_port(port):
    for _ in range(50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.1)
    raise RuntimeError(f"nothing on :{port}")


def main():
    table = "--table" in sys.argv
    stubs = [stub("varnish", VARNISH_PORT), stub("reader", READER_PORT)]
    failures = 0
    try:
        for mode, (args, cases) in MODES.items():
            work = tempfile.mkdtemp(prefix=f"reader-nginx-{mode}-")
            conf = render(args, work)
            t = subprocess.run(["nginx", "-t", "-p", work, "-e", f"{work}/error.log", "-c", conf], capture_output=True, text=True)
            print(f"[{mode}] nginx -t: {'ok' if t.returncode == 0 else t.stderr.strip()}")
            if t.returncode:
                failures += 1
                continue
            proc = subprocess.Popen(["nginx", "-p", work, "-e", f"{work}/error.log", "-c", conf, "-g", "daemon off;"])
            try:
                wait_port(NGINX_PORT)
                for path, host, plain, opted in cases:
                    got = (ask(path, host, False), ask(path, host, True))
                    ok = got == (plain, opted)
                    failures += not ok
                    if table or not ok:
                        print(f"  {'ok ' if ok else 'BAD'} {host:32} {path:52} no cookie → {got[0]:8} cookie → {got[1]:8}" + ("" if ok else f" (expected {plain}, {opted})"))
                print(f"[{mode}] {len(cases)} paths checked")
                if mode in ("optin", "reader"):
                    # nginx sets X-Forwarded-Host itself: a value the client sends never reaches the reader
                    seen = fetch("/Genesis.1", LIBRARY, True, headers={"X-Forwarded-Host": "evil.example"})[1]
                    ok = seen.endswith(f"xfh={LIBRARY}")
                    failures += not ok
                    print(f"  {'ok ' if ok else 'BAD'} X-Forwarded-Host sent to the reader: {seen!r}")
                    # a write with the cookie reaches the reader, body and all
                    page = fetch("/Genesis.1", LIBRARY, True, "POST")
                    got = ask("/api/profile/x", LIBRARY, True, "POST"), page[0]
                    ok = got == ("varnish", "reader") and " body=x=1 " in page[1]
                    failures += not ok
                    print(f"  {'ok ' if ok else 'BAD'} POST with the cookie: /api → {got[0]}, a page → {got[1]}")
                    # the reader down (nothing listening): a read falls back to Varnish/Django; a write is never replayed (502)
                    stubs[1].shutdown()
                    stubs[1].server_close()
                    down = [(p, m, ask(p, LIBRARY, True, m)) for p, m in (("/Genesis.1", "GET"), ("/Genesis.1", "HEAD"), (ASSETS, "GET"), ("/Genesis.1", "POST"))]
                    want = [("/Genesis.1", "GET", "varnish"), ("/Genesis.1", "HEAD", "varnish"), (ASSETS, "GET", "varnish"), ("/Genesis.1", "POST", "502")]
                    ok = down == want
                    failures += not ok
                    print(f"  {'ok ' if ok else 'BAD'} reader down, with the cookie: {down}" + ("" if ok else f" (expected {want})"))
                    stubs[1] = stub("reader", READER_PORT)
            finally:
                proc.terminate()
                proc.wait()
                shutil.rmtree(work, ignore_errors=True)
    finally:
        for s in stubs:
            s.shutdown()
    print("FAIL" if failures else "PASS", f"({failures} unexpected)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
