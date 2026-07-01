# Views & URL Routing
> Sources: `sefaria/views.py`, `sefaria/urls.py`, `sefaria/urls_library.py`, `sefaria/urls_shared.py`, `sefaria/urls_sheets.py`, `sefaria/hosts.py`

## Purpose
Handles all HTTP request routing and the view functions defined in `sefaria/views.py`. The app uses **django-hosts** to split traffic across two subdomains (library and sheets/voices), with a large set of shared URL patterns common to both.

## URL Architecture

### django-hosts Setup (`hosts.py`)
The app routes requests by subdomain using `django_hosts`. Two host patterns are defined:

- **`library`** -- the main site (e.g. `sefaria.org`). Routes to `sefaria.urls_library`.
- **`voices`** -- the voices/sheets subdomain (e.g. `sheets.sefaria.org`). Routes to `sefaria.urls_sheets`.

Domain strings are built dynamically from `settings.DOMAIN_MODULES`, keyed by language. Each language has entries for `LIBRARY_MODULE` and `VOICES_MODULE` (constants from `sefaria.constants.model`). Multiple language domains are OR'd together with `|` in the regex.

```
settings.DOMAIN_MODULES[lang][LIBRARY_MODULE]  -> library subdomain
settings.DOMAIN_MODULES[lang][VOICES_MODULE]   -> sheets subdomain
```

### `urls.py` (ROOT_URLCONF)
Contains only `urlpatterns = []`. All real routing is in `urls_library` and `urls_sheets`. This file exists solely to satisfy Django's `ROOT_URLCONF` requirement.

### `urls_library.py` -- Library Subdomain
Library-specific routes followed by `shared_patterns`. Key groups:

- **Homepage & text browsing**: `/`, `/texts/`, `/texts/<cats>`, `/calendars`
- **Text editing**: `/add/`, `/edit/`, `/translate/` -- all route to `reader_views.edit_text`
- **Visualization**: `/visualize/*` routes
- **Activity & dashboard**: `/activity/`, `/dashboard`
- **Settings**: `/settings/account`, `/settings/profile`
- **Downloads**: `/download/version/...` -> `sefaria_views.text_download_api`
- **Mod tools**: `/modtools/` for text upload, link management (staff-only)
- **Compare**: `/compare/` -> `sefaria_views.compare`

Appends `shared_patterns` at the end. If `DOWN_FOR_MAINTENANCE` is set, replaces all patterns with `maintenance_patterns`.

### `urls_sheets.py` -- Sheets Subdomain
Sheets-specific routes followed by `shared_patterns`:

- **Homepage**: `/` -> `sheets_views.sheets_home_page`
- **Sheet CRUD**: `/sheets/new`, `/sheets/<id>`, `/sheets/visual/<id>`
- **Collections**: `/collections/`, `/collections/new`, `/collections/<slug>`, `/collections/<slug>/settings`
- **Profile**: `/my/profile`, `/profile/`, `/profile/<username>`

### `urls_shared.py` -- Shared Patterns (Both Subdomains)
The bulk of the URL patterns live here. Included by both `urls_library` and `urls_sheets`. Major groups:

**Authentication** (all route to `sefaria_views`):
- `/login/`, `/register/`, `/logout/`, `/password/reset/*`
- `/api/login/` (JWT via `TokenObtainPairView`), `/api/login/refresh/`
- `/api/register/`

**Text & Index APIs** (mostly `reader_views`):
- `/api/texts/<tref>`, `/api/v3/texts/<tref>` (DRF class-based view)
- `/api/index/`, `/api/v2/index/<title>`, `/api/index/<title>`
- `/api/links/<ref>`, `/api/link-summary/<ref>`
- `/api/related/<tref>`, `/api/notes/*`
- `/api/versions/`, `/api/texts/versions/<tref>`

**Sheets API** (`sheets_views`):
- `/api/sheets/` (save), `/api/sheets/<id>` (get/update), `/api/sheets/<id>/delete`
- `/api/sheets/<id>/like`, `/api/sheets/<id>/unlike`
- `/api/sheets/user/<id>/`, `/api/sheets/ref/<ref>`
- `/api/sheets/upload-image`, `/api/sheets/<id>/export_to_drive`

**Collections API** (`sheets_views` + `sefaria_views` for image upload):
- `/api/collections/`, `/api/collections/<slug>`
- `/api/collections/<slug>/set-role/`, `/api/collections/<slug>/invite/`
- `/api/collections/upload` -> `sefaria_views.collections_image_upload`

**Topics API** (`reader_views`):
- `/api/topics/<topic>`, `/api/v2/topics/<topic>`
- `/api/topic/new`, `/api/topic/delete/<topic>`
- `/api/ref-topic-links/*`, `/api/topics-graph/<topic>`
- `/topics/`, `/topics/<slug>`, `/topics/category/<cat>`

**Profile & User APIs** (`reader_views`):
- `/api/profile`, `/api/profile/<slug>`, `/api/profile/sync`
- `/api/profile/user_history`, `/api/profile/upload-photo`
- `/api/follow/`, `/api/unfollow/`, `/api/block/`, `/api/unblock/`

**Search**:
- `/search/`, `/api/search-wrapper/es8`, `/api/search-wrapper/es6`
- `/api/opensearch-suggestions/`

**Linker** (`sefaria_views`):
- `/linker.js`, `/linker.v<N>.js`
- `/api/find-refs/`, `/api/find-refs/report/`
- `/api/linker-data/<titles>`, `/api/bulktext/<refs>`
- `/api/linker-track`, `/api/regexs/<titles>`

**Admin** (`sefaria_views`, all `@staff_member_required`):
- `/admin/reset/cache`, `/admin/reset/toc`, `/admin/reset/ac`
- `/admin/reset/<tref>`, `/admin/reset/varnish/<tref>`
- `/admin/rebuild/auto-links/<title>`, `/admin/rebuild/citation-links/<title>`
- `/admin/delete/user-account`, `/admin/delete/sheet`
- `/admin/spam`, `/admin/spam/sheets`, `/admin/spam/profiles`
- `/admin/cache/stats`, `/admin/memory/summary`

**Misc**:
- `/data.js`, `/sefaria.js` -- dynamic JS bundles
- `/api/send_feedback`, `/api/subscribe/<email>`
- `/api/strapi/graphql-cache`, `/api/strapi/cache-invalidate`
- `/api/passages/<refs>`, `/api/async/<task_id>`
- `/api/remote-config/`

**Catchall** (last pattern): `/<tref>/` -> `reader_views.catchall`

**Maintenance mode**: When `DOWN_FOR_MAINTENANCE` is truthy, both subdomains replace all patterns with `maintenance_patterns` which only allow `/admin/`, `/healthz/`, `/health-check/`, and a catch-all that renders a maintenance message.

## Key View Functions (in `sefaria/views.py`)

### Authentication & Registration
- `CustomLoginView`, `CustomLogoutView` -- class-based views extending Django auth, mixed with `StaticViewMixin` for SSR context.
- `CustomPasswordResetView` -- overrides `form_valid` to set correct domain for multi-subdomain email links.
- `register(request)` -- form-based registration (session auth).
- `register_api(request)` -- DRF `@api_view(["POST"])`, returns JWT tokens.
- `process_register_form(request, auth_method)` -- shared logic for both. Creates user, profile, assigns slug, joins invited collections, fetches Gravatar.

### JavaScript Generation
- `data_js(request)` -- renders `js/data.js` template with dynamic book lists and TOC. Cached for 1 year with `immutable`.
- `sefaria_js(request)` -- combines `data.js` + webpack bundle.
- `linker_js(request, linker_version)` -- serves the Sefaria Linker plugin. v3 uses webpack bundle; older versions use Django templates.

### Linker & Find Refs
- `find_refs_api(request)` -- POST, dispatches to Celery task (`find_refs_api_task`), returns task_id with 202 status for async polling.
- `async_task_status_api(request, task_id)` -- polls Celery `AsyncResult`. Returns 200 on success, 202 while pending, 500 on failure.
- `title_regex_api(request, titles)` -- returns JS-compatible regex for title matching.
- `linker_data_api(request, titles)` -- combines regex data with website tracking exclusion info.
- `bulktext_api(request, refs)` -- returns text for multiple refs at once (used by linker).
- `linker_tracking_api(request)` -- POST, logs linker hits, creates/updates `WebPage` records.

### Newsletter & Feedback
- `generic_subscribe_to_newsletter_api` -- dispatches to org-specific subscribe functions (sefaria, steinsaltz).
- `subscribe_sefaria_newsletter` -- uses `CrmMediator` (Salesforce).
- `generate_feedback(request)` -- sends email based on feedback type (corrections, user testing, general).

### Text Downloads
- `text_download_api(request, format, title, lang, versionTitle)` -- serves text versions as JSON/CSV/TXT.
- `bulk_download_versions_api(request)` -- staff-only, creates ZIP of multiple versions matching query patterns.

### Admin & Cache Management (all `@staff_member_required`)
- `reset_cache` -- rebuilds library, publishes multiserver event, invalidates Varnish.
- `reset_ref(tref)` -- refreshes index cache, version state, TOC, and Varnish for a specific ref.
- `reset_counts(title)` -- refreshes `VersionState` for a title or all titles.
- `rebuild_toc`, `rebuild_auto_completer` -- rebuild table of contents or autocomplete data.
- `reset_cached_api(apiurl)` -- reverse-resolves a URL, finds decorated cache, resets it.
- `cache_stats`, `cache_dump`, `memory_summary` -- diagnostic endpoints.

### Spam Management
- `spam_dashboard(request)` -- POST handler for marking sheets/profiles as spam.
- `sheet_spam_dashboard`, `profile_spam_dashboard` -- GET views showing potential spam.
- `purge_spammer_account_data(spammer_id)` -- deletes sheets, notes, notifications, following relationships; deactivates account; marks in CRM.

### Mod Tools
- `modtools_upload_workflowy(request)` -- parses WorkFlowy export files to create index/version records.
- `links_upload_api(request)` -- uploads or deletes links from CSV.
- `text_upload_api(request)` -- imports text versions from uploaded files.

### Other
- `collections_image_upload(request)` -- resizes and uploads collection images to Google Cloud Storage.
- `compare(request, ...)` -- renders the text comparison page.
- `passages_api(request, refs)` -- maps refs to their containing sugya/passage.
- `strapi_graphql_cache` / `strapi_cache_invalidate` -- caching proxy for Strapi CMS GraphQL queries.
- `maintenance_message(request)` -- renders 503 maintenance page.

## Non-Obvious Patterns

### StaticViewMixin
All auth class-based views use `StaticViewMixin`, which adds `renderStatic: True` to template context. This controls server-side rendering behavior in the React frontend.

### CSRF Handling
Several API endpoints are `@csrf_exempt`: `linker_tracking_api`, `generic_subscribe_to_newsletter_api`, `subscribe_sefaria_newsletter_view`, `index_sheets_by_timestamp`, `strapi_graphql_cache`, `rebuild_shared_cache`. This is because they are called by external services or the linker widget.

### Multiserver Coordination
Admin cache-reset views check `MULTISERVER_ENABLED` and publish events via `server_coordinator.publish_event()`. This ensures cache invalidation propagates across all app servers. Pattern: reset locally, then publish event.

### Varnish Integration
When `USE_VARNISH` is True, cache resets also call `invalidate_*` functions from `sefaria.system.varnish.wrapper`. The import is conditional at module level.

### Authentication Decorators
- `@login_required` -- used on: `unlink_gauth`, `collections_image_upload`
- `@staff_member_required` -- used on all `/admin/` views
- `@webhook_auth_or_staff_required` -- custom decorator for webhook endpoints (`rebuild_shared_cache`, `strapi_cache_invalidate`)
- `@api_view(["POST"])` -- DRF decorator on `register_api`, `find_refs_api`, `find_refs_report_api`
- `@cors_allow_all` -- custom decorator on `find_refs_api`, `async_task_status_api` (linker needs cross-origin access)

### Async Pattern (Find Refs)
`find_refs_api` is async: it enqueues a Celery task and returns `202` with a `task_id`. The client polls `async_task_status_api` until the task completes. The task runs on `CeleryQueue.TASKS`.

### Catchall Route
The very last shared pattern is `r'^(?P<tref>[^/]+)(/)?$'` -> `reader_views.catchall`. This catches any single-segment URL and tries to resolve it as a text reference. Must remain last.

### Maintenance Mode
When `settings.DOWN_FOR_MAINTENANCE` is truthy, both `urls_library` and `urls_sheets` replace their entire `urlpatterns` with `maintenance_patterns`. Only admin and health-check URLs remain active.

### data.js Caching Strategy
`data_js` sets `max_age=31536000` (1 year) and `immutable=True`. The URL includes a timestamp segment (`data.<timestamp>.js`) so cache busting happens via URL change, not revalidation.

## Relationships

### Model Layer Imports
`sefaria/views.py` imports extensively from the model layer:
- `import sefaria.model as model` -- primary access pattern (used as `model.Ref`, `model.library`, `model.TextFamily`, `model.TextChunk`, `model.VersionState`)
- `from sefaria.model import *` -- brings in `Ref`, `library`, `Version`, `VersionSet`, `Passage`, etc.
- `from sefaria.model.webpage import *` -- `WebPage`, `WebPageSet`, `WebSite`, `WebSiteSet`
- `from sefaria.model.user_profile import UserProfile, user_link`
- `from sefaria.model.collection import CollectionSet, process_sheet_deletion_in_collections`
- `from sefaria.model.notification import process_sheet_deletion_in_notifications`

### Other Key Imports
- `sefaria.client.util.jsonResponse` -- standard JSON response helper used throughout
- `sefaria.system.cache` -- `get_shared_cache_elem`, `set_shared_cache_elem`, `in_memory_cache`, `get_cache_elem`, `set_cache_elem`, `invalidate_cache_by_pattern`
- `sefaria.system.database.db` -- direct MongoDB access
- `sefaria.system.decorators` -- `catch_error_as_http`, `cors_allow_all`
- `sefaria.forms` -- `SefariaNewUserForm`, `SefariaNewUserFormAPI`, `SefariaLoginForm`, `SefariaPasswordResetForm`, `SefariaSetPasswordForm`
- `reader.views.base_props`, `reader.views.render_template` -- used for SSR rendering
- `sefaria.helper.text` -- `make_versions_csv`, `get_library_stats`, `get_core_link_stats`, `WorkflowyParser`
- `sefaria.helper.link` -- `add_links_from_csv`, `delete_links_from_text`, `get_csv_links_by_refs`
- `sefaria.google_storage_manager.GoogleStorageManager` -- file uploads to GCS
- `sefaria.system.multiserver.coordinator.server_coordinator` -- cross-server cache coordination
- `sefaria.export` -- text export functions
- `sefaria.decorators.webhook_auth_or_staff_required` -- custom auth decorator

### Related View Modules
`sefaria/views.py` is only one of several view modules. URL patterns also reference:
- `reader.views` -- the largest view module; handles text display, most API endpoints, profiles, topics
- `sourcesheets.views` -- sheet CRUD, collections management, sheet APIs
- `api.views` -- v3 API (DRF class-based views, e.g. `api_views.Text`)
- `sefaria.gauth.views` -- Google OAuth flow
- `guides.views` -- guides API
- `remote_config.views` -- remote config API

## Common Tasks

### Adding a New API Endpoint
1. Write the view function in the appropriate module (`sefaria/views.py` for general/admin, `reader/views.py` for text/content, `sourcesheets/views.py` for sheets).
2. Add the URL pattern to `sefaria/urls_shared.py` (if it should work on both subdomains) or to `urls_library.py`/`urls_sheets.py` (if subdomain-specific).
3. Place the pattern **before** the catchall route at the end of `shared_patterns`.
4. Use `jsonResponse()` from `sefaria.client.util` for JSON API responses.
5. Apply `@staff_member_required` for admin endpoints, `@login_required` for authenticated endpoints.
6. If the endpoint needs CORS (external callers), use `@cors_allow_all`.

### Adding an Admin Cache Reset
1. Add a `@staff_member_required` view in `sefaria/views.py`.
2. Perform the local reset.
3. If `MULTISERVER_ENABLED`: publish via `server_coordinator.publish_event(...)`.
4. If `USE_VARNISH`: call appropriate `invalidate_*` function.
5. Add URL to `urls_shared.py` under the `/admin/` prefix.

### Adding a New Page (SSR)
1. Use `render_template(request, 'template.html', None, context)` (imported from `reader.views`).
2. For pages that need React props, call `base_props(request)` and serialize to JSON in the context.
