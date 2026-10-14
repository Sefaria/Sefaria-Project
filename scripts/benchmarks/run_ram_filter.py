"""Stream exact checkout sources into an isolated process in the existing cauldron.

Requires kubectl credentials and the earlier benchmark's fixture/config directory.
Does not replace application files or modify the running web process.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import runpy
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--fixture-dir', type=pathlib.Path, required=True)
p.add_argument('--output', type=pathlib.Path, required=True)
p.add_argument('--counts', type=int, nargs='+', default=[0, 10, 100, 150, 1000])
a = p.parse_args()
config = runpy.run_path(str(a.fixture_dir / 'hidden_books_experiment.py'))
assert all(0 <= n <= len(config['BOOK_TITLES']) for n in a.counts)
a.output.mkdir(parents=True, exist_ok=False)
base = ['kubectl', '--context', 'gke_development-205018_us-east1-b_cluster-1', '-n', 'default']
pods = json.loads(subprocess.check_output(base + ['get', 'pods', '-l', 'app=web-hidden-links-pr', '-o', 'json']))['items']
ready = [p for p in pods if not p['metadata'].get('deletionTimestamp') and any(c['type']=='Ready' and c['status']=='True' for c in p['status'].get('conditions', []))]
assert len(ready) == 1, 'Require one stable ready benchmark pod'
pod = ready[0]
command = base + ['exec', '-i', pod['metadata']['name'], '-c', 'web', '--', 'python', '-u', '-']
sources = {name: (ROOT / path).read_text() for name, path in {
    'sefaria.model.abstract': 'sefaria/model/abstract.py',
    'sefaria.model.ram_link_set': 'sefaria/model/ram_link_set.py',
}.items()}
bootstrap = '''import importlib.abc, importlib.util, sys
class CheckoutLoader(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def find_spec(self, fullname, path=None, target=None):
        if fullname in SOURCES and fullname != 'sefaria.model.abstract':
            return importlib.util.spec_from_loader(fullname, self)
    def create_module(self, spec):
        return None
    def exec_module(self, module):
        exec(compile(SOURCES[module.__name__], '<checkout:' + module.__name__ + '>', 'exec'), module.__dict__)
sys.meta_path.insert(0, CheckoutLoader())
'''
worker = 'TEST_SOURCE = ' + repr((ROOT/'sefaria/model/tests/ram_link_set_test.py').read_text()) + '\n' + 'SOURCES = ' + repr(sources) + '\n' + bootstrap + (ROOT/'scripts/benchmarks/ram_filter_worker.py').read_text()
(a.output/'worker.py').write_text(worker)
(a.output/'experiment.json').write_text(json.dumps({'counts':a.counts, 'titles':config['BOOK_TITLES'], 'pod':pod['metadata']['name'], 'containers':pod['status']['containerStatuses'], 'source_sha256':{k:hashlib.sha256(v.encode()).hexdigest() for k,v in sources.items()}, 'timing':'construction + fetch + decode + RAM filtering if selected + hydration; cache refresh separate; median of 6 after warm-up'}, indent=2))
def run(name, source, options=()):
    events = []
    with (a.output/(name+'.jsonl')).open('w') as out, (a.output/(name+'.stderr')).open('w') as err:
        proc = subprocess.Popen(command + list(options), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=err, text=True)
        proc.stdin.write(source); proc.stdin.close()
        for line in proc.stdout:
            out.write(line); out.flush()
            if line.startswith('BENCH='):
                events.append(json.loads(line[6:]))
                print(name, line[6:].strip(), flush=True)
        if proc.wait():
            raise RuntimeError(f'{name} failed; see {a.output/(name+".stderr")}')
    if name.startswith('count-'):
        # A successful transport exit alone does not establish a complete run.
        assert sum(r['kind'] == 'trial' for r in events) == 63, 'Incomplete trial stream: ' + name
        assert sum(r['kind'] == 'summary' for r in events) == 9, 'Incomplete summaries: ' + name
        assert any(r['kind'] == 'pagination_tests' and r['passed'] for r in events), 'Missing correctness checks: ' + name
fixture = (a.fixture_dir/'set_hidden_books_fixture.py').read_text()
try:
    for count in a.counts:
        print('Setting hidden indexes:', count, flush=True)
        run(f'fixture-{count}', fixture, ['--expected-db','sefaria-hidden-links-pr','--titles-json',json.dumps(config['BOOK_TITLES'][:count])])
        run(f'count-{count}', worker)
finally:
    print('Restoring original flags', flush=True)
    run('fixture-restored', fixture, ['--expected-db','sefaria-hidden-links-pr','--count','0'])
print('Results:', a.output, flush=True)
