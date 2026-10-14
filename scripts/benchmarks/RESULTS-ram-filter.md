# Hidden-book filtering in RAM vs MongoDB — 14 October 2026

Draft PR: https://github.com/Sefaria/Sefaria-Project/pull/3817. Measured implementation: `bc62ff6cdc`; completeness-checked runner: `565fffb183`.

**Each time is the median of six executions after one excluded warm-up.** Timings include set construction, database fetch, transfer/decoding, filtering and Link-object construction. Title-cache refresh and Django initialization are excluded. These are repeated executions of the same query, not averages of different queries.

All three modes ran in shuffled order inside the same cauldron process and against the same dedicated database. RAM uses bounded cursor batches (at most 1,000 candidates) and checks title prefixes with a frozenset. It filters before object construction, skips visible results for pagination, and keeps fetching until the visible page is full.

The exact PR sources were loaded into an isolated remote Python process; the running web service and deployed image were not changed. The harness preserves unrelated newer master code while applying the two changed ORM methods, with an assertion checking constructor compatibility. Source hashes, source text and image metadata are in the saved experiment.

## All links with an endpoint exactly equal to Genesis 1:1

Source query: `{"refs": "Genesis 1:1"}`

| Hidden indexes | No filtering (ms) | Mongo filtering (ms) | RAM filtering (ms) | Mongo / RAM |
|---:|---:|---:|---:|---:|
| 0 | 16.6 | 16.4 | 18.3 | 0.90× |
| 10 | 16.3 | 18.7 | 26.9 | 0.70× |
| 100 | 17.2 | 33.0 | 29.7 | 1.11× |
| 150 | 16.5 | 42.8 | 27.4 | 1.56× |
| 1000 | 17.2 | 179.3 | 29.1 | 6.16× |

## First 10,000 visible links with an endpoint starting with Genesis

Source query: `{"refs": {"$regex": "^Genesis(?:[ ,]|$)"}}`

| Hidden indexes | No filtering (ms) | Mongo filtering (ms) | RAM filtering (ms) | Mongo / RAM |
|---:|---:|---:|---:|---:|
| 0 | 563.5 | 558.0 | 583.3 | 0.96× |
| 10 | 570.2 | 587.8 | 637.4 | 0.92× |
| 100 | 579.2 | 657.6 | 680.5 | 0.97× |
| 150 | 562.9 | 697.2 | 673.8 | 1.03× |
| 1000 | 553.7 | 1516.8 | 663.7 | 2.29× |

## First 10,000 visible links from the entire links collection

Source query: `{}`

| Hidden indexes | No filtering (ms) | Mongo filtering (ms) | RAM filtering (ms) | Mongo / RAM |
|---:|---:|---:|---:|---:|
| 0 | 65.7 | 66.6 | 84.0 | 0.79× |
| 10 | 71.9 | 76.4 | 123.9 | 0.62× |
| 100 | 65.5 | 148.0 | 127.8 | 1.16× |
| 150 | 64.9 | 195.6 | 124.8 | 1.57× |
| 1000 | 70.0 | 1021.4 | 148.2 | 6.89× |

## Correctness and scope

- Ordered Mongo and RAM result IDs matched in every measured case and warm-up. Each mode completed 90 measured executions (five counts × three queries × six repetitions).
- Four focused regression tests passed in each worker. Real-database checks also passed for visible pagination at pages 0/1/3, dictionary and Ref inputs, empty results, count, indexing and repeated iteration.
- Original Index flags were restored; final hidden count is zero. No Link or Version records were modified.
- Existing callers remain unchanged. This is an opt-in LinkSet materialization experiment, not a replacement for every visibility filter. Count materializes the visible page; distinct and bulk deletion retain Mongo filtering.
- Raw cursor access exposes candidates; callers must consume the set. Integration with newer master’s skip-guard API remains necessary before adoption.
- Shared development Mongo hardware, warm caches, one title selection and three queries limit generalization. This is not a production HTTP latency measurement. High proportions of hidden candidates can still increase transfer and scanning; deep pagination must scan earlier visible records.
- Earlier preliminary runs, including the interrupted run and the first bounded-batch run, are excluded entirely. This report uses only the full confirmation rerun, started after verifying that no earlier remote benchmark workers remained. Every worker must deliver all 63 trial events, nine summaries and its final correctness marker.

## Returned visible records and examined candidates

Candidates examined counts Python-consumed documents; cursor batches may transfer additional documents.

| Hidden indexes | Exact Genesis 1:1: returned / examined | Genesis prefix: returned / examined | Broad query: returned / examined |
|---:|---:|---:|---:|
| 0 | 1,732 / 1,732 | 10,000 / 10,000 | 10,000 / 10,000 |
| 10 | 1,731 / 1,732 | 10,000 / 10,000 | 10,000 / 10,000 |
| 100 | 1,727 / 1,732 | 10,000 / 10,007 | 10,000 / 10,000 |
| 150 | 1,724 / 1,732 | 10,000 / 10,014 | 10,000 / 10,000 |
| 1000 | 1,553 / 1,732 | 10,000 / 10,764 | 10,000 / 11,222 |
