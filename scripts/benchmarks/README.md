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

Use `set_hidden_books_fixture.py` only on the PR database. The launcher supplies exact
titles from the editable `BOOK_TITLES` list in `hidden_books_experiment.py`, hiding its
first 0, 1, 10, 100, and 1000 entries. That explicit ordering preserves the original
experiment's SHA-256 selection; future runs do not compute a new selection. It never modifies links or versions, so topology is preserved.
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
4. Full collection: `{}` with `--full-scan --explain-only`; only after assessing bounded runs. This measures server execution without transferring the entire collection.

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

## Run interactively from your laptop

```sh
python3 scripts/benchmarks/run_hidden_books.py
```

**No arguments needed.** This runs the three configured queries at **0, 1, 10, 100,
and 1000** hidden indexes. Each case compares baseline/filtered modes with six measured
rounds and one excluded warm-up. It temporarily changes Index flags in the dedicated
PR cauldron and restores the fixture's original values afterward.

### Edit the experiment

All defaults are in **`hidden_books_experiment.py`**:

- `FLAG_COUNTS`: the successive sizes, currently `[0, 1, 10, 100, 1000]`.
- `QUERIES`: exact passage, Genesis book, and any 10,000 links. The full-library
  server-only query is present as a commented example you can enable.
- `BOOK_TITLES`: 1,000 explicit exact Index titles, ordered exactly as in the original
  experiment. Each step hides the first N. Reorder/add/replace entries to change the
  selection; make sure the largest count fits the list. The complex book that triggered
  the original regex error is the 43rd entry.
- `REPEATS`, `LIMIT`, `MAX_TIME_MS`: measurement settings.

The runner prints selected titles, complete generated queries, live measurements,
and summaries. Unknown or duplicate book titles are rejected. The experiment config,
selected titles and raw JSONL measurements are saved locally under `hidden-books-runs/`.
Use `--output /path/to/new-directory` to choose another results directory.

The local launcher requires Python 3, `kubectl`, and working Google Cloud/Kubernetes
credentials. It discovers the ready cauldron web pod and uses `kubectl exec` to stream
in the benchmark script. Actual ORM queries execute in the container using its Django
settings and MongoDB connection; no port forwarding or local project dependencies are
needed. Initialization may take a while before the first measurement.

### Optional overrides

```sh
# Inspect the full configuration without connecting or changing flags:
python3 scripts/benchmarks/run_hidden_books.py --show-plan

# Smaller trial of all configured queries:
python3 scripts/benchmarks/run_hidden_books.py --counts 0 1 10 --repeats 2

# One query instead of the suite, retaining configured flag counts:
python3 scripts/benchmarks/run_hidden_books.py --query '{"refs":"Genesis 1:1"}'

# Full-library server execution only:
python3 scripts/benchmarks/run_hidden_books.py --counts 0 1 10 --query '{}' --full-scan

# Read-only: use existing flags, no fixture changes:
python3 scripts/benchmarks/run_hidden_books.py --read-only

# Master control: all configured queries, baseline only, no flag changes:
python3 scripts/benchmarks/run_hidden_books.py --environment control

# Recovery if a prior run was interrupted before restoring flags:
python3 scripts/benchmarks/run_hidden_books.py --restore-only
```

Restoration runs in `finally`, including after a normal Ctrl-C or child-process failure.
A killed launcher, network failure, or second Ctrl-C can interrupt recovery; use
`--restore-only` afterward. Do not run simultaneous fixture-changing benchmarks against
this same database. The control environment is always read-only.

For execution entirely on your machine, use `--execution local` from a configured Sefaria
Python environment with dependencies and a disposable local MongoDB copy. The checkout's
Django settings determine the connection; the DB must be named `sefaria-hidden-links-pr`
(or `sefaria-hidden-links-control`). The launcher does not provision a database.

Each mode performs three separate queries: explain executionStats (server work), a fully
consumed raw cursor (server + transfer + decoding), and actual LinkSet hydration (also
Python objects). Do not add these times together as if they were one request. Full-scan
mode performs only explain. Baseline/filtered order is shuffled deterministically;
round zero is warm-up and excluded from summaries. Failed queries are counted as errors,
never zero-millisecond successes. The runner continues after measured query failures,
so the original regex-size errors at 100/1000 do not prevent subsequent cases running.

Printed find/explain documents describe benchmark operations, not a wire-protocol trace
of driver session fields, getMore requests or bootstrap queries. Each measurement is
printed when its operation completes; the query is printed before it starts.
