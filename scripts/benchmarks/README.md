# Hidden-book link query benchmark

Experimental branch for PR #3784. Do not merge it into production.

## Matched environments

- `hidden-links-control`: master; no Index flags changed.
- `hidden-links-pr`: PR #3784 merged with master `3910579367`, plus these scripts.
- Both use chart `0.90.4`, standard cauldron mode (separate databases), snapshot
  `private_dump_small_14.10.26.tar.gz`, default matching resources, no Celery workers,
  and no KEDA scale-to-zero. Sheets are excluded equally.
- These databases share the dev Mongo server. Run sequentially, alternate the
  environment order, record interference, and never flush shared server caches.
- Record exact deployed image digests before measuring; branch names are insufficient.

## Fixture

Use `set_hidden_books_fixture.py` only on the PR database. It picks existing Index
records in a stable SHA-256 title order, and flags nested samples of size
0, 1, 10, 100, and 1000. It never modifies links or versions, so topology is preserved.
It records original flag values in a separate ledger. `--count 0` restores them.
The exact database name must be supplied and must end in `-hidden-links-pr`.
No model save hooks run: this is deliberately a fixture edit on a disposable copy.

Flagged books may have dependents; this experiment measures the actual query filters,
not whether the fixture describes a valid publishable library. Do not use these
fixtures to claim application-wide correctness.

## Measurements

Run `python -m scripts.benchmarks.hidden_books_links --help` for arguments.
Copy the same script to the control pod and use `--mode baseline` there.
In PR paired mode, baseline disables visibility filtering in that process and
filtered mode enables the actual PR filter. This paired control isolates filter
cost from differences between deployments. Settings changes never affect web workers.

Start with a single smoke-test repeat, then six measured repeats plus a labelled warm-up:

1. Exact passage: `{"refs":"Genesis 1:1"}`.
2. Whole book: `{"refs":{"$regex":"^Genesis(?:[ ,]|$)"}}`.
3. Broad set: `{}`, bounded to 10,000 documents.
4. Full collection: `{}` with `--full-scan`; only after assessing bounded runs.

The fixture may select Genesis at a larger count: record this as changed selectivity,
not an equivalent-output latency comparison. Include a stable public book confirmed
absent from the selection for final reporting.

Capture separately:
- Hidden Index count, expanded title/alias count, query BSON size.
- Exclusion-list refresh and LinkSet query construction times.
- Mongo `executionStats` and winning plan, including returned/examined counts.
- Fully consumed raw cursor time (including network and BSON decoding).
- Actual LinkSet hydration time, bounded to avoid exhausting pod memory.

Full scans retain a 30-second server execution limit by default; timeouts are results,
not zero-duration successes. Client elapsed time can exceed the server limit due to
network, decoding, and hydration. First-use startup is outside the measured interval.
Warm-up does not certify a globally warm database. Report medians and ranges of the
raw trials; do not present a reliable p95 from only six observations.

Verify restoration first: matching collection counts and index specifications, correct
DB names, and enough records for the largest fixture. No writes to production,
preprod, staging, or the shared feature database.

Do not infer correctness from speed: check that hidden links are excluded and public
links preserved separately, especially for overlapping title prefixes.
