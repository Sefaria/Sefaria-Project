# Experimental RAM filtering for links

`RAMFilteredLinkSet` is an explicit alternative to `LinkSet`, stacked on the
compact Mongo regex implementation in #3816. Existing callers are unchanged.

```python
from sefaria.model.ram_link_set import RAMFilteredLinkSet
links = RAMFilteredLinkSet({'refs': 'Genesis 1:1'}, limit=10000).array()
```

It captures the cached hidden-title list, fetches candidate documents using the
original query, and checks both endpoints against a frozenset of titles. It tests
prefixes only at space/comma/end boundaries, preserving the existing regex
semantics (including overlapping-name behavior). Hidden records are discarded
before constructing Link objects. Skip and limit apply to visible records, so it
keeps fetching until the page is full or the cursor ends. Cursor batches may
transfer more documents than the application examines.

This is a LinkSet materialization experiment, not a system-wide replacement.
Versions, direct Mongo queries and single-record loads retain their current
behavior. `count()` materializes the visible page; `distinct()` and bulk deletion
retain ordinary Mongo filtering. Do not consume `raw_records` directly: it is the
unfiltered candidate cursor. No production call sites opt in yet. The current
base branch does not have master's later `with_skip_guard` behavior; integration
with that API is required before adopting this subclass on newer master.

## Reproduce on the existing dedicated cauldron

Run with Python 3 and authenticated kubectl. The fixture directory is the earlier
benchmark checkout, containing the editable book list and guarded fixture tool.

```sh
python3 scripts/benchmarks/run_ram_filter.py \
  --fixture-dir /Users/yon/projects/sefaria/hidden-books-benchmark/scripts/benchmarks \
  --output /Users/yon/projects/sefaria/hidden-books-benchmark-results/ram-new-run
```

Defaults: 0, 10, 100, 150 and 1000 flagged indexes; the same three link queries as
the previous experiment; one warm-up and six measured executions per mode. Modes
are no filtering, Mongo filtering, and RAM filtering, shuffled per round. Each
measurement includes constructing the set, fetching and decoding documents,
filtering, and constructing returned Link objects. Title-cache refresh is measured
separately; a fixed snapshot is used within each worker to avoid TTL refreshes
landing in one mode's timing. Ordered result IDs must match for Mongo and RAM.
Additional checks compare visible pagination, Ref-object input, empty results,
count, indexing and repeated iteration.

The launcher streams exact checkout sources into an isolated Python process in
`hidden-links-pr`. It injects the two changed base-class methods after checking
that the deployed constructor otherwise matches, preserving unrelated newer
master methods. It imports the exact new RAM module. No application files or
running web processes are replaced. All modes run against the same database and
resources. This is source-injected experimental validation, not a deployed image
or HTTP benchmark. Source hashes and pod image details are recorded.

Only the dedicated experimental database's Index flags are changed, using the
existing fixture ledger. The launcher restores them in `finally`. If the terminal
or network is interrupted, restore with the original benchmark runner's
`--restore-only`. Complete raw trials, errors and source snapshots are saved in
the output directory. Tests run in each remote worker before measurements.
