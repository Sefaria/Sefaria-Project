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
  (Tanakh,    index      ES topic       ES topic         ES category
   fuzzy)     (other)    index          index            + ES book
            │                               │
            ▼                               ▼
       Sources tab             Topics / Authors / Books tabs
```

1. **Source search** — `Sefaria.search` function, uses our elastic search endpoint for texts aside from Tanakh. For Tanakh, it uses the Dicta search for fuzzy matching.
2. **Entity search** — A new endpoint using Elastic Search, `/api/entity-search?q=<query>&type=<topic|author|book>`, is fired once per tab. This endpoint queries the dedicated `topic` and `book` Elasticsearch indices built for the POC, plus the `category` index that backs category results on the Books tab; see [Backend Architecture](#backend-architecture) below. Note `category` is not a `type` the API accepts — it is a kind of *row* the Books tab can return, not a tab of its own.
* Note - this API was called search-poc in the POC. It will be renamed for clarity to `entity-search`. 

> **Note on history.** The POC originally fed the entity tabs from the autocomplete **Name API** (`/api/name/<query>?limit=50`), reusing the dropdown's existing result handling - this was not the right decision, since while the Name API excels at returning results sorted by type, **it is not searching!** The Name API is _**autocompleting**_, which is an entirely different functionality. (Additionally, the Name API `ref` type conflated books and section-level refs)



## Backend Architecture

The `/api/entity-search` endpoint is backed by three new Elasticsearch indices — `topic`, `book` and `category` — added alongside the existing `text` and `sheet` indices. This section covers what those indices contain, how they're built, and how the query path uses them. The `category` index is documented separately under [Categories as first-class search entities](#categories-as-first-class-search-entities), since it exists to solve one specific problem on the Books tab.

### The two entity indices

**`topic` index — topics and authors**

One document per Topic **in the `library` TopicPool**. Pool membership (curated in Postgres via `django_topics`) is the inclusion filter: the full Mongo `TopicSet` carries ~40k topics, most of them auto-generated noise never curated for the library, so only the ~5.5k library-pool topics and authors are indexed. Authors are not a separate index — `AuthorTopic` is a subtype of `Topic`, so authors live in the `topic` index and are distinguished by a `subtype` field (`"topic"` or `"author"`).

| Field | Type | Analyzer | Notes |
|---|---|---|---|
| `slug` | `keyword` | — | Stable identifier; used as document ID (idempotent reindex) |
| `subtype` | `keyword` | — | `"topic"` or `"author"` |
| `title_en` | `text` + `keyword` | `stemmed_english` | Primary match; `keyword` sub-field for exact-match and sort |
| `title_he` | `text` + `keyword` | plain `text` | Primary match; `keyword` sub-field for exact-match and sort |
| `titleVariants` | `text` | `stemmed_english` | Alternate titles — the main recall driver |
| `description_en` | `text` | `stemmed_english` | Returned for display only; **not searched** |
| `description_he` | `text` | plain `text` | Returned for display only; **not searched** |
| `era` | `keyword` | — | Author-only: historical period |
| `birthYear` | `integer` | — | Author-only: for display and filtering |
| `deathYear` | `integer` | — | Author-only: for display and filtering |
| `sortYear` | `integer` | — | Author-only: the derived year the chronological sort keys on — `deathYear`, falling back to `birthYear` (see Sorting) |
| `authored_titles_en` | `text` + `keyword` | `stemmed_english` | Author-only: denormalized titles of the author's works, **including English title variants** — the same title set the book doc indexes (`title_en` + `titleVariants`), so any query that returns a book in the Books tab also returns its author in the Authors tab (e.g. "Moreh Nevukhim" → Rambam) |
| `authored_titles_he` | `text` + `keyword` | plain `text` | Author-only: Hebrew primary titles of the author's works (mirrors the book doc's `title_he`) |

Author-only fields (`era`, `birthYear`, `deathYear`, `sortYear`, `authored_titles_*`) are sparse on topic documents. Document id = topic `slug`, so reindexing is idempotent.

**`book` index — Index (book) records**

One document per Index record.

| Field | Type | Analyzer | Notes |
|---|---|---|---|
| `title_en` | `text` + `keyword` | `stemmed_english` | Primary match & sort |
| `title_he` | `text` + `keyword` | plain `text` | Primary match & sort |
| `titleVariants` | `text` | `stemmed_english` | Alternate titles; recall |
| `categories` | `keyword` | — | Category path components; filterable |
| `path` | `keyword` | — | `"Category/Subcategory/Title"` — mirrors text index shape |
| `description_en` | `text` | `stemmed_english` | Returned for display only; **not searched** |
| `description_he` | `text` | plain `text` | Returned for display only; **not searched** |
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
- **Numeric fields** (`birthYear`, `deathYear`, `compDate`) are integers, usable for ranking and range logic.

The analyzers (`stemmed_english`, `exact_english`) are the same family already defined for the `text` index.

### Indexing pipeline

The pipeline plugs into the existing reindex infrastructure rather than building a parallel one.

**Document builders** are pure functions that turn a model object into an ES document dict:
- *Topic builder*: reads titles, variants, and descriptions; sets `subtype`; adds author-only fields for `AuthorTopic`. Returns `None` for topics missing a slug and title in at least one language (many are Hebrew-only).
- *Book builder*: reads titles, variants, categories, descriptions, `compDate`, era, and authors; computes `path`; resolves each author slug to display names for `author_names`. Author-name resolution is cached (one author appears on many books). `compDate` is stored in Mongo as a list; the builder collapses it to a single sortable integer. The book's `collective_title` — a **string** term key like `"Rashi"` or `"Chafetz Chaim"` (not a dict) — is appended to the variant list so commentaries are findable by their commentator name. *(Regression guard: an interim version treated `collective_title` as a dict (`.get('en')`) and threw on every book that had one — all commentaries, Targums, Rashi, etc. — silently dropping ~83% of Index records from the `book` index. The builder swallows per-doc errors, so this surfaced only as missing search results, not a failed reindex.)*

**Bulk indexers** — `index_topics` iterates the topics in the `library` TopicPool (slugs fetched from `django_topics`, then queried from Mongo via `TopicSet`); `index_books` iterates all Index records. Each calls its builder, writes under the document's natural id, and collects skipped slugs/titles into a summary report rather than aborting.


Index names are configured via `SEARCH_INDEX_NAME_TOPIC`, `SEARCH_INDEX_NAME_BOOK` and `SEARCH_INDEX_NAME_CATEGORY` (defaulting to `topic`, `book` and `category`), parallel to `SEARCH_INDEX_NAME_TEXT` / `_SHEET`. `SEARCH_INDEX_NAME_CATEGORY` additionally carries a default in `settings.py` after the local-settings import, so a deployment whose `local_settings.py` predates it still boots — without one, the name is simply undefined and the `global_settings` context processor raises `NameError` on every page render.

### Query path

The endpoint accepts a query string and a `type` of `topic`, `author`, or `book`. Hits return self-contained documents (titles, descriptions, and the author-only year/era fields).

#### Elastic Search Scoring Mechanisms

An entity query is a `bool should` that layers several **match tiers** over English and Hebrew fields, titles weighted highest, then variants. A `bool should` **sums** the matching clauses, so a document that satisfies a higher tier (which also satisfies the lower ones) accumulates a higher score. **Descriptions are not searched at all** — a description mention is not a meaningful entity match; description fields stay in the index only so hits can render them:

- **Exact match (`constant_score` on the `.keyword` sub-fields)** — the decisive tier, split in two by whose name matched:
  - **Primary-title hit** (`title_en.keyword` / `title_he.keyword`) → large fixed boost (**1000**).
  - **Secondary hit** — a title *variant* (book `titleVariants.keyword`) or a *work the entity wrote* (author `authored_titles_*.keyword`) → smaller fixed boost (**100**).

  `constant_score` makes these contributions **IDF-independent** — the same amount no matter how common the word is corpus-wide. This is what guarantees the book literally titled "Chafetz Chaim" outranks "Chafetz Chaim on Sifra" and every other work by that author: no accumulation of the partial tiers below on a longer title can *sum* past a true exact match, and an exact *variant* hit can never outrank an exact *primary* hit. (This replaced an earlier scored `term` tier whose value rode on IDF, which let an exact variant hit — scoring 85 — outscore an exact primary hit — scoring 67 — purely because the word was rarer in one field than another.)
- **Exact phrase (`match_phrase`, titles only)** — the query as an ordered phrase.
- **Exact-word match (`best_fields`, ×2 boost)** — all query words, best-matching field wins; the per-field boosts (`title_en^3` > `titleVariants^2` > `author_names^1.5`) are the RemoteConfig-tunable knob (see below).
- **Prefix match (`phrase_prefix`, titles only)** — handles mid-typing. "Mos" isn't a token, so `phrase_prefix` treats the last query word as a prefix → "Moses", "Moshe", etc.
**Relevance is purely textual.** The tiers above are the entire score — no document signal (popularity, page rank, etc.) is layered on top, for any entity type.

> **Removed: the `numSources` popularity boost — and the field itself.** An earlier iteration wrapped topic/author queries in a `function_score` that multiplied the text score by a log-scaled source-count factor (`1 + log10(1 + numSources) * 0.2` — roughly a 1.7× lift at ~7,000 sources), nudging results toward well-sourced entities (Moses 7,074 refs ≫ Mosquitoes 3). It was never a specced requirement, so it was taken out rather than left as an untracked thumb on the scale. That left `numSources` with no reader anywhere in the pipeline — not ranking, not filtering, and the frontend never displayed it — so it was dropped from the topic mapping and the document builder too, rather than kept as a field nothing consumes.
>
> **Consequence:** re-introducing any source-count behavior (see the open ["topic results with no sources"](#open-questions) question) now needs a **reindex**, not just a query change — the data is no longer in the index. The Mongo `Topic.numSources` field is untouched and still drives topic pages, the topics TOC, and the autocompleter via `Topic.should_display()`. Any future document-signal ranking should come in deliberately, via the structured `signal_boosts` shape sketched under [Product-configurable ranking](#product-configurable-ranking-remoteconfig), not as an implicit default.

**Length normalization.** `title_en` keeps BM25 length norms **on**, so a short, focused title outscores a longer title that merely *contains* the query words for the same matched term ("Chafetz Chaim" > "Chafetz Chaim on Sifra"). `titleVariants` keeps norms **off**, so a book with a rich variant list isn't penalized on the variant tiers.

**Routing:** `topic` and `author` queries both search the `topic` index, filtered by `subtype`. Book queries additionally boost `author_names` so a search for "Rambam" surfaces his works even when his name isn't in the book title.

#### Product-configurable ranking (RemoteConfig)

A natural extension is to lift the ranking weights out of code and into a RemoteConfig JSON entry, so the product team can tune result ordering without a code change or reindex. The per-field **match boosts** map onto this cleanly: the weights in the `multi_match` field list — e.g. `["title_en^3", "title_he^3", "titleVariants^2", "author_names^2"]` — are already a `{field: weight}` dictionary. The `^3` on `title_en` means a query word found in the title counts three times as much as the same word found in a lower-weighted field like `titleVariants`, so a search for "Rashi" ranks *Rashi on Genesis* (title match) above a book that merely matches on a variant. Exposing that dictionary as config lets product retune it live. The defaults also double as an allow-list: a RemoteConfig key that isn't a default field for that type (a typo, or an intentionally removed field like `description_en`) is ignored, never added to the query.

The catch is that **not every ranking factor reduces to a single per-field weight.** The inputs fall into a few kinds, only one of which fits the flat model:

- **Match boosts — configurable.** Weights on the searchable text fields (`title_en`, `titleVariants`, `author_names`, …). One weight per field, safe for product to edit directly. **Scope:** RemoteConfig tunes *only* the tier-3 `best_fields` weights. The exact-match tier's `constant_score` boosts (primary **1000** / secondary **100**) and the `title_en` length-norm setting are fixed in code — they are structural guarantees ("an exact title always wins"), not ranking knobs, so they are deliberately not RemoteConfig-exposed. Overrides still validate against the default field allow-list: an unknown or misspelled field name is ignored with a warning, never added to the query.
- **Document signals — need more structure. None are active today.** Numeric properties that would lift a document *regardless of the query* — e.g. ranking authors with more `numSources` above those with fewer, or a future per-book page rank to float more-studied books to the top. The `numSources` version of exactly this was built and then removed (see [Elastic Search Scoring Mechanisms](#elastic-search-scoring-mechanisms)) because it was never specced; the lesson is that this class of factor needs a product decision, not a default. These feed a `function_score`, not the field list, and a bare weight is not enough: the raw values live on very different scales (`numSources` spans 0–7,000+), so each needs a scaling modifier (e.g. log) and missing-value handling, not just a multiplier.
- **Categorical preferences — don't fit at all.** Wanting certain categories to outrank others (e.g. surfacing Halakhah above a niche category) is a weight per *value*, not per *field* — a different shape again (`{category: weight}`), wired as filtered boost clauses.

In short, the match-boost weights are a clean, low-risk knob to hand to product via RemoteConfig, but signal- and category-based factors require purpose-built structure in the query builder and can't be collapsed into the same flat field→weight map. A RemoteConfig schema for this should therefore separate these concerns (e.g. a `match_boosts` map distinct from `signal_boosts`) rather than expose one undifferentiated dictionary — and should validate keys against the real index fields, since a typo'd field name would silently boost nothing.

#### Sorting (entity tabs only)

Each entity tab offers explicit sort orders in addition to the default relevance ranking; the Sources tab is unchanged (it is a separate query path with its own existing sort options).

| Tab | Sort options | Year field |
|---|---|---|
| Sources | *no change* | — |
| Books | Relevance · Publication Year (Oldest/Newest First) · A-Z | `compDate` |
| Authors | Relevance · Year (Oldest/Newest First) · A-Z | `sortYear` (= `deathYear`, falling back to `birthYear`) |
| Topics | Relevance · A-Z | — |

The API takes `sort=relevance|alpha|year_asc|year_desc` (default `relevance`); a sort invalid for the type (e.g. a year sort on topics) is rejected. Mechanics:

- **Same match set, different order.** A non-relevance sort keeps the identical tiered text query as a filter and adds an ES `sort` clause; it never changes *which* documents match, only their order. `_score` is the secondary sort, so equal-keyed documents still order by relevance. Because relevance carries no score wrapper, the query is now byte-identical under every sort — the sort clause is the only difference.
- **A-Z is case-insensitive.** Sorting uses a `title_en.sort` keyword sub-field with a `lowercase` normalizer (a raw `keyword` sort would put "iggeret" after "Zohar"). Both title fields on both indices carry the sub-field, so a Hebrew-interface א-ת sort on `title_he.sort` needs no reindex later.
- **Missing keys always sort last.** Year and title sorts use `missing: "_last"` in both directions, so undated books/authors and Hebrew-only topics (≈7,200 topics have no English title) trail rather than lead. To make this work the document builders *omit* empty titles instead of indexing `""` — an empty string is a real keyword value and would sort first.
- **An entity's year is a single derived number, and it must be the year the card displays.** Both types derive that number **at index time**, so the ES sort is always a plain field sort with no per-query fallback logic. A book collapses Mongo's `compDate` *list* to one sortable int (`best_time_period`: end year, else start, else `3000` so undated works trail — mirroring the text index). An author collapses to a **`sortYear`** field: `deathYear`, **falling back to `birthYear` when there is no death year** (`_author_sort_year`; raw `birthYear`/`deathYear` are still indexed separately for display). Sorting authors on the raw `deathYear` instead — as the query briefly did — pushes every author who has only a birth year into the `missing: "_last"` undated tail while their card still shows a year; the client-side re-sort in `sortEntityHits` cannot compensate, because it only reorders the page of hits already returned. Changing either derivation requires a **reindex**, not just a query change.

- **Explicit sorts keep the author-works aggregation.** On the Books tab, a query that resolves to an author returns category-aggregated works (see below) under every sort, not just relevance. To make that sortable, each aggregated row carries a `compDate`: an individual work's own composition year, or — for a category row, which collapses many works and dates into one entry — the **average year of its dated works** (`AuthorCategoryAggregation.get_comp_date`). The rows are then sorted in code with the same semantics as the flat ES sorts (A-Z on lowercased English title; year sorts on `compDate`; missing keys last in either direction). An earlier iteration bypassed the aggregation on explicit sorts to expose each book's individual date; product preferred preserving the collapsed view, with a representative date per category. (Alternative considered: keying a category by its *first* work's date rather than the average — rejected because "first" follows canonical library order, not chronology.)

#### Category filter (books only)

The Books tab also supports a category filter: `filter=<category path>` on the API (repeatable — multiple filters OR together). This is where the `path` field's design choice pays off: because book `path` mirrors the text index's `"Category/Subcategory/Title"` shape, the filter reuses the exact regexp semantics of text search path filters (`path` or `path/.*`, via a shared `make_path_filter` helper) — e.g. `filter=Tanakh/Torah` matches every book at or under that category. Properties:

- **Non-scoring.** The paths go into the bool query's `filter` context, so filtering never perturbs relevance ranking — the same match scores, just a restricted set. It composes freely with any `sort`.
- **Books only.** Topics and authors carry no category path; a `filter` on those types is rejected (topics may want a different faceting concept later, but it isn't this field).
- **Bypasses the author-works aggregation** (unlike explicit sorts, which preserve it): category-aggregated rows collapse many books into one entry with no single per-row path, so a filtered query always returns the flat book list.

#### Author-aware book results

When the query resolves to an author, the endpoint returns that author's works aggregated by category rather than a flat list. The dozens of Mishneh Torah volumes, for example, collapse into a single "Mishneh Torah" entry. This reuses existing function Sefaria has for author topic pages - `AuthorTopic` author-works aggregation. Under the default relevance sort the rows order **eponymous work → category aggregations → remaining individual books**: the author's *eponymous work* — the book whose title exactly matches the query (e.g. the book "Chafetz Chaim" on a search for that name) — is lifted to the top, since a search for an author's name most often means the book of that name, which would otherwise be buried among the author's other works. The exact-match test is EN/HE title equality (not prefix), so only the eponymous book is lifted, not longer titles that merely begin with it ("Chafetz Chaim on Sifra"). When the query does not resolve to an author, the endpoint falls back to a flat full-text search over the `book` index (where the `constant_score` exact-match tier above already floats an exact book title to #1).

> **Note — a book query for an author name takes the aggregation branch.** Because "Chafetz Chaim", "Rashi", "Rambam" etc. resolve to authors, the flat-ranking improvements (exact-match tier, length norms) do *not* apply to those queries — they hit `_author_works_response` instead, which is why the eponymous-work lift lives there too. Non-author book queries ("Bereshit", "Shalom") use the flat path.

**QA escape hatch:** `aggregate=0` on the API (or appended to the search page URL, which forwards it) skips the author resolution entirely, so a book query always returns the flat list. This exists so product staff can compare the aggregated and flat views for the same query; it is ignored for types that never aggregate (topics/authors) and composes with any `sort`.

> **Note:** An earlier iteration could trigger the author-works view whenever an author's name appeared anywhere in matched text — including book descriptions — causing queries like "Genesis" to return all of Rashi's books because his name appeared in a description. This is addressed twice over: descriptions are no longer searched at all, and the aggregated-works view only activates when the query directly matches an author entity's title or title variant in the `topic` index.

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
      "era": "RI",
      "birthYear": 1138,
      "deathYear": 1204,
      "sortYear": 1204
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
      "categories": null,
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

In the aggregated view, an individual work carries its full `categories` path (rendered as the card's
breadcrumb trail); a category row collapses many per-book paths into one entry, so it carries
`categories: null` and is represented by its `categoryLabel_*` instead (a single breadcrumb).

## Categories as first-class search entities

**The gap.** Some of the most likely queries a user will type — "Talmud", "Mishnah", "Halakhah", "Kabbalah", "Midrash" — name a *category* in Sefaria's text tree, not an `Index` record. The `book` index has one document per `Index`, and `categories` / `path` are `keyword` fields used for filtering only; they are not in the searchable field list. So the corpus a user is asking for has no document to match. Measured against the cauldron (`/api/entity-search?type=book`):

| Query | Result |
|---|---|
| `Bavli` | **0 hits** — the token appears in no title anywhere |
| `Talmud Bavli` | byte-identical to `Talmud`; "Bavli" contributes nothing |
| `Halakhah` | **22 hits**, in a category holding thousands of books |
| `Kabbalah` | **1 hit** |
| `Talmud` | 579 hits, none of which is the Talmud |

A second, sharper version of the same gap: a query like "Mishneh Torah" *does* match books — dozens of them, one per volume ("Mishneh Torah, Laws of Prayer", "Mishneh Torah, Blessings", …) — burying the thing the user actually asked for under its own parts. This is exactly the shape the author-works aggregation already fixes for authors.

Note that these same terms *do* resolve correctly on the Topics tab (`talmud`, 747 sources; `mishnah`; `kabbalah` all rank #1), so the concept is already represented in the `topic` index. The gap is specific to Books.

**Rejected: making `categories` a searchable text field.** The cheap fix — add `categories` to `_DEFAULT_ENTITY_FIELD_BOOSTS["book"]` — converts "0 results for Bavli" into "7,000 undifferentiated Talmud books". A user typing "Talmud" wants *one thing*, not the corpus flattened. Useful only as a weak recall signal underneath a real solution.

### What was built

A dedicated **`category` index**, and a category branch in the Books resolution chain that replaces a matched category's books with a single category row.

**Storage — a separate index, not a `doctype` on `book`.** An earlier draft of this section proposed discriminating category documents inside the existing `book` index via a `doctype` field, on the grounds that one index means one query and one `total`. The built version uses a separate `category` index instead, a deliberate product decision: categories are a distinct kind of thing with a distinct lifecycle (~309 documents that change on TOC edits, versus ~6,600 that change on text edits), and keeping them apart means the category logic is legible in one place and a category reindex can't disturb the book index. The cost is real and accepted — **the Books tab now issues a second Elasticsearch round-trip**, and its `total` is summed in Python rather than read off one response. At ~309 documents the extra query is sub-10ms locally.

**Which categories are indexed.** Not all of them. `get_search_categories` (`sefaria/model/autospell.py`) yields **309 documents** out of a ~1,000-node category tree, by two rules:

- keep only real **containers of texts** — a category with at least **two indices anywhere beneath it** (`is_index_container`). A category holding a single book is that book under another name, and the book is already searchable on its own, so `Shulchan Arukh/Commentary/Magen Avraham` and 67 others like it are dropped. The count is over the whole subtree, not direct children: Tanakh, Talmud, Mishnah, Midrash and Mishneh Torah have **no** direct index children at all, so a direct-children test would discard exactly the categories users search for most;
- at a *collection boundary* — a node whose name matches `commentary|commentaries|rishonim|acharonim|geonim|savoraim|other`, or is exactly one of `comment/comments/modern/targum/guides` — **drop the boundary node itself**, harvest its child categories one level down (Rashi, Ramban, Kessef Mishneh, …), and never descend past it into the repeated per-book structure.

So "Rishonim", "Acharonim", "Modern", "Targum" and "Commentary" are *not* searchable categories; the commentator names underneath them are — provided they hold two or more texts. By depth the set is 14 / 44 / 112 / 131 / 8 across levels 1-5.

> **Deviation from the source branch.** `feat/autospell-search-categories` gates the taxonomy on `len(child.children) >= 2` and applies no gate at all to the harvested children. Counting *child nodes* is a proxy for "is this a collection?"; counting *indices* is the thing itself, so the proxy is replaced by `is_index_container` on both branches. Net effect: 376 categories -> 309 (68 single-book categories dropped, and `Jewish Thought/Guide for the Perplexed` — one child, but Moreh Nevukhim plus commentaries inside — gained).

This function was already the definition of "a category worth autocompleting"; it was lifted from a private static method on `AutoCompleter` to a module-level function so the indexer and the autocompleter share one definition and cannot drift into a state where a category completes but doesn't search. It is imported into `sefaria/search.py` **under an alias** (`get_searchable_toc_categories`), because that module already defines an unrelated `get_search_categories(oref, categories)` for text-index category paths which would otherwise shadow it.

**Titles come from the shared `Term`.** All 309 searchable categories carry a `sharedTitle` naming a `Term`, and `AbstractTitledOrTermedObject._process_terms` replaces the category's title group with the Term's during load. So `category.get_titles(lang)` already returns the Term's full title list — which is where the real aliases live: "Bible" → Tanakh, "Gemara" → Talmud, "Mishnah Torah" → Mishneh Torah, "Halacha"/"Halachah"/"Halocha" → Halakhah. A category *without* a sharedTitle falls back to its own titles, so the same call is correct either way and no explicit Term lookup is needed. Note the titles cannot be read off the TOC node: `TocCategory.__init__` copies only the primary EN/HE titles, so the variants exist only on the backing `Category` record (`toc_node.get_category_object()`).

| Field | Type | Notes |
|---|---|---|
| `path` | `keyword` | `"Halakhah/Mishneh Torah"` — document id, and the key used to exclude the category's books |
| `title_en` / `title_he` | `text` + `keyword` + `sort` | Same analyzers and sub-fields as the `book` index |
| `titleVariants` | `text` (`alias_bag`) | The shared Term's other titles |
| `categories` | `keyword` | **Parent** path — the result card's breadcrumb; empty for a top-level category |
| `depth`, `order` | `integer` | `depth` breaks ties between same-titled categories |
| `description_en` / `description_he` | `text` | Display only, never searched — same rule as every other entity |

**Ranking needed no new machinery.** Tier 1 is already a `constant_score` exact match on `title_en.keyword` at boost 1000, and the same tiered builder runs against the `category` index (its per-type entries live alongside the others in `_DEFAULT_ENTITY_FIELD_BOOSTS` / `_ENTITY_TITLE_FIELDS` / `_ENTITY_SECONDARY_KEYWORD_FIELDS`). Resolution then applies `_query_matches_entity_title` — the same exact-match guard the author path uses — so only a query that *names* a category flips the tab into category mode. Exact and never prefix, for the same reason as authors: a prefix test would let "Mod" or "Tal" hijack the whole Books tab.

**Resolution chain.** The `book` branch of `entity_search` is now `_resolve_author` → `_resolve_categories` → flat book search.

- **Author wins — and this is the common case, not an edge case.** **138** category titles are also an author's name or title variant, because the TOC collects a commentator's works under a category named after him (Rashi, Ramban, Maggid Mishneh, Lechem Mishneh, Ramak, Ramchal, Josephus, …). For a name query the person is the likelier intent, so author resolution runs first and every one of those keeps returning aggregated author works, never reaching category resolution. A consequence worth noting: most of the commentator categories harvested from below the boundaries are therefore unreachable as category rows.
- **All exact matches are returned, not one.** **57** titles name more than one category: "Seder Moed" names five (under Mishnah, Bavli, Yerushalmi and both Tosefta editions), "Rashi" names three, and "Halakhah" names both the top-level category and `Midrash/Halakhah`. Picking a single winner would be arbitrary, so every exact match becomes a row, ordered **shallowest-first then A-Z** — so top-level Halakhah leads Midrash/Halakhah — and the breadcrumbs tell them apart.
- **`aggregate=0` bypasses category mode** as well as author mode, so the QA escape hatch still shows the flat list for any query.

**The response.** Rows, in order:

1. **the eponymous book**, if the query also names a book *inside* a matched category. **11** exist — Zohar, Tur, Sefer Yetzirah, Shulchan Arukh HaRav, Mishnah Berurah, Sefer HaMitzvot, … — and without this they would vanish behind their own category card. Mirrors the eponymous-work lift `_author_works_response` already does for "Chafetz Chaim". Only books inside a matched category need rescuing; a same-titled book elsewhere was never excluded and the exact-match tier already floats it to #1.
2. **one row per matched category**
3. **the ordinary flat book results, with every book at or under a matched category path excluded** — a `must_not` built from the same `make_path_filter` helper the category *filter* uses, in non-scoring context so it never perturbs relevance.

Step 3 is the point: `q=Mishneh Torah` answers with one "Mishneh Torah" card instead of forty-odd volumes, while books matching the query from *other* categories still appear beneath it.

**Sorting.** Category mode is a decision about *which* books to show, not what order to show them in, so it holds under every sort rather than collapsing back to a flat list (unlike the category *filter*, which does bypass collapsed views). The leading rows order among themselves — A-Z under `alpha`, otherwise shallowest-first — and the flat remainder honors the requested sort. Year sorts leave the leading rows in place rather than banishing them to the `missing: _last` tail; they are the query's answer, not a dateless straggler.

**Pagination and counting.** The leading rows are a small fixed block: paging walks them first, then offsets into Elasticsearch by `start - lead_count`. `total` is `lead_count + es_total`, so the tab badge and the "more to load" check stay honest. When a page is filled by leading rows alone, the book query still runs at `size: 0` purely for its total — no fetch, scoring or highlighting.

**No frontend change was needed.** A category row carries `isCategory`, `url` and `categories`, which is exactly the contract `bookHitCardProps` (`static/js/SearchPage.jsx`) already branches on for author-works rows, so it renders through the existing `SearchResultCard` with the collection icon and a breadcrumb. `categoryLabel_*` is deliberately *omitted*: on an author-works row it names the category that collapsed several books, but here the category *is* the row's title, and sending it would render the same words as both heading and breadcrumb. The parent path in `categories` is the breadcrumb — empty for a top-level category, which correctly yields no breadcrumb at all.

**Freshness.** Unlike topics and books, which get surgical per-document upserts, a category save or delete re-syncs the **whole** `category` index (`resync_category_docs`). A single category edit is not a single-document change: renaming "Halakhah" rewrites the path — and therefore the document id — of every category beneath it, and a category whose child count crosses the two-child threshold (or whose rename turns it into a boundary) moves in or out of the indexed set entirely. Tracking those cascades individually would be easy to get subtly wrong; a full re-sync of ~309 documents in one bulk request is unconditionally correct and cheaper than the logic it replaces. The hook must stay subscribed *after* `text.rebuild_library_after_category_change`, since it reads the rebuilt TOC tree.

### Verified locally

Full local reindex: **309 category documents, 0 errors**, ~0.36s.

| Query | Result |
|---|---|
| `Mishneh Torah` | Mishneh Torah category card; all 40+ volumes gone (`aggregate=0` shows them: 1,931 flat hits) |
| `Zohar` | the **book** Zohar, then the Zohar category, then unrelated Zohar books |
| `Rishonim` | **no category** — it is a boundary name, so it is deliberately not indexed; 1 book |
| `Halakhah` | top-level Halakhah, then Midrash/Halakhah, then 4 books |
| `Bavli` | 1 hit — the Talmud/Bavli category (**was 0**) |
| `Bible`, `Gemara` | resolve Tanakh and Talmud via shared-Term variants |
| `Rashi`, `Ramchal` | unchanged: author-works aggregation |
| `Bereshit` | unchanged: flat book search |

### Still open

- **Duplication with the Topics tab.** "Talmud" now returns a strong result on *two* tabs — the corpus on Books, the concept on Topics. That may be correct or may read as redundant; worth a deliberate product look now that it is observable.
- **Multi-word noise in the excluded remainder.** `q=Mishneh Torah` correctly hides the Mishneh Torah volumes, but the flat remainder below the card is weak ("Torah Temimah on Torah" et al.), because a two-word query matches any book containing either common word. This is the pre-existing flat-ranking behavior, not something category mode introduced, but the category card makes it more visible. Related to the numeric-token false positives already listed under [Backend Limitations](#backend-limitations).
- **Counting.** A category row counts as one toward the Books tab badge; the collapsed-vs-raw ambiguity already flagged for author works applies here too.
- **Weak `categories` recall.** Now that an exact-match category document owns the head of the list, adding `categories` as a low-boost (~0.5) searchable text field on `book` is safe and would help queries like "talmud commentary". Not built.


## Elastic Search Indexing Operations

### Scheduled reindex

The scheduled cron job rebuilds the `topic`, `book` and `category` indices on the same schedule as `text`/`sheet`. Each index is rebuilt using a blue-green strategy: a fresh index is built in the background under a temporary name, and only swapped in as the live index once it's complete. This means search stays available on the old data during the rebuild, with zero downtime. A failure rebuilding one index type is recorded but does not block the others from completing.

We need sample scripts to minimally populate a dev environment, as well as a script for a **full reindex** which runs the reindex for `topic`, `book` and/or `category` on demand.

### Local development setup

Add these constants to `sefaria/local_settings.py` before running any indexing scripts:

```python
SEARCH_INDEX_NAME_TOPIC = 'topic'
SEARCH_INDEX_NAME_BOOK = 'book'
SEARCH_INDEX_NAME_CATEGORY = 'category'
```

`settings.py` defines these for production, but `local_settings.py` does not include them by default. Without them, indexing scripts fail with `ImportError: cannot import name 'SEARCH_INDEX_NAME_TOPIC' from sefaria.settings`.

Populate all three locally with `python scripts/populate_dev_entity_search.py`, or one at a time with `--type topic|book|category`. `--limit` is ignored for categories: the whole set is only ~309 documents, and a partial one would make category resolution silently miss queries.

**Reindex both `book` and `topic` together.** The two indices are coupled by denormalized data, so a partial reindex produces confusing, half-working results:

- The **Authors tab depends on the `topic` index.** An author matches a book-title query (e.g. "Zevachim" → Rambam, Ovadiah Bartenura) through the author's `authored_titles_*` field, which lives on the `topic` index. If only `book` is rebuilt, the Authors tab returns **0** for these queries until `topic` is rebuilt too.
- `author_names` (on `book`) and `authored_titles_*` (on `topic`) are both snapshots taken at index time, so any author rename or book-title change needs both indices refreshed to stay consistent.

The `category` index is independent of both — it is built from the TOC tree, not from denormalized book or author data — so it can be rebuilt alone without desynchronizing anything.

Rebuild a single entity index on demand with `index_all_of_type('book')` / `index_all_of_type('topic')` / `index_all_of_type('category')` (blue-green: builds a fresh index, then swaps the alias). Note `index_topics` only indexes the curated **library TopicPool** (~5.5k topics/authors), so the `topic` doc count is far below an older all-topics index (~36k) — expected, not data loss. Likewise `index_categories` indexes only the ~80 *main* categories, not the ~1,000-node category tree.

## Showing Result Counts While Results Load

Product wants each tab's result count to appear before that tab's results finish rendering. With the tabbed design this is **four counts** (Sources, Topics, Books, Authors), and they do *not* share a cost profile — the work depends entirely on the index behind the tab.

**The entity tabs (Topics / Books / Authors) need no optimization.** The `topic` and `book` indices hold thousands of docs (not the millions in `text`), the entity query has **no facet aggregations**, and the response **already returns `total`** for free. Read the count straight off the entity response.

**Only the Sources tab is expensive enough to optimize.** A count is cheap for Elasticsearch to compute — it skips the three things that dominate the *source* search's full response: **aggregations** (facets visit *every* matching doc and build `size: 10000` bucket tables — ~half the latency), **top-N fetch** (scoring + reading/serializing `_source` for the page of hits), and **highlighting** (re-analyzing each returned doc to build snippets). A bench against a 200k-doc local index put a count-only query ~90%+ faster than the full request.

**Approach — fire a separate, parallel count-only query** (`size: 0`, no `aggs`/`highlight`/`_source`) alongside the main search and paint the count the moment it returns.
- *Count appears earliest* — gated only by the network round-trip, not by aggs/fetch/highlight.
- *Smallest blast radius* — the existing search path is untouched; you add a lightweight call rather than refactoring the query builder.
- *Isolates exact-count cost* — `track_total_hits: true` (for exact counts above the 10k default cap) rides on the cheap query, not the main results query.
- *Cost to accept:* it re-runs the query-match scan (≈2× that portion of cluster work per search), and the frontend coordinates two responses — including the Sefaria + Dicta total merge on the Sources tab ([`search.js` total merge](../../static/js/sefaria/search.js)).

This resolves the open **"eager vs. lazy entity search"** question (see [Open Questions](#open-questions)): to show count badges on all four tabs up front, fire the (cheap, per point above) full entity queries per type eagerly. Each badge reads `total` off its response — not `hits.length`, which is capped at one page (max 100) and would undercount broad queries — and the fetched hits are cached (`Search.entitySearch`) for reuse when the user switches to that tab, so the eager fetch does double duty. The `size: 0` count-only trick stays reserved for the expensive Sources query.

**Two count-semantics wrinkles to decide:**
- *Author-works collapsing.* Book/Author results collapse many works into category entries (the sample shows `"total": 42` with far fewer displayed rows). A count-only query returns the **raw** match total, which won't equal the collapsed row count — product must pick which number the badge shows.
- *Sources is a two-source sum.* The Sources count merges Sefaria + Dicta totals client-side, so even a count-only Sources query needs both halves before showing a number.

## Limitations


### Backend Limitations

- **On-save freshness is gated on `SEARCH_INDEX_ON_SAVE`.** All three entity indices now have save hooks (`sefaria/model/dependencies.py`), so an edit shows up in search immediately where that setting is on: topics and books upsert the single changed document, while a category save or delete re-syncs the whole `category` index (see [Categories as first-class search entities](#categories-as-first-class-search-entities) for why). Where the setting is off, edits only appear after the next scheduled rebuild. All of these hooks are best-effort — they log and swallow failures, since the Mongo write is already committed and the cron reconciles.
- **Relevance is unproven at scale.** Field boosting is a reasonable first cut; default ranking and cross-language behavior still need tuning against real queries.
- **Denormalization staleness.** `author_names` on book docs and `authored_titles_*` on author docs are snapshots taken at index time; an author rename (or a book title/variant change) requires reindexing the affected docs to stay consistent.
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
- **Topic descriptions** — how much do we display? (The search side is decided: descriptions are never searched, only displayed.)
- **Ref queries ("Genesis 1:1")** — it's unclear whether a ref-shaped query should trigger a search or directly load that ref in the reader. Needs a product decision before building: these are fundamentally different UX flows.
- **Hebrew text analysis** — entity search uses a built-in `stemmed_english` analyzer for English fields and plain `text` for Hebrew. Hebrew morphology is complex (prefixes, root-based stems) and plain tokenization may hurt recall for Hebrew queries. Worth considering a dedicated Hebrew analyzer, though this may be out of scope for the initial MVP.
- **Topic results with no sources** — topics with zero associated sources should probably not appear in results (a topic with no sources is not useful to a user). Note this is now a **larger change than it was**: `numSources` is no longer indexed (see [Elastic Search Scoring Mechanisms](#elastic-search-scoring-mechanisms)), so building this means re-adding the field to the mapping and builder *and* running a reindex, on top of deciding where the filter applies (a hard `must`/`range` filter in the query, a threshold, or at render time — render time being the worst option, since it desynchronizes the `total` the count badges read). Also worth settling: whether the rule is a bare count or the richer `Topic.should_display()` semantics used elsewhere in the codebase, which admits a topic with few sources if it has a description. Partly mitigated already — only the curated ~5.5k `library` TopicPool is indexed, so the worst auto-generated zero-source noise never reaches the index.
- **When to Call the Entity Search** - either on every search (what was implemented on the POC) or only on tab switch. POC queries all three in parallel so results are ready before the user switches tabs. 

## Localization (Weblate)

Separate from search, we want to bring `Sefaria-Project` onto the same translation workflow we already run for the `ai-chatbot` repo: a self-hosted [Weblate](https://weblate.sefaria.org) instance where translators edit strings in a web UI and Weblate opens PRs back to the repo. This section captures what that setup looks like for `Sefaria-Project` and how it differs from the existing `ai-chatbot` deployment.

### Why this is now possible

Weblate translates **translation files**, not source code — it cannot parse `.js`. Historically Sefaria's interface strings lived inline in `static/js/sefaria/strings.js`, which put them out of Weblate's reach. Commit [`314e55b7cf`](https://github.com/Sefaria/Sefaria-Project/commit/314e55b7cf) ("chore: split up into json files") extracts them into JSON, which is what makes a Weblate hookup possible. After that commit:

- `static/js/sefaria/i18n/interface/*.json` — a single **flat** map (keyed ID → value). Keys are namespaced by component where that's meaningful (`follow_button.follow`) and by `common.*` otherwise. An earlier split into a second `interface-context/` directory was folded back into this one file set, so there is only one shape to configure.
- `en.json` is the **Weblate source template** (the source of truth for keys) and also supplies the English display text at runtime; `he.json` holds the Hebrew translations. `strings.js` imports both.

### How ai-chatbot does it (the model to copy)

The `ai-chatbot` deployment is the reference implementation; the full runbook lives in the infrastructure repo at `docs/weblate.md`. In brief:

- Self-hosted Weblate on Coolify at `weblate.sefaria.org`, Google SSO restricted to `@sefaria.org`.
- A GitHub machine user (`sefaria-weblate`) with a fine-grained PAT opens PRs — **Weblate never pushes directly to `main`**; engineers review and merge translation PRs.
- One Weblate component pointed at a **monolingual** JSON file mask (`src/i18n/locales/*.json`) with `en.json` as the monolingual base file, file format `JSON file`, `Edit base file: No`.
- A GitHub webhook (`/hooks/github/`) syncs the component when the repo changes.
- Add-ons: cleanup translation files, squash git commits, JSON indent `2`, key sorting disabled (so translation-PR diffs stay minimal and don't reorder keys).

### What's different for Sefaria-Project

The infrastructure (Coolify instance, Google SSO, machine user) is **already stood up** for `ai-chatbot`, so onboarding this repo is mostly adding a new project/components rather than deploying Weblate again. The differences to account for:

- **One component, same as `ai-chatbot`.** File mask `static/js/sefaria/i18n/interface/*.json`, base `interface/en.json`, file format **`JSON file`** (flat). (An earlier draft of this plan called for a second component for `interface-context/`; that directory has since been merged into `interface/`, so a single component covers everything.)
- **`en.json` is both the template and the runtime English.** Same monolingual pattern as `ai-chatbot` (`Edit base file: No`) — `en.json` gives Weblate the canonical key list *and* supplies the English display text that `strings.js` imports, so a Weblate edit to a source string changes the English UI.
- **New GitHub machine-user permissions and a webhook** scoped to `Sefaria/ai-chatbot` today; both need to be extended/added for `Sefaria/Sefaria-Project`.
- **Branch policy.** `Sefaria-Project` PRs land on `master` (vs. `main` in `ai-chatbot`), so the component branch and PR target must be set accordingly.
- **Scale.** This repo carries ~590+ interface strings (vs. a small string set in `ai-chatbot`), so the initial import and the first translation sync are larger; budget for that in the smoke test.

### Open items to resolve before hooking it up

- **Key stability / no-concat rule.** Weblate keys must be stable and each key should carry a full, standalone sentence — never concatenate translated fragments (use placeholders instead). Existing Sefaria strings should be audited for concatenation patterns that won't survive translation cleanly.
- **`en.json` drift.** Because `en.json` is generated/maintained separately from runtime, we need a convention (and ideally CI) ensuring new strings are added to `en.json` so Weblate surfaces them, and that stale keys get cleaned up.
- **Empty Hebrew values.** `interface/he.json` currently carries a couple of `""` values (e.g. `calendar_listing.talmud`). `Sefaria._keyedString` tests `id in maps.he`, not whether the value is non-empty, so an empty string renders as blank rather than falling back to English. Either fill those in or make the fallback treat `""` as missing before the Weblate import.

## Future Enrichments

- **AI metadata enrichment** — use AI to enrich entity documents (topics, books, authors) at index time.
- **Filter out stopwords** (complexity may differ from en/he) from query (i.e. do not match "The" or "and")
- **Author Matching** - If there are sources where the author matches the query name we boost the relevance score (i.e. q="Rambam", if a source has an author="Rambam", add to the relevance score) - by how much? Not sure. 
- Book matching - if index matches query add relevance
- **Chronological Ordering** - Add an ability to sort sources by chronology (i.e. current view is relevance, add a toggle for chronology)
- **Date of Death** - Show author date of death next to name if relevant
- **Send the entity `sort` to the API** — the sort orders described under [Sorting](#sorting-entity-tabs-only) are implemented and tested on the backend, but the search page never requests them: `entitySearch` (`static/js/sefaria/search.js`) builds its URL from `q`, `type` and `start` only, and `setEntitySort` (`static/js/SearchPage.jsx`) just sets React state. So every request uses the default `sort=relevance`, and the dropdown selection is applied client-side by `sortEntityHits` to the hits already in memory. Two consequences: the server-side sort clauses are currently unreachable from the UI, and — because the tabs page in more hits on scroll in *relevance* order — "Year (Oldest First)" returns the oldest of an arbitrary loaded subset rather than the oldest authors, reshuffling as the user scrolls. An author who ranks poorly on relevance never surfaces near the top no matter how old they are. The fix is to thread `sort` through `entitySearch` (URL **and** cache key), refetch from `start=0` with the accumulated hits cleared whenever the sort changes, and then retire `sortEntityHits` — leaving a second sort implementation in the client is what let the author year rule drift from the server's in the first place.
