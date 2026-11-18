# C1: names, paths and settings

Contract C1 of the developer portal (PLAN.md §2.1, §4.3). It changes only through the Integrator, who announces each change in every affected inbox. The settings are also machine-readable in [`settings.json`](settings.json).

## Fixed names

| Name                        | Value                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Django app                  | `devportal`, label `devportal`, config `devportal.apps.DevportalConfig`                                                                                             |
| Module constant             | `DEVELOPERS_MODULE = "developers"` in `sefaria/constants/model.py`                                                                                                  |
| Developers host URLconf     | `sefaria/urls_developers.py` (includes `devportal.urls`, `app_name = "devportal"`)                                                                                  |
| Settings prefix             | `DEVPORTAL_`                                                                                                                                                        |
| Internal endpoint prefix    | `/_portal/` (never `/api/`; see C9)                                                                                                                                 |
| CSS class prefix            | `dp-` (the sanitizer keeps only `class` values with this prefix; see C10)                                                                                           |
| Frontend package            | `devportal-ui/` (Vite + React 19 + TypeScript)                                                                                                                      |
| Build output                | `static/bundles/devportal/`, served as same-origin `/static/bundles/devportal/…`                                                                                    |
| Vite manifest               | `static/bundles/devportal/.vite/manifest.json`                                                                                                                      |
| Prerendered files           | `devportal-ui/dist/prerender/` with `manifest.json` (header per tab, one file per operationId)                                                                      |
| Template tags               | `{% load devportal_assets %}`: `{% devportal_entry %}`, `{% devportal_prerendered kind key %}`                                                                      |
| Page data island            | `<script type="application/json" id="dp-data">` (written with `json_script`)                                                                                        |
| React root                  | `#dp-root` (mounted with `createRoot`, not `hydrateRoot`)                                                                                                           |
| Recent requests storage key | `localStorage["dp:recent-requests:v1"]`, at most 50 entries                                                                                                         |
| Agent working directory     | `.devportal-run/` (git-ignored; inboxes in `.devportal-run/inbox/`)                                                                                                 |
| Standalone settings         | `devportal.dev.settings_standalone`, URLconf `devportal.dev.urls_standalone`                                                                                        |
| Middleware                  | `devportal.middleware.DevportalMiddleware`, after `LanguageSettingsMiddleware`                                                                                      |
| Editor permission wrapper   | `devportal.security.permissions.staff_api`                                                                                                                          |
| Management commands         | `devportal_import`, `devportal_fetch_source`, `devportal_mirror_images`, `devportal_rebuild`, `devportal_sync_spec`, `devportal_check_links`, `devportal_purge_e2e` |
| Golden regeneration         | `python -m devportal.contracts.regenerate`                                                                                                                          |
| Celery task module          | `devportal/tasks.py` (`"devportal"` added to `autodiscover_tasks`)                                                                                                  |

## Layout

```
devportal/                         Django app (Python). Label "devportal"
  apps.py  urls.py  middleware.py  tasks.py
  admin/                           One module per area: homepage.py feedback.py pages.py routing.py
  models/                          pages.py feedback.py homepage.py media.py routing.py state.py audit.py
  views/                           pages.py reference.py machine.py api.py editor_api.py gallery.py htmlblock.py errors.py
  markdown/                        Pure Python. Parser, components, renderer, sanitizer, TOC, links, plain text
  spec/                            Pure Python. OpenAPI loader, operation index, per-path slice, overlay merge
  mcp/                             Self-contained MCP server: server.py tools.py execute.py ratelimit.py README.md
  services/                        nav.py publish.py search_index.py llms.py md_export.py images.py seed.py editor.py
  security/                        csp.py headers.py permissions.py
  adapters/                        storage.py tasks.py (the only places that import sefaria.* lazily)
  templatetags/devportal_assets.py Reads the Vite manifest
  templates/devportal/             base.html, sidebar.html, page_*.html, home.html, gallery_*.html, 404.html, htmlblock_frame.html
  management/commands/             devportal_* commands (above)
  migration_source/                Vendored snapshot of Sefaria/developer-docs plus SOURCE.json, live/, link_fixes.yaml
  contracts/                       C1-C10 (see README.md), JSON Schemas and the fixture corpus shared with devportal-ui
  dev/                             settings_standalone.py, urls_standalone.py, README.md
  tests/                           *_test.py, plus tests/pure/ for tests that need no Django
devportal-ui/                      Vite + React 19 + TypeScript package with its own package.json and lockfile
  src/app/ src/shell/ src/reference/ src/docs/ src/search/ src/home/ src/discord/ src/analytics/ src/gallery/ src/editor/
  src/styles/                      tokens.css, readme-tokens.css, article.css
  src/contracts/                   TypeScript types mirroring devportal/contracts
  scripts/                         prerender.ts, build-spec.ts, roundtrip-corpus.ts
  public/                          Brand SVGs, favicons, fonts
sefaria/urls_developers.py         URLconf of the developers host
e2e-tests/developers/              Functional Playwright suites
e2e-tests/developers-visual/       Visual-parity suite
e2e-tests/mobile web/developers/   Mobile suites
e2e-tests/pages/developers/        Page objects
e2e-tests/feature-specs/steps/developers/   Step definitions (never the .feature files)
docs/agent_docs/apps/devportal.md  Agent documentation for the app
```

## Import rules (PLAN.md §2.3.1)

- `devportal` imports Django, its own code, `sefaria.constants.model` and `powered_by.models`. Every other `sefaria.*` import happens inside a function in `devportal/adapters/`. `devportal/tests/isolation_test.py` enforces this.
- `devportal/markdown/`, `devportal/spec/` and the core of `devportal/mcp/` import no Django.
- Portal templates render without `request` (`render_to_string(template, context)`), so no Sefaria context processor runs.

## Settings

Defaults are set in `sefaria/settings.py` before the local-settings import; deployments override them in local settings (the Helm chart passes the ones marked "Helm").

| Setting                         | Default                     | Helm | Meaning                                                                                                                    |
| ------------------------------- | --------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| `DEVPORTAL_API_ORIGIN`          | `"https://www.sefaria.org"` | no   | The API origin for Try It and code samples, the CSP `connect-src` entry, and the only host `execute-request` accepts       |
| `DEVPORTAL_GA4`                 | `{}`                        | yes  | GA4 ids by section (`default`, `gallery`); empty loads no analytics                                                        |
| `DEVPORTAL_DEMO_API_KEY`        | `""`                        | yes  | Public demo key; empty means no key anywhere, as live                                                                      |
| `DEVPORTAL_MEDIA_BUCKET`        | `""`                        | yes  | GCS bucket for uploads; empty means `SITE_SETTINGS["TOPICS_BUCKET"]`                                                       |
| `DEVPORTAL_ALLOW_INDEXING`      | `False`                     | yes  | `robots.txt` allows crawling only when true (inverse of `nginx.disableScraping`)                                           |
| `DEVPORTAL_ALLOW_README_IMAGES` | `True`                      | no   | Adds `https://files.readme.io` to `img-src` until images are mirrored; must be false at cutover                            |
| `DEVPORTAL_AUTO_SEED`           | `True`                      | yes  | `post_migrate` seeds content when the snapshot or spec hash changed; false under pytest; false in production after cutover |
| `DEVPORTAL_CUTOVER_DONE`        | `False`                     | yes  | Switches the main site's `poweredByURL` to `<developersURL>/powered-by`                                                    |
| `DEVPORTAL_VITE_DEV_SERVER`     | `""`                        | no   | Local only: load the Vite dev client from this origin                                                                      |

Standalone-only knobs (`devportal/dev/settings_standalone.py`): `DEVPORTAL_STANDALONE_POWERED_BY_FIXTURE` (the file behind `/api/powered-by`), and the environment variables `DEVPORTAL_SQLITE_PATH`, `DEVPORTAL_DEBUG`, `DEVPORTAL_AUTO_SEED`, `DEVPORTAL_VITE_DEV_SERVER`.
