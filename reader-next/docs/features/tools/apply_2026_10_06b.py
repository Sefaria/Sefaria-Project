"""Owner decision 2026-10-06: the client replaces the legacy Node server in the cluster (cauldron first). Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("PLT-003", [
  "OWNER DECISION 2026-10-06: the client replaces node/server.js in the node pods. Requests reach it FIRST (nginx `location /` → node); it renders reader/library pages reading the API through Varnish (http://varnish-<env>-<rev>:8040 with the public Host), and passes Django's pages, every write and its own 404s to Varnish (src/start.ts, src/server/pass-through.ts; header x-served-by: django). Django's own SSR is switched off in that mode (USE_NODE = False): Django pages render client-side only until moved. BUILT on Sefaria-Project branch reader-next (helm values nodejs.mode reader|legacy; build/node/Dockerfile builds reader-next/). Verified locally: rendered nginx config passes nginx -t; nginx → client → stand-in Varnish routes reader pages, Django pages, /api and the 404 correctly, and falls back to Django when the client is down. docs/DEPLOYMENT.md.",
])
add("PLT-002", [
  "Rebuild: /healthz-reader (answered before routing; readiness and liveness probes of the node rollout in reader mode). Django's /healthz and /healthz-rollout pass through to Django unchanged.",
])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["PLT-002"] = {"status": "done", "note": "/healthz-reader + node rollout probes; Django health URLs pass through", "by": "src/start.ts"}
st["PLT-003"]["note"] = "Server-rendered text, canonical redirects, prev/next links; in the cluster the client answers first and passes Django's pages through (docs/DEPLOYMENT.md)"
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
