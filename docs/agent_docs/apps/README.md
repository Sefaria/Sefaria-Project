# Django Apps
> Sources: various top-level Django apps

## Purpose
These are the smaller Django apps that sit alongside the main `reader/` and `sefaria/` packages. Each one is a focused, self-contained Django app (with its own `apps.py`, admin, and usually migrations) providing a narrow capability: REST endpoints, ORM-backed admin UIs for curation, auth monkey-patches, feature flags, etc. They are registered in `INSTALLED_APPS` and most back data into Postgres/MySQL via Django ORM, while the core Sefaria data model still lives in MongoDB under `sefaria/model/`.

## Apps

### api/
> Source: `api/`
- **Purpose**: New-style REST API endpoints; currently only a class-based `Text` view for fetching versioned text by `Ref`.
- **Key files**: `views.py` (`Text(View)` with `get` + `dispatch` that resolves the `Ref`), `api_warnings.py` (structured response warnings: `APINoVersion`, `APINoLanguageVersion`, `APINoSourceText`, `APINoTranslationText` with numeric `APIWarningCode`s 101-104), `api_errors.py` (stub, largely empty).
- **Non-obvious**: Delegates actual text assembly to `sefaria.model.text_request_adapter.TextRequestAdapter`. Versions are passed as pipe-delimited `version=lang|vtitle` query params, underscores in `vtitle` are converted to spaces. Warnings are attached alongside returned data rather than raised; only truly empty refs return 404. This is separate from the older API surface in `reader/views.py`.

### django_topics/
> Source: `django_topics/`
- **Purpose**: Django-ORM-backed admin surface for Sefaria-product-specific topic metadata that doesn't belong in Mongo: topic pool membership, Topic of the Day, Featured Topic, Seasonal Topic schedules for the landing page.
- **Key files**: `models/topic.py` (`Topic` with slug PK and M2M to `TopicPool`; `TopicManager` has a process-local `slug_to_pools` cache rebuilt on save), `models/pool.py` (`TopicPool` + `PoolType` enum: `LIBRARY`, `SHEETS`, `TORAH_TAB`, `GENERAL_EN`, `GENERAL_HE`), `models/featured_topic.py`, `models/seasonal_topic.py`, `models/topic_of_the_day.py` (each uses EN/HE proxy models that force the `lang` field in `save()` so admin gets two separate list views per concept).
- **Non-obvious**: The real source of truth for topics is `sefaria/model/topic.py` (MongoDB). `sefaria.model.topic.Topic` imports `Topic as DjangoTopic` and mirrors a minimal row (slug + pools) into the ORM via `get_or_create` whenever a Mongo topic is saved (`topic.py:196`), deletes the Django row on Mongo deletion (`topic.py:1198`), and renames on slug change (`topic.py:393`). Pool membership lives only on the Django side and is read back via `DjangoTopic.objects.get_pools_by_topic_slug`. Seasonal topics have separate Israel/diaspora display date ranges with auto-population in `clean()`.

### chatbot/
> Source: `chatbot/`
- **Purpose**: Tiny app exposing editable chatbot welcome/restart/new-session messages (EN/HE) to the admin.
- **Key files**: `models.py` — defines `ChatbotWelcomeMessageProxy(RemoteConfigEntry)` (a Django admin proxy so the single JSON `feature.chatbot.welcome_messages` entry shows under the `chatbot` app label), plus `get_chatbot_welcome_messages()` which reads from `remoteConfigCache` and falls back to hard-coded `DEFAULTS` for any missing/empty keys.
- **Non-obvious**: There's no actual chatbot backend in this app — it's purely the message strings stored as a JSON value in `remote_config` under key `CHATBOT_WELCOME_MESSAGES`. Other chatbot knobs (`CHATBOT_MAX_INPUT_CHARS`, `CHATBOT_MAX_PROMPTS`, `SHOW_JOIN_CHATBOT_BANNER`) also live in `remote_config/keys.py`.

### emailusernames/
> Source: `emailusernames/`
- **Purpose**: Lets users log in with their email instead of Django's 30-char `username`. Historical third-party app vendored into the repo.
- **Key files**: `models.py` (monkey-patches `User.__init__` and `User.save_base` via `monkeypatch_user()`; also overrides `AdminSite.login_form` and `login_template`), `backends.py` (`EmailAuthBackend` — custom auth backend that looks up user by hashed email), `utils.py` (`_email_to_username` = first 30 chars of urlsafe-b64 SHA256; helpers `get_user`, `user_exists`, `create_user`, `create_superuser`, plus a `migrate_usernames` one-shot).
- **Non-obvious**: The `username` column stores a 30-char hash of the lowercased email; the `User` instance presents `username == email` in memory, then rewrites it to the hash inside `save_base`. `monkeypatch_user()` is called from `EmailUsernamesConfig.ready()` and re-applies itself if Django's test DB creation strips the patch. Anywhere you need to look up a user, call `emailusernames.utils.get_user(email)` rather than `User.objects.get(username=...)`.

### guides/
> Source: `guides/`
- **Purpose**: Backs the in-product "info card" guides (e.g., the editor quick-start carousel) that are editable from admin.
- **Key files**: `models.py` — `Guide` (keyed by a closed choices list, currently just `editor`; has title prefix and up to 2 footer links in EN/HE) and `InfoCard(Sortable)` (ordered tip cards with EN/HE title/markdown-text/video URL; uses `adminsortable`). Both expose a `contents()` method that emits the camelCase JSON shape the frontend expects (`titlePrefix`, `footerLinks`, `cards` with `videoUrl`). `views.py` exposes `guides_api(request, guide_key)` which returns `guide.contents()` or 404.
- **Non-obvious**: Video URLs are expected to be uploaded manually to the `guides-resources` GCS bucket — the model just stores the URL. Adding a new guide requires editing the `choices=[('editor', 'editor')]` tuple on `Guide.key`.

### remote_config/
> Source: `remote_config/`
- **Purpose**: Centralized feature-flag / runtime-config store. Anything that needs to be togglable without a deploy (linker version, ref cache limit, sentry config, chatbot knobs, client-side config JSON) lives here.
- **Key files**: `models.py` (`RemoteConfigEntry` with `key`, `raw_value`, `value_type` ∈ `string|int|bool|json`, `is_active`; `parse_value()` coerces; `save`/`delete` call `remoteConfigCache.reload()`), `cache.py` (`RemoteConfigCache` — thread-safe, lazily-built, process-local dict of `{key: parsed_value}` for active entries; singleton `remoteConfigCache`), `keys.py` (all known key constants — always reference these, don't hardcode), `views.py` (`remote_config_values` GET returns the whole cache as JSON for the client), `README.md` (full usage guide).
- **Non-obvious**: Cache is **process-local** — updates from admin/shell in one process don't propagate to Celery workers or other gunicorn workers until they reload. `apps.py:ready()` eagerly warms the cache on startup but swallows DB-unavailable errors. For `bool`, only the strings `"0"` and `"1"` are valid. Always call `remoteConfigCache.get(KEY, default=...)`; never query the ORM directly in hot paths.

### sourcesheets/
> Source: `sourcesheets/`
- **Purpose**: All HTTP routes for Source Sheets — viewing, editing, saving, collection (=sheet group) management, likes, tags, export, and media upload.
- **Key files**: Only `views.py` (~1100 lines) plus migrations. Notable functions: `view_sheet`, `save_sheet_api`, `add_source_to_sheet_api`, `collections_api` + family, `collections_inclusion_api`, `collections_invite_api`, `user_sheet_list_api`, `export_to_drive` (Google Drive via `gauth_required`), `upload_sheet_media` (GCS via `GoogleStorageManager`), `sheets_by_ref_api`, `tag_list_api`, `trending_tags_api`.
- **Non-obvious**: The app has **no `models.py`** — sheets are MongoDB documents managed in `sefaria/sheets.py` and `sefaria/model/collection.py`. Permission checks live inline as `can_edit`/`can_add` helpers. Uses `reader.views.menu_page` / `render_template` for the React shell. Drive export and media upload are the only paths that touch external services directly from this app.

### promotions/
> Source: `promotions/`
- **Purpose**: Not a Django app — it's a deploy/staging marker directory. `promotions/staging` is a single-line file containing a chart/app version (currently `6.88.0`) consumed by the CI/CD pipeline (see recent deploy commits).
- **Key files**: `staging` (one line, the pinned version).
- **Non-obvious**: Despite living next to the Django apps, there is no `__init__.py`, `apps.py`, or Python code here. Don't treat it as importable; bumping the version string is what triggers a staging deploy.

## Cross-App Relationships
- `chatbot/` is a thin proxy over `remote_config/`; its admin page edits a single JSON `RemoteConfigEntry`. Other chatbot feature flags also live in `remote_config/keys.py`.
- `django_topics/` is tightly coupled to `sefaria/model/topic.py` — the Mongo `Topic.save`/`delete` path mirrors slug + pool membership into the Postgres `DjangoTopic` row. Pools themselves only exist in Postgres; Mongo topic code calls back through `DjangoTopic.objects` to read them.
- `emailusernames/` globally monkey-patches `django.contrib.auth.models.User` at app-ready time, so every other app (including `sourcesheets/`, `reader/`) sees the email-as-username behavior transparently. Anything looking up users by email should route through `emailusernames.utils.get_user`.
- `api/` and `sourcesheets/` both depend on `sefaria.model` (MongoDB). `api/views.Text` is the newer versioned-text endpoint while `reader/views.py` still hosts the legacy text API.
- `guides/`, `remote_config/`, `django_topics/`, and `chatbot/` are all admin-curation apps: non-engineers edit data in `/admin/`, the frontend reads it via small JSON endpoints (`guides_api`, `remote_config_values`) or via template context populated from `remoteConfigCache`.
- `promotions/staging` is orthogonal — it's referenced only by CI, not by Python code.

## Common Tasks
- **Add a new feature flag**: add a constant to `remote_config/keys.py`, create the `RemoteConfigEntry` via admin or a data migration, read it with `remoteConfigCache.get(KEY, default=...)`. Remember the cache is per-process.
- **Add a new topic pool**: create a `TopicPool` row in `/admin/django_topics/` (or extend `PoolType` if it's a first-class kind), then assign topics via the Topic admin. Pool membership surfaces to Mongo via `DjangoTopic.objects.get_pools_by_topic_slug`.
- **Add a new guide**: extend the `choices` on `Guide.key`, create the `Guide` and its `InfoCard`s in admin, upload videos to the `guides-resources` GCS bucket, and fetch via `GET /api/guides/<key>`.
- **Look up a user by email**: `from emailusernames.utils import get_user; get_user(email)` — never `User.objects.get(username=email)`.
- **Add a new text-API endpoint**: extend `api/views.py` with another class-based view; add structured warnings to `api_warnings.py` with a new `APIWarningCode` enum value.
- **Edit chatbot welcome copy**: `/admin/chatbot/chatbotwelcomemessageproxy/` — it's a proxy over the JSON `RemoteConfigEntry` keyed by `feature.chatbot.welcome_messages`.
- **Bump staging deploy version**: edit the single line in `promotions/staging`.
