"""Read-only paired link benchmark. Run in a disposable standard cauldron.

python -m scripts.benchmarks.hidden_books_links --expected-db <exact-name> \
    --query '{"refs": "Genesis 1:1"}' --limit 1000 --repeats 6

Requires the PR implementation for filtered mode. Baseline mode also runs on master.
Outputs JSONL measurements; verbose mode also prints complete query filters. No database writes or API cache involved.
"""
import argparse
import gc
import json
import os
import random
import subprocess
import sys
import statistics
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-db', required=True)
    parser.add_argument('--verbose', action='store_true', help='Print complete queries and live operation timings to stderr; JSONL remains on stdout.')
    parser.add_argument('--query', default='{}')
    parser.add_argument('--limit', type=int, default=10000)
    parser.add_argument('--repeats', type=int, default=6)
    parser.add_argument('--max-time-ms', type=int, default=30000)
    parser.add_argument('--mode', choices=['baseline', 'paired'], default='paired')
    parser.add_argument('--explain-only', action='store_true', help='Measure server execution without transferring/hydrating results.')
    parser.add_argument('--full-scan', action='store_true', help='Allow unlimited raw cursor scans; ORM still bounded.')
    args = parser.parse_args()
    if args.limit <= 0 or args.repeats <= 0 or args.max_time_ms <= 0:
        parser.error('limit, repeats and max-time-ms must be positive')
    query = json.loads(args.query)
    if not isinstance(query, dict):
        parser.error('query must be a JSON object')

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')
    from django.conf import settings
    # Keep bootstrap identical across fixture sizes; measured LinkSet queries below
    # use the requested visibility mode. This does not test public library startup.
    settings.SHOW_ADMIN_ONLY_BOOKS = True
    import django
    django.setup()
    from bson import BSON
    from sefaria.model import LinkSet
    from sefaria.model import text
    from sefaria.system.database import db

    if db.name != args.expected_db or not db.name.endswith(('-hidden-links-control', '-hidden-links-pr')):
        raise SystemExit('Refusing unexpected DB; use one of the dedicated benchmark cauldrons')
    has_filter = hasattr(text, 'admin_only_titles')
    if args.mode == 'paired' and not has_filter:
        raise SystemExit('Paired mode requires PR #3784')

    measurements = []

    def say(message):
        if args.verbose:
            print(message, file=sys.stderr, flush=True)

    def describe(label, value):
        say(label + "\n" + json.dumps(value, indent=2, ensure_ascii=False, default=str))

    def emit(**row):
        print(json.dumps(row, default=str), flush=True)
        if row.get('error'):
            say(f"  FAILED {row['kind']}: {row['message']}")
        elif row.get('kind') == 'explain':
            stats = row['stats']
            say(f"  DONE server: {stats['executionTimeMillis']} ms; returned={stats['nReturned']:,}; docs examined={stats['totalDocsExamined']:,}; keys examined={stats['totalKeysExamined']:,}")
        elif 'elapsed_ms' in row:
            say(f"  DONE {row['kind']}: {row['elapsed_ms']:.2f} ms; returned={row['returned']:,}")
        if row.get('kind') in ('explain', 'raw_stream', 'orm_hydration'):
            measurements.append(row)


    try:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = 'unavailable-in-image'
    emit(kind='metadata', db=db.name, commit=commit, has_filter=has_filter,
         link_estimate=db.links.estimated_document_count(), indexes=list(db.links.list_indexes()),
         max_time_ms=args.max_time_ms, limit=args.limit, full_scan=args.full_scan,
         mongo_version=db.command('buildInfo')['version'])
    say(f'Connected to {db.name}; MongoDB {db.command("buildInfo")["version"]}. Bootstrap excluded from timings.')
    describe('Requested source query:', query)
    modes = ['baseline', 'filtered'] if args.mode == 'paired' else ['baseline']
    rng = random.Random(3784)
    # Round zero is a warm-up and is explicitly labelled. No server cache flushing.
    for repeat in range(args.repeats + 1):
        order = modes[:]
        rng.shuffle(order)
        for mode in order:
            say(f"\n=== {'WARM-UP' if repeat == 0 else f'ROUND {repeat}/{args.repeats}'} | {mode.upper()} ===")
            settings.SHOW_ADMIN_ONLY_BOOKS = mode == 'baseline'
            refresh_ms = None
            title_count = 0
            if has_filter and mode == 'filtered':
                describe('Refresh hidden titles: db.index.find', {'admin_only': True})
                started = time.perf_counter()
                title_count = len(text.admin_only_titles(force_refresh=True))
                refresh_ms = (time.perf_counter() - started) * 1000
            started = time.perf_counter()
            linkset = LinkSet(query, limit=args.limit)
            effective_query = linkset.query
            build_ms = (time.perf_counter() - started) * 1000
            common = dict(mode=mode, repeat=repeat, warmup=repeat == 0,
                          hidden_alias_count=title_count, refresh_ms=refresh_ms,
                          build_ms=build_ms, query_bytes=len(BSON.encode(effective_query)))
            say(f'Expanded titles={title_count}; BSON query bytes={common["query_bytes"]}; query build={build_ms:.2f} ms; title refresh={refresh_ms} ms')
            # Mongo execution stats measure server work, not client hydration.
            command = {'find': 'links', 'filter': effective_query, 'maxTimeMS': args.max_time_ms}
            if not args.full_scan:
                command['limit'] = args.limit
            describe('START MongoDB explain (server execution, no result hydration):', {'explain': command, 'verbosity': 'executionStats', 'maxTimeMS': args.max_time_ms})
            try:
                result = db.command('explain', command, verbosity='executionStats', maxTimeMS=args.max_time_ms)
                emit(kind='explain', **common, stats=result.get('executionStats'), planner=result.get('queryPlanner'))
            except Exception as exc:
                emit(kind='explain', **common, error=type(exc).__name__, message=str(exc))
            if args.explain_only:
                linkset.raw_records.close()
                del linkset
                continue
            # Fully consume cursor: timing find() alone measures almost no database work.
            describe('START raw cursor (fully consumed; includes transfer and BSON decoding):', dict(command, batchSize=1000))
            started = time.perf_counter()
            count = 0
            cursor = db.links.find(effective_query).batch_size(1000).max_time_ms(args.max_time_ms)
            if not args.full_scan:
                cursor = cursor.limit(args.limit)
            try:
                for _ in cursor:
                    count += 1
                emit(kind='raw_stream', **common, returned=count, elapsed_ms=(time.perf_counter()-started)*1000)
            except Exception as exc:
                emit(kind='raw_stream', **common, returned=count, error=type(exc).__name__, message=str(exc))
            finally:
                cursor.close()
            # The actual LinkSet materializes all returned objects; keep this bounded.
            describe('START actual LinkSet hydration (always bounded):', {'find': 'links', 'filter': effective_query, 'limit': args.limit, 'maxTimeMS': args.max_time_ms})
            gc.collect()
            started = time.perf_counter()
            linkset.raw_records = linkset.raw_records.max_time_ms(args.max_time_ms)
            try:
                count = sum(1 for _ in linkset)
                emit(kind='orm_hydration', **common, returned=count, elapsed_ms=(time.perf_counter()-started)*1000)
            except Exception as exc:
                emit(kind='orm_hydration', **common, error=type(exc).__name__, message=str(exc))
            finally:
                linkset.raw_records.close()
                del linkset

    say("\n=== SUMMARY — warm-up excluded; medians and ranges, not p95 ===")
    for mode in modes:
        for kind in ('explain', 'raw_stream', 'orm_hydration'):
            rows = [r for r in measurements if r['mode'] == mode and r['kind'] == kind and not r['warmup']]
            if not rows:
                continue
            good = [r for r in rows if 'error' not in r]
            values = [r['stats']['executionTimeMillis'] if kind == 'explain' else r['elapsed_ms'] for r in good]
            summary = dict(kind='summary', mode=mode, operation=kind, trials=len(rows), errors=len(rows)-len(good))
            if values:
                summary.update(median_ms=statistics.median(values), min_ms=min(values), max_ms=max(values))
            emit(**summary)
            describe(f'{mode} / {kind}:', summary)


if __name__ == '__main__':
    main()
