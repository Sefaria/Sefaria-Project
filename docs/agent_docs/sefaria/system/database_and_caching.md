# Database and Caching
> Sources: `sefaria/system/database.py`, `sefaria/system/cache.py`, `sefaria/system/caches.py`, `sefaria/system/cloudflare.py`, `sefaria/system/serializers.py`

## Purpose

Provides the foundational data layer: MongoDB connectivity, a multi-tier caching system (Django cache backends including a custom MongoDB-backed cache), an in-process memory cache, Cloudflare CDN purge integration, and JSON serialization helpers.

## Key Components

### database.py -- MongoDB Connection

- **Module-level singleton**: On import, creates a `pymongo.MongoClient` and assigns `db` to the Sefaria database. This `db` object is imported throughout the codebase as the primary database handle.
- **Replica set support**: When `MONGO_REPLICASET_NAME` is set (production), connects via a URI with `readPreference=primaryPreferred`. Otherwise uses simple host/port (development).
- **Test mode**: When `sys._called_from_test` is set (by pytest conftest), connects to `TEST_DB` instead.
- **Doc build guard**: When `sys._doc_build` is set, `db` is set to an empty string to avoid connecting during documentation generation.
- **`ensure_indices()`**: Defines all MongoDB indexes for every collection (links, texts, sheets, topics, user_history, etc.). Called during setup/migration. Indexes are defined as `(collection_name, field_spec, kwargs)` triples.

### cache.py -- Django Cache Abstraction

- **`get_cache_factory(cache_type)`**: Returns a Django cache backend instance by alias name. Central dispatch for all cache operations.
- **`django_cache()` decorator**: Wraps any function with automatic cache-aside logic. Supports `action="get"|"reset"|"set"`, custom `cache_key`, `cache_prefix`, `timeout`, `default_on_miss` (returns a default instead of computing on miss), and `decorate_data_with_key` (wraps result with its key).
  - Strips `HttpRequest` objects from cache key generation to ensure replicable keys.
  - Uses MD5 hashing of serialized args/kwargs for cache keys.
- **`get/set/delete_cache_elem()`**: Low-level cache CRUD. `delete_cache_elem` handles both single keys and lists (falls back to iterative delete if `delete_many` is unavailable).
- **Shared cache variants**: `get/set/delete_shared_cache_elem()` route to the `SHARED_DATA_CACHE_ALIAS` backend, used for data that must be consistent across processes (e.g., library cache state).
- **`InMemoryCache`**: A simple dict-based cache with optional TTL. The singleton `in_memory_cache` is used for per-process memoization and is referenced by the multiserver coordinator for cross-server cache invalidation.
- **`invalidate_cache_by_pattern()`**: Pattern-based cache clearing. Uses `delete_pattern()` on Redis-backed caches (django-redis). Returns a result dict with success/method/count. Falls back gracefully for non-Redis backends.
- **Cache aliases**: `SHARED_DATA_CACHE_ALIAS` and `LONG_TERM_CACHE_ALIAS` can be configured in settings; both default to the Django default cache.

### caches.py -- MongoDB-Backed Django Cache Backend

- **`SimpleMongoDBCache`**: A full Django `BaseCache` implementation that stores cache entries in a MongoDB collection (default: `django_cache`).
  - Uses the existing `db` connection from `database.py` -- does not create its own MongoDB client.
  - Stores entries as `{key, data, expires, last_change}` documents.
  - Creates TTL indexes on `expires` for automatic expiration by MongoDB.
  - Sanitizes keys by replacing `$` and `.` (MongoDB special characters) with `_`.
  - `reconnect()` decorator retries operations up to 3 times on `AutoReconnect` errors.
  - Supports capped collections (marks entries as expired rather than deleting).

### cloudflare.py -- CDN Cache Purge

- **`SefariaCloudflareManager`**: Manages Cloudflare cache invalidation via the Cloudflare API.
  - `purge_cloudflare()`: Purges the entire zone cache.
  - `purge_multiple_cloudflare_urls(files)`: Purges specific URLs. Prepends the current Django `Site` domain if not preprocessed. Max 30 files per API call.
  - `purge_batch_cloudflare_urls()`: Chunks large file lists into batches of 30.
  - `purge_static_files_from_cloudflare(timestamp)`: Finds and purges static files modified after a given timestamp.
  - Only purges files under `valid_cached_dirs` (currently just `"static"`).

### serializers.py -- JSON Serialization

- **`JSONSerializer`**: Uses `DjangoJSONEncoder` for serialization with `ensure_ascii=False`. Provides `dumps()`/`loads()` interface.

## Non-Obvious Patterns

- **`db` is a module-level singleton** created at import time. Any module that does `from sefaria.system.database import db` shares the same connection. There is no connection pooling abstraction beyond what pymongo provides internally.
- **The `django_cache` decorator marks its wrapped function** with `fn.__dict__["django_cache"] = True`, allowing introspection to check if a function is cache-decorated.
- **Cache key collisions are possible** since the key is an MD5 hash of concatenated string representations of args/kwargs. Two different argument sets could theoretically produce the same hash.
- **`SimpleMongoDBCache` reuses the app's main database** (`from sefaria.system.database import db`), not a separate cache database. Cache data lives alongside application data.
- **`InMemoryCache.reset_all()` sets values to `None`** rather than removing keys, which means `get()` will return `None` (a cache miss) but timeouts and keys persist.
- **Cloudflare purge uses HTTP DELETE** with `X-Auth-Key` authentication (legacy API key auth, not the newer API token pattern).

## Relationships

- `caches.py` depends on `database.py` for its MongoDB connection.
- `cache.py`'s `in_memory_cache` is directly referenced by the multiserver coordinator (`coordinator.py`) during cross-server cache invalidation events.
- The `django_cache` decorator in `cache.py` is used throughout the model layer (e.g., `library` methods for TOC, text titles, term mappings).
- `SharedCacheMiddleware` (in `middleware.py`) uses `get/set_shared_cache_elem` from `cache.py` to coordinate library cache regeneration across requests.
- Cloudflare invalidation is a separate concern from Varnish invalidation -- Cloudflare handles static assets/CDN, while Varnish handles API endpoint caching.

## Common Tasks

- **Add a new MongoDB index**: Add a tuple to the `indices` list in `ensure_indices()` in `database.py`, then run the function.
- **Cache a function result**: Apply `@django_cache(timeout=3600)` to the function. Use `cache_prefix` to namespace keys.
- **Invalidate cached data by pattern**: Call `invalidate_cache_by_pattern("*pattern*")`. Only works with Redis backends.
- **Purge Cloudflare for specific URLs**: Use `SefariaCloudflareManager().purge_cloudflare_url(path)` or `purge_batch_cloudflare_urls(files)`.
- **Access the database**: `from sefaria.system.database import db` then use `db.collection_name` for direct pymongo operations.
