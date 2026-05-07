# API Endpoint Documentation Audit

A complete inventory of every Sefaria API endpoint and the decision on whether to publish it in [`docs/openAPI.json`](../openAPI.json) (which is what becomes the public reference at developers.sefaria.org via ReadMe).

**Last reviewed:** 2026-05-04
**Scope:** Every `api/` and `_api/` route declared in [`sefaria/urls_shared.py`](../../sefaria/urls_shared.py) and [`sefaria/urls_library.py`](../../sefaria/urls_library.py). (`urls_sheets.py` adds no API routes; it pulls in `shared_patterns`.)

## Summary

| Bucket | Count |
|---|---|
| Already documented in `openAPI.json` | 30 |
| Newly added in the 2026-05 documentation pass | 28 |
| Skipped — login-required (per-user data) | ~38 |
| Skipped — staff-only (admin / moderation) | ~22 |
| Skipped — internal infrastructure | ~8 |
| Skipped — auth flow (login / register / JWT) | 4 |
| Skipped — forms / telemetry / subscribe | 5 |
| Skipped — duplicates or version-status helpers | ~12 |
| Skipped — broken / unreliable | 3 |
| **Total** | **~152** |

(Counts use ~ because a few endpoints serve multiple regex patterns; the totals jiggle by 1–3 depending on how you count.)

## Skip rubric

An endpoint is skipped from public documentation if any of the following apply:

- **Auth-gated** — requires `@login_required` or `@staff_member_required`. We do not distribute API keys, so external developers cannot call these.
- **Internal-only shape** — built for our own services (Strapi cache, remote-config, async polling, opensearch suggestions, linker telemetry).
- **Auth flow** — `/api/login`, `/api/login/refresh`, `/api/register`, `/api/account/delete`. Worth documenting later as a dedicated authentication sub-project.
- **Form / telemetry** — newsletter subscribes, feedback submission, linker tracking.
- **Duplicate / legacy redirect** — alternate shapes of an already-documented endpoint, or legacy redirects to current versions.
- **Broken** — endpoint returns 504 / 5xx under normal load.

When a future engineer adds a new endpoint, the rubric above is the contract: if it fits a skip bucket, it stays out of `openAPI.json` unless we explicitly revisit.

## In scope — newly documented (29 endpoints)

All endpoints are served from `https://www.sefaria.org`. Sheets are *viewed* at `voices.sefaria.org`, but their API endpoints live at `www.sefaria.org` like everything else.

### Sheets (11)

| Endpoint | Description | Notes |
|---|---|---|
| `GET /api/sheets/{sheet_id}` | Fetch a single sheet by ID. | sheet_id lookup recipe |
| `GET /api/sheets/modified/{sheet_id}/{timestamp}` | Check whether a sheet has been modified since a timestamp. | sheet_id lookup recipe |
| `GET /api/sheets/user/{user_id}` | List a user's public sheets. | Split path; user_id recipe; public-only caveat |
| `GET /api/sheets/user/{user_id}/{sort_by}/{limiter}/{offset}` | Same, paginated and sorted. | Same as above |
| `GET /api/v2/sheets/bulk/{sheet_id_list}` | Fetch many sheets at once via piped ID list. | sheet_id recipe |
| `GET /api/sheets/trending-tags` | Currently trending sheet tags. | — |
| `GET /api/sheets/tag-list` | All sheet tags, sorted by count. | — |
| `GET /api/sheets/tag-list/{sort_by}` | All sheet tags with chosen sort order. | — |
| `GET /api/sheets/tag-list/user/{user_id}` | Tags used on a specific user's sheets. | user_id recipe |
| `GET /api/sheets/ref/{ref}` | Public sheets that cite a given ref. | — |
| `GET /api/sheets/all-sheets/{limiter}/{offset}` | Paginated list of all public sheets. | — |

### Collections (3)

| Endpoint | Description | Notes |
|---|---|---|
| `GET /api/collections` | List collections. | Unauthenticated shape; logged-in users see more |
| `GET /api/collections/{slug}` | Fetch a single collection. | Unauthenticated shape; logged-in users see more |
| `GET /api/collections/user-collections/{user_id}` | List a user's collections. | user_id recipe |

### Text (2)

| Endpoint | Description |
|---|---|
| `GET /api/bulktext/{refs}` | Text for many refs at once (pipe-delimited). |
| `GET /api/passages/{refs}` | Contiguous passages for refs. |

(`GET /api/texts/parashat_hashavua` was originally in scope but moved to "broken / unreliable" — see below — after consistent 504s during capture on 2026-05-05.)

### Index (7, including Authors fold-in)

| Endpoint | Description |
|---|---|
| `GET /api/index/titles` | All index titles. |
| `GET /api/index/{title}` | Index metadata. |
| `GET /api/v2/index/{title}` | v2 index metadata. |
| `GET /api/counts/{title}` | Word/segment counts for a title. |
| `GET /api/counts/links/{cat1}/{cat2}` | Link counts between two categories. |
| `GET /api/counts/words/{title}/{version}/{language}` | Word counts for a specific version. |
| `GET /api/authors/{author_slug}/indexes` | List of indexes by an author. (author_slug lookup recipe.) |

### Related (1)

| Endpoint | Description |
|---|---|
| `GET /api/link-summary/{ref}` | Summary of links by category. |

### Calendars (3)

| Endpoint | Description | Notes |
|---|---|---|
| `GET /api/calendars/topics/parasha` | Topic info for current parasha. | — |
| `GET /api/calendars/topics/holiday` | Topic info for current holiday. | Returns 404 when no holiday is active; example uses a fixed canonical holiday date |
| `GET /api/sheets/{parasha}/get_aliyot` | Aliyot ranges for a parasha. | Moved to Calendars tag (URL is under /api/sheets/ for historical reasons) |

### Misc (1, including Profile fold-in)

| Endpoint | Description |
|---|---|
| `GET /api/profile/{slug}` | Public profile by slug. |

## Already documented (30 endpoints)

These are present in `openAPI.json` as of 2026-05-04. No re-work in this pass; new entries will reuse their tags and component schemas where possible.

| Endpoint | Tag |
|---|---|
| `GET /api/v3/texts/{tref}` | Text |
| `GET /api/texts/{tref}` | Text |
| `GET /api/texts/versions/{index}` | Text |
| `GET /api/texts/translations` | Text |
| `GET /api/texts/translations/{lang}` | Text |
| `GET /api/texts/random` | Text |
| `GET /api/texts/random-by-topic` | Text |
| `GET /api/index` | Index |
| `GET /api/v2/raw/index/{index_title}` | Index |
| `GET /api/shape/{title}` | Index |
| `GET /api/links/{tref}` | Related |
| `GET /api/related/{tref}` | Related |
| `GET /api/related/{tref}/websites` | Related |
| `GET /api/manuscripts/{tref}` | Related |
| `GET /api/img-gen/{tref}` | Related |
| `GET /api/calendars` | Calendars |
| `GET /api/calendars/next-read/{parasha}` | Calendars |
| `GET /api/words/{word}` | Lexicon |
| `GET /api/words/completion/{word}/{lexicon}` | Lexicon |
| `GET /api/topics` | Topic |
| `GET /api/topics/{topic_slug}` | Topic |
| `GET /api/v2/topics/{topic_slug}` | Topic |
| `GET /api/topics-graph/{topic_slug}` | Topic |
| `GET /api/ref-topic-links/{tref}` | Topic |
| `GET /api/recommend/topics/{ref_list}` | Topic |
| `GET /api/terms/{name}` | Term |
| `GET /api/category/{category_path}` | Misc |
| `GET /api/name/{name}` | Misc |
| `POST /api/find-refs` | Misc |
| `POST /api/search-wrapper` | Misc |

## Out of scope — login required (per-user data)

Skipped because they require `@login_required` and we do not distribute API keys.

- `POST /api/sheets/`, `POST /api/sheets/{id}`, `POST /api/sheets/{id}/delete`, `POST /api/sheets/{id}/add`, `POST /api/sheets/{id}/add_ref`, `POST /api/sheets/{id}/copy_source`, `POST /api/sheets/{id}/topics`, `POST /api/sheets/{id}/like`, `POST /api/sheets/{id}/unlike`, `POST /api/sheets/{id}/export_to_drive`, `POST /api/sheets/create/{ref}`, `POST /api/sheets/upload-image`
- `GET/POST/DELETE /api/sheets/{id}.{node_id}` (also internal-shaped)
- `GET /api/sheets/{id}/visualize` (no auth, but tightly coupled to internal renderer)
- `POST /api/collections`, `POST/DELETE /api/collections/{slug}`, `POST /api/collections/upload`, `GET /api/collections/for-sheet/{id}`, `POST /api/collections/{slug}/set-role/{uid}/{role}`, `POST /api/collections/{slug}/invite/{uid_or_email}` (and uninvite), `POST /api/collections/{slug}/(add|remove)/{id}`, `POST /api/collections/{slug}/pin-sheet/{id}`
- `GET /api/profile` (own profile), `POST /api/profile/{slug}`, `GET /api/profile/user_history`, `POST /api/profile/sync`, `POST /api/profile/upload-photo`, `POST /api/profile/experiments/opt-in`
- `GET /api/notes/all`, `GET/POST/DELETE /api/notes/{id_or_ref}`
- `GET /api/notifications/`, `POST /api/notifications/read`
- `POST /api/(follow|unfollow)/{uid}`, `GET /api/(followers|followees)/{uid}`, `POST /api/(block|unblock)/{uid}`
- `GET /api/user_history/saved`
- `GET /api/user_stats/{uid}`, `GET /api/site_stats/`
- `GET /api/profile/{slug}/(followers|following)` (skipped this pass per product call; not auth-required)
- `DELETE /api/account/delete`

## Out of scope — staff only (admin / moderation)

Skipped because they require `@staff_member_required`.

- `POST /api/texts/modify-bulk/{title}`
- `POST/PATCH /api/versions/`
- `POST /api/topics/generate-prompts/{slug}`, `POST /api/topic/new`, `DELETE /api/topic/delete/{topic}`, `POST /api/topic/reorder`, `POST /api/source/reorder`
- `POST /api/sheets/next-untagged/`, `POST /api/sheets/next-uncategorized/`
- `GET/POST /api/locks/(set|release|check)/{tref}/{lang}/{version}`, `POST /api/locktext/{title}/{lang}/{version}`, `POST /api/version/flags/{title}/{lang}/{version}`, `POST /api/revert/{tref}/{lang}/{version}/{revision}`
- `POST /api/text-upload`
- `POST` mutations on `/api/index/{title}`, `/api/v2/index/{title}`, `/api/category/{path}`, `/api/tag-category/{path}`, `/api/terms/{name}`, `/api/topics/{topic}`, `/api/ref-topic-links/{tref}`, `/api/links/{ref}`

## Out of scope — internal infrastructure

Built for our own services, not external consumers.

- `GET /api/remote-config/`
- `GET /api/strapi/graphql-cache`, `POST /api/strapi/cache-invalidate`
- `GET /api/async/{task_id}` (only useful when paired with a task-creating endpoint, none of which are public)
- `GET /api/opensearch-suggestions/` (browser-integration, not API)
- `GET /api/dummy-search` (test scaffold)
- `GET /api/background-data` (client-bootstrap blob)
- `POST /api/linker-track` (telemetry)
- `GET /api/preview/{title}` (lightweight variant of `/api/texts/{tref}`)

## Out of scope — auth flow

Worth documenting later as a dedicated sub-project. Documenting these would unlock external use of the login-required endpoints above.

- `POST /api/login` (JWT obtain)
- `POST /api/login/refresh` (JWT refresh)
- `POST /api/register/`
- `DELETE /api/account/delete`

## Out of scope — forms / telemetry

CSRF-form-shaped endpoints, not API-shaped consumer endpoints.

- `POST /api/send_feedback`
- `POST /api/subscribe/{email}`, `POST /api/subscribe/{org}/{email}`
- `GET /api/newsletter_mailing_lists/`
- `POST /api/find-refs/report/`

## Removed after initial documentation

Endpoints that were documented then removed on review.

- `GET /api/sheets/{id}/likers` — removed 2026-05-07; not useful enough to external developers to warrant public documentation.

## Out of scope — duplicates or version-status helpers

Alternate shapes of already-documented endpoints, or admin-dashboard helpers.

- `POST /api/search-wrapper/es6`, `POST /api/search-wrapper/es8` (ES6/ES8 compat shapes — `/api/search-wrapper` is the documented one)
- `GET /api/texts/{tref}/{lang}/{version}` (legacy redirect to v3)
- `GET /api/texts/version-status/`, `GET /api/texts/version-status/tree/{lang}` (admin-dashboard helpers)
- `GET /api/topics/pools/{pool_name}`, `GET /api/topics/trending/`, `GET /_api/topics/featured-topic/` (skipped this pass per product call)
- `GET /api/links/bare/{book}/{cat}` (currently non-functional per product)
- `GET /api/tag-category/{path}` (overlaps with topics)
- `GET /api/search-path-filter/{book_title}` (search-internal helper)
- `GET /api/regexs/{titles}`, `GET /api/linker-data/{titles}` (linker; skipped this pass)
- `GET /api/websites/{domain}`, `GET /api/portals/{slug}` (skipped this pass)
- `GET /api/history/{tref}`, `GET /api/history/{tref}/{lang}/{version}` (skipped this pass)
- `GET /api/updates/{gid}`, `GET /api/guides/{guide_key}`, `GET /api/stats/library-stats`, `GET /api/stats/core-link-stats` (skipped this pass)

## Out of scope — broken / unreliable

Returned 504 Gateway Timeout under normal load when verified live. Should be reviewed by engineering.

- `GET /api/sheets/tag/{tag}` (verified 2026-05-04)
- `GET /api/v2/sheets/tag/{tag}` (verified 2026-05-04)
- `GET /api/texts/parashat_hashavua` (verified 2026-05-05; multiple retries with 60s and 120s timeouts all returned 504)

## ReadMe folder structure

Endpoints group into the following sidebar folders (= OpenAPI `tags`):

| Tag | Endpoint count | Net change |
|---|---|---|
| Text | 9 | +2 |
| Index | 10 | +7 (incl. Authors fold-in) |
| Related | 5 | +1 |
| Calendars | 5 | +3 (incl. Aliyot fold-in) |
| Lexicon | 3 | unchanged |
| Topic | 5 | unchanged |
| Term | 1 | unchanged |
| Sheets *(new)* | 11 | +11 |
| Collections *(new)* | 3 | +3 |
| Misc | 7 | +1 (Profile fold-in) |
