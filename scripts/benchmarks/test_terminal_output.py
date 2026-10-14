"""Offline checks for display aggregation and literal query rendering."""
import io
import pathlib
import tempfile
import unittest
from terminal_output import Dashboard, Console, compact


class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.display = Dashboard(pathlib.Path(self.tmp.name), plain=True)

    def measurement(self, env, value, warmup=False, error=False):
        row = dict(kind='explain', mode='filtered' if env=='pr' else 'baseline', warmup=warmup)
        if error:
            row.update(error='OperationFailure', message='regex too large')
        else:
            row['stats'] = dict(executionTimeMillis=value, nReturned=10, totalDocsExamined=20, totalKeysExamined=0)
        self.display.event(env, row)

    def test_warmup_errors_and_cauldron_separation(self):
        self.measurement('pr', 9999, warmup=True)
        self.measurement('pr', 10)
        self.measurement('pr', 30)
        self.measurement('pr', 0, error=True)
        self.measurement('control', 2)
        pr = self.display.results('pr')[0]
        self.assertEqual((pr['median_ms'], pr['trials'], pr['errors']), (20, 3, 1))
        self.assertEqual(self.display.results('control')[0]['median_ms'], 2)

    def test_all_failures_have_no_success_latency(self):
        self.measurement('pr', 0, error=True)
        self.assertIsNone(self.display.results('pr')[0]['median_ms'])

    def test_filtered_query_remains_visible(self):
        for mode in ('filtered', 'baseline'):
            self.display.event('pr', dict(kind='query', mode=mode, command={'filter':{'literal':'[red]'}}, hidden_alias_count=1, query_bytes=30))
        self.assertEqual(self.display.states['pr']['query']['mode'], 'filtered')
        if Console:
            for width in (80, 160):
                stream = io.StringIO()
                console = Console(file=stream, width=width, color_system=None)
                console.print(self.display)
                text = stream.getvalue()
                self.assertIn('[red]', text)
                self.assertIn('MASTER', text)
                self.assertIn('PR #3784', text)
                if width == 160:
                    self.assertTrue(any('MASTER' in line and 'PR #3784' in line for line in text.splitlines()))

    def test_preview_marks_truncation(self):
        self.assertIn('preview; full query in JSONL', compact({'regex':'x'*1000}, budget=80))


if __name__ == '__main__':
    unittest.main()
