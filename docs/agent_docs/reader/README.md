# Reader App

> Source: `reader/`

## Purpose

The reader app is the main Django application that serves the Sefaria web interface. It handles all page rendering (text reader, topics, profiles, collections, community pages) and most REST API endpoints. The app name is somewhat misleading -- it is not just a "reader" but the entire web-facing Django app.

URL routing lives in `sefaria/urls_library.py` and `sefaria/urls_sheets.py` (via django-hosts), not inside the reader app itself. Views are imported as `reader.views`.

## Key Components

### views.py (~5200 lines)

The largest file in the project. Contains all page-rendering views and API endpoints.

#### SSR Pattern (Server-Side Rendering)

The central rendering pattern is:

1. **`base_props(request)`** (line ~274) -- Builds a dict of props that every page gets: user data, auth state, interface settings (from cookies), calendar items, chatbot config, notification counts, etc. This dict becomes the React `ReaderApp` component's props.

2. **`render_template(request, template_name, app_props, template_context)`** (line ~192) -- The universal render function. It:
   - Merges `app_props` with `base_props()`
   - Serializes to JSON as `propsJSON`
   - Calls `render_react_component("ReaderApp", propsJSON)` to get server-rendered HTML from Node.js
   - Passes both `propsJSON` and the SSR `html` to the Django template

3. **`render_react_component(component, props)`** (line ~222) -- Sends props to a Node.js SSR server (`NODE_HOST`) via HTTP POST. On timeout/error, falls back to a loading spinner (client-side rendering). Controlled by `USE_NODE` setting.

**Key implication:** To add data to a page, you add it to `app_props` in the view function. The React app receives it as props. If the data should be on ALL pages, add it to `base_props()`.

#### Page-Rendering Views (HTML responses)

| Function                         | Line  | Purpose                                                                                         |
| -------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `home`                           | ~4272 | Homepage                                                                                        |
| `catchall`                       | ~412  | Catch-all URL handler -- resolves text refs and sheet refs, delegates to `text_panels`          |
| `text_panels`                    | ~658  | Core text reader -- builds panel dicts for text content, handles multi-panel, versions, filters |
| `texts_category_list`            | ~833  | Category listing page (e.g., `/texts/Tanakh`)                                                   |
| `topic_page`                     | ~3308 | Individual topic page (`/topics/<slug>`)                                                        |
| `topics_page`                    | ~3288 | Topics landing page                                                                             |
| `all_topics_page`                | ~895  | Alphabetical topic listing                                                                      |
| `collection_page`                | ~1036 | Collection (group) page                                                                         |
| `edit_collection_page`           | ~1069 | Collection editor                                                                               |
| `user_profile`                   | ~3858 | User profile page                                                                               |
| `search`                         | ~966  | Search results page                                                                             |
| `menu_page`                      | ~1144 | Generic menu page renderer (used for saved, history, etc.)                                      |
| `community_page`                 | ~4279 | Community/voices landing page                                                                   |
| `translations_page`              | ~1108 | Translation management page                                                                     |
| `edit_text`                      | ~1365 | Text editor page                                                                                |
| `edit_text_info`                 | ~1405 | Text metadata editor                                                                            |
| `explore`                        | ~4739 | Link explorer visualization                                                                     |
| `notifications`                  | ~1236 | Notifications page                                                                              |
| `sheet_crumbs` / `ld_cat_crumbs` | ~1283 | Structured data (JSON-LD breadcrumbs for SEO)                                                   |
| `global_activity`                | ~3709 | Recent edit activity                                                                            |
| `segment_history`                | ~3787 | Edit history for a specific text segment                                                        |

#### Panel Construction Helpers

These functions build the data structures that define what the React reader displays:

- **`make_panel_dict`** (~468) -- Builds a single panel's data: fetches text, resolves versions, sets mode
- **`make_panel_dicts`** (~633) -- Builds panels for a ref (may create connection panel alongside text panel)
- **`make_sheet_panel_dict`** (~580) -- Builds panel data for a source sheet
- **`make_search_panel_dict`** (~564) -- Builds panel data for search results

#### Text & Content APIs

| Function               | Line  | URL Pattern                    | Purpose                                                      |
| ---------------------- | ----- | ------------------------------ | ------------------------------------------------------------ |
| `texts_api`            | ~1547 | `/api/texts/<ref>`             | GET/POST text content. The primary text retrieval API        |
| `index_api`            | ~1892 | `/api/index/<title>`           | GET/POST/DELETE text index (metadata/schema)                 |
| `links_api`            | ~2163 | `/api/links/<ref>`             | GET/POST/DELETE intertextual links                           |
| `related_api`          | ~3112 | `/api/related/<ref>`           | All related data for a ref (links, sheets, topics, webpages) |
| `versions_api`         | ~2432 | `/api/texts/versions/<ref>`    | List available versions for a text                           |
| `shape_api`            | ~2023 | `/api/shape/<title>`           | Text structure/shape data                                    |
| `complete_version_api` | ~1722 | `/api/texts/complete-version/` | Batch version data                                           |
| `notes_api`            | ~2291 | `/api/notes/<ref>`             | User notes CRUD                                              |
| `category_api`         | ~2627 | `/api/category/<path>`         | Category metadata CRUD                                       |
| `modify_bulk_text_api` | ~1504 | `/api/texts/<title>`           | Bulk text modification                                       |

`related_api` takes two lighter modes, used by the new reader (`reader-next/`): `?with_links=0` leaves `links` out (the client has them from `/api/links`), and `?sheets=count` answers `sheets` with only each sheet's id and anchors (`sefaria.sheets.get_sheet_anchors_for_ref`), enough to count them per verse. Without either parameter the answer, and its key order, is unchanged. The answer depends on the URL only, never on the host: Varnish keys `/api/related` on the URL alone. `sefaria/system/varnish/wrapper.py` `invalidate_ref` purges and bans the client's encoded form of these URLs (see [gencache_and_varnish.md](../sefaria/system/gencache_and_varnish.md)).

#### Topic APIs

| Function                 | Line  | URL Pattern                 | Purpose                                                                                          |
| ------------------------ | ----- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `topics_api`             | ~3459 | `/api/topics/<topic>`       | Topic CRUD                                                                                       |
| `topics_list_api`        | ~3357 | `/api/topics/list`          | List topics                                                                                      |
| `topic_ref_api`          | ~3610 | `/api/topics/ref/<ref>`     | Topics linked to a ref                                                                           |
| `bulk_topic_api`         | ~3664 | `/api/topics/bulk`          | Batch topic retrieval                                                                            |
| `recommend_topics_api`   | ~3679 | `/api/topics/recommend`     | Topic recommendations                                                                            |
| `add_new_topic_api`      | ~3406 | POST `/api/topics/new`      | Create topic                                                                                     |
| `topic_graph_api`        | ~3491 | `/api/topics/graph/<topic>` | Topic relationship graph                                                                         |
| `reorder_sources`        | ~3641 | POST `/api/topics/reorder`  | Reorder topic sources                                                                            |
| `topics_toc_api`         | ~2531 | `/api/topics-toc`           | Topics table of contents (the `topic_toc_json` legacy pages carry); not in Varnish's cached list |
| `num_library_topics_api` | ~2543 | `/api/topics/library-count` | `{"count": N}`, the library topic pool size (`numLibraryTopics` in `base_props`)                 |

#### Search APIs

| Function                         | Line  | Purpose                                            |
| -------------------------------- | ----- | -------------------------------------------------- |
| `search_wrapper_api`             | ~4668 | Proxy to Elasticsearch                             |
| `name_api`                       | ~2912 | `/api/name/<name>` -- Autocomplete/name resolution |
| `dictionary_api`                 | ~2995 | Dictionary entry lookup                            |
| `dictionary_completion_api`      | ~2970 | Dictionary autocomplete                            |
| `opensearch_suggestions_api`     | ~1868 | OpenSearch suggestions                             |
| `search_autocomplete_redirecter` | ~1849 | Redirect autocomplete selections                   |

#### User & Profile APIs

| Function                  | Line  | Purpose                                                                                  |
| ------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `profile_api`             | ~3885 | Profile GET/POST                                                                         |
| `account_user_update`     | ~3942 | Update user account fields                                                               |
| `follow_api`              | ~3164 | Follow/unfollow user                                                                     |
| `block_api`               | ~3196 | Block/unblock user                                                                       |
| `notifications_api`       | ~3104 | Get notifications                                                                        |
| `user_history_api`        | ~4197 | Reading history                                                                          |
| `profile_sync_api`        | ~4049 | Sync user settings/history                                                               |
| `experiments_opt_in_api`  | ~3927 | Opt in/out of experiments                                                                |
| `delete_user_account_api` | ~4139 | Account deletion                                                                         |
| `profile_upload_photo`    | ~4025 | Profile photo upload                                                                     |
| `reader_choice_api`       | ~5046 | `/api/reader-choice` (Library host only): which reader this browser gets, and the switch |
| `library_assistant_api`   | ~5015 | `/api/library-assistant`: Library Assistant access and token                             |
| `segment_history_api`     | ~4743 | `/api/activity/<ref>/<lang>/<version>`: JSON twin of `segment_history`                   |

`reader_choice_api`: GET answers `{available, disabled, canChooseNext, reader, saved}`; POST `{"reader": "classic" | "next"}` (CSRF-protected) sets or clears the `reader_version` cookie and records the choice on the profile; `"next"` is refused (403) outside the opt-in audience or while the kill switch is on. Never cached. See `sefaria/helper/reader_choice.py`. `library_assistant_api`: the same rule and chatbot token as the page props, for clients that do not render through `base_props`; `private, no-store`. `segment_history_api`: signed-in only (401 otherwise), `?type=&page=` in pages of 100, an unknown ref or version is a 404.

`profile_api` POST also accepts `settings.reader_version` on the Library host: normalized, dropped when it is `"next"` and the user may not use the new reader, and, when the deployment offers the choice (`READER_OPTIN`), the response sets or clears the routing cookie (`reader_choice.apply_cookie`).

#### Calendar & Liturgical APIs

| Function                | Line  | Purpose                     |
| ----------------------- | ----- | --------------------------- |
| `calendars_api`         | ~2746 | Daily/weekly calendar items |
| `parashat_hashavua_api` | ~1817 | Weekly Torah portion        |
| `parasha_data_api`      | ~2733 | Parasha metadata            |

#### Infrastructure & Health

| Function                 | Line  | Purpose                                                                                       |
| ------------------------ | ----- | --------------------------------------------------------------------------------------------- |
| `application_health_api` | ~6594 | `/healthz` -- Checks Redis (via GenCache's client), Node.js (only while `USE_NODE` is on), DB |
| `rollout_health_api`     | ~5104 | `/healthz-rollout` -- Deployment health check                                                 |
| `background_data_api`    | ~3216 | Background data loading for client                                                            |

With `USE_NODE` off (Helm `nodejs.mode: reader`) the node pods are the new reader, which sends `/healthz` back to Django, so `/healthz` skips the Node check rather than wait on itself.

#### Static pages as JSON

`serve_static` (and `digitized_by_sefaria`) answer `?format=json[&lang=en|he]` with the page's content only (title, description, the `{% block content %}` HTML, its stylesheets) for the new reader's own shell; the page rendering itself moved to `_serve_static_page`. The JSON is built by `reader/static_content.py` (`requested(request)`, `respond(...)`): rendered for an anonymous visitor, `Cache-Control: public` only when `lang` is explicit, a 404 `{"standalone": true}` for pages that do not extend `base.html`. A query parameter, not a header, so Varnish and Cloudflare (URL-keyed) never confuse the JSON with the page. Library host only: on Voices `?format=json` is ignored.

#### Browser error beacons

`reader/browser_errors.py` `reader_errors_api`, routed at `/api/reader-errors` in `sefaria/urls_library.py` (Library host only): the new reader's `navigator.sendBeacon` error reports. CSRF-exempt and session-free (it writes only one structured log line on the `reader-browser` logger, no database write), validates a fixed schema, scrubs query strings and email addresses, answers 204 (or 400/405/413/415/429). Rate limited per client address and globally in Django's default cache; the client address is taken from the header the gateway overwrites, never from one the client can append to.

#### Redirects

Many functions handle legacy URL redirects (old sheet URLs, old profile URLs, module-based routing between library/voices domains). Key ones:

- `redirect_to_module` (~4862) -- Cross-module redirects between library and voices
- `catchall` (~412) -- The catch-all that resolves any text ref URL

### models.py

Contains a single model:

- **`UserExperimentSettings`** -- A one-to-one extension of Django's `User` model tracking whether a user is opted into experiments (feature flags). The `experiments` boolean is also monkey-patched onto the `User` model as a property via `User.add_to_class()`.
- **`_set_user_experiments(user, value)`** -- Sets the flag on both the Django model and the MongoDB `UserProfile`, and dispatches a CRM webhook.
- **`user_has_experiments(user)`** -- Checks if a user has an experiment settings record.

### admin.py

Registers `UserExperimentSettings` in Django admin with:

- CSV upload for bulk-enabling experiments by email
- Custom `UserAdmin` subclass that adds an "Experiments" checkbox to the user edit form
- Search by email, username, name

### startup.py

Called during `runserver` startup. Two functions:

- **`init_sentry_from_settings()`** -- Initializes Sentry error tracking
- **`init_library_cache()`** -- Warms critical caches: TOC tree, shared cache, autocompleter, lexicon completers, linker. This is why the dev server takes a while to start.

### management/commands/ensure_mongo_indexes.py

`./manage.py ensure_mongo_indexes [--create] [--collection NAME ...]`: lists (default; exit 1 if any) or creates the MongoDB indexes registered in `sefaria/system/database.py` `ensure_indices` that the database lacks. Nothing else creates them. See [database_and_caching.md](../sefaria/system/database_and_caching.md).

### management/commands/runserver.py

Custom `runserver` management command that extends Django's staticfiles runserver. Calls `init_library_cache()` and `init_sentry_from_settings()` on startup, ensuring caches are warm before serving requests.

### templatetags/sefaria_tags.py

Custom Django template tags and filters. Notable ones:

| Tag/Filter                                               | Purpose                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `{% static "path" %}`                                    | Static file URL with cache-busting hash (overrides Django's built-in) |
| `ref_link`                                               | Converts a text ref string to an `<a>` tag                            |
| `he_ref_link`                                            | Same as `ref_link` but with Hebrew text                               |
| `he_ref`                                                 | Returns Hebrew ref for an English ref                                 |
| `version_link`                                           | Link to a specific text version                                       |
| `text_toc_link`                                          | Link to a text's table of contents                                    |
| `jsonify`                                                | Serializes objects to JSON (used in templates)                        |
| `strip_tags`                                             | HTML tag stripping                                                    |
| `license_link`                                           | Link to license explanation page                                      |
| `partition_by` / `partition_into` / `partition_vertical` | List partitioning for template layouts                                |
| `hebrew_term`                                            | Translates a term to Hebrew                                           |
| `user_link` / `user_name`                                | Render user link/name from UID                                        |

### browsertest/

Selenium-based browser tests. Key test classes in `basic_tests.py`:

- `PagesLoad` -- Verifies basic pages load (TOC, texts, topics, search, gardens)
- `PagesLoadLoggedIn` -- Tests logged-in pages (profile, notifications)
- `SinglePanelOnMobile` -- Verifies mobile renders single panel

The `framework/` directory contains the `SefariaTest` base class with helper methods for browser interaction.

## Non-Obvious Patterns

1. **`catchall` is the most important routing function.** Any URL that doesn't match an explicit pattern in `urls_library.py` falls through to `catchall`, which tries to parse it as a text ref (e.g., `/Genesis.1.1`) or sheet ref.

2. **Multi-panel state is URL-encoded.** The `text_panels` function reads `p2`, `p3`, etc. query params to build additional panels beyond the first. Version params use `v2he`, `v2en` patterns.

3. **Module system (library vs. voices).** The app supports two "modules" on different domains. `request.active_module` determines which module is active. Some views redirect between modules.

4. **Props are the API contract with React.** The Django views don't return HTML directly -- they build Python dicts that become React props. The React `ReaderApp` component is the single entry point for all page rendering.

5. **`base_props` is expensive.** It loads user profile, notifications, saved items, calendar data, etc. on every page load. This is intentional -- the React app needs this data immediately.

6. **Version preferences.** Users can set preferred text versions per corpus. `override_version_with_preference` (~950) applies these preferences when loading text.

7. **The `jsonResponse` helper** (from `sefaria.client.util`) wraps API responses. It handles JSONP callbacks and error formatting.

## Relationships

- **URL routing**: `sefaria/urls_library.py` and `sefaria/urls_sheets.py` map URLs to `reader.views` functions
- **React frontend**: Views build props consumed by `static/js/ReaderApp.jsx`
- **Node SSR server**: `render_react_component` calls a separate Node.js process to pre-render React HTML
- **sefaria.model**: Nearly all views depend on model classes (`Ref`, `TextFamily`, `Index`, `UserProfile`, etc.)
- **sefaria.tracker**: Text/link edits go through the tracker for history recording
- **Templates**: `templates/base.html` is the main template; receives `propsJSON` and `html` from `render_template`

## Common Tasks

### Adding a new page

1. Create a view function in `views.py` that calls `render_template()` with appropriate `app_props`
2. Add URL pattern in `sefaria/urls_library.py` (and/or `urls_sheets.py`)
3. Handle the new `initialPath` in the React `ReaderApp` component

### Adding a new API endpoint

1. Create a function in `views.py` decorated with `@catch_error_as_json`
2. Return data via `jsonResponse(data)`
3. Add URL pattern in `sefaria/urls_library.py`

### Adding data to all pages

Add it to the `base_props()` function. It will be available as a prop in `ReaderApp`.

### Adding data to a specific page

Add it to the `app_props` dict in that page's view function before calling `render_template()`.

### Managing feature flags

Use `UserExperimentSettings` via Django admin. Bulk-enable via CSV upload. Check with `user_has_experiments(request.user)` or `request.user.experiments` in views.

### The Library Assistant switch

Not a feature flag: it is a per-user setting at `profile.settings["library_assistant"]`, read and written only through `sefaria.helper.library_assistant`. Until every profile has been backfilled, an absent key falls back to the old rule (`UserExperimentSettings` row exists AND `profile.experiments`), so never read the key directly — call `is_enabled(profile)` / `is_enabled_for_user(user)`.
