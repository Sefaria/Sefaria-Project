// Proves the pagination rule of pager.ts against live: research/site/pages.json records, for every
// page, the prev/next links live shows. The inputs are live's sidebar files (vendored in
// devportal/migration_source/live/) and the source front matter (devportal/migration_source/).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SidebarItem, SidebarTree } from '../contracts';
import { NO_PAGER, flattenPages, pagerFor } from './pager';
import { REPO, readJson } from './test-utils';

interface LivePage {
  slug: string;
  title: string;
  type: string;
  hidden: boolean;
  deprecated: boolean;
  link_external?: boolean;
  pages: LivePage[];
}

interface LiveCategory {
  title?: string;
  pages: LivePage[];
}

interface PagesJsonEntry {
  url: string;
  status: number;
  pagination: { t: string; h: string }[];
}

let nextId = 1;
function toItem(section: string, page: LivePage): SidebarItem {
  return {
    id: nextId++,
    kind: page.type === 'link' ? 'link' : 'page',
    title: page.title,
    href: `/${section}/${page.slug}`,
    newTab: false,
    method: null,
    deprecated: page.deprecated,
    children: page.pages.filter((p) => !p.hidden).map((p) => toItem(section, p)),
  } as SidebarItem;
}

function liveTree(section: 'docs' | 'reference'): SidebarTree {
  const cats = readJson<LiveCategory[]>(`devportal/migration_source/live/sidebar-${section}.json`);
  return {
    contractVersion: 1,
    section,
    generation: 1,
    categories: cats.map((c, i) => ({
      id: 10_000 + i,
      title: c.title ?? '',
      items: c.pages.filter((p) => !p.hidden).map((p) => toItem(section, p)),
    })),
  };
}

/** Every source Markdown file by slug (a folder's index.md is the folder's page). */
function sourceFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'index.md') out.set(dir.split('/').pop()!, full);
      else if (name.endsWith('.md')) out.set(name.slice(0, -3), full);
    }
  };
  walk(resolve(REPO, 'devportal/migration_source/docs'));
  walk(resolve(REPO, 'devportal/migration_source/reference'));
  return out;
}

/** Whether the front matter's `next:` block lists at least one page. */
function hasNextPages(markdown: string): boolean {
  const fm = /^---\r?\n([\s\S]*?)\n---(?:\r?\n|$)/.exec(markdown)?.[1] ?? '';
  const lines = fm.split('\n');
  const start = lines.findIndex((l) => /^next:\s*$/.test(l));
  if (start < 0) return false;
  for (let i = start + 1; i < lines.length && /^\s/.test(lines[i]!); i++) {
    if (/^\s+pages:\s*$/.test(lines[i]!) && /^\s+-\s/.test(lines[i + 1] ?? '')) return true;
  }
  return false;
}

const pages = readJson<PagesJsonEntry[]>('docs/dev-portal/research/site/pages.json').filter((p) => p.status === 200);
const docsTree = liveTree('docs');
const files = sourceFiles();

describe('pagination rule (pages.json)', () => {
  const docs = pages.filter((p) => new URL(p.url).pathname.startsWith('/docs/'));

  it('covers every visible docs page', () => {
    expect(docs).toHaveLength(59);
    expect(flattenPages(docsTree)).toHaveLength(59);
  });

  it.each(docs.map((p) => [decodeURIComponent(new URL(p.url).pathname), p] as const))(
    '%s shows the prev/next links live shows',
    (path, entry) => {
      const slug = path.split('/').pop()!;
      const file = files.get(slug);
      expect(file, `source file for ${slug}`).toBeDefined();
      const pager = pagerFor(docsTree, path, hasNextPages(readFileSync(file!, 'utf8')));
      const shown = [pager.prev, pager.next].filter((l) => l !== null).map((l) => ({ t: l!.title, h: l!.path }));
      expect(shown).toEqual(entry.pagination.map((l) => ({ t: l.t, h: decodeURIComponent(l.h) })));
    }
  );

  it('the reference guide and the custom page show none', () => {
    const ref = pages.find((p) => p.url.endsWith('/reference/getting-started'))!;
    expect(ref.pagination).toEqual([]);
    expect(hasNextPages(readFileSync(files.get('getting-started')!, 'utf8'))).toBe(true);
    expect(pagerFor(liveTree('reference'), '/reference/getting-started', true)).toEqual(NO_PAGER);
    const contact = pages.find((p) => p.url.endsWith('/page/contact-us'))!;
    expect(contact.pagination).toEqual([]);
  });

  it('skips link items and crosses categories', () => {
    const flat = flattenPages(docsTree).map((p) => p.path);
    expect(flat).not.toContain('/docs/helpful-link-somewhere-else');
    const mcp = pagerFor(docsTree, '/docs/the-sefaria-mcp', false);
    expect(mcp.prev?.path).toBe('/docs/sites-using-the-linker');
    const last = pagerFor(docsTree, '/docs/how-to-report-a-mistake', false);
    expect(last.next).toBeNull();
    expect(pagerFor(docsTree, '/docs/nope', false)).toEqual(NO_PAGER);
  });
});
