# Middleware and Request Processing
> Sources: `sefaria/system/middleware.py`, `sefaria/system/decorators.py`, `sefaria/system/context_processors.py`, `sefaria/system/exceptions.py`, `sefaria/system/validators.py`, `sefaria/system/logging.py`

## Purpose

Handles the Django request/response pipeline: middleware classes that enrich requests with language, location, module, and profiling data; view decorators for error handling, caching, CORS, and XSS protection; template context processors that inject global data; a structured exception hierarchy for user-facing errors; input validators; and structlog processors for Google Cloud-compatible logging.

## Key Components

### middleware.py -- Request Enrichment

- **`MiddlewareURLMixin`**: Base mixin providing `should_process_request()` that checks URL names and path prefixes against exclusion sets. Used by `ModuleMiddleware`.
- **`SharedCacheMiddleware`**: On each request, checks if the shared cache has been populated (`last_cached` key). If not, and no regeneration is in progress, sets `request.init_shared_cache = True` to trigger library cache rebuild. Prevents thundering herd via a `regenerating` flag.
- **`LocationSettingsMiddleware`**: Sets `request.diaspora` based on `HTTP_CF_IPCOUNTRY` header (Cloudflare geolocation). Falls back to `PINNED_IPCOUNTRY` setting or `"us"`. Israel = not diaspora.
- **`LanguageSettingsMiddleware`**: The most complex middleware. Determines `request.interfaceLang` and `request.contentLang` through a priority chain:
  1. Interface language: user profile > cookie > Cloudflare geo > HTTP Accept-Language > default "english". Only "english" and "hebrew" are supported.
  2. If the current domain is pinned to a language (via `DOMAIN_MODULES`) and the user's language differs, redirects to the correct domain. Crawlers are not redirected.
  3. Content language: URL param `lang` > cookie > default based on interface language.
  4. Also resolves `translation_language_preference` and `version_preferences_by_corpus` from profile or cookies.
- **`LanguageCookieMiddleware`**: Handles the `set-language-cookie` query parameter. Sets an `interfaceLang` cookie on the target domain and redirects to remove the param from the URL. Enables cross-domain language persistence.
- **`SessionCookieDomainMiddleware`**: Dynamically sets session/CSRF cookie domains based on `DOMAIN_MODULES` configuration. Enables cross-subdomain login (e.g., `www.sefaria.org` and `voices.sefaria.org` share cookies via `.sefaria.org`). Includes legacy cookie expiration logic gated by `EXPIRE_LEGACY_COOKIES` remote config flag.
- **`CORSDebugMiddleware`**: Adds permissive CORS headers only when `DEBUG=True` and request is from localhost.
- **`ProfileMiddleware`**: Appending `?prof` to any URL in debug mode runs cProfile and returns profiling output as HTML.
- **`MaxRSSMiddleware`**: Measures memory (maxrss) delta per request and binds it to structlog context. Handles macOS vs Linux unit differences (bytes vs KB).
- **`ModuleMiddleware`**: Sets `request.active_module` based on hostname lookup against `DOMAIN_MODULES`. Defaults to `LIBRARY_MODULE`. Excludes API and static paths.

### decorators.py -- View Decorators

- **`catch_error_as_json`**: Catches `InputError` exceptions and returns them as `{"error": "..."}` JSON. The primary error-handling decorator for API views.
- **`catch_error_as_http`**: Catches `InputError` as 404, other exceptions as a generic error page. Used for HTML-rendering views.
- **`sanitize_get_params`**: Bleach-cleans all GET parameters and string URL args to prevent XSS.
- **`conditional_graceful_exception`**: Catches exceptions and logs them (instead of raising) when `FAIL_GRACEFULLY=True`. Used during server startup to prevent one bad text/ref from crashing the whole server. When `FAIL_GRACEFULLY=False` (e.g., during data import), exceptions propagate normally.
- **`memoized`**: Class-based decorator for in-memory function result caching. Supports instance methods via `__get__`. Cache is per-decorator-instance (not shared).
- **`cors_allow_all`**: Adds permissive CORS headers and handles OPTIONS preflight. Also applies `csrf_exempt`.
- **`json_response_decorator`**: Wraps return value in `jsonResponse()` with optional JSONP callback support.

### context_processors.py -- Template Context

- **Gating decorators**: `@builtin_only` (login/password pages), `@data_only` (sefaria.js/data endpoints/sheets), `@user_only` (excludes API/linker/data paths). These prevent expensive data lookups on requests that don't need them.
- **`global_settings()`**: Injects search index names, Strapi config, analytics IDs, debug flags, and site settings into every template.
- **`large_data()`**: Injects `toc`, `topic_toc`, `titles_json`, `terms_json`, `virtual_books` from the library. Only runs for data-serving endpoints.
- **`cache_timestamp()`**: Provides `last_cached` timestamp for cache-busting.
- **`module_context()`**: Provides `active_module` and `domain_modules` to templates.
- **`chatbot_user_token()`**: Manages chatbot script URL/type based on user experiment enrollment and optional `chatbot_version` query parameter (persisted in session).

### exceptions.py -- Exception Hierarchy

- **`InputError`**: Base exception for user input problems. Caught by `catch_error_as_json` and `catch_error_as_http` decorators.
  - `PartialRefInputError`: Includes `matched_part` and `valid_continuations` for autocomplete-style feedback.
  - `BookNameError`: Book title not found.
  - `DuplicateRecordError`: Would-be duplicate on save.
  - `IndexSchemaError`, `NoVersionFoundError`, `SheetNotFoundError`, `ComplexBookLevelRefError`, `DictionaryEntryNotFoundError`.
- **Non-InputError exceptions**: `ManuscriptError`, `MissingKeyError`, `SluggedMongoRecordMissingError` -- these are NOT caught by the standard error decorators and will produce 500s unless handled explicitly.
- **Schema validation exceptions**: `SchemaValidationException`, `SchemaRequiredFieldException`, `SchemaInvalidKeyException` -- used by model `_validate()` methods.
- **`InvalidURLException`, `InvalidHTTPMethodException`**: Used by validators.

### validators.py -- Input Validation

- **`validate_url()`**: Uses Django's `URLValidator`. Raises `InvalidURLException` on failure.
- **`validate_http_method()`**: Checks against standard HTTP methods. Raises `InvalidHTTPMethodException`.

### logging.py -- Structlog Processors

- **`log_exception_info()`**: Converts `exc_info` field to a formatted `message` string.
- **`decompose_request_info()`**: Extracts `requestUrl` and `requestMethod` from a Django request object into an `httpRequest` dict (Google Cloud Logging format).
- **`add_severity()`**: Maps structlog method name (e.g., "warning") to a `severity` field.

## Non-Obvious Patterns

- **`LanguageSettingsMiddleware` can return a redirect response** from `process_request`, short-circuiting the entire middleware chain. This happens when the user's language doesn't match the current domain's pinned language.
- **`SharedCacheMiddleware` uses a two-flag pattern** (`last_cached` + `regenerating`) to coordinate cache rebuilds across concurrent requests without explicit locking.
- **`conditional_graceful_exception` is controlled by a global setting**, not per-call. The same decorated function behaves differently on prod (fail gracefully) vs during data import (fail loudly). This is the `FAIL_GRACEFULLY` setting.
- **`SessionCookieDomainMiddleware` works around a Django limitation** (ticket #10554) where you cannot set multiple cookies with the same name. It injects raw `Set-Cookie` headers via `response._headers` with unique internal keys to expire legacy cookies.
- **The `memoized` decorator's cache is never invalidated**. It grows unboundedly for the lifetime of the process.
- **Context processors use path-based gating** to avoid expensive operations. If you add a new URL pattern, check whether it matches any of the exclusion patterns in `@builtin_only`, `@data_only`, or `@user_only`.

## Relationships

- Middleware sets request attributes (`interfaceLang`, `contentLang`, `diaspora`, `active_module`, `init_shared_cache`) that views and context processors depend on.
- `catch_error_as_json` and `catch_error_as_http` depend on the `InputError` hierarchy from `exceptions.py`.
- `SharedCacheMiddleware` uses `cache.py`'s shared cache functions and triggers library cache regeneration.
- `LanguageSettingsMiddleware` depends on `UserProfile` model, `DOMAIN_MODULES` settings, and Cloudflare headers.
- `context_processors.py` depends heavily on `sefaria.model.library` for TOC, titles, and terms data.
- The structlog processors in `logging.py` are configured in Django settings and run on every log call.

## Common Tasks

- **Add a new middleware**: Add to `MIDDLEWARE` in settings. Use `MiddlewareMixin` for class-based or implement `__init__`/`__call__` for function-based.
- **Handle errors in a new API view**: Decorate with `@catch_error_as_json`. Raise `InputError` subclasses for user-facing errors.
- **Add data to all templates**: Add a context processor function to `context_processors.py` and register it in `TEMPLATES` settings. Use gating decorators to limit when it runs.
- **Exclude a URL from middleware processing**: Add the path prefix to the middleware's exclusion set or check `request.path` early in `process_request`.
