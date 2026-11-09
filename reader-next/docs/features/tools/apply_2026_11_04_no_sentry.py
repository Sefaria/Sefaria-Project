"""Sentry is no longer used (owner, 2026-11-04): the new reader sends nothing to it. Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
IDS = ["ANL-017"]
for i in IDS:
    print(i, by[i]["name"])
f = by["ANL-017"]
f["tier"] = "retire"
f["details"] = [l for l in f["details"] if not l.startswith("Rebuild: src/lib/analytics/sentry.ts")]
note = "RETIRED 2026-11-04 (owner): Sentry is no longer used. The new reader loads no Sentry SDK and sends no errors, traces or replays; CLIENT_SENTRY_DSN is no longer passed to the reader pods. Its removal also ends the browser's /api/remote-config fetch on every page (Sentry was its only reader)."
if note not in f["details"]:
    f["details"].append(note)
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"
st = json.load(open(S2))
st["ANL-017"] = {"status": "replaced", "note": "Not ported: Sentry is no longer used (owner, 2026-11-04)"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
