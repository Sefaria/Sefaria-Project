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
    parser.add_argument('--count', type=int, required=True)
    args = parser.parse_args()
    if args.count < 0:
        parser.error('count must be nonnegative')
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
    if args.count > len(rows):
        raise SystemExit(f'Only {len(rows)} indexes available')
    operations = []
    for position, row in enumerate(rows):
        if position < args.count:
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
    if count != args.count:
        raise SystemExit(f'Unexpected hidden count: {count}')
    selected = [r['title'] for r in rows[:args.count]]
    print(json.dumps({'database': db.name, 'hidden_indexes': count,
                      'selection_sha256': hashlib.sha256(json.dumps(selected).encode()).hexdigest()}))


if __name__ == '__main__':
    main()
