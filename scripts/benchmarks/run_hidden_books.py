"""Local launcher for live hidden-book query measurements. Python standard library only."""
import argparse
import datetime
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CONTEXT = 'gke_development-205018_us-east1-b_cluster-1'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--environment', choices=['pr', 'control'], default='pr')
    p.add_argument('--execution', choices=['cauldron', 'local'], default='cauldron',
                   help='Local uses this Python interpreter and checkout settings; cauldron streams the script to the existing pod.')
    p.add_argument('--query', default='{"refs":"Genesis 1:1"}')
    p.add_argument('--limit', type=int, default=10000)
    p.add_argument('--repeats', type=int, default=6)
    p.add_argument('--max-time-ms', type=int, default=30000)
    p.add_argument('--full-scan', action='store_true', help='Measure entire collection server-side only, without transferring millions of records.')
    p.add_argument('--counts', type=int, nargs='+', help='Change experimental Index flags through these counts; restore original fixture in finally. Omit for read-only measurements.')
    p.add_argument('--output', type=pathlib.Path, help='New results directory (must not already exist).')
    args = p.parse_args()
    try:
        query = json.loads(args.query)
    except ValueError as exc:
        p.error(str(exc))
    if not isinstance(query, dict):
        p.error('--query must be a JSON object')
    if min(args.limit, args.repeats, args.max_time_ms) <= 0:
        p.error('limit, repeats and max-time-ms must be positive')
    if args.counts is not None and (args.environment != 'pr' or min(args.counts) < 0):
        p.error('--counts requires the pr environment and nonnegative counts')
    db = 'sefaria-hidden-links-' + args.environment
    if args.execution == 'cauldron':
        base = ['kubectl', '--context', CONTEXT, '-n', 'default']
        deployment = subprocess.check_output(base + ['get', 'rollout', 'hidden-links-' + args.environment + '-web', '-o', 'json'], text=True)
        selector = json.loads(deployment)['spec']['selector']['matchLabels']
        pods = json.loads(subprocess.check_output(base + ['get', 'pods', '-l', ','.join(f'{k}={v}' for k,v in selector.items()), '-o', 'json'], text=True))['items']
        ready = [x for x in pods if not x['metadata'].get('deletionTimestamp') and any(c['type']=='Ready' and c['status']=='True' for c in x['status'].get('conditions', []))]
        if not ready:
            p.error('No ready web pod found in the selected benchmark cauldron')
        pod = sorted(ready, key=lambda x:x['metadata']['name'])[0]['metadata']['name']
        command = base + ['exec', '-i', pod, '-c', 'web', '--', 'python', '-u', '-']
        print(f'Execution: cauldron pod {pod}; database {db}', flush=True)
    else:
        command = [sys.executable, '-u', '-']
        print(f'Execution: local interpreter {sys.executable}; configured DB must be {db}', flush=True)
    out = args.output or pathlib.Path('hidden-books-runs') / datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    out.mkdir(parents=True, exist_ok=False)
    (out/'run.json').write_text(json.dumps(dict(vars(args), output=str(out), command=command, expected_db=db), indent=2, default=str)+'\n')
    print(f'Complete queries and measurements appear below. Raw JSONL: {out.resolve()}\n', flush=True)

    def run(script, name, options):
        print(f'\n>>> {name}', flush=True)
        with (HERE/script).open('rb') as src, (out/(name+'.jsonl')).open('wb') as dst:
            subprocess.run(command + ['--expected-db', db] + options, stdin=src, stdout=dst, cwd=ROOT, check=True)
        if script == 'set_hidden_books_fixture.py':
            print((out/(name+'.jsonl')).read_text(), flush=True)

    options = ['--verbose', '--query', args.query, '--limit', str(args.limit), '--repeats', str(args.repeats), '--max-time-ms', str(args.max_time_ms)]
    if args.environment == 'control':
        options += ['--mode', 'baseline']
    if args.full_scan:
        options += ['--full-scan', '--explain-only']
    try:
        for position, count in enumerate(args.counts if args.counts is not None else [None]):
            if count is not None:
                run('set_hidden_books_fixture.py', f'{position:02}-fixture-{count}', ['--count', str(count)])
            run('hidden_books_links.py', f'{position:02}-measure-{count if count is not None else "current"}', options)
    finally:
        if args.counts is not None:
            print('\nRestoring original fixture flags. If interrupted again or disconnected, run the recovery command in README.', flush=True)
            run('set_hidden_books_fixture.py', 'fixture-restored', ['--count', '0'])
    print(f'\nFinished. Results: {out.resolve()}', flush=True)


if __name__ == '__main__':
    main()
