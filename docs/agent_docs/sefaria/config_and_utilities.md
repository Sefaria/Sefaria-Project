# Configuration and Utilities
> Sources: `sefaria/settings.py`, `sefaria/settings_utils.py`, `sefaria/forms.py`, `sefaria/decorators.py`, `sefaria/export.py`, `sefaria/recommendation_engine.py`, `sefaria/pagesheetrank.py`, `sefaria/stats.py`, `sefaria/clean.py`, `sefaria/sitemap.py`, `sefaria/image_generator.py`, `sefaria/google_storage_manager.py`

## Purpose

This document covers the supporting infrastructure files in the `sefaria/` package: configuration, authentication helpers, data export, analytics/ranking, maintenance utilities, and media generation. These files are not part of the core model layer but provide essential scaffolding.

## Key Components

### Configuration

**`settings.py`** -- Standard Django settings file. Key Sefaria-specific settings include:
- `STATIC_URL` dynamically set from `FRONT_END_URL` env var
- `SECRET_KEY`, `CHATBOT_USER_ID_SECRET` -- secrets (empty in repo, set in local_settings)
- `SEFARIA_EXPORT_PATH` -- used by `export.py`
- `SEARCH_INDEX_ON_SAVE` -- controls whether text saves enqueue search indexing
- `USE_VARNISH`, `CELERY_ENABLED`, `MULTISERVER_ENABLED` -- feature flags consumed by `tracker.py`
- Bilingual i18n setup (`en`/`he`)
- Template context processors include `sefaria.system.context_processors.global_settings`

**`settings_utils.py`** -- Sentry initialization helper. Contains `init_sentry()` which configures the Sentry SDK with:
- A `before_send` filter that drops non-exception events, expected HTTP exceptions (404, PermissionDenied), and non-5xx status codes
- Sample rates pulled from a remote config cache (`remoteConfigCache`)
- Performance/profiling intentionally disabled

### Authentication and Forms

**`forms.py`** -- Django form overrides for user management:
- `SefariaLoginForm` -- email-based login (uses `emailusernames`)
- `SefariaNewUserForm` -- registration with email, name, password, reCAPTCHA, and optional educator flag. Supports "User Seeds" -- pre-created accounts that may already belong to a Group
- `SefariaDeleteUserForm`, `SefariaDeleteSheet` -- admin forms for deletion

**`decorators.py`** -- View decorators:
- `webhook_auth_or_staff_required` -- dual-mode auth that accepts either Django staff login or HTTP Basic Auth (for webhook integrations). Credentials checked against `settings.WEBHOOK_USERNAME`/`WEBHOOK_PASSWORD`.

### Export

**`export.py`** -- Functions for exporting the text library to files (JSON, plain text, CSV). Outputs to `SEFARIA_EXPORT_PATH`. Key functions:
- `make_path(doc, format)` -- generates filesystem paths organized by category/title/language
- `make_json(doc)`, `make_text(doc)` -- format documents for export
- Uses `sefaria.tracker.modify_bulk_text` for import operations as well

### Analytics and Ranking

**`recommendation_engine.py`** -- Content recommendation system. Core classes:
- `Recommendation` -- represents a recommended ref with a relevance score, novelty factor, and list of sources. Supports additive combination (`__add__`/`__iadd__`).
- `RecommendationSource` -- tracks why something was recommended (e.g., link, sheet co-occurrence)
- Scoring constants: `DIRECT_LINK_SCORE = 2.0`, `COMMENTARY_LINK_SCORE = 0.7`, `SHEET_REF_SCORE = 1.0`

**`pagesheetrank.py`** -- PageRank implementation for ranking texts by importance. Low-memory implementation based on link graph structure. Key pieces:
- `web` class -- sparse graph representation with in-links, out-link counts, and dangling page tracking
- `create_web(g)` -- converts a link graph into the `web` structure for PageRank computation
- Weighted edges based on link counts

**`stats.py`** -- Sheet analytics via the `SheetStats` class. Computes aggregate statistics across all source sheets:
- Ref frequency, category distribution, language breakdown
- Tag/topic analysis via `sheet_topics_counts`
- Untranslated text tracking
- Supports query filtering and sampling (`test` parameter for large datasets)

### Maintenance

**`clean.py`** -- Database cleanup utilities:
- `remove_refs_with_false()` -- removes links/history containing `False` as a ref
- `broken_links(tref, auto_links, manual_links, delete_links, check_text_exists)` -- detects and optionally deletes links with invalid or empty refs. Reports error type (bad ref vs. missing text) and link type (auto vs. manual).
- `remove_old_counts()` -- deletes count documents for texts that no longer exist

**`sitemap.py`** -- SEO sitemap generation via `SefariaSiteMapGenerator`:
- Generates sitemaps for both `sefaria.org` (English) and `sefaria.org.il` (Hebrew)
- Includes static URLs (explore, texts, donate, etc.) and dynamic text refs
- Segment-level sitemaps for Tanakh and Mishnah; section-level for everything else
- Outputs to `STATICFILES_DIRS[0]/sitemaps/`

### Media and Storage

**`image_generator.py`** -- Social media preview image generation:
- Generates branded images for Facebook and Twitter sharing
- Category-specific color palette (e.g., Talmud = gold, Tanakh = teal, Kabbalah = purple)
- Handles Hebrew text with BiDi algorithm and cantillation/vowel stripping
- Platform-specific dimensions (1200x630 for Facebook, 1200x600 for Twitter)
- Module-aware: Library and Voices modules each have distinct logo assets and fallback background
  colors. `normalize_social_image_module()` guards all entry points so an unknown module name
  always falls back to Library branding.
- `make_module_fallback_img_http_response()` -- centered white logo on the module's brand color,
  used for topic pages, sheet pages, and any path without a custom renderer.
- `make_static_img_http_response()` -- neutral Sefaria logo on the "Static" palette color, used
  for marketing pages (About, Jobs, etc.) shared across all modules.
- Hebrew RTL rendering: uses Raqm (via Pillow's `features.check("raqm")`) when available; falls
  back to `python-bidi`'s `get_display()`. Production (`build/base-web/Dockerfile`) does not
  install `libraqm`, so the fallback path runs in production.

**`google_storage_manager.py`** -- `GoogleStorageManager` class wrapping Google Cloud Storage:
- Named buckets for collections, profiles, UGC sheets, and topics (from `SITE_SETTINGS`)
- Methods: `upload_file`, `duplicate_file`, `delete_filename`, `file_exists`, `get_filename`
- Auth via service account JSON file (`GOOGLE_APPLICATION_CREDENTIALS_FILEPATH`)

## Non-Obvious Patterns

- **Settings layering**: `settings.py` defines defaults; `local_settings.py` (not in repo) overrides them. Many feature flags (`USE_VARNISH`, `CELERY_ENABLED`) default to values that `tracker.py` checks at import time.
- **User Seeds**: The forms system supports pre-created user accounts. If a user tries to register with an email that exists but belongs to the "User Seeds" group, registration proceeds (the seed account is adopted rather than rejected).
- **Sentry filtering is aggressive**: The `before_send` hook drops all non-exception events and all HTTP errors below 500. This means 400-level errors are intentionally invisible in Sentry.
- **Export is bidirectional**: Despite its name, `export.py` imports `modify_bulk_text` from tracker, suggesting it also handles import/ingestion workflows.
- **PageRank uses raw NumPy/MongoDB**: The ranking system operates outside of Django's ORM, working directly with MongoDB and numpy for performance.

## Relationships

- `settings.py` is consumed by nearly every module. `tracker.py` reads `USE_VARNISH`, `CELERY_ENABLED`, `SEARCH_INDEX_ON_SAVE`, `MULTISERVER_ENABLED`.
- `export.py` depends on `tracker.modify_bulk_text` for import operations and `settings.SEFARIA_EXPORT_PATH` for output.
- `google_storage_manager.py` depends on `sefaria.site.site_settings.SITE_SETTINGS` for bucket names and `settings.GOOGLE_APPLICATION_CREDENTIALS_FILEPATH` for auth.
- `image_generator.py` reads fonts from `static/fonts/`.
- `sitemap.py` uses `model.library.ref_list()` and writes to `STATICFILES_DIRS`.
- `recommendation_engine.py` uses `sefaria.client.wrapper.get_links` and `sefaria.model` for building the recommendation graph.
- `pagesheetrank.py` reads links from `sefaria.model` and `db` directly.

## Common Tasks

**Generate sitemaps:**
```python
from sefaria.sitemap import SefariaSiteMapGenerator
gen = SefariaSiteMapGenerator(hostSuffix='org')
gen.generate_texts_sitemaps()
```

**Run sheet statistics:**
```python
from sefaria.stats import SheetStats
stats = SheetStats()
stats.run()  # or stats.run(test=100) for sampling
```

**Find broken links:**
```python
from sefaria.clean import broken_links
broken = broken_links(auto_links=True, manual_links=True, check_text_exists=True)
```

**Upload a file to Google Cloud Storage:**
```python
from sefaria.google_storage_manager import GoogleStorageManager
url = GoogleStorageManager.upload_file("/path/to/file.jpg", "image.jpg", GoogleStorageManager.PROFILES_BUCKET)
```

**Generate a social sharing image:**
```python
from sefaria.image_generator import generate_image
img = generate_image(text="...", category="Talmud", ref_str="Berakhot 2a", lang="he", platform="twitter")
```
