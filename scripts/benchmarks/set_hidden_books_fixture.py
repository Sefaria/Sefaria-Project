"""Flag a deterministic nested sample ONLY in the dedicated PR benchmark DB.

This intentionally bypasses save hooks in a disposable database copy. It never
edits versions or links. Run with --count 0 to restore all original flag values.
The ledger persists the original values so interrupted runs are recoverable.
"""
import argparse
import hashlib
import json
import os


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-db', required=True)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument('--count', type=int, help='Legacy hash-ordered fixture size; zero restores original flags.')
    selection.add_argument('--titles-json', help='Explicit JSON list of exact Index titles.')
    args = parser.parse_args()
    if args.count is not None and args.count < 0:
        parser.error('count must be nonnegative')
    requested = None
    if args.titles_json is not None:
        try:
            requested = json.loads(args.titles_json)
        except ValueError as exc:
            parser.error(str(exc))
        if not isinstance(requested, list) or any(not isinstance(t, str) or not t for t in requested):
            parser.error('titles-json must be a list of nonempty strings')
        if len(set(requested)) != len(requested):
            parser.error('Duplicate titles are not allowed')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')
    from django.conf import settings
    # Keep library bootstrap stable after previous rounds have flagged base texts.
    settings.SHOW_ADMIN_ONLY_BOOKS = True
    import django
    django.setup()
    from pymongo import UpdateOne
    from sefaria.system.database import db
    if db.name != args.expected_db or not db.name.endswith('-hidden-links-pr'):
        raise SystemExit('Refusing to modify any DB except the dedicated PR benchmark DB')
    ledger = db.benchmark_hidden_books_fixture
    state = ledger.find_one({'_id': 'original-index-flags-v1'})
    if state is None:
        rows = list(db.index.find({}, {'title': 1, 'admin_only': 1}))
        if any(r.get('admin_only') for r in rows):
            raise SystemExit('Snapshot already contains hidden indexes; inspect before proceeding')
        rows.sort(key=lambda r: (hashlib.sha256(r['title'].encode()).hexdigest(), str(r['_id'])))
        state = {'_id': 'original-index-flags-v1', 'rows': rows}
        ledger.insert_one(state)
    rows = state['rows']
    if args.count is not None and args.count > len(rows):
        raise SystemExit(f'Only {len(rows)} indexes available')
    selected = requested if requested is not None else [r['title'] for r in rows[:args.count]]
    selected_set = set(selected)
    current = list(db.index.find({}, {'title': 1}))
    if {r['_id'] for r in current} != {r['_id'] for r in rows}:
        raise SystemExit('Index population changed since fixture snapshot; refusing to write')
    missing = selected_set - {r['title'] for r in current}
    if missing:
        raise SystemExit('Unknown Index titles; no flags changed: ' + json.dumps(sorted(missing)))
    if {r['_id']: r['title'] for r in current} != {r['_id']: r['title'] for r in rows}:
        raise SystemExit('Index titles changed since fixture snapshot; refusing to write')
    operations = []
    for row in rows:
        if row['title'] in selected_set:
            update = {'$set': {'admin_only': True}}
        elif 'admin_only' in row:
            update = {'$set': {'admin_only': row['admin_only']}}
        else:
            update = {'$unset': {'admin_only': ''}}
        operations.append(UpdateOne({'_id': row['_id']}, update))
    if operations:
        result = db.index.bulk_write(operations, ordered=True)
        if result.matched_count != len(rows):
            raise SystemExit('Index population changed since fixture snapshot; inspect before benchmarking')
    count = db.index.count_documents({'admin_only': True})
    if count != len(selected):
        raise SystemExit(f'Unexpected hidden count: {count}')
    print(json.dumps({'database': db.name, 'hidden_indexes': count, 'selected_titles': selected,
                      'selection_sha256': hashlib.sha256(json.dumps(selected).encode()).hexdigest()}))


if __name__ == '__main__':
    main()
