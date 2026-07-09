# Sefaria Small Packages
> Sources: `sefaria/client/`, `sefaria/gauth/`, `sefaria/celery_setup/`, `sefaria/constants/`, `sefaria/site/`, `sefaria/sefaria_tasks_interace/`

## Purpose

A collection of small, focused packages that handle cross-cutting concerns: HTTP response formatting, Google OAuth, async task queuing, shared constants, multi-site configuration, and history change data contracts.

## Key Components

### `sefaria/client/` -- Internal HTTP Client & Response Utilities

**`client/util.py`** -- Response helpers used by Django views:
- `jsonResponse(data, callback, status)` -- serializes data to JSON `HttpResponse`; auto-calls `.contents()` on AbstractMongoRecord objects; converts `_id` to string and datetime fields to ISO format. Supports JSONP via optional `callback`.
- `jsonpResponse(data, callback)` -- wraps JSON in a JavaScript callback
- `celeryResponse(task_id, sub_task_ids)` -- returns a 202 Accepted response with task tracking IDs
- `send_email(subject, message_html, from_email, to_email)` -- sends email via Django's `EmailMultiAlternatives`
- `read_webpack_bundle(config_name)` -- reads a webpack bundle file from disk, handling both relative paths and full CDN URLs in production

**`client/wrapper.py`** -- Formats model objects for the frontend client:
- `format_link_object_for_client(link, with_text, ref, pos)` -- transforms a `Link` model object into the dict format expected by the reader UI; includes commentary metadata, version info, merged source attribution, and text content
- `format_note_object_for_client(note)` -- formats user notes for display alongside links
- `format_object_for_client(obj)` -- dispatcher for Link or Note objects
- `get_links(tref, with_text, with_sheet_links, categories)` -- main link retrieval function. Fetches all links for a ref, caches section-level text lookups to minimize DB calls, handles spanning refs, merged versions, and "bound texts" (e.g. Steinsaltz automatically includes links from the underlying Talmud text)
- `get_notes(oref, public, uid)` -- retrieves formatted notes for a ref

### `sefaria/gauth/` -- Google OAuth2

Implements a two-step OAuth 2.0 flow for Google API access (currently used only for Google Drive export of source sheets).

**`gauth/decorators.py`:**
- `@gauth_required(scope, ajax)` -- decorator that checks if the user has valid Google credentials stored in their `UserProfile.gauth_token`. If credentials exist but are expired, attempts refresh. If no credentials or refresh fails, redirects to OAuth flow (or returns 401 for AJAX).

**`gauth/views.py`:**
- `index(request)` -- Step 1: initiates OAuth flow by redirecting to Google's authorization URL
- `auth_return(request)` -- Step 2: handles the callback, exchanges authorization code for credentials, stores them in the user's profile. Preserves existing refresh tokens if the new response lacks one.
- `GAUTH_ERROR_CODES` -- recognized OAuth error types: `access_denied`, `invalid_grant`, `scope_mismatch`
- Error handling redirects back to the originating view with error info in the URL fragment

### `sefaria/celery_setup/` -- Async Task Queue Configuration

**`celery_setup/app.py`:**
- Creates the Celery application instance (`app = Celery('sefaria')`)
- Auto-discovers tasks in `sefaria.helper.llm`, `sefaria.helper.linker`, `sefaria.helper.crm`
- Results expire after 1800 seconds (30 minutes)

**`celery_setup/config.py`:**
- `CeleryQueue` enum with `TASKS` and `LLM` queue names (read from `settings.CELERY_QUEUES`)
- `generate_config_from_env()` -- builds Celery config from Django settings, supporting both direct Redis and Redis Sentinel

**`celery_setup/generate_config.py`:**
- `RedisConfig` / `SentinelConfig` dataclasses for connection parameters
- `generate_config(redis_config, sentinel_config)` -- produces the broker/result-backend URL config. When Sentinel is configured, resolves DNS to get all Sentinel addresses and joins them.
- `dns_refresher()` / `start_background_dns_refresher()` -- background thread that polls DNS every 60 seconds and updates the broker URL if Sentinel addresses change

### `sefaria/constants/model.py` -- Model Constants

- `ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD` -- tuple of HTML tags permitted in text content: `i`, `b`, `br`, `u`, `strong`, `em`, `big`, `small`, `img`, `sup`, `sub`, `span`, `a`
- `ALLOWED_ATTRS_IN_ABSTRACT_TEXT_RECORD` -- dict mapping tags to their allowed attributes (e.g. `i` tags support `data-commentator`, `data-order`, `data-overlay` for inline commentary and structural markers)
- `LANGUAGE_CODES` -- maps ISO codes to language names (includes `jrb` -> "arabic" for Judeo-Arabic)
- `LIBRARY_MODULE`, `VOICES_MODULE` -- string constants (`"library"`, `"voices"`) used as keys in `settings.DOMAIN_MODULES` for multi-site routing

### `sefaria/site/` -- Multi-Site URL & Settings Configuration

A dynamic import layer that loads site-specific settings and URL patterns based on the `SITE_PACKAGE` Django setting.

**`site/site_settings.py`:**
- Dynamically imports `SITE_SETTINGS` dict from `{SITE_PACKAGE}.site_settings`. This dict contains site-specific configuration like `TORAH_SPECIFIC` (controls whether calendar features are active) and `HELP_CENTER_REDIRECTS`.

**`site/urls.py`:**
- Dynamically imports `site_urlpatterns` from `{SITE_PACKAGE}.urls`, allowing different URL routing per deployment.

### `sefaria/sefaria_tasks_interace/` -- History Change Data Contracts

Note: the directory name contains a typo ("interace" instead of "interface").

**`history_change.py`:**
- `AbstractHistoryChange` -- base dataclass with `uid` (user ID) and `method` ("API" or "Site")
- `LinkChange(AbstractHistoryChange)` -- adds `raw_link: dict`
- `VersionChange(AbstractHistoryChange)` -- adds `raw_version: dict`, `patch: bool`, `skip_links: bool`, `count_after: int`

These are data transfer objects used to pass structured change information between components, likely for history/audit logging.

## Non-Obvious Patterns

- **`client/wrapper.py` text caching**: `get_links()` caches section-level text lookups in a local `texts` dict to avoid redundant DB queries when multiple links point to the same section. This is a significant performance optimization since a single ref can have dozens of links.

- **Bound texts in `get_links()`**: Hard-coded logic adds links from underlying texts to overlay texts. For example, when viewing "Steinsaltz on Berakhot 2a", links to "Berakhot 2a" are automatically included. The `bound_texts` tuple currently only contains `"Steinsaltz on "`.

- **`site/` dynamic imports**: The `__import__` pattern with `fromlist` allows Sefaria to support multiple site configurations (e.g. Sefaria vs. other deployments) by swapping the `SITE_PACKAGE` setting. This affects URL patterns, feature flags, and site-specific settings.

- **Sentinel DNS refresh**: In production with Redis Sentinel, Celery's broker URL may go stale if Sentinel instances change IP addresses. The background DNS refresher thread handles this transparently.

- **OAuth refresh token preservation**: In `gauth/views.py`, if Google does not return a new refresh token (which happens on subsequent authorizations), the existing refresh token from the user's profile is preserved.

## Relationships

- `client/util.py` is imported by virtually every Django view for `jsonResponse`.
- `client/wrapper.py` is the primary consumer of `JaggedTextArray` outside the model layer; it is called by the texts API and links API views.
- `constants/model.py` is imported by `sefaria/utils/util.py` (for `ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD`) and throughout the model layer for HTML sanitization.
- `site/site_settings.py` is imported by `calendars.py` (to check `TORAH_SPECIFIC`), views, and middleware.
- `celery_setup/app.py` is imported by any module that defines or calls Celery tasks (LLM processing, link checking, CRM sync).
- `gauth/` is used by `sheets/views.py` for Google Drive export functionality.

## Common Tasks

**Return a JSON response from a view:**
```python
from sefaria.client.util import jsonResponse
return jsonResponse({"status": "ok"})
return jsonResponse({"error": "not found"}, status=404)
```

**Get formatted links for a text ref:**
```python
from sefaria.client.wrapper import get_links
links = get_links("Genesis 1:1", with_text=True)
```

**Use the Celery app to define a task:**
```python
from sefaria.celery_setup.app import app
@app.task
def my_task():
    pass
```

**Check allowed HTML tags for text content:**
```python
from sefaria.constants.model import ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD
# Use with bleach or custom sanitizer
```
