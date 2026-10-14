"""Run from your laptop: reproduce the single-hidden-book failure in the PR cauldron.

Uses kubectl and the deployed PR code. Temporarily flags only Chafetz Chaim on
Sifra, then restores its original flag. Refuses to start if any books are hidden.
"""
import argparse
import json
import pathlib
import subprocess
import sys

TITLE = 'Chafetz Chaim on Sifra'
CONTEXT = 'gke_development-205018_us-east1-b_cluster-1'


def worker():
    import os
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')
    from django.conf import settings
    settings.SHOW_ADMIN_ONLY_BOOKS = True
    import django
    django.setup()
    from bson import BSON
    from pymongo.errors import OperationFailure
    from sefaria.model import LinkSet, text
    from sefaria.system.database import db

    if db.name != 'sefaria-hidden-links-pr':
        raise SystemExit('Refusing unexpected database: ' + db.name)
    if db.index.count_documents({'admin_only': True}):
        raise SystemExit('Other hidden books exist. Finish other benchmark runs before this test; nothing changed.')
    raw = db.index.find_one({'title': TITLE})
    if raw is None:
        raise SystemExit('Book missing: ' + TITLE)
    if not hasattr(text, 'admin_only_titles'):
        raise SystemExit('This image does not contain the required PR code.')
    query = {'refs': 'Genesis 1:1'}
    settings.SHOW_ADMIN_ONLY_BOOKS = False

    def fetch():
        links = LinkSet(query, limit=1)
        links.raw_records = links.raw_records.max_time_ms(10000)
        try:
            return sum(1 for _ in links)
        finally:
            links.raw_records.close()

    print('Database:', db.name, flush=True)
    print('MongoDB:', db.command('buildInfo')['version'], flush=True)
    print('Query: LinkSet({"refs": "Genesis 1:1"}, limit=1)', flush=True)
    text.admin_only_titles(force_refresh=True)
    print('\nBEFORE: zero hidden indexes', flush=True)
    print('Success; Link objects loaded:', fetch(), flush=True)
    reproduced = False
    try:
        result = db.index.update_one({'_id': raw['_id']}, {'$set': {'admin_only': True}})
        if result.matched_count != 1:
            raise RuntimeError('Index disappeared before flag update')
        hidden = list(db.index.find({'admin_only': True}, {'title': 1}))
        print('\nAFTER: hidden indexes:', json.dumps([r['title'] for r in hidden]), flush=True)
        if len(hidden) != 1 or hidden[0]['_id'] != raw['_id']:
            raise RuntimeError('Concurrent flag change detected; cannot isolate this experiment')
        titles = text.admin_only_titles(force_refresh=True)
        links = LinkSet(query, limit=1)
        try:
            print('Expanded title strings:', len(titles), flush=True)
            print('Effective query size:', len(BSON.encode(links.query)), 'BSON bytes', flush=True)
        finally:
            links.raw_records.close()
        try:
            print('Link objects loaded:', fetch(), flush=True)
            print('NO FAILURE reproduced on this deployed version/data.', flush=True)
        except OperationFailure as exc:
            print('\nMongoDB exception (unmodified):', flush=True)
            print(str(exc), flush=True)
            print('Error code:', exc.code, flush=True)
            print('Server details:', json.dumps(exc.details, ensure_ascii=False, default=str), flush=True)
            reproduced = exc.code == 51091 and 'regular expression is too large' in str(exc)
            print('Expected regex-size failure reproduced:', reproduced, flush=True)
            if not reproduced:
                raise
    finally:
        update = {'$set': {'admin_only': raw['admin_only']}} if 'admin_only' in raw else {'$unset': {'admin_only': ''}}
        restored = db.index.update_one({'_id': raw['_id']}, update)
        if restored.matched_count != 1:
            raise RuntimeError('Could not restore the original flag')
        text.admin_only_titles(force_refresh=True)
        print('\nRESTORED original flag; hidden indexes remaining:', db.index.count_documents({'admin_only': True}), flush=True)
    print('AFTER RESTORATION: Link objects loaded:', fetch(), flush=True)
    if reproduced:
        print('\nCONFIRMED: the same ORM lookup works before/after, and fails with only this book hidden.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        worker()
        return
    base = ['kubectl', '--context', CONTEXT, '-n', 'default']
    rollout = json.loads(subprocess.check_output(base + ['get', 'rollout', 'hidden-links-pr-web', '-o', 'json'], text=True))
    selector = ','.join(f'{k}={v}' for k,v in rollout['spec']['selector']['matchLabels'].items())
    pods = json.loads(subprocess.check_output(base + ['get', 'pods', '-l', selector, '-o', 'json'], text=True))['items']
    ready = [p for p in pods if not p['metadata'].get('deletionTimestamp') and any(c['type']=='Ready' and c['status']=='True' for c in p['status'].get('conditions', []))]
    if not ready:
        raise SystemExit('No ready PR cauldron web pod')
    pod = sorted(ready, key=lambda p:p['metadata']['name'])[0]['metadata']['name']
    print('Running actual PR code remotely in', pod, flush=True)
    print('Please let this short test finish so it can restore the flag.', flush=True)
    with pathlib.Path(__file__).open('rb') as source:
        subprocess.run(base + ['exec', '-i', pod, '-c', 'web', '--', 'python', '-u', '-', '--worker'], stdin=source, check=True)


if __name__ == '__main__':
    main()
