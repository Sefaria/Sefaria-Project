# Sefaria-Project — Agent Guide

> Entry point to agent-oriented documentation for the Sefaria codebase.
> External API docs (for end users): https://developers.sefaria.org/docs/welcome

## What Sefaria Is

Sefaria is a Django + MongoDB + React web application serving a digital library of Jewish texts with translations, commentary, source sheets, topics, and cross-references. The core abstraction is the **Ref** — a canonical citation (e.g. `"Genesis 1:1"`, `"Rashi on Genesis 1:1:1"`) — and nearly every feature is either producing, resolving, or rendering refs.

### Stack
- **Backend**: Django (Python 3), MongoDB (primary store — texts, sheets, topics, links, history, etc.), Postgres (all Django-native ORM: auth, sessions, admin-managed content for Chatbot, Guides, Remote Config, Sites, Topic Pool Management, Reader experiments), Redis (pub/sub + cache), Elasticsearch (search), Varnish (HTTP cache), Celery (async tasks)
- **Frontend**: React (no Redux — component state + Context + `Sefaria` JS singleton), server-side rendered via Django templates, hydrated on the client
- **Infra**: Multiple app servers coordinated via Redis pub/sub; Varnish in front for HTTP caching; Cloudflare for static assets

## Documentation Tree

```
agent_docs/
├── model/           # MongoDB ORM + domain models (29 docs)
├── sefaria/         # Backend package: views, business logic, helpers, infra
│   ├── helper/      # Business logic layer
│   └── system/      # DB, cache, middleware, multiserver, Varnish
├── reader/          # Reader Django app (main web views)
├── frontend/        # React components + Sefaria JS singleton
├── apps/            # Smaller Django apps (api, sourcesheets, chatbot, etc.)
└── scripts.md       # Top-level scripts/
```

## Navigation — "Load this doc when working on X"

| Working on... | Start here |
|---------------|-----------|
| Any data model, Ref, Index, Version, schema | [`agent_docs/model/README.md`](./agent_docs/model/README.md) |
| Django views, URL routing, subdomains | [`agent_docs/sefaria/views_and_routing.md`](./agent_docs/sefaria/views_and_routing.md) |
| Source sheets | [`agent_docs/sefaria/sheets.md`](./agent_docs/sefaria/sheets.md) |
| Search / Elasticsearch | [`agent_docs/sefaria/search.md`](./agent_docs/sefaria/search.md) |
| Text mutations, history, diffs | [`agent_docs/sefaria/tracker_and_history.md`](./agent_docs/sefaria/tracker_and_history.md) |
| Helper layer (text edits, topics, linker, LLM, CRM) | [`agent_docs/sefaria/helper/README.md`](./agent_docs/sefaria/helper/README.md) |
| DB, caching, middleware, multi-server, Varnish | [`agent_docs/sefaria/system/README.md`](./agent_docs/sefaria/system/README.md) |
| Linker / find-refs / citation resolution | [`agent_docs/model/linker/README.md`](./agent_docs/model/linker/README.md) |
| React components | [`agent_docs/frontend/README.md`](./agent_docs/frontend/README.md) |
| The `Sefaria` JS singleton | [`agent_docs/frontend/sefaria_js.md`](./agent_docs/frontend/sefaria_js.md) |
| Reader views (the main reading app) | [`agent_docs/reader/README.md`](./agent_docs/reader/README.md) |
| API, sourcesheets, chatbot, guides, etc. | [`agent_docs/apps/README.md`](./agent_docs/apps/README.md) |
| Scripts / one-off jobs | [`agent_docs/scripts.md`](./agent_docs/scripts.md) |
| Config, exports, stats, sitemap, image gen | [`agent_docs/sefaria/config_and_utilities.md`](./agent_docs/sefaria/config_and_utilities.md) |

## Core Conventions Every Agent Should Know

### 1. The Model Save Lifecycle
`AbstractMongoRecord.save()` runs: `_normalize → _validate → _sanitize → _pre_save → (write) → notify`. The `notify()` step fires pub/sub callbacks registered in **`sefaria/model/dependencies.py`**. A single `Index` title change triggers **14 cascading callbacks** across collections — never bypass this by writing directly to Mongo.

### 2. Text Mutations Go Through `tracker`
Never call `Version.save()` directly to change text. Use `sefaria.tracker.modify_text(...)` so that:
- History is logged
- Varnish is invalidated
- Search indices are queued for update
- Multi-server caches sync

### 3. The `library` Singleton
`from sefaria.model import library` — the TOC tree, title maps, autocompleters. Call sites often `import` it inside functions to avoid circular imports, but the singleton itself eagerly builds index maps during its second init stage at module import (not on first access). See [`agent_docs/model/text.md`](./agent_docs/model/text.md) for the three-stage init.

### 4. Multi-Server Cache Invalidation
```
Model.save() → notify() → in-process cache update
            → ServerCoordinator.publish_event() (Redis pub/sub)
            → other servers update their in-process caches
            → MultiServerMonitor waits for confirmations
            → Varnish purge/ban
            → (optional) Cloudflare purge
```
Details in [`agent_docs/sefaria/system/multiserver_and_varnish.md`](./agent_docs/sefaria/system/multiserver_and_varnish.md). Redis pub/sub means **missed messages are lost** — a server restarted mid-event may have stale caches.

### 5. Ref Is Cached Aggressively
The `RefCacheType` metaclass intercepts `Ref(...)` construction and returns a cached instance when the input string or its normal form matches a previous call. The cache is an `OrderedDict` with LRU-style eviction; the limit defaults to 60,000 and is tunable at runtime via `remoteConfigCache` (`REF_CACHE_LIMIT_KEY`). Constructing the same ref string returns the same object. Don't mutate a `Ref`; derive a new one.

### 6. InputError vs System Errors
`catch_error_as_json` converts `InputError` subclasses (`BookNameError`, `PartialRefInputError`, etc.) into structured JSON responses. Other exceptions bubble up as 500s. Raise `InputError` for anything the caller did wrong.

### 7. Frontend State
No Redux. State lives in React component state, a few Contexts, and the global `Sefaria` JS singleton (caches + API wrapper). Django SSR renders initial props into the page; React hydrates from them. See [`agent_docs/frontend/sefaria_js.md`](./agent_docs/frontend/sefaria_js.md).

### 8. Async Work Goes Through Celery
Linker disambiguation, LLM calls, search indexing, CRM syncs, and email are all Celery tasks. Never block an HTTP request on an LLM call.

## External References
- **Public API docs**: https://developers.sefaria.org/docs/welcome
- **Codebase**: this repo. Source lives alongside the `agent_docs/` mirror — every doc cites its source file path.

## When Docs and Code Disagree
**Code wins.** These docs are a map, not the territory. If you find a discrepancy, read the source and update the doc. Flag surprising findings at the top of your response so they aren't lost.

## Keeping These Docs Fresh

The docs in `AGENTS.md` and `agent_docs/` are stamped to a specific commit in [`agent_docs/.stamp`](./agent_docs/.stamp). Everything between that commit and `HEAD` is unaudited — trust the docs less in areas where source has changed.

### Check for drift

```bash
STAMP=$(grep '^commit=' agent_docs/.stamp | cut -d= -f2)
# What source has changed since the stamp?
git diff --name-only "$STAMP"..HEAD -- sefaria/ reader/ static/js/ api/ \
    sourcesheets/ chatbot/ guides/ remote_config/ django_topics/ \
    emailusernames/ promotions/ scripts/
```

Each changed path maps to a doc via the navigation table above. If a changed file's behavior, signature, or relationships shifted in ways the doc claims otherwise, update the doc.

### When to update the stamp

Bump `commit=` and `date=` in `agent_docs/.stamp` (and update `note=` with a one-line summary) after:
- A full re-audit of the tree, or
- A targeted update that refreshes every doc touched by the diff since the last stamp.

Don't bump the stamp for partial updates — the stamp's value is that *everything* up to that commit has been audited. A partial bump silently certifies docs that weren't actually reviewed.

### Agent workflow for doc-affecting changes

If you're making a code change that invalidates a doc:
1. Update the doc in the same PR as the code change.
2. Do **not** bump `.stamp` — your change is one file; the stamp covers the whole tree.
3. The next full-tree audit bumps the stamp.
