# Search Improvements Architecture

This project implements improvements to Sefaria search.
1. **Frontend** - A tabbed view of search results, sorted by type (sources, topics, books, authors).
2. **Data and Backend** - Extending elastic search to not only search text, but also entities. This involves reindexing Elastic Search as well as new endpoints for entity search. Additional metadata enrichment to improve search results may also be included. 

This document covers the design, open decisions, known gaps, and tech debt to address before production.

History:
- Originally, this project was scoped to Frontend only. 
- Upon presenting a POC for frontend improvements, jarring data issues became more clear - and became part of the scope of this work. 
- The backend work focuses on leveraging Elastic Search to index books and topics, and working with our existing metadata to return more relevant search results. 

## Design

Two query paths run in parallel on every search:

```
                       User query
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
      Source Search                   Entity Search
      Sefaria.search()           /api/entity-search?q=…&type=…
            │                               │
      ┌─────┴──────┐        ┌───────────────┼───────────────┐
      ▼            ▼        ▼               ▼                ▼
  Dicta API   ES text    type=topic     type=author      type=book
  (Tanakh,    index      ES topic       ES topic         ES book
   fuzzy)     (other)    index          index            index
            │                               │
            ▼                               ▼
       Sources tab             Topics / Authors / Books tabs
```

1. **Source search** — `Sefaria.search` function, uses our elastic search endpoint for texts aside from Tanakh. For Tanakh, it uses the Dicta search for fuzzy matching.
2. **Entity search** — A new endpoint using Elastic Search, `/api/entity-search?q=<query>&type=<topic|author|book>`, is fired once per tab. This endpoint queries the dedicated `topic` and `book` Elasticsearch indices built for the POC; see [Backend Architecture](#backend-architecture) below.
* Note - this API was called search-poc in the POC. It will be renamed for clarity to `entity-search`. 

> **Note on history.** The POC originally fed the entity tabs from the autocomplete **Name API** (`/api/name/<query>?limit=50`), reusing the dropdown's existing result handling - this was not the right decision, since while the Name API excels at returning results sorted by type, **it is not searching!** The Name API is _**autocompleting**_, which is an entirely different functionality. (Additionally, the Name API `ref` type conflated books and section-level refs)



## Backend Architecture

The `/api/entity-search` endpoint is backed by two new Elasticsearch indices — `topic` and `book` — added alongside the existing `text` and `sheet` indices. This section covers what those indices contain, how they're built, and how the query path uses them.

### The two indices

**`topic` index — topics and authors**

One document per Topic. Authors are not a separate index — `AuthorTopic` is a subtype of `Topic`, so authors live in the `topic` index and are distinguished by a `subtype` field (`"topic"` or `"author"`).

| Field | Type | Analyzer | Notes |
|---|---|---|---|
| `slug` | `keyword` | — | Stable identifier; used as document ID (idempotent reindex) |
| `subtype` | `keyword` | — | `"topic"` or `"author"` |
| `title_en` | `text` + `keyword` | `stemmed_english` | Primary match; `keyword` sub-field for exact-match and sort |
| `title_he` | `text` + `keyword` | plain `text` | Primary match; `keyword` sub-field for exact-match and sort |
| `titleVariants` | `text` | `stemmed_english` | Alternate titles — the main recall driver |
| `description_en` | `text` | `stemmed_english` | Full-text match |
| `description_he` | `text` | plain `text` | Full-text match |
| `numSources` | `integer` | — | Popularity signal for `function_score` ranking |
| `era` | `keyword` | — | Author-only: historical period |
| `birthYear` | `integer` | — | Author-only: for display and filtering |
| `deathYear` | `integer` | — | Author-only: for display and filtering |
| `authored_slugs` | `keyword` | — | Author-only: slugs of books this author wrote |

Author-only fields (`era`, `birthYear`, `deathYear`, `authored_slugs`) are sparse on topic documents. Document id = topic `slug`, so reindexing is idempotent.

**`book` index — Index (book) records**

One document per Index record.

| Field | Type | Analyzer | Notes |
|---|---|---|---|
| `title_en` | `text` + `keyword` | `stemmed_english` | Primary match & sort |
| `title_he` | `text` + `keyword` | plain `text` | Primary match & sort |
| `titleVariants` | `text` | `stemmed_english` | Alternate titles; recall |
| `categories` | `keyword` | — | Category path components; filterable |
| `path` | `keyword` | — | `"Category/Subcategory/Title"` — mirrors text index shape |
| `description_en` | `text` | `stemmed_english` | Full-text match |
| `description_he` | `text` | plain `text` | Full-text match |
| `compDate` | `integer` | — | Composition date (collapsed from Mongo list to single sortable int) |
| `era` | `keyword` | — | Historical period label |
| `authors` | `keyword` | — | Author slugs for facet/filter |
| `author_names` | `text` | `stemmed_english` | Denormalized author display names (EN + HE + variants); enables author-name queries to match books |
| `order` | `keyword` | — | Display sort order |

Two structural choices:

- **`path` mirrors the text index** — the same `"Category/Subcategory/Title"` shape, so existing category-path filter logic can be reused without a new scheme.
- **`author_names` is denormalized** — `authors` stores slugs; `author_names` additionally stores the author's display titles (EN + HE, including variants), copied at index time. This lets a query for "Rambam" or "Maimonides" match his works even when his name isn't in the title (e.g. "Mishneh Torah, Blessings").

### Mappings and text analysis

- **Title and description fields** use a `stemmed_english` analyzer so queries match on stems; Hebrew fields are plain `text`.
- **Title fields also expose a `keyword` sub-field** for exact-match and sort use cases.
- **Identifiers and facets are `keyword`**: `slug`, `subtype`, `categories`, `path`, `authors`, `era`, `order`.
- **Numeric fields** (`numSources`, `birthYear`, `deathYear`, `compDate`) are integers, usable for ranking and range logic.

The analyzers (`stemmed_english`, `exact_english`) are the same family already defined for the `text` index.

### Indexing pipeline

The pipeline plugs into the existing reindex infrastructure rather than building a parallel one.

**Document builders** are pure functions that turn a model object into an ES document dict:
- *Topic builder*: reads titles, variants, descriptions, and `numSources`; sets `subtype`; adds author-only fields for `AuthorTopic`. Returns `None` for topics missing a slug and title in at least one language (many are Hebrew-only).
- *Book builder*: reads titles, variants, categories, descriptions, `compDate`, era, and authors; computes `path`; resolves each author slug to display names for `author_names`. Author-name resolution is cached (one author appears on many books). `compDate` is stored in Mongo as a list; the builder collapses it to a single sortable integer.

**Bulk indexers** — `index_topics` iterates all topics via `TopicSet`; `index_books` iterates all Index records. Each calls its builder, writes under the document's natural id, and collects skipped slugs/titles into a summary report rather than aborting.


Index names are configured via `SEARCH_INDEX_NAME_TOPIC` and `SEARCH_INDEX_NAME_BOOK` (defaulting to `topic` and `book`), parallel to `SEARCH_INDEX_NAME_TEXT` / `_SHEET`.

### Query path

The endpoint accepts a query string and a `type` of `topic`, `author`, or `book`. Hits return self-contained documents (titles, descriptions, `numSources`).

#### Elastic Search Scoring Mechanisms
Each query combines three scoring mechanisms, applied over English and Hebrew fields with titles weighted highest, then title variants, then descriptions:

- **Exact-word match (`best_fields`, ×2 boost)** — the primary scorer. Searches for the query as complete words and ranks documents by how well they match. Gets a 2× boost so a full-word hit always outranks a partial one.
- **Prefix match (`phrase_prefix`, titles only)** — handles mid-typing. Elasticsearch treats each word as an indivisible token, so "Mos" doesn't match "Moses" in an exact search — it's not a recognized token. `phrase_prefix` solves this by treating the last word in the query as a prefix, so "Mos" matches "Moses", "Moshe", etc. Applied to title fields only (not descriptions) to avoid noise.
- **Popularity boost (`function_score` on `numSources`)** — without this, "Mos" prefix-matches Moses, Mosquitoes, and Moser with nearly identical text scores. `numSources` breaks the tie using source count: Moses has 7,074 references, Mosquitoes has 3. The score is log-scaled so the multiplier stays reasonable (≈8.9× vs ≈1.4×), and is applied as a multiplier — not an additive offset — so it consistently separates results regardless of their base text score.

**Routing:** `topic` and `author` queries both search the `topic` index, filtered by `subtype`. Book queries additionally boost `author_names` so a search for "Rambam" surfaces his works even when his name isn't in the book title.

#### Product-configurable ranking (RemoteConfig)

A natural extension is to lift the ranking weights out of code and into a RemoteConfig JSON entry, so the product team can tune result ordering without a code change or reindex. The per-field **match boosts** map onto this cleanly: the weights in the `multi_match` field list — e.g. `["title_en^3", "title_he^3", "titleVariants^2", "description_en", "author_names^2"]` — are already a `{field: weight}` dictionary. The `^3` on `title_en` means a query word found in the title counts three times as much as the same word found in a description, so a search for "Rashi" ranks *Rashi on Genesis* (title match) above a book that merely mentions Rashi in its description. Exposing that dictionary as config lets product retune it live.

The catch is that **not every ranking factor reduces to a single per-field weight.** The inputs fall into a few kinds, only one of which fits the flat model:

- **Match boosts — configurable.** Weights on the searchable text fields (`title_en`, `titleVariants`, `description_en`, `author_names`, …). One weight per field, safe for product to edit directly.
- **Document signals — need more structure.** Numeric properties that should lift a document *regardless of the query* — e.g. ranking authors with more `numSources` above those with fewer, or a future per-book page rank to float more-studied books to the top. These feed a `function_score`, not the field list, and a bare weight is not enough: the raw values live on very different scales (`numSources` spans 0–7,000+), so each needs a scaling modifier (e.g. log) and missing-value handling, not just a multiplier.
- **Categorical preferences — don't fit at all.** Wanting certain categories to outrank others (e.g. surfacing Halakhah above a niche category) is a weight per *value*, not per *field* — a different shape again (`{category: weight}`), wired as filtered boost clauses.

In short, the match-boost weights are a clean, low-risk knob to hand to product via RemoteConfig, but signal- and category-based factors require purpose-built structure in the query builder and can't be collapsed into the same flat field→weight map. A RemoteConfig schema for this should therefore separate these concerns (e.g. a `match_boosts` map distinct from `signal_boosts`) rather than expose one undifferentiated dictionary — and should validate keys against the real index fields, since a typo'd field name would silently boost nothing.

#### Author-aware book results

When the query resolves to an author, the endpoint returns that author's works aggregated by category rather than a flat list. The dozens of Mishneh Torah volumes, for example, collapse into a single "Mishneh Torah" entry. This reuses existing function Sefaria has for author topic pages - `AuthorTopic` author-works aggregation. Category aggregations sort to the top; individual books below. When the query does not resolve to an author, the endpoint falls back to a flat full-text search over the `book` index.

> **Note:** It is possible to trigger the author-works view whenever an author's name appeared anywhere in matched text — including book descriptions. This can cause queries like "Genesis" to return all of Rashi's books because his name appeared in a description. To fix this, ensure that the aggregated-works view now only activates when the query directly matches an author entity in the `topic` index.

To support useful labels in the aggregated view, the author-works aggregation was extended to report, per entry, whether it is a category aggregation and a localized category label. 

### Sample request / response

**Author search**

```
GET /api/entity-search?q=Rambam&type=author
```

```json
{
  "hits": [
    {
      "slug": "maimonides",
      "subtype": "author",
      "title_en": "Maimonides",
      "title_he": "רמב\"ם",
      "titleVariants": ["Rambam", "Moses Maimonides", "Moses ben Maimon"],
      "description_en": "Rabbi Moshe ben Maimon (1138–1204), prolific halakhic authority and philosopher.",
      "numSources": 7074,
      "era": "RI",
      "birthYear": 1138,
      "deathYear": 1204
    }
  ],
  "total": 1
}
```

**Book search** (author resolved — returns category-aggregated works)

```
GET /api/entity-search?q=Rambam&type=book
```

```json
{
  "hits": [
    {
      "title_en": "Mishneh Torah",
      "title_he": "משנה תורה",
      "isCategory": true,
      "categoryLabel_en": "Mishneh Torah",
      "categories": ["Halakhah", "Mishneh Torah"],
      "path": "Halakhah/Mishneh Torah",
      "description_en": "Maimonides' comprehensive code of Jewish law, organized by topic.",
      "authors": ["maimonides"],
      "author_names": ["Maimonides", "Rambam", "Moses ben Maimon"],
      "compDate": 1180,
      "era": "RI"
    },
    {
      "title_en": "Mishneh Torah, Laws of Prayer",
      "title_he": "משנה תורה, הלכות תפילה",
      "isCategory": false,
      "categories": ["Halakhah", "Mishneh Torah"],
      "path": "Halakhah/Mishneh Torah/Laws of Prayer",
      "authors": ["maimonides"],
      "author_names": ["Maimonides", "Rambam"],
      "compDate": 1180,
      "era": "RI"
    }
  ],
  "total": 42
}
```

## Elastic Search Indexing Operations

### Scheduled reindex

The scheduled cron job rebuilds the `topic` and `book` indices on the same schedule as `text`/`sheet`. Each index is rebuilt using a blue-green strategy: a fresh index is built in the background under a temporary name, and only swapped in as the live index once it's complete. This means search stays available on the old data during the rebuild, with zero downtime. A failure rebuilding one index type is recorded but does not block the other from completing.

We need sample scripts to minimally populate a dev environment, as well as a script for a **full reindex** which runs the reindex for `topic` and/or `book` on demand.

### Local development setup

Running any indexing script from a fresh local checkout crashes with `ImportError: cannot import name 'SEARCH_INDEX_NAME_TOPIC' from sefaria.settings` unless those constants exist in `sefaria/local_settings.py`. The production `settings.py` defines them; the local dev override does not by default. Add to `local_settings.py` to unblock local indexing:

```python
SEARCH_INDEX_NAME_TOPIC = 'topic'
SEARCH_INDEX_NAME_BOOK = 'book'
```

## Showing Result Counts While Results Load

Product wants each tab's result count to appear before that tab's results finish rendering. With the tabbed design this is **four counts** (Sources, Topics, Books, Authors), and they do *not* share a cost profile — the work depends entirely on the index behind the tab.

**The entity tabs (Topics / Books / Authors) need no optimization.** The `topic` and `book` indices hold thousands of docs (not the millions in `text`), the entity query has **no facet aggregations**, and the response **already returns `total`** for free. Read the count straight off the entity response.

**Only the Sources tab is expensive enough to optimize.** A count is cheap for Elasticsearch to compute — it skips the three things that dominate the *source* search's full response: **aggregations** (facets visit *every* matching doc and build `size: 10000` bucket tables — ~half the latency), **top-N fetch** (scoring + reading/serializing `_source` for the page of hits), and **highlighting** (re-analyzing each returned doc to build snippets). A bench against a 200k-doc local index put a count-only query ~90%+ faster than the full request.

**Approach — fire a separate, parallel count-only query** (`size: 0`, no `aggs`/`highlight`/`_source`) alongside the main search and paint the count the moment it returns.
- *Count appears earliest* — gated only by the network round-trip, not by aggs/fetch/highlight.
- *Smallest blast radius* — the existing search path is untouched; you add a lightweight call rather than refactoring the query builder.
- *Isolates exact-count cost* — `track_total_hits: true` (for exact counts above the 10k default cap) rides on the cheap query, not the main results query.
- *Cost to accept:* it re-runs the query-match scan (≈2× that portion of cluster work per search), and the frontend coordinates two responses — including the Sefaria + Dicta total merge on the Sources tab ([`search.js` total merge](../../static/js/sefaria/search.js)).

This same `size: 0` count query also resolves the open **"eager vs. lazy entity search"** question (see [Open Questions](#open-questions)): to show count badges on all four tabs up front, fire cheap count-only queries per type eagerly to populate the badges, then fetch full per-tab results lazily on tab switch — strictly lighter than firing all full queries in parallel.

**Two count-semantics wrinkles to decide:**
- *Author-works collapsing.* Book/Author results collapse many works into category entries (the sample shows `"total": 42` with far fewer displayed rows). A count-only query returns the **raw** match total, which won't equal the collapsed row count — product must pick which number the badge shows.
- *Sources is a two-source sum.* The Sources count merges Sefaria + Dicta totals client-side, so even a count-only Sources query needs both halves before showing a number.

## Limitations


### Backend Limitations

- **No on-save freshness.** When a text is saved in Sefaria, a hook automatically updates its Elasticsearch entry right away. The `topic` and `book` indices don't have this — they only get updated when the cron job runs its full rebuild. So edits to a topic or book won't appear in search results until the next scheduled rebuild.
- **Relevance is unproven at scale.** Field boosting is a reasonable first cut; default ranking and cross-language behavior still need tuning against real queries.
- **Denormalization staleness.** `author_names` on book docs and `authored_slugs` on author docs are snapshots taken at index time; an author rename requires reindexing affected books to stay consistent.
- **Numeric token false positives.** Queries containing numbers (e.g., "Genesis 1:1") match books with "1" in the title or `titleVariants` — "I Kings", "Vol. I", numbered tractates, etc. — producing noisy results. Needs a fix before production (e.g., exclude purely-numeric tokens from `titleVariants` matching, or treat numeric-heavy queries as ref queries rather than book searches).
- **Cauldron test environment.** Getting Elasticsearch and the reindex cron job working correctly in our cauldron test environment carries non-trivial setup complexity. This needs to be budgeted as part of the production path — it is not automatic from the existing cron wiring.
- **Prefix Matching** - To match strings like `Mo` to `Moses`, we use a strategy that treats ending word fragments as search prefixes. It should be noted that this approach comes with query cost and the main Elastic Search query performance risk to validate at scale.

### Frontend Limitations (and tech debt)

- **`TabView`** - The existing `TabView` component is usable but clunky — tab switching UX is rough in practice. This is worth a refactor, either as part of this project or alongside it.
- **Filterable list** -  The filterable list component could also use a cleanup pass.
- **Search results "page" component** - The existing search results page (`SearchPage` or equivalent) is a large shared component — it also powers Voices and comes with its own filter infrastructure. The POC works around this rather than integrating with it.
  - Production integration requires:
    - Assessing how to extend or override the component's behavior for this feature.
    - Ensuring changes don't introduce regressions in the Voices flow.
    - Deciding whether to modify the shared component or extract a lighter-weight version.
  - This is a significant body of work to scope before committing to an approach.
- **Language Filtering** - A language-family filter has been added to the source search tab, letting users restrict displayed hits by language. It is important to use  **`languageFamilyName` vs `lang` to avoid issues with legacy lumping French, German, and Portuguese into the English bucket based on ltr/rtl languages.

### Open Questions

- **Empty results** — what should each tab show when there are no matches? Fall through to another tab? Show a zero-state message?
- **Categorical collapsing** — should similar topic clusters be collapsed?
- **Language filtering** — a language-family filter has been added to source search results (see [Language Filtering](#language-filtering) in Frontend Tech Debt). This needs further tweaking from a UX perspective.
- **Topic descriptions** — how much do we display? When is the text included in a search or not included?
- **Ref queries ("Genesis 1:1")** — it's unclear whether a ref-shaped query should trigger a search or directly load that ref in the reader. Needs a product decision before building: these are fundamentally different UX flows.
- **Hebrew text analysis** — entity search uses a built-in `stemmed_english` analyzer for English fields and plain `text` for Hebrew. Hebrew morphology is complex (prefixes, root-based stems) and plain tokenization may hurt recall for Hebrew queries. Worth considering a dedicated Hebrew analyzer, though this may be out of scope for the initial MVP.
- **Topic results with no sources** — topics with zero associated sources should probably not appear in results (a topic with no sources is not useful to a user). The `numSources` field is already indexed; the question is where to apply the filter — as a hard `must` filter in the query, a minimum `numSources` threshold, or at render time.
- **When to Call the Entity Search** - either on every search (what was implemented on the POC) or only on tab switch. POC queries all three in parallel so results are ready before the user switches tabs. 

## Localization (Weblate)

Separate from search, we want to bring `Sefaria-Project` onto the same translation workflow we already run for the `ai-chatbot` repo: a self-hosted [Weblate](https://weblate.sefaria.org) instance where translators edit strings in a web UI and Weblate opens PRs back to the repo. This section captures what that setup looks like for `Sefaria-Project` and how it differs from the existing `ai-chatbot` deployment.

### Why this is now possible

Weblate translates **translation files**, not source code — it cannot parse `.js`. Historically Sefaria's interface strings lived inline in `static/js/sefaria/strings.js`, which put them out of Weblate's reach. Commit [`314e55b7cf`](https://github.com/Sefaria/Sefaria-Project/commit/314e55b7cf) ("chore: split up into json files") extracts them into JSON, which is what makes a Weblate hookup possible. After that commit:

- `static/js/sefaria/i18n/interface/*.json` — a **flat** map (English key → value).
- `static/js/sefaria/i18n/interface-context/*.json` — a **nested** map, one namespace per component (context-scoped strings).
- In each directory, `en.json` is the **Weblate source template** (the source of truth for keys; not imported at runtime), and `he.json` holds the Hebrew translations consumed at runtime. `strings.js` now just imports the two `he.json` files.

### How ai-chatbot does it (the model to copy)

The `ai-chatbot` deployment is the reference implementation; the full runbook lives in the infrastructure repo at `docs/weblate.md`. In brief:

- Self-hosted Weblate on Coolify at `weblate.sefaria.org`, Google SSO restricted to `@sefaria.org`.
- A GitHub machine user (`sefaria-weblate`) with a fine-grained PAT opens PRs — **Weblate never pushes directly to `main`**; engineers review and merge translation PRs.
- One Weblate component pointed at a **monolingual** JSON file mask (`src/i18n/locales/*.json`) with `en.json` as the monolingual base file, file format `JSON file`, `Edit base file: No`.
- A GitHub webhook (`/hooks/github/`) syncs the component when the repo changes.
- Add-ons: cleanup translation files, squash git commits, JSON indent `2`, key sorting disabled (so translation-PR diffs stay minimal and don't reorder keys).

### What's different for Sefaria-Project

The infrastructure (Coolify instance, Google SSO, machine user) is **already stood up** for `ai-chatbot`, so onboarding this repo is mostly adding a new project/components rather than deploying Weblate again. The differences to account for:

- **Two file sets, so two components (not one).** `ai-chatbot` has a single `locales/*.json` mask. `Sefaria-Project` has two shapes that need distinct Weblate components:
  - `interface/` → file mask `static/js/sefaria/i18n/interface/*.json`, base `interface/en.json`, file format **`JSON file`** (flat).
  - `interface-context/` → file mask `static/js/sefaria/i18n/interface-context/*.json`, base `interface-context/en.json`, file format **`JSON nested structure file`** (nested).
- **`en.json` is a template, `he.json` is runtime.** Same monolingual pattern as `ai-chatbot` (`Edit base file: No`), but worth flagging that `en.json` is deliberately *not* imported by `strings.js` — it exists only to give Weblate the canonical key list.
- **New GitHub machine-user permissions and a webhook** scoped to `Sefaria/ai-chatbot` today; both need to be extended/added for `Sefaria/Sefaria-Project`.
- **Branch policy.** `Sefaria-Project` PRs land on `master` (vs. `main` in `ai-chatbot`), so the component branch and PR target must be set accordingly.
- **Scale.** This repo carries ~640+ interface strings plus the context-scoped set (vs. a small string set in `ai-chatbot`), so the initial import and the first translation sync are larger; budget for that in the smoke test.

### Open items to resolve before hooking it up

- **Key stability / no-concat rule.** Weblate keys must be stable and each key should carry a full, standalone sentence — never concatenate translated fragments (use placeholders instead). Existing Sefaria strings should be audited for concatenation patterns that won't survive translation cleanly.
- **`en.json` drift.** Because `en.json` is generated/maintained separately from runtime, we need a convention (and ideally CI) ensuring new strings are added to `en.json` so Weblate surfaces them, and that stale keys get cleaned up.
- **Two-component UX.** Confirm the flat vs. nested split is the right long-term shape for translators, or whether it should be consolidated before onboarding.

## Future Enrichments

- **AI metadata enrichment** — use AI to enrich entity documents (topics, books, authors) at index time.
- **Filter out stopwords** (complexity may differ from en/he) from query (i.e. do not match "The" or "and")
- **Author Matching** - If there are sources where the author matches the query name we boost the relevance score (i.e. q="Rambam", if a source has an author="Rambam", add to the relevance score) - by how much? Not sure. 
- Book matching - if index matches query add relevance
- **Chronological Ordering** - Add an ability to sort sources by chronology (i.e. current view is relevance, add a toggle for chronology)
- **Date of Death** - Show author date of death next to name if relevant
