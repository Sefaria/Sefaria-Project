# GenCache Coordination and Varnish Cache Invalidation
> Sources: `sefaria/system/cache.py` (`GenCache`), `sefaria/system/redis_sentinel.py`, `sefaria/system/varnish/common.py`, `sefaria/system/varnish/wrapper.py`

## Purpose

Coordinates cache invalidation across multiple application server instances and the Varnish HTTP cache. When a model changes on one server, the change must propagate to all other servers' in-memory caches and to Varnish. This replaces the older `sefaria/system/multiserver/` push-based design (broadcast a method call over Redis pub/sub, retired alongside this change) with a pull-based one: a Redis `INCR` counter behind each tracked object, checked cheaply before a process's local copy is trusted. Pipeline: DB change -> write path calls `gen_cache.publish()`/`mark_fresh()` -> a peer's next `gen_cache.get()` notices the counter changed -> peer refreshes itself -> (for index records) Varnish invalidation fires directly from the write path.

See the GenCache migration decision record for the full design rationale and failure-mode analysis.

## Key Components

### cache.py -- `GenCache`

- **`register(key, redis_gen_key, refresh_fn)`**: Called once per tracked object, normally at process startup (`sefaria.model.text.Library._register_gen_cache()`, `sefaria.helper.webpages`, `NonUniqueTerm.init()` for per-slug keys). Associates a local key with its Redis counter key and the function that rebuilds it.
- **`get(key)`**: The passive read path. Throttled (`CHECK_INTERVAL_SECONDS`, default 2s) per key per process -- within the window, returns the local value without touching Redis. Past the window: compares this process's last-seen generation against Redis's current one; on first access or a mismatch, calls `refresh_fn()` and remembers the new generation. If the counter has vanished (Redis lost its keyspace, so the whole fleet is refreshing at once), it first sleeps a random jitter up to `JITTER_MAX_SECONDS`; ordinary bumps refresh without sleeping. Fails open: a Redis error logs and serves the last-known local value (or, on a true first access with Redis down, falls through to `refresh_fn()` rather than returning nothing).
- **`bump(redis_gen_key)`**: Low-level write primitive -- one `INCR`, nothing else. Fails open (logs, returns `None`).
- **`mark_fresh(key)`**: Write-path helper for objects whose state lives on their owner (e.g. `Library`'s index maps, autocompleters, linkers): the writer has already rebuilt it, so this records this process as current and bumps the counter for peers.
- **`publish(key, value)`**: `mark_fresh()` for objects whose value GenCache itself holds (TOC family, term mappings, websites data): stores the fresh value locally, then bumps.
- **`invalidate_local(key)`**: Drops a key's local state so the next `get()` is treated as a cold start. Mainly for tests that mutate Mongo directly and need an immediate, synchronous view of the change, bypassing the normal (by-design, eventual-consistency) throttle window.
- Module-level `gen_cache` singleton: built by `_build_gen_cache()` against whichever store `sefaria.system.redis_sentinel.get_redis_client()` resolves to (Sentinel in prod/staging, a single plain Redis in local dev), in its own DB number (`GENCACHE_REDIS_DB_NUM`) separate from Django's `CACHES` and Celery's broker/result-backend.

### redis_sentinel.py -- Shared Redis / Sentinel Connection Helpers

- **`SentinelConfig` / `RedisConfig`**: Dataclasses carrying connection settings. `SentinelConfig.is_configured()` is `True` iff `SENTINEL_HEADLESS_URL` is set (prod/staging); otherwise callers fall back to the single `REDIS_URL`/`REDIS_PORT` instance (local dev, which has no Sentinel).
- **`get_sentinel_host_ports(url, port)`**: Returns the Sentinel headless Service hostname unresolved. redis-py (and kombu, for Celery) resolve it on every new connection and try each pod address, so Sentinel pods that restart with new IPs are picked up without a refresh loop.
- **`get_redis_client(redis_config, sentinel_config, db_num, **kwargs)`**: Returns a `redis.sentinel.Sentinel(...).master_for(...)` client when Sentinel is configured (re-asks Sentinel which pod is master on each connection checkout, so a failover doesn't need its own refresh loop), else a plain `redis.Redis(...)`. Used by `GenCache`.
- **`get_django_redis_cache_options(redis_config, sentinel_config, db_num)`**: Returns `(LOCATION, OPTIONS)` for a `django-redis` `CACHES` entry, using `SentinelConnectionFactory` when Sentinel is configured (`LOCATION` is `redis://<master set>/<db>`). Reads go to replicas via `SentinelClient` by default; `read_from_replicas=False` keeps them on the master, which `CACHES["shared"]` uses so a refresh triggered by a new GenCache counter never reads a value older than that counter. Used to build `CACHES["default"]`/`["shared"]` in `local_settings.py`.
- Also used by `sefaria/celery_setup/` for the Celery broker/result-backend URL -- the same Sentinel cluster backs Celery, Django's cache, and GenCache's counters, each in its own DB number.

### varnish/common.py -- Varnish Primitives

- **`ban_url(url)`**: Runs `varnishadm ban` via subprocess to ban all cached objects matching a URL regex. Used for broad invalidation (anything under a ref).
- **`purge_url(url)`**: Sends an HTTP `PURGE` request to the Varnish frontend. Used for targeted invalidation of specific URLs. Returns the HTTP response; logs errors on non-200 status.
- Both functions are wrapped with `@graceful_exception` to prevent Varnish errors from crashing the application.

### varnish/wrapper.py -- Varnish Invalidation

- **`invalidate_ref(oref, lang, version, purge)`**: The primary invalidation function called when text content changes.
  - If `purge=True`: PURGEs the specific section-level ref across multiple API endpoint patterns (v3/texts, links, related -- with various query param combinations).
  - Always BANs the ref and everything beneath it using regex patterns.
  - Normalizes refs to section level before invalidating.
- **`invalidate_linked(oref)`**: Finds all refs linked to `oref` and invalidates each one. Handles UnicodeDecodeError gracefully.
- **`invalidate_counts(indx)`**: Purges preview, counts, and v2 index endpoints for a given index.
- **`invalidate_index(indx)`**: Purges index API endpoints (v1, v2, v2/raw).
- **`invalidate_title(title)`**: Combines `invalidate_index` + `invalidate_counts` + bans for texts and links APIs. The main entry point for title-level invalidation. Called directly from the write path now (`sefaria.model.text.process_index_change_in_core_cache` and neighbors), not gated on any cross-server confirmation.
- **`invalidate_all()`**: Bans `.*` -- nuclear option.
- **`url_regex(ref)`**: Generates Varnish-compatible regex patterns for a Ref that match the ref itself and any more specific refs beneath it. Handles ranges, spanning refs, titled continuations, and numeric continuations.

## Non-Obvious Patterns

- **`refresh_fn` must reproduce a shared-cache tier, not skip it**: for objects with an existing Redis-backed shared-cache tier in front of Mongo (most of `Library`'s tracked objects), `refresh_fn` is a dedicated method that checks that shared cache before rebuilding from Mongo -- never a direct rebuild-from-Mongo shortcut. Otherwise a generation mismatch (including a cold start on a brand-new process) always pays a full Mongo rebuild even when a peer already repopulated the shared cache.
- **`refresh_fn` must never call `bump()`/`publish()`**: several `refresh_fn`s are also the public rebuild method a writer calls directly (e.g. `Library._build_index_maps`, `build_full_auto_completer`). If the shared method bumped its own counter, a peer refreshing via `GenCache.get()` would re-trigger the same bump, cascading across the fleet. Bumping happens only at the actual write-path call site, after the local mutation.
- **Varnish invalidation is unconditional now, not confirmation-gated**: the old monitor waited for every server to confirm before purging Varnish, so a request repopulating Varnish never raced a not-yet-updated backend. GenCache gets the same guarantee for free from ordering: bump the counter *before* the Varnish purge, so a request that repopulates Varnish will, on its own next `GenCache.get()`, already see the bumped counter.
- **Granularity is coarse by default**: most objects use one counter per object type, matching the granularity their existing rebuild methods already operate at (e.g. `gen:index_map` bumps on any index change, re-walking the whole `IndexSet`). `NonUniqueTerm`'s per-slug counters are the one deliberately fine-grained, lazy exception -- checked only when that slug is actually looked up via `.init()`, not via a bulk sweep.
- **The per-key throttle bounds Redis QPS** as `(tracked keys) × (1 / CHECK_INTERVAL_SECONDS)` per process, independent of request volume.

## Relationships

- **The invalidation pipeline for an index change**: Model `save()` -> dependency callback (e.g. `process_index_change_in_core_cache` in `sefaria/model/text.py`) -> `library.refresh_index_record_in_cache()` (mutates locally, calls `gen_cache.mark_fresh("index_map")` itself) -> `invalidate_title(title)` called directly, no confirmation wait -> a peer's next `gen_cache.get("index_map")` (gated inline in `Library.get_index()`) notices the bump and runs `_refresh_index_maps()` (index maps, derived title lists/regexes, and the Ref cache).
- `sefaria.model.text.Library` is the main consumer: registers ~20 keys in `_register_gen_cache()` (shared-cache-backed ones via `_shared_cache_objects`), covering the TOC family, term mappings, title lists, the index maps, autocompleters, linker resolvers, and the topic mapping.
- `sefaria.helper.webpages.get_website_cache()` and `sefaria.model.schema.NonUniqueTerm.init()` register directly against the shared `gen_cache` singleton rather than through `Library`.
- `wrapper.py` imports the full `sefaria.model` and uses `Ref`, `Index`, and linkset operations.
- `common.py` depends on settings: `VARNISH_ADM_ADDR`, `VARNISH_HOST`, `VARNISH_FRNT_PORT`, `VARNISH_SECRET`, `FRONT_END_URL`.

## Common Tasks

- **Track a new object for cross-process freshness**: call `gen_cache.register(key, f"gen:{key}", refresh_fn)` at startup (or lazily, as `NonUniqueTerm.init()` does per-slug), gate reads with `gen_cache.get(key)`, and call `gen_cache.publish(key, value)` (or `gen_cache.mark_fresh(key)` if the object lives on its owner) at the actual write-path site -- never inside `refresh_fn` itself.
- **Invalidate a specific ref in Varnish**: call `invalidate_ref(oref, purge=True)` from `wrapper.py`.
- **Invalidate an entire title**: call `invalidate_title(title)` from `wrapper.py`.
- **Debug staleness**: check Redis/Sentinel connectivity, confirm the relevant `gen:*` key is actually being bumped at the write path, and check `GenCache.CHECK_INTERVAL_SECONDS` -- a peer can lag by up to that interval before noticing a change (by design).
