# Helper Utilities
> Sources: `sefaria/helper/search.py`, `sefaria/helper/slack/send_message.py`, `sefaria/helper/texts/tasks.py`, `sefaria/helper/file.py`, `sefaria/helper/webpages.py`, `sefaria/helper/linker_index_converter.py`

Small, mostly independent utility modules that support search, text-save workflows, Slack notifications, image handling, webpage URL normalization, and the large Linker.v3 index migration toolkit.

## Purpose

Each module is self-contained and solves one concern:

- **`search.py`** — Build an `elasticsearch_dsl.Search` query object from Sefaria-flavored inputs (filters with slash-prefix semantics, score-mode sorting with `field_value_factor`, phrase matching with slop, highlighting).
- **`slack/send_message.py`** — Minimal wrapper that POSTs a formatted attachment payload to the Slack webhook at `settings.SLACK_URL`.
- **`texts/tasks.py`** — Celery fan-out for bulk text/link saves via a `chord` pattern; notifies `#engineering-signal` when the chord completes.
- **`file.py`** — Pillow-based image resizing/thumbnailing to an in-memory `BytesIO`, plus a naive HTTP scrape helper. (Note: lives at `sefaria/helper/file.py`, not `helper/file/file.py`.)
- **`webpages.py`** — URL normalization with per-domain rule overrides read from the `websites` Mongo collection. (Lives at `sefaria/helper/webpages.py`.)
- **`linker_index_converter.py`** — Migration toolkit that walks existing `Index` documents and attaches `match_templates`, alt-structures, and dibur-hamatchil metadata consumed by Linker.v3.

## Key Components

### `search.py`
- **`get_query_obj`** — main entry. Decorated with `@param_fixer`, which coerces `None` list/bool/Search params to sensible defaults *and silently drops unknown kwargs*.
- **`get_filter_obj` / `make_filter`** — filters for `type="text"` use a `Regexp` on `path` that matches the prefix or the prefix + `/` subtree; filters for `type="sheet"` use exact `Term`.
- **`get_elasticsearch_client`** — imports `Elasticsearch` lazily; used by scripts that need a raw client.

### `texts/tasks.py`
- **`save_changes(changes, func, method, task_title)`** — routes to Celery `chord` only if `CELERY_ENABLED and method == 'API'`; otherwise runs inline and returns a `jsonResponse`.
- **`save_change`** task — dispatches by function name string (`save_link` / `save_version`) from a local map.
- **`inform`** chord callback — aggregates results with `Counter` and posts to Slack.

### `linker_index_converter.py`
- **`ReusableTermManager`** — caches `NonUniqueTerm` creations by `(context, primary_title)` so shared terms (e.g. "Perek") aren't duplicated.
- **`LinkerIndexConverter`** — walks a single Index (main tree + alt-struct nodes), calling user-supplied `get_match_templates` / `get_other_fields` / `get_alt_structs` callbacks on each node. Commentary conversion is nested via `LinkerCommentaryConverter`.
- **`LinkerCategoryConverter`** / **`LinkerCommentaryConverter`** — fan-out wrappers for running the single-index converter across a category, corpus, or all commentaries on a base text.
- **`DiburHamatchilAdder`** — extracts DH strings from Hebrew versions using per-(commentary, base-text) regex tables and bulk-inserts into `db.dibur_hamatchils`.

## Non-Obvious Patterns

- **`param_fixer` silently strips unknown kwargs** (`search.py`, lines 30–32). A typo like `soruce_proj=True` will not raise — it just gets dropped.
- **Filter semantics flip by type** (`search.py`). Text filters combine with `should` (OR), sheet filters with `must` (AND). Documented inline but easy to miss.
- **Gershaim substitution.** `get_query_obj` rewrites internal `"` to `\u05f4` (Hebrew gershaim) so Hebrew quoted forms match indexed text.
- **Score-sort goes through a handwritten dict.** When `sort_method == "score"` and exactly one `sort_fields` entry is given, the query becomes a `function_score` with `field_value_factor`, assigned as a raw dict to `search_obj.query`. Multiple score fields are silently ignored.
- **`save_change` dispatches by function name string** — the Celery worker looks up the callable in a local dict. Adding a new savable change type requires editing both `save_changes` (callers) and the dict in `save_change`.
- **Sync fallback for `save_changes`** returns a different response shape (`jsonResponse` of `[{status|error}]`) than the Celery path (`celeryResponse(job_id, task_ids)`). Callers must handle both.
- **`webpages.normalize_url` rule-merging** keeps the `global_rules` order but appends per-domain rules only if `is_whitelisted`. Rule execution order is whatever Python iteration yields on the merged list — subtle, easy to re-break when adding rules.
- **`webpages` only consults custom rules for whitelisted sites.** Unknown domains get the global rules only.
- **`site_data_for_domain` matches by suffix** (`domain.endswith("." + site_domain)`) — subdomains inherit parent config.
- **`file.scrape_image` re-raises the same exception** it catches — the `try/except` is cosmetic; the call is equivalent to `Image.open(scrape_file(url))`.
- **`LinkerIndexConverter.fast_unsafe_saving=True` is the default.** It writes directly via `db.index.replace_one`, bypassing `Index.save()` and all its Python-side dependency checks. Great for speed, dangerous for correctness.
- **`get_match_templates` callback supports three return values:** a list of `MatchTemplate` (set it), `None` (delete the attribute), or the sentinel string `"NO-OP"` (leave it alone). Missing the sentinel and returning `None` by mistake will wipe existing templates.
- **`DiburHamatchilAdder.add_all_dibur_hamatchils`** *fully deletes* `db.dibur_hamatchils` before re-inserting — never run partially.
- **`LinkerCommentaryConverter` wraps the user's `get_match_templates`** with its own commentary-aware logic that uses `"NO-OP"` to defer to template-suffix defaults.
- **`slack.send_message`** is fire-and-forget: it does not check the response, so Slack failures are invisible.

## Relationships

- `texts/tasks.py` imports `sefaria.helper.slack.send_message.send_message` for chord completion notifications and uses `sefaria.celery_setup.app`/`CeleryQueue`.
- `search.py` consumers include the search views in `reader/views.py` and batch scripts.
- `webpages.py` backs the WebPage link collection pipeline in `sefaria/model/webpage.py` and the webpage scraping jobs.
- `file.py` is used by image upload handlers (sheet thumbnails, media) in `api/` and `sheets/` views.
- `linker_index_converter.py` is invoked from one-off migration scripts in `scripts/` that wire up per-category callbacks; it writes to the `index` and `dibur_hamatchils` Mongo collections and reads Version text for DH extraction.

## Common Tasks

- **Run a text search with filters:** call `get_query_obj(query, type="text", filters=[...], filter_fields=[...], aggs=[...])`, then `.execute()` on the returned `Search`.
- **Bulk save links via API:** call `save_changes(changes, save_link, method='API', task_title='...')`; the response is a `celeryResponse` the client can poll.
- **Notify engineering:** `send_message('#engineering-signal', 'bot-name', pretext, text)`.
- **Add a URL normalization rule for a domain:** add the rule name to the `websites` doc's `normalization_rules` and make sure `is_whitelisted=True`; register the rule implementation in `normalize_url.rewrite_rules`.
- **Migrate a category to Linker.v3:** instantiate `LinkerCategoryConverter(category_title, get_match_templates=..., get_other_fields=...)` and call `.convert()`.
- **Regenerate all dibur hamatchils:** build a `DiburHamatchilAdder`, `add_index()` each relevant Index, then `add_all_dibur_hamatchils()` — destructive.
