# Sefaria System Infrastructure
> Source: `sefaria/system/`

## Purpose
The infrastructure layer: MongoDB connections, multi-tier caching, request middleware, exception handling, cross-process cache freshness via GenCache (a Redis/Sentinel-backed generation-counter primitive), and Varnish HTTP cache invalidation. This is the plumbing that keeps the app running across multiple processes and servers.

## Navigation

| Doc | Covers | Load when... |
|-----|--------|-------------|
| [database_and_caching.md](./database_and_caching.md) | `database.py`, `cache.py`, `caches.py`, `cloudflare.py`, `serializers.py` | MongoDB connection setup, Django cache wrappers, Cloudflare CDN purges |
| [middleware_and_request.md](./middleware_and_request.md) | `middleware.py`, `decorators.py`, `context_processors.py`, `exceptions.py`, `validators.py`, `logging.py` | Request pipeline — language/location detection, error handling, template contexts, the `InputError` hierarchy |
| [gencache_and_varnish.md](./gencache_and_varnish.md) | `cache.py`'s `GenCache`, `redis_sentinel.py`, `varnish/*` | Cross-process cache freshness, Varnish cache invalidation on data changes |

## File Layout

```
system/
├── database.py              # MongoDB connection, index creation
├── cache.py                 # Django cache decorator + key generation + GenCache
├── caches.py                # MongoDB-backed Django cache backend
├── redis_sentinel.py        # Shared Redis/Sentinel connection helpers (GenCache, CACHES, Celery)
├── cloudflare.py            # Cloudflare purge API wrapper
├── serializers.py           # JSON cache serializer
├── middleware.py            # Language/location/module/cache/profiling middleware (~420 lines)
├── decorators.py            # View decorators (error handling, JSON, memoization)
├── context_processors.py    # Django template context processors
├── exceptions.py            # InputError hierarchy (BookNameError, DuplicateRecordError, etc.)
├── validators.py            # URL + HTTP method validators
├── logging.py               # Structlog processors
├── testing.py                # Test utilities
└── varnish/
    ├── common.py            # varnishadm + HTTP PURGE primitives
    └── wrapper.py           # Ref-aware invalidation logic
```
