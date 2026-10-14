"""Run after loading the exact PR sources in a disposable cauldron process."""
import gc
import hashlib
import json
import os
import random
import statistics
import time

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')
from django.conf import settings
settings.SHOW_ADMIN_ONLY_BOOKS = True
import django
django.setup()
from sefaria.model import LinkSet, text
# Apply only the two exact PR methods to the deployed base class, preserving
# unrelated newer master methods required by this cauldron's startup.
import ast
import inspect
import textwrap
from sefaria.model import abstract
new_class = next(n for n in ast.parse(SOURCES['sefaria.model.abstract']).body if isinstance(n, ast.ClassDef) and n.name == 'AbstractMongoSet')
methods = [n for n in new_class.body if isinstance(n, ast.FunctionDef) and n.name in ('__init__', '_visibility_filter')]
old_init = inspect.getsource(abstract.AbstractMongoSet.__init__).replace('self.recordClass.visibility_filter()', 'self._visibility_filter()')
assert ast.dump(ast.parse(textwrap.dedent(old_init)).body[0]) == ast.dump(next(n for n in methods if n.name == '__init__')), 'Unexpected deployed constructor drift'
namespace = dict(abstract.__dict__)
exec(compile(ast.Module(body=methods, type_ignores=[]), '<exact-pr-methods>', 'exec'), namespace)
for method in methods:
    setattr(abstract.AbstractMongoSet, method.name, namespace[method.name])
from sefaria.model.ram_link_set import RAMFilteredLinkSet, hidden_ref
import unittest
suite_namespace = {'__name__': 'ram_regression_tests'}
exec(TEST_SOURCE, suite_namespace)
suite = unittest.defaultTestLoader.loadTestsFromTestCase(suite_namespace['RAMLinkSetTests'])
assert unittest.TextTestRunner().run(suite).wasSuccessful(), 'Regression tests failed' 
from sefaria.system.database import db
assert db.name == 'sefaria-hidden-links-pr', db.name


def emit(**row):
    print('BENCH=' + json.dumps(row), flush=True)


# Boundary equivalence, including aliases, literal metacharacters and Unicode.
import re
sample = ('Book', 'Book, Part', 'A+B', 'ספר', 'Standalone')
pattern = re.compile('^(?:' + '|'.join(re.escape(t) for t in sample) + ')(?:[ ,]|$)')
for title in sample + ('Bookish', 'Public', 'AAB'):
    for suffix in ('', ' 1:2', ', Part', ':1', '\n', 'X'):
        value = title + suffix
        assert hidden_ref(value, frozenset(sample)) == bool(pattern.search(value)), value
emit(kind='boundary_tests', passed=True)
settings.SHOW_ADMIN_ONLY_BOOKS = False
start = time.perf_counter()
titles = text.admin_only_titles(force_refresh=True)
emit(kind='metadata', hidden_indexes=db.index.count_documents({'admin_only': True}),
     aliases=len(titles), refresh_ms=(time.perf_counter()-start)*1000,
     mongo_version=db.command('buildInfo')['version'])
# Hold the same title-cache snapshot for the duration of this short experiment.
# Normal implementation retains its 60-second TTL; refresh is measured separately.
original_titles = text.admin_only_titles
text.admin_only_titles = lambda *a, **k: titles
rng = random.Random(3784)
queries = [('segment', {'refs': 'Genesis 1:1'}),
           ('genesis', {'refs': {'$regex': '^Genesis(?:[ ,]|$)'}}),
           ('all-10000', {})]
for name, query in queries:
    measures = []
    expected = None
    for repeat in range(7):
        modes = ['baseline', 'mongo', 'ram']
        rng.shuffle(modes)
        for mode in modes:
            settings.SHOW_ADMIN_ONLY_BOOKS = mode == 'baseline'
            gc.collect()
            start = time.perf_counter()
            cls = RAMFilteredLinkSet if mode == 'ram' else LinkSet
            records = cls(query, limit=10000)
            records.raw_records = records.raw_records.max_time_ms(30000)
            objects = records.array()
            elapsed = (time.perf_counter()-start)*1000
            ids = [str(obj._id) for obj in objects]
            digest = hashlib.sha256('\n'.join(ids).encode()).hexdigest()
            if mode != 'baseline':
                if expected is None:
                    expected = ids
                assert ids == expected, (name, mode, 'ordered result mismatch')
            row = dict(kind='trial', case=name, mode=mode, repeat=repeat,
                       warmup=repeat == 0, elapsed_ms=elapsed, returned=len(ids),
                       ids_sha256=digest, candidates_examined=getattr(records, 'candidates_examined', None))
            emit(**row)
            if repeat:
                measures.append(row)
            records.raw_records.close()
            del objects, records
    for mode in ('baseline', 'mongo', 'ram'):
        rows = [r for r in measures if r['mode'] == mode]
        emit(kind='summary', case=name, mode=mode, median_ms=statistics.median(r['elapsed_ms'] for r in rows),
             min_ms=min(r['elapsed_ms'] for r in rows), max_ms=max(r['elapsed_ms'] for r in rows),
             returned=rows[0]['returned'], trials=len(rows))
# Visible pagination, empty result, count, indexing, iteration reuse and Ref inputs.
settings.SHOW_ADMIN_ONLY_BOOKS = False
for query in ({'refs': 'Genesis 1:1'}, {'_id': {'$exists': False}}, text.Ref('Genesis 1:1')):
    for page in (0, 1, 3):
        a = LinkSet(query, page=page, limit=7)
        b = RAMFilteredLinkSet(query, page=page, limit=7)
        a.raw_records = a.raw_records.max_time_ms(30000)
        b.raw_records = b.raw_records.max_time_ms(30000)
        assert [x._id for x in a] == [x._id for x in b]
        assert b.count() == len(b.array()) == len(b)
        assert list(b) == b.array()
        if b.count():
            assert b[0] is b.array()[0]
        a.raw_records.close()
emit(kind='pagination_tests', passed=True)
text.admin_only_titles = original_titles
