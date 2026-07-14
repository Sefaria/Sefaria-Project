# Sefaria System Infrastructure
> Source: `sefaria/system/`

## Purpose
The infrastructure layer: MongoDB connections, multi-tier caching, request middleware, exception handling, multi-server coordination via Redis pub/sub, and Varnish HTTP cache invalidation. This is the plumbing that keeps the app running across multiple processes and servers.

## Navigation

| Doc | Covers | Load when... |
|-----|--------|-------------|
| [database_and_caching.md](./database_and_caching.md) | `database.py`, `cache.py`, `caches.py`, `cloudflare.py`, `serializers.py` | MongoDB connection setup, Django cache wrappers, Cloudflare CDN purges |
| [middleware_and_request.md](./middleware_and_request.md) | `middleware.py`, `decorators.py`, `context_processors.py`, `exceptions.py`, `validators.py`, `logging.py` | Request pipeline — language/location detection, error handling, template contexts, the `InputError` hierarchy |
| [multiserver_and_varnish.md](./multiserver_and_varnish.md) | `multiserver/*`, `varnish/*` | Cross-server event coordination, Varnish cache invalidation on data changes |

## File Layout

```
system/
├── database.py              # MongoDB connection, index creation
├── cache.py                 # Django cache decorator + key generation
├── caches.py                # MongoDB-backed Django cache backend
├── cloudflare.py            # Cloudflare purge API wrapper
├── serializers.py           # JSON cache serializer
├── middleware.py            # Language/location/module/cache/profiling middleware (~420 lines)
├── decorators.py            # View decorators (error handling, JSON, memoization)
├── context_processors.py    # Django template context processors
├── exceptions.py            # InputError hierarchy (BookNameError, DuplicateRecordError, etc.)
├── validators.py            # URL + HTTP method validators
├── logging.py               # Structlog processors
├── testing.py               # Test utilities
├── multiserver/
│   ├── messaging.py         # Redis pub/sub base
│   ├── coordinator.py       # Per-server publish + sync listener
│   └── monitor.py           # Central confirmation tracker
└── varnish/
    ├── common.py            # varnishadm + HTTP PURGE primitives
    ├── wrapper.py           # Ref-aware invalidation logic (full)
    └── thin_wrapper.py      # Minimal invalidation (no model dependency)
```

## Key Architecture Pattern: Cache Invalidation Flow

A single data change propagates through multiple layers:

```
1. Model.save()
   ↓
2. notify() fires callbacks from dependencies.py
   ↓
3. In-process caches updated (library title maps, ref cache)
   ↓
4. ServerCoordinator.publish_event() → Redis pub/sub
   ↓
5. All other app servers receive event, update their in-process caches
   ↓
6. MultiServerMonitor waits for all confirmations
   ↓
7. Varnish purge/ban invalidates HTTP cache
   ↓
8. (Optional) Cloudflare purge for static assets
```

Understanding this flow is critical for any work that touches model state.

## Common Patterns

- **Thin wrapper avoids circular imports**: `varnish/thin_wrapper.py` is used by the monitor process to invalidate without importing models.
- **Redis pub/sub, not a queue**: Missed messages are lost. Servers restarted mid-event may have stale caches until next full restart.
- **InputError vs system errors**: `catch_error_as_json` converts `InputError` to structured JSON responses; other exceptions bubble up as 500s.
- **Two-flag thundering herd prevention**: `SharedCacheMiddleware` uses two flags to prevent multiple workers from rebuilding the same cache simultaneously.
- **MongoDB cache is persistent**: `SimpleMongoDBCache` survives process restarts. Useful for expensive computations that shouldn't be re-run on deploys.
