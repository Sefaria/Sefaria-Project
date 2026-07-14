# Multiserver Coordination and Varnish Cache Invalidation
> Sources: `sefaria/system/multiserver/messaging.py`, `sefaria/system/multiserver/coordinator.py`, `sefaria/system/multiserver/monitor.py`, `sefaria/system/varnish/common.py`, `sefaria/system/varnish/wrapper.py`, `sefaria/system/varnish/thin_wrapper.py`

## Purpose

Coordinates cache invalidation across multiple application server instances and the Varnish HTTP cache. When a model changes on one server, the change must propagate to all other servers' in-memory caches and to Varnish. This is the core infrastructure for the pipeline: DB change -> model notify -> multiserver Redis pub/sub -> each server updates its caches -> Varnish invalidation.

## Key Components

### messaging.py -- Redis Pub/Sub Base

- **`MessagingNode`**: Base class for all Redis pub/sub participants. Provides:
  - `connect()`: Creates a `redis.StrictRedis` client and subscribes to `subscription_channels`. Pops initial subscription confirmation messages.
  - `_check_initialization()`: Lazy-connects if not already connected.
  - `event_description(data)`: Formats event data as `"obj.method(args) [id]"` for logging.
  - Configuration comes from `MULTISERVER_REDIS_SERVER`, `MULTISERVER_REDIS_PORT`, `MULTISERVER_REDIS_DB` settings.

### coordinator.py -- Server-Side Event Publishing and Listening

- **`ServerCoordinator(MessagingNode)`**: Runs on each web server instance. Subscribes to `MULTISERVER_REDIS_EVENT_CHANNEL`.
  - **`publish_event(obj, method, args)`**: Publishes a cache invalidation event. The payload is `{obj, method, args, id}` where `obj` is a string name (e.g., `"library"`, `"scache"`, `"in_memory_cache"`), `method` is a method name to call, and `args` is the argument list. Before publishing, calls `sync()` to process any pending inbound messages. After publishing, pops its own message off the subscription (since the publisher is also a subscriber).
  - **`sync()`**: Polls for and processes all pending Redis messages. Called periodically by `MultiServerEventListenerMiddleware` (every 20 requests) and before every `publish_event`.
  - **`_process_message(msg)`**: Deserializes the event, resolves `obj` to a local Python object (from a hardcoded set: `library`, `scache`, `text`, `in_memory_cache`), calls `method(*args)`, then publishes a confirmation message (success/error) to `MULTISERVER_REDIS_CONFIRM_CHANNEL`.

- **`MultiServerEventListenerMiddleware`**: Django middleware that calls `server_coordinator.sync()` every 20 requests. Self-disables via `MiddlewareNotUsed` when `MULTISERVER_ENABLED=False`.

- **`server_coordinator`**: Module-level singleton, created only when `MULTISERVER_ENABLED=True`.

### monitor.py -- External Monitor Process

- **`MultiServerMonitor(MessagingNode)`**: A standalone process (not part of the web server) that subscribes to both the event and confirm channels. Tracks event completion across all servers.
  - `listen()`: Infinite polling loop (200ms interval).
  - `_process_event(data)`: Records a new event and calculates expected confirmations as `subscribers - 2` (excludes itself and the publisher).
  - `_process_confirm(data)`: Increments confirmation count. When all confirmations received, calls `_process_completion()`.
  - **`_process_completion(data)`**: After all servers confirm a cache update, triggers Varnish invalidation. Currently handles two library methods:
    - `refresh_index_record_in_cache` -> `invalidate_title(title)` in Varnish
    - `remove_index_record_from_cache` -> `invalidate_title(title)` in Varnish
  - Uses `thin_wrapper.invalidate_title()` (not the full `wrapper`) to avoid importing core model code.

### varnish/common.py -- Varnish Primitives

- **`ban_url(url)`**: Runs `varnishadm ban` via subprocess to ban all cached objects matching a URL regex. Used for broad invalidation (anything under a ref).
- **`purge_url(url)`**: Sends an HTTP `PURGE` request to the Varnish frontend. Used for targeted invalidation of specific URLs. Returns the HTTP response; logs errors on non-200 status.
- Both functions are wrapped with `@graceful_exception` to prevent Varnish errors from crashing the application.

### varnish/wrapper.py -- Full Varnish Invalidation (Web Server)

- **`invalidate_ref(oref, lang, version, purge)`**: The primary invalidation function called when text content changes.
  - If `purge=True`: PURGEs the specific section-level ref across multiple API endpoint patterns (v3/texts, links, related -- with various query param combinations).
  - Always BANs the ref and everything beneath it using regex patterns.
  - Normalizes refs to section level before invalidating.
- **`invalidate_linked(oref)`**: Finds all refs linked to `oref` and invalidates each one. Handles UnicodeDecodeError gracefully.
- **`invalidate_counts(indx)`**: Purges preview, counts, and v2 index endpoints for a given index.
- **`invalidate_index(indx)`**: Purges index API endpoints (v1, v2, v2/raw).
- **`invalidate_title(title)`**: Combines `invalidate_index` + `invalidate_counts` + bans for texts and links APIs. The main entry point for title-level invalidation.
- **`invalidate_all()`**: Bans `.*` -- nuclear option.
- **`url_regex(ref)`**: Generates Varnish-compatible regex patterns for a Ref that match the ref itself and any more specific refs beneath it. Handles ranges, spanning refs, titled continuations, and numeric continuations.

### varnish/thin_wrapper.py -- Lightweight Varnish Invalidation (Monitor)

- **`invalidate_title(title)`**: Duplicates the logic of `wrapper.invalidate_index()` + `wrapper.invalidate_counts()` + base title bans, but without importing any model code. Uses only string manipulation and `common.py` functions. This exists specifically for the `MultiServerMonitor` process, which should not load the full Sefaria model layer.

## Non-Obvious Patterns

- **The object resolution in `_process_message` is done via `locals()`**: The coordinator imports `library`, `scache`, `text`, and `in_memory_cache` inside the method, then uses `locals()[data["obj"]]` to resolve the string name to the actual Python object. This means only these four objects can be referenced in multiserver events.
- **The publisher is also a subscriber**: `ServerCoordinator` subscribes to the same channel it publishes to. After publishing, it must pop its own message to avoid processing it as an incoming event. There's a collision-handling path for messages that arrive between publish and pop.
- **Varnish uses two distinct invalidation strategies**: `PURGE` (immediate, targeted, one URL at a time) and `BAN` (regex-based, lazy evaluation, broader scope). PURGEs give immediate freshness to the editing user; BANs handle cascading invalidation.
- **The monitor waits for ALL servers to confirm** before triggering Varnish invalidation. This ensures all in-memory caches are updated before Varnish serves fresh content, preventing a race where Varnish fetches stale data from a server that hasn't yet updated its cache.
- **`thin_wrapper` exists to avoid circular imports**: The monitor process cannot import `sefaria.model` (which triggers heavy initialization), so it has its own minimal Varnish invalidation code.
- **`sync()` is recursive**: It calls itself after processing each message, continuing until the queue is drained.
- **The middleware delay of 20 requests** means cache updates can be delayed by up to 20 requests on any given server. This is a trade-off between freshness and performance.

## Relationships

- **The full invalidation pipeline**: Model `save()` -> model calls `library.refresh_index_record_in_cache()` -> `server_coordinator.publish_event("library", "refresh_index_record_in_cache", [title])` -> Redis pub/sub -> all `ServerCoordinator` instances call `library.refresh_index_record_in_cache(title)` on their local library -> each sends confirmation -> `MultiServerMonitor._process_completion()` -> `thin_wrapper.invalidate_title(title)` -> Varnish purge/ban.
- `coordinator.py` imports `library`, `scache` (from `cache.py`), `text` (from `model.text`), and `in_memory_cache` (from `cache.py`) to execute received events.
- `wrapper.py` imports the full `sefaria.model` and uses `Ref`, `Index`, and linkset operations. `thin_wrapper.py` deliberately avoids these imports.
- `common.py` depends on settings: `VARNISH_ADM_ADDR`, `VARNISH_HOST`, `VARNISH_FRNT_PORT`, `VARNISH_SECRET`, `FRONT_END_URL`.
- `MultiServerEventListenerMiddleware` is registered in Django `MIDDLEWARE` and drives the periodic `sync()` on each web server process.

## Common Tasks

- **Trigger cache invalidation after a model change**: Call `server_coordinator.publish_event("library", "method_name", [args])`. The coordinator handles propagation.
- **Add a new invalidation target**: Add the import to `_process_message()` in `coordinator.py` and handle the new object/method in `monitor._process_completion()` if Varnish invalidation is needed.
- **Invalidate a specific ref in Varnish**: Call `invalidate_ref(oref, purge=True)` from `wrapper.py`.
- **Invalidate an entire title**: Call `invalidate_title(title)` from `wrapper.py` (web server) or `thin_wrapper.py` (monitor).
- **Debug multiserver sync issues**: Check Redis connectivity, verify `MULTISERVER_ENABLED=True`, look at log messages for "publish_event", "Processing succeeded/failed", and confirmation counts in the monitor.
