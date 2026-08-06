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

## 2. Entity indices refresh only on the reindex cron — no on-save freshness

### What changed

The scheduled Elasticsearch reindex now rebuilds the `topic` and `book` indices
alongside texts and sheets. The cronjob is defined in
[`helm-chart/sefaria/templates/cronjob/reindex-elasticsearch.yaml`](../../helm-chart/sefaria/templates/cronjob/reindex-elasticsearch.yaml),
which runs
[`scripts/scheduled/reindex_elasticsearch_cronjob.py`](../../scripts/scheduled/reindex_elasticsearch_cronjob.py).
That script now adds a `run_index_entities()` step (STEP 3) that calls
`index_all_of_type()` for `topic` and `book` — each doing its own blue-green index
creation and alias swap — on top of the existing `index_all()` (text + sheet) and the
sheets-by-timestamp catch-up.

### The limitation

Refresh is **only** as frequent as that scheduled run. Unlike the text index, there is
**no on-save hook** for entities, so:

- Between scheduled runs the `topic`/`book` indices **drift out of date** as topics,
  authors, books, and `numSources` change — staleness is bounded by the cron interval,
  not eliminated.
- `numSources` — which the new `function_score` ranks on — is exactly the kind of
  value that goes stale within an interval, degrading result ranking until the next
  run.
- Local/dev environments that never run the cron stay stale indefinitely (this is part
  of why local state sits at 2 topics / 246 books); they must be rebuilt manually via
  the `sindex_*` scripts.

### Recommendation

Before promoting the entity-search POC to production, decide on an acceptable freshness
interval for entity data and `numSources` and tune the cron frequency to it — and, if
near-real-time freshness is needed, add an on-save hook for entities as exists for
text rather than relying on the periodic rebuild alone.
