// Harness only: writes reference-tree.json, the full reference sidebar as a C3 sidebar tree, from live's sidebar
// (`research/reference/data/sidebar-tree.txt`) and the methods in the golden operations list. The pixel harness and
// the Sidebar tests use it. Run: node src/shell/harness/make-reference-tree.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Item {
  id: number;
  kind: string;
  title: string;
  href: string;
  newTab: boolean;
  method: string | null;
  deprecated: boolean;
  children: Item[];
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../../..');
const lines = readFileSync(join(repo, 'docs/dev-portal/research/reference/data/sidebar-tree.txt'), 'utf8').split('\n');
const ops = (
  JSON.parse(readFileSync(join(repo, 'devportal/contracts/golden/operations.json'), 'utf8')) as {
    operations: { operationId: string; method: string }[];
  }
).operations;
const methods = new Map(ops.map((o) => [o.operationId, o.method]));

let id = 1000;
const categories: { id: number; title: string; items: Item[] }[] = [];
for (const line of lines) {
  const heading = /^# (.+)$/.exec(line);
  if (heading) {
    categories.push({ id: id++, title: (heading[1] ?? '').trim(), items: [] });
    continue;
  }
  const row = /^( *)- (.+?) \| (\S+) \| type=(\w+) .*?dep=(True|False)/.exec(line);
  if (!row) continue;
  const [, indent = '', title = '', href = '', type = '', dep = ''] = row;
  const depth = indent.length / 2;
  const slug = href.split('/').pop() ?? '';
  const endpoint = type === 'endpoint';
  const item: Item = {
    id: id++,
    kind: endpoint ? 'endpoint' : 'page',
    title,
    href,
    newTab: false,
    method: endpoint ? (methods.get(slug) ?? 'get') : null,
    deprecated: dep === 'True',
    children: [],
  };
  const items = categories.at(-1)?.items;
  if (!items) continue;
  const parent = items.at(-1);
  if (depth === 0 || !parent) items.push(item);
  else {
    parent.children.push(item);
    // Tag groups (`/reference/text`) are pages with an empty body whose children are endpoints.
    parent.kind = parent.children.every((c) => c.kind === 'endpoint') ? 'tag_group' : 'page';
  }
}

const tree = { contractVersion: 1, section: 'reference', generation: 1, categories };
writeFileSync(join(here, 'reference-tree.json'), JSON.stringify(tree, null, 2) + '\n');
