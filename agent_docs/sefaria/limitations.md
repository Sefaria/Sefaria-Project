# Search POC — Known Limitations

> Scope: the entity-search POC behind `search_poc_api` in [`reader/views.py`](../../reader/views.py)
> (the `topic` and `book` Elasticsearch indices). Last updated: 2026-06-09.

This document records architectural limitations of the new entity-search path that
are **not visible from the code alone** — they only surface in how the system is
tested and operated. Two are recorded here.

---

## 1. The new compound query cannot be performance-tested locally

### What changed

`entity_search()` (in `search_poc_api`, [`reader/views.py`](../../reader/views.py))
was changed from a single `multi_match` (`best_fields`) into a compound query:

- a `bool.should` combining `best_fields` (boosted ×2) **+** `phrase_prefix`
  (so partial queries like "Mos" match "Moses"), wrapped in
- a `function_score` with `field_value_factor` on `numSources`
  (`modifier: log1p`, `boost_mode: multiply`) to float well-referenced entities
  to the top.

### The limitation

There is a legitimate concern that this is slower than the original single query.
The dominant cost is the **`phrase_prefix`** clause: it expands the final query
token against each field's term dictionary (default `max_expansions: 50`), across
five-to-six fields including the large `description_en` / `description_he` fields.
**This cost scales with the number of distinct terms in the index**, i.e. with
index size.

The problem: **a local/dev environment cannot exercise this.** The local indices
are essentially empty —

| index   | local docs | production (expected) |
|---------|-----------:|-----------------------|
| `topic` | 2          | thousands             |
| `book`  | 246        | full library          |

With a 2-document `topic` index the term dictionary is tiny, so `phrase_prefix`
expansion is nearly free. A local benchmark therefore reports "no slowdown" by
construction — it is structurally incapable of reproducing the one regression
worth worrying about. **Local timing results must not be used to clear this change
for production.**

### Evidence

A benchmark harness exists at
[`scripts/bench_entity_search.py`](../../scripts/bench_entity_search.py). It fires
the **old** and **new** query bodies directly at Elasticsearch (bypassing Django and
serialization), with `request_cache=False`, over a fixed query set that includes the
short-prefix worst case, and reports `took` p50/p95 plus an optional `--profile`
breakdown. Run locally (2 topics / 246 books) it shows only single-digit-millisecond
differences dominated by fixed request overhead — exactly the non-result the table
above predicts.

### Recommendation

Validate against a **production-sized index** before drawing any conclusion. The
harness already prints index doc counts at startup so it is obvious whether the
target is representative:

```bash
SEARCH_URL=http://<prod-or-staging-es>:9200 PYTHONPATH=. \
  DJANGO_SETTINGS_MODULE=sefaria.settings \
  python scripts/bench_entity_search.py --iters 100 --profile
```

Point it at a production ES read replica or a staging cluster carrying the real
`topic`/`book` indices. Watch:

- **p95 of the short-prefix rows** (e.g. `Mo`, `Ge`) — where `phrase_prefix`
  expansion hurts first;
- the **`--profile`** per-clause breakdown — to confirm `phrase_prefix` (not
  `function_score`, which is effectively free) is the cost driver;
- mitigations if p95 regresses: cap `phrase_prefix` with a small `max_expansions`,
  drop the `description_*` fields from the prefix clause, or restrict
  `phrase_prefix` to the title fields only.

---

## 2. No cronjob reindexes the `topic` and `book` indices

### The limitation

The scheduled Elasticsearch reindex only covers **texts and sheets** — not the
`topic` and `book` indices that the entity-search POC depends on.

The cronjob is defined in
[`helm-chart/sefaria/templates/cronjob/reindex-elasticsearch.yaml`](../../helm-chart/sefaria/templates/cronjob/reindex-elasticsearch.yaml),
which runs
[`scripts/scheduled/reindex_elasticsearch_cronjob.py`](../../scripts/scheduled/reindex_elasticsearch_cronjob.py).
That script's work is `index_all()` (text + sheet indices) plus a
sheets-by-timestamp catch-up. Its own docstring states it "performs a full reindex
of Elasticsearch indexes for **text and sheet** content." There is **no scheduled
job** that (re)builds the `topic` or `book` indices.

### Consequences

- The `topic`/`book` indices are populated only by whatever ad-hoc / manual process
  built them; they will **drift out of date** as topics, authors, books, and
  `numSources` change, with no automated refresh.
- This also explains the stale local state (2 topics / 246 books): nothing keeps
  these indices current.
- `numSources` — which the new `function_score` ranks on — is exactly the kind of
  value that goes stale without a refresh, degrading result ranking over time.

### Recommendation

Before the entity-search POC is promoted to production, add a scheduled reindex for
the `topic` and `book` indices — either by extending the existing reindex cronjob to
also rebuild them, or by adding a dedicated cronjob — and decide on an acceptable
freshness interval for entity data and `numSources`.
