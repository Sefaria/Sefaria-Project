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

## Future Enrichments

- **AI metadata enrichment** — use AI to enrich entity documents (topics, books, authors) at index time.
- **Filter out stopwords** (complexity may differ from en/he) from query (i.e. do not match "The" or "and")
- **Author Matching** - If there are sources where the author matches the query name we boost the relevance score (i.e. q="Rambam", if a source has an author="Rambam", add to the relevance score) - by how much? Not sure. 
- Book matching - if index matches query add relevance
- **Chronological Ordering** - Add an ability to sort sources by chronology (i.e. current view is relevance, add a toggle for chronology)
- **Date of Death** - Show author date of death next to name if relevant
