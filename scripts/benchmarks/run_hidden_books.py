"""Local launcher for live hidden-book query measurements. Python standard library only."""
import argparse
import datetime
import json
import pathlib
import runpy
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CONTEXT = 'gke_development-205018_us-east1-b_cluster-1'


def main():
    config = runpy.run_path(str(HERE / 'hidden_books_experiment.py'))
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--environment', choices=['pr', 'control'], default='pr')
    p.add_argument('--execution', choices=['cauldron', 'local'], default='cauldron',
                   help='Local uses this Python interpreter and checkout settings; cauldron streams the script to the existing pod.')
    p.add_argument('--query', help='Override the configured suite with one JSON query.')
    p.add_argument('--limit', type=int, default=config['LIMIT'])
    p.add_argument('--repeats', type=int, default=config['REPEATS'])
    p.add_argument('--max-time-ms', type=int, default=config['MAX_TIME_MS'])
    p.add_argument('--full-scan', action='store_true', help='Measure entire collection server-side only, without transferring millions of records.')
    p.add_argument('--counts', type=int, nargs='+', help='Override configured counts; hides the first N explicit BOOK_TITLES entries.')
    p.add_argument('--output', type=pathlib.Path, help='New results directory (must not already exist).')
    p.add_argument('--read-only', action='store_true', help='Run the queries using current flags without changing them.')
    p.add_argument('--restore-only', action='store_true', help='Restore original fixture flags and exit.')
    p.add_argument('--show-plan', action='store_true', help='Print the complete experiment configuration without connecting or changing anything.')
    args = p.parse_args()
    if args.query is not None:
        try:
            query = json.loads(args.query)
        except ValueError as exc:
            p.error(str(exc))
        cases = [{'name': 'custom', 'query': query}]
    else:
        cases = config['QUERIES']
    if not cases or any(not isinstance(c.get('query'), dict) for c in cases):
        p.error('Each configured query must be a JSON object; configure at least one query')
    if min(args.limit, args.repeats, args.max_time_ms) <= 0:
        p.error('limit, repeats and max-time-ms must be positive')
    titles = config['BOOK_TITLES']
    if any(not isinstance(t, str) or not t for t in titles) or len(set(titles)) != len(titles):
        p.error('BOOK_TITLES must contain unique nonempty strings')
    if args.counts is not None and (args.read_only or args.environment == 'control' or args.restore_only):
        p.error('--counts cannot be combined with read-only, control, or restore-only')
    if args.restore_only and (args.environment != 'pr' or args.read_only):
        p.error('--restore-only requires the writable pr environment')
    counts = args.counts if args.counts is not None else config['FLAG_COUNTS']
    if not args.restore_only and (not counts or any(type(n) is not int or not 0 <= n <= len(titles) for n in counts)):
        p.error('Each flag count must be between zero and the length of BOOK_TITLES')
    change_flags = args.environment == 'pr' and not args.read_only
    plan = {'queries': cases, 'flag_counts': counts if change_flags else None,
            'book_titles': titles, 'repeats': args.repeats, 'limit': args.limit,
            'max_time_ms': args.max_time_ms, 'full_scan_override': args.full_scan,
            'change_flags': change_flags, 'restore_only': args.restore_only}
    if args.show_plan:
        print(json.dumps(plan, indent=2, ensure_ascii=False))
        return
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
    (out/'experiment.json').write_text(json.dumps(plan, indent=2, ensure_ascii=False)+'\n')
    (out/'hidden_books_experiment.py').write_bytes((HERE/'hidden_books_experiment.py').read_bytes())
    print(f'Complete queries and measurements appear below. Raw JSONL: {out.resolve()}\n', flush=True)

    def run(script, name, options):
        print(f'\n>>> {name}', flush=True)
        with (HERE/script).open('rb') as src, (out/(name+'.jsonl')).open('wb') as dst:
            subprocess.run(command + ['--expected-db', db] + options, stdin=src, stdout=dst, cwd=ROOT, check=True)
        if script == 'set_hidden_books_fixture.py':
            print((out/(name+'.jsonl')).read_text(), flush=True)

    if args.restore_only:
        run('set_hidden_books_fixture.py', 'fixture-restored', ['--count', '0'])
        return
    print(f"Queries: {[c['name'] for c in cases]}; flag counts: {counts if change_flags else 'unchanged (read-only)'}", flush=True)
    try:
        for position, count in enumerate(counts if change_flags else [None]):
            if count is not None:
                selected = titles[:count]
                print(f'\nHiding {count} indexes (exact titles):\n' + json.dumps(selected, indent=2, ensure_ascii=False), flush=True)
                run('set_hidden_books_fixture.py', f'{position:02}-fixture-{count}', ['--titles-json', json.dumps(selected)])
            for case_number, case in enumerate(cases):
                print(f"\nQuery case: {case['name']}", flush=True)
                options = ['--verbose', '--query', json.dumps(case['query']), '--limit', str(args.limit), '--repeats', str(args.repeats), '--max-time-ms', str(args.max_time_ms)]
                if args.environment == 'control':
                    options += ['--mode', 'baseline']
                if args.full_scan or case.get('full_scan', False):
                    options += ['--full-scan', '--explain-only']
                run('hidden_books_links.py', f'{position:02}-count-{count if count is not None else "current"}-query-{case_number:02}', options)
    finally:
        if change_flags:
            print('\nRestoring original fixture flags. If interrupted again or disconnected, run with --restore-only.', flush=True)
            run('set_hidden_books_fixture.py', 'fixture-restored', ['--count', '0'])
    print(f'\nFinished. Results: {out.resolve()}', flush=True)


if __name__ == '__main__':
    main()
