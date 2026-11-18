"""Build live-urls.json, the URL-parity list of PLAN.md §6.4, from live developers.sefaria.org.

Run once (it was, by W17); the committed JSON is the reference, not this script. GET requests only,
redirects are not followed, about 0.15 s between requests. Usage, from the repository root:

    python e2e-tests/developers/redirects/build_live_urls.py

Sources, each recorded on its entries:
- sitemap: docs/dev-portal/research/site/machine/sitemap_urls.txt (129 URLs)
- llms: docs/dev-portal/research/site/machine/llms_urls.txt
- md-variant: `<path>.md` of every sitemap and llms page (the homepage has none)
- machine: the endpoints of SITE_ATLAS.md §1.3
- atlas-redirects: the table of SITE_ATLAS.md §6
- static-llms: the developers URLs in static/llms.txt
- hidden: the pages marked `hidden: true` in devportal/migration_source, and their `.md`
- variants: extra trailing-slash and `/v1.0/...` forms
"""

import datetime
import json
import re
import time
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).with_name("live-urls.json")
LIVE = "https://developers.sefaria.org"
MACHINE = ROOT / "docs" / "dev-portal" / "research" / "site" / "machine"

MACHINE_PATHS = [
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/docs/llms.txt",
    "/reference/llms.txt",
    "/llms-full.txt",
    "/docs.md",
    "/.well-known/api-catalog",
    "/openapi/sefaria-api.json",
    "/.well-known/agent-skills/index.json",
    "/.well-known/agent-skills/read-the-docs/SKILL.md",
    "/.well-known/mcp/server-card.json",
    "/mcp",
    "/site.webmanifest",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/feed",
    "/changelog.rss",
    "/.well-known/llms.txt",
    "/.well-known/security.txt",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource",
]
ATLAS_REDIRECTS = [
    "/docs",
    "/docs/",
    "/docs/welcome/",
    "/docs/getting-started",
    "/reference",
    "/v1.0",
    "/v1.0/docs/welcome",
    "/page/contact-us/",
    "/docs.md",
    "/login",
    "/logout",
    "/suggested-edits/",
    "/DOCS/WELCOME",
    "/docs/api",
    "/docs/get-text",
    "/docs/text-api",
    "/docs/sefaria-mcp",
    "/docs/the-sefaria-mcps",
    "/docs/linker-v1",
    "/page/contact",
    "/contact-us",
    "/home",
    "/index.html",
    "/mcp/",
    "/changelog",
    "/recipes",
    "/discuss",
    "/blog",
    "/openapi.json",
    "/llms-full.txt",
    "/docs/welcome.json",
]
VARIANTS = [
    "/reference/",
    "/reference/getting-started/",
    "/reference/get-v3-texts/",
    "/docs/the-sefaria-mcp/",
    "/v1.0/",
    "/v1.0/docs",
    "/v1.0/reference",
    "/v1.0/reference/get-v3-texts",
    "/v1.0/page/contact-us",
    "/v1.0/docs/welcome.md",
    "/v1.0/llms.txt",
]
SECTIONS = {"docs": "docs", "reference": "reference", "custom_pages": "page"}


def path_of(url):
    path = url[len(LIVE) :] if url.startswith(LIVE) else url
    return path or "/"


def collect():
    entries = {}

    def add(path, source):
        sources = entries.setdefault(path, [])
        if source not in sources:
            sources.append(source)

    for url in (MACHINE / "sitemap_urls.txt").read_text(encoding="utf-8").split():
        add(path_of(url), "sitemap")
    for url in (MACHINE / "llms_urls.txt").read_text(encoding="utf-8").split():
        add(path_of(url), "llms")
    for path in sorted(p for p in entries if p != "/"):
        add(f"{path}.md", "md-variant")
    for path in MACHINE_PATHS:
        add(path, "machine")
    for path in ATLAS_REDIRECTS:
        add(path, "atlas-redirects")
    llms = (ROOT / "static" / "llms.txt").read_text(encoding="utf-8")
    for url in sorted(set(re.findall(r"https://developers\.sefaria\.org[^\s)\"'>\]]*", llms))):
        add(path_of(url.rstrip(".,")), "static-llms")
    source_dir = ROOT / "devportal" / "migration_source"
    for file in sorted(source_dir.rglob("*.md")):
        if not re.search(r"^hidden: true", file.read_text(encoding="utf-8"), re.MULTILINE):
            continue
        section = SECTIONS[file.relative_to(source_dir).parts[0]]
        path = f"/{section}/{urllib.parse.quote(file.stem)}"
        add(path, "hidden")
        add(f"{path}.md", "hidden")
    for path in VARIANTS:
        add(path, "variants")
    return entries


def main():
    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 (url-parity crawl)"
    out = []
    for path, sources in collect().items():
        for attempt in range(4):
            try:
                response = session.get(LIVE + path, allow_redirects=False, timeout=30)
            except requests.RequestException:
                if attempt == 3:
                    raise
                time.sleep(2)
                continue
            if response.status_code != 429 or attempt == 3:
                break
            time.sleep(20)  # live rate-limits bursts; wait and ask again
        content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip() or None
        out.append(
            {
                "path": path,
                "sources": sources,
                "status": response.status_code,
                "location": response.headers.get("Location"),
                "contentType": content_type,
            }
        )
        print(response.status_code, path, response.headers.get("Location") or "")
        time.sleep(0.15)
    document = {
        "$comment": "Built once by W17 from live (GET, redirects not followed) with build_live_urls.py. See README.md.",
        "origin": LIVE,
        "recordedAt": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "entries": out,
    }
    OUT.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(len(out), "entries")


if __name__ == "__main__":
    main()
