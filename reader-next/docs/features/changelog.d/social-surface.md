## 2026-11-23 — the social surface seam

### Built

- **SHL-076** The `social` lab (off by default; remote config `feature.reader.labs.social`) and the `/social` routes: a sized page mount the surface fills in the browser, a persistent mount beside the page; with the lab off, `/social` is the reader's not-found page.
- **SHL-077** The surface loader: the release manifest from an allowlisted origin, validated (zod; JSON Schema generated), contract major checked, every file linked with its integrity hash before the entry is imported; a 404, a bad manifest, a wrong hash (entry or chunk), an entry that throws or a timeout leaves the reader working. Integrity enforcement checked in Chromium.
- **SHL-078** SurfaceHost v1 (`contract/surface-host.v1.ts`): location and navigation through the router, the reader state API, the workspace commands, the reserved context, the viewer and its identity token (`POST /api/social/token`, Django's, added separately), interface language and theme, config, reporting. The reader's own types are checked against the contract at compile time.
- **RTE-066** The reserved `ctx` parameter: kept through the reader's address rewrites (validation, the workspace codec, canonicalize, scroll and panel navigations, refresh), left out of the canonical link and og:url, snapshot URLs and the Share link.

### Recorded

- New architecture rules: `surface-boundary` (only the loader and the shell import surface code) and `reader-state-core-pure` (the reader state core imports nothing from the app, React, the router or vendored code). `scripts/replay-check.mjs`: a first version of the replay check (its TODO list in the script); not in CI yet.
