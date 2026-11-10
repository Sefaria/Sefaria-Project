"""Wave 4, lane e-platform, 2026-11-10: the wave-3 security review's platform findings (S-1..S-5 and nits 1, 2, 4, 7) and the exits
allowlist (v-exits F-1, F-3, F-8). Only the two features whose behaviour changed get a line; no status changes (both stay done).
Idempotent: running it twice changes nothing."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))


def add(fid, name, lines):
    assert by[fid]["name"] == name, (fid, by[fid]["name"])
    print(f"{fid}  {by[fid]['name']}")
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


add(
    "ANL-017",
    "Browser error reporting (Sentry)",
    [
        "2026-11-10 (security S-4): /api/reader-errors' rate limit is keyed on the visitor's address as the Envoy Gateway sets it (X-Original-Forwarded-For, which the gateway overwrites and nginx and Varnish pass on; nginx's X-Real-IP only without the gateway, as behind it that is the gateway pod; REMOTE_ADDR locally), not on CF-Connecting-IP or X-Forwarded-For as sent by the client. CF-Connecting-IP is read directly only with the Django setting ORIGIN_LOCKED_TO_CLOUDFLARE = True (off by default). A beacon within its own limit also counts against a cap for everyone together (600 a minute). Tests: reader/tests/reader_errors_rate_limit_test.py.",
    ],
)

add(
    "LIB-021",
    "Translations page backend and SEO",
    [
        "2026-11-10 (security S-2): the page's server function (a public GET endpoint) accepts only the slugs the route accepts (translationLanguage(slug, true): Django's languages and the in-app-only ones); any other input is refused before an upstream call or a cache entry. The server's shared model cache keeps at most 32 languages, oldest first. Tests: src/lib/translations/translations-page.test.ts.",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
