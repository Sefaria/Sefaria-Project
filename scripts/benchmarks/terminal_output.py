"""Rich display of benchmark events; all full events remain in JSONL logs."""
import json
import os
import statistics
import time
try:
    from rich.console import Console, Group
    from rich.live import Live
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
except ImportError:
    Console = None

OPERATIONS = [('explain', 'MongoDB'), ('raw_stream', 'Raw fetch'), ('orm_hydration', 'ORM hydration')]


def compact(value, budget=650):
    text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return text if len(text) <= budget else text[:budget] + '… [preview; full query in JSONL]'


class Dashboard:
    def __init__(self, out, plain=False):
        self.out = out
        self.console = Console(highlight=False, markup=False, no_color='NO_COLOR' in os.environ) if Console else None
        self.enabled = bool(self.console and self.console.is_terminal and not plain)
        self.live = None
        self.title = 'Preparing experiment'
        self.status = 'Connecting'
        self.source = {}
        self.states = {}
        self.history = []
        self.begin('Starting', {}, None)

    def __enter__(self):
        if self.enabled:
            self.live = Live(self, console=self.console, refresh_per_second=4)
            self.live.start()
        elif not Console:
            print('Rich is not installed; using plain output. Install requirements-terminal.txt for panels.', flush=True)
        return self

    def __exit__(self, *exc):
        if self.live:
            self.live.stop()
        self.save()

    def begin(self, title, source, count):
        self.title = f'{title} · hidden indexes: {count if count is not None else "unchanged"}'
        self.source = source
        self.states = {env: {'status': 'Waiting', 'rows': [], 'query': None, 'since': time.monotonic(), 'active': False} for env in ('control', 'pr')}

    def note(self, message):
        self.status = message
        if not self.enabled:
            print(message, flush=True)

    def event(self, env, row):
        state = self.states[env]
        kind = row.get('kind')
        if kind == 'query':
            if row['mode'] == 'filtered' or state['query'] is None:
                state['query'] = row
            if not self.enabled:
                print(f'{env} / {row["mode"]} query: {compact(row["command"])}', flush=True)
        elif kind == 'start':
            state['status'] = f'{row["mode"]} · {"warm-up" if row["warmup"] else "round " + str(row["repeat"])} · {row["operation"]}'
            state['since'] = time.monotonic()
            state['active'] = True
        elif kind in dict(OPERATIONS):
            state['active'] = False
            state['rows'].append(row)
            state['status'] = 'Failed' if row.get('error') else 'Measurement complete'
            if not self.enabled:
                value = row.get('stats', {}).get('executionTimeMillis', row.get('elapsed_ms'))
                print(f'{env} / {row["mode"]} / {kind}: ' + (row.get('message') if row.get('error') else f'{value:.2f} ms'), flush=True)
        elif kind == 'metadata':
            state['mongo'] = row.get('mongo_version')
        if self.live:
            self.live.refresh()

    def results(self, env):
        rows = self.states[env]['rows']
        results = []
        for mode in ('baseline', 'filtered'):
            for kind, label in OPERATIONS:
                trials = [r for r in rows if r['mode'] == mode and r['kind'] == kind and not r['warmup']]
                good = [r for r in trials if not r.get('error')]
                values = [r['stats']['executionTimeMillis'] if kind == 'explain' else r['elapsed_ms'] for r in good]
                if trials:
                    results.append(dict(mode=mode, operation=label, trials=len(trials), errors=len(trials)-len(good), median_ms=statistics.median(values) if values else None,
                                        last_ms=values[-1] if values else None))
        return results

    def panel(self, env):
        state = self.states[env]
        query = state['query']
        parts = [Text(state['status'] + (f' · {time.monotonic()-state["since"]:.0f}s elapsed' if state['active'] else ''), style='cyan')]
        if query:
            parts += [Text(f'{query["mode"]}: {query["hidden_alias_count"]:,} title strings · {query["query_bytes"]:,} query bytes'),
                      Text(compact(query['command']), style='dim')]
        else:
            parts.append(Text('Query pending'))
        table = Table(expand=True, box=None)
        for name in ('Mode / operation', 'Last ms', 'Median ms', 'Errors'):
            table.add_column(name, justify='left' if name.startswith('Mode') else 'right')
        for r in self.results(env):
            table.add_row(Text(r['mode'] + ' / ' + r['operation']),
                          '—' if r['last_ms'] is None else f'{r["last_ms"]:.2f}',
                          '—' if r['median_ms'] is None else f'{r["median_ms"]:.2f}', f'{r["errors"]}/{r["trials"]}')
        parts.append(table)
        explanations = [r for r in state['rows'] if r['kind']=='explain' and not r.get('error')]
        if explanations:
            stats = explanations[-1]['stats']
            parts.append(Text(f'Latest {explanations[-1]["mode"]} explain: {stats["nReturned"]:,} returned · {stats["totalDocsExamined"]:,} docs examined · {stats["totalKeysExamined"]:,} keys'))
        errors = [r for r in state['rows'] if r.get('error')]
        if errors:
            parts.append(Text(errors[-1]['message'][:300], style='bold red'))
        return Panel(Group(*parts), title='MASTER · hidden-links-control' if env=='control' else 'PR #3784 · hidden-links-pr', border_style='blue' if env=='control' else 'magenta')

    def __rich_console__(self, console, options):
        panels = [self.panel(env) for env in ('control', 'pr')]
        table = Table.grid(expand=True)
        if options.max_width >= 100:
            table.add_column(ratio=1); table.add_column(ratio=1)
            table.add_row(*panels)
        else:
            table.add_column(); table.add_row(panels[0]); table.add_row(panels[1])
        ratios = []
        for operation, label in OPERATIONS:
            control = next((r['median_ms'] for r in self.results('control') if r['operation'] == label and r['mode'] == 'baseline'), None)
            filtered = next((r['median_ms'] for r in self.results('pr') if r['operation'] == label and r['mode'] == 'filtered'), None)
            if control and filtered is not None:
                ratios.append(f'{label}: {filtered/control:.2f}×')
        yield Group(Text(self.title, style='bold'), Text('Source query: '+compact(self.source)), table,
                    Text('PR filtered / master medians: ' + (' · '.join(ratios) or 'waiting for comparable measurements')),
                    Text(self.status, style='cyan'),
                    Text('Warm-up excluded · timings are separate operations · sequential cauldrons · full queries saved', style='dim'))

    def finish_case(self):
        self.history.append({'case': self.title, 'query': self.source, 'control': self.results('control'), 'pr': self.results('pr')})
        self.save()
        if self.enabled:
            self.console.print(self)

    def save(self):
        (self.out/'comparison.json').write_text(json.dumps(self.history, indent=2)+'\n')
