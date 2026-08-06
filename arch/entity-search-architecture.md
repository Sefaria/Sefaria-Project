# Entity Search Architecture: the `topic` and `book` Elasticsearch Indices

This document describes the two Elasticsearch indices introduced for the search
proof-of-concept — `topic` (topics and authors) and `book` (Index records) — and
how they are built, queried, and operated. It is a companion to
[search-poc-architecture.md](search-poc-architecture.md), which covers the
client-facing POC page and its open product questions. This document focuses on the
**backend data layer**: what these indices contain, how documents are constructed,
and how the query path uses them.

It is deliberately conceptual. It records the big-picture design and the decisions
behind it, not exact line numbers or signatures.

---

## Motivation

Historically Sefaria has run two Elasticsearch indices: `text` (full-text of all
sources) and `sheet` (source sheets). Entity lookups — "is there a topic called X?",
"which book is this?", "who is this author?" — were served by the **Name API**
(`/api/name`), a Mongo/trie-backed autocompleter, not by Elasticsearch.

The Name API has limitations the POC ran into (fuzzy-match noise, cross-language
bleed, the `ref` type conflating whole books with section refs, and no real
relevance ranking — see the companion doc). To explore a better ranking and recall
story, the POC adds **two new first-class Elasticsearch indices dedicated to
entities**, so that topics, authors, and books become searchable with the same
analyzer/boosting/relevance machinery already used for text — independent of the
Name API.

The result is four index types total: `text`, `sheet`, `topic`, `book`.

---

## The two indices

### `topic` index — topics *and* authors

One document per Topic. **Authors are not a separate index** — an `AuthorTopic` is a
subtype of `Topic` in the data model, so authors live in the same `topic` index and
are distinguished by a `subtype` field whose value is `"topic"` or `"author"`.

- **Shared fields** (all topics): `slug` (the stable id), `title_en` / `title_he`,
  `titleVariants` (alternate titles, the main recall driver), `description_en` /
  `description_he`, and `numSources` (a popularity signal usable for default
  ranking).
- **Author-only fields** (present only when `subtype == "author"`, otherwise simply
  absent — the mapping is sparse): `era`, `birthYear`, `deathYear`, and
  `authored_slugs` (the titles/ids of the Index records the author wrote).

Document id = the topic `slug`, so reindexing a topic is idempotent.

### `book` index — Index (book) records

One document per Index record. Fields: `title_en` / `title_he`, `titleVariants`,
`categories`, `path`, `description_en` / `description_he`, `compDate` (composition
date), `era`, `authors` (author **slugs**), `author_names`, and `order`.

Document id = the book title.

Two structural choices are worth calling out:

- **`path` mirrors the text index.** It is the hierarchical
  `"Category/Subcategory/Title"` string, the same shape the `text` index uses. This
  is intentional so the existing category-path filter logic can be reused on the
  query side without inventing a new filtering scheme.
- **`author_names` is denormalized.** The `authors` field stores only author slugs.
  `author_names` additionally stores the author's **display titles** (English +
  Hebrew, including variants), copied onto the book document at index time. This
  lets a search for "Rambam" or "Maimonides" match his works even when his name is
  not in the title (e.g. "Mishneh Torah, Blessings"). Without this denormalization,
  those books are linked to the author only by an opaque slug that the query string
  would never match.

---

## Mappings and text analysis

Each index type has its own mapping function, wired into the shared `create_index`
entry point alongside the existing `text` and `sheet` cases. The mapping conventions:

- **Title and description fields** use a `stemmed_english` analyzer (English text
  fields) so queries match on stems rather than exact forms. Hebrew title/description
  fields are plain `text`.
- **Title fields also expose a `keyword` sub-field**, so the same field supports both
  analyzed full-text matching and exact-match / sort use cases.
- **Identifiers and facets are `keyword`**: `slug`, `subtype`, `categories`, `path`,
  `authors`, `era`, `order`. These are for filtering and aggregation, not scoring.
- **Numeric fields** (`numSources`, `birthYear`, `deathYear`, `compDate`) are
  integers, usable for ranking and range logic.

The analyzers themselves (`stemmed_english`, `exact_english`, the English stemmer
filter) are the same family already defined for the text index.

---

## Indexing pipeline

The pipeline reuses the existing reindex infrastructure rather than building a
parallel one. Two layers:

**1. Document builders** — pure functions that turn a model object into an ES
document dict:

- *Topic builder*: reads primary titles, title variants, descriptions, and
  `numSources`; sets `subtype`; and, for `AuthorTopic`, adds the author-only fields.
  It returns `None` (skipping the document) when critical fields are missing — a
  topic needs a slug and a title in **at least one** language, since many topics are
  Hebrew-only.
- *Book builder*: reads titles, variants, categories, descriptions, composition
  date, era, and authors; computes `path`; and resolves each author slug to its
  display names for `author_names`. Author-name resolution is **cached** (one author
  authors many books, so the lookup repeats heavily). `compDate` is stored in Mongo
  as a list of years; the builder collapses it to a single sortable integer.

**2. Bulk indexers** — `index_topics` iterates all topics (via `TopicSet`),
`index_books` iterates all Index records (via the library's index records). Each
calls the matching builder, writes the document under its natural id, and collects
the slugs/titles that failed so a run reports what it skipped rather than aborting.

**Blue-green alias swap.** Entity reindexing plugs into the same alias-swap scheme
as text/sheet: build into an inactive `-a`/`-b` index, then atomically repoint the
alias (`topic` / `book`) to the freshly built index and clean up the old one. The
app always queries the alias, so a rebuild never serves partial results. The
type→index-name mapping and the per-type dispatch in the reindex driver were extended
to include `topic` and `book`.

Index names are configured via `SEARCH_INDEX_NAME_TOPIC` and `SEARCH_INDEX_NAME_BOOK`
settings (defaulting to `topic` and `book`), parallel to the existing
`SEARCH_INDEX_NAME_TEXT` / `_SHEET`.

---

## Query path

A dedicated endpoint, `/api/search-poc`, serves entity search. It takes a query
string and a `type` of `topic`, `author`, or `book`, and returns hits whose
`_source` already carries the titles, descriptions, and `numSources` the client
needs — so, unlike the Name API path, **no second hydration request is required**.

Core query shape — a `function_score` wrapping a `bool.should` of two `multi_match`
clauses, all over the same English+Hebrew field set with **field boosting** (titles
weighted highest, then title variants, then descriptions — a title hit is a better
match than a description hit):

- **`best_fields`** (boosted ×2) — full-token relevance matching. This is the primary
  scorer.
- **`phrase_prefix`** — prefix matching on the final query token, so partial queries
  like "Mos" match "Moses" before the user finishes typing. The two clauses are
  combined in a `should` so an entity can match either way.
- **`function_score` on `numSources`** (`field_value_factor`, `modifier: log1p`,
  `boost_mode: multiply`, `missing: 1`) wraps the whole thing, multiplying in a
  popularity signal so well-referenced entities float to the top. `log1p` damps the
  effect so a high `numSources` boosts rather than dominates.
- **`topic` vs `author` both hit the `topic` index**, differing only by a `term`
  filter on `subtype`. They are two views of one index.
- **`book` search additionally boosts `author_names`**, so an author-name query
  surfaces that author's books (the denormalization described above is what makes
  this possible).

The `phrase_prefix` clause is the dominant query cost and the one performance risk
worth validating at production scale — see
[limitations.md §1](../agent_docs/sefaria/limitations.md).

**Author-aware book results.** The book tab has special behavior: if the query
resolves to an author, the endpoint returns that author's works **aggregated by
category** rather than as a flat list of individual volumes. For example, the dozens
of Mishneh Torah volumes collapse into a single "Mishneh Torah" entry. This reuses
the model's existing author-works aggregation (`AuthorTopic`'s aggregated-URLs
logic), which groups an author's output into category aggregations and standalone
books. Category aggregations are sorted to the top, individual books below. When the
query does **not** resolve to an author (e.g. a plain title query like "Genesis"),
the endpoint falls back to a flat full-text search over the `book` index.

To support the aggregated view with useful labels, the author-works aggregation was
extended to also report, per entry, whether it is a category aggregation and a
localized **category label** (a single book's own top-level category, or a category
aggregation's parent category). The Name API (`/api/name`) gained an opt-in
`get_author_books` flag that returns the same aggregated author-works structure, so
the autocomplete path and the POC endpoint can share this data.

### Ranking sketch (proposal — not yet implemented)

> ⚠️ **This is only a sketch.** The query path above describes what exists today. The
> following is a more explicit ranking recipe we may adopt to make relevance tuning
> legible and easy to tweak. The boost numbers are illustrative starting points, not
> measured values — treat them as a strawman to argue with, not a spec.

The goal is a *relatively simple, lexical* ranking with no learning-to-rank or
vectors: **score = how well the query matches the titles (dominant) + a small
popularity nudge (tie-breaker).** One reusable `function_score` template,
parameterized per index.

**Per-field weights.** Not all text fields are equal — an exact title hit should
beat a description hit. Illustrative boosts (same set for all three entity types):

| Match | Boost | Rationale |
|---|---|---|
| `title_en.keyword` / `title_he.keyword` — exact full string | ×10 | full-string match ≈ certainly what they want |
| `title_en` / `title_he` — phrase (all words, in order) | ×6 | strong intent signal |
| `title_en` / `title_he` — tokens (stemmed, any order) | ×5 | normal word match |
| `titleVariants` | ×3 | alternate spellings → recall (Rambam/Maimonides) |
| `description_en` / `description_he` | ×1 | weak signal, breaks ties only |

**The `should` ladder.** These clauses live in a `bool.should`, so each one that
matches *adds* to the score. A document matching exactly *and* as a phrase *and* by
tokens stacks all three boosts and rises to the top — which is the behavior we want.
`fuzziness: AUTO` on the token clause forgives typos ("Ramban" → "Rambam").

**Popularity prior, per entity** (the only part that differs by index):

- **Topics / authors** — `function_score` with `field_value_factor` on `numSources`,
  `modifier: log1p`. The log keeps popularity a *tie-breaker, not a hammer*, so
  lexical relevance still leads.
- **Books** — **no popularity number is indexed**, so books rank on pure lexical
  score for now. We could potentially value certain categories of books over others, such as Tanakh over Commentary.


---

## Operational scripts

The scheduled reindex cronjob rebuilds the entity indices alongside text/sheet (see
[Scheduled reindex](#scheduled-reindex) below), but there is still **no on-save hook**
for entities (unlike the text index, which reindexes on save), so between scheduled
runs they can drift. The entity indices can also be rebuilt on demand:

- **Full reindex** — a script that runs the blue-green reindex for `topic` and/or
  `book`, the entity analog of the text/sheet reindex script.
- **Dev subset (Rashi/Rambam)** — a small script that builds `topic`/`book` indices
  containing only the Rashi and Rambam author topics and the books they authored, so
  entity-search work doesn't require reindexing all ~34k topics and ~6.5k books.
  Authored books are found via the authoritative `authors` field on Index records
  rather than by matching title prefixes like "Rashi on…".
- **Synthetic sample data** — a script that creates tiny local `text`/`sheet`
  indices with synthetic-but-realistically-shaped documents, for local
  search-wrapper and UI development without a Mongo-backed reindex.

### Scheduled reindex

The scheduled Elasticsearch reindex cronjob
(`scripts/scheduled/reindex_elasticsearch_cronjob.py`) rebuilds the entity indices on
the same schedule as text/sheet. Its `run_index_entities()` step calls
`index_all_of_type()` for `topic` and `book`, each performing its own blue-green index
creation and alias swap; a failure in one type is recorded but does not prevent the
other (or the rest of the job) from running. So entity data is refreshed automatically
per scheduled run — what remains missing is a finer-grained on-save hook (see
[Known gaps](#known-gaps-and-future-work)).

---

## Frontend integration (brief)

The POC page runs two query paths in parallel per search: the existing source search
(`Sefaria.search`) and entity search against `/api/search-poc`, fetched per tab
(topics / authors / books). Each ES hit is normalized into the existing `SearchTopic`
card shape, so no new card UI is needed. Because the entity documents are
self-contained, the lazy per-card hydration the autocomplete path requires is
unnecessary here. See [search-poc-architecture.md](search-poc-architecture.md) for
the client design and product questions.

---

## Known gaps and future work

- **No on-save freshness.** The scheduled cronjob now rebuilds the entity indices
  (see [Scheduled reindex](#scheduled-reindex)), but there is no on-save hook as there
  is for text. Between scheduled runs, topic/book edits in Mongo are not reflected, so
  entity data can lag by up to one reindex interval. A finer-grained refresh (an
  on-save hook, or simply tuning the cron frequency for an acceptable staleness
  window) is future work.
- **Relevance is unproven at scale.** Field boosting is a reasonable first cut, but
  default ranking (e.g. by `numSources` / `compDate`) and cross-language behavior
  still need tuning against real queries — the same ranking questions raised in the
  companion doc.
- **Denormalization staleness.** `author_names` on book docs and `authored_slugs` on
  author docs are snapshots taken at index time; an author rename requires
  reindexing the affected books to stay consistent.
- **Error handling is coarse.** Bulk indexers skip-and-log failed documents; there is
  no retry or alerting. Acceptable for a POC, not for production.
- **POC endpoint hardening.** `/api/search-poc` is a thin POC surface and would need
  the usual production concerns (pagination, input limits, caching) before launch.
