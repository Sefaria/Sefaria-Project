import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SearchDocuments } from '../contracts';
import { SearchIndex, clearSearchIndexCache, highlight, loadSearchIndex, windowAround } from './engine';
import { TEST_DOCUMENTS } from './testDocs';

const SAMPLE = resolve(
  import.meta.dirname,
  '../../../devportal/contracts/fixtures/shapes/search-documents/sample.json'
);

describe('SearchIndex', () => {
  const index = new SearchIndex(TEST_DOCUMENTS);

  it('returns nothing and zero counts for an empty query', () => {
    expect(index.search('   ')).toEqual({ hits: [], counts: { all: 0, docs: 0, reference: 0, page: 0 } });
  });

  it('matches prefixes and counts per section', () => {
    const { hits, counts } = index.search('ref');
    expect(counts).toEqual({ all: hits.length, docs: 2, reference: 21, page: 0 });
    expect(hits.map((h) => h.id)).toContain('op:post-find-refs');
  });

  it('ranks a title match above a body match (title boost)', () => {
    const { hits } = index.search('linker');
    expect(hits[0]?.title).toBe('The Sefaria Linker');
  });

  it('tolerates one typo in a longer word', () => {
    expect(index.search('calendrs').hits.map((h) => h.id)).toEqual(['op:get-calendars']);
    expect(index.search('cxt').hits).toEqual([]);
  });

  it('searches parameter and response descriptions', () => {
    expect(index.search('diaspora').hits.map((h) => h.id)).toEqual(['op:get-calendars']);
    const name = index.search('canonical').hits[0];
    expect(name?.id).toBe('op:get-name');
    expect(name?.snippet).toMatchObject({ kind: 'response', status: '200' });
  });

  it('builds snippets: title for endpoint title hits, the API path, then body windows', () => {
    const { hits } = index.search('ref');
    const byId = new Map(hits.map((h) => [h.id, h]));
    const text = (id: string) =>
      byId
        .get(id)
        ?.snippet.parts.map((p) => p.text)
        .join('');
    expect(text('op:get-ref')).toBe('Ref');
    expect(byId.get('op:get-ref')?.method).toBe('get');
    expect(text('page:1')).toContain('refer');
    const highlighted = byId
      .get('page:1')
      ?.snippet.parts.filter((p) => p.match)
      .map((p) => p.text.toLowerCase());
    expect(highlighted?.[0]).toMatch(/^ref/);
  });

  it('falls back to OR when every term together matches nothing', () => {
    expect(index.search('welcome zzzz').hits.map((h) => h.id)).toEqual(['page:3']);
  });
});

describe('snippet helpers', () => {
  it('highlights every occurrence, case-insensitively, longest term first', () => {
    expect(highlight('Refs and ref', ['refs', 'ref'])).toEqual([
      { text: 'Refs', match: true },
      { text: ' and ', match: false },
      { text: 'ref', match: true },
    ]);
  });

  it('cuts a window around the first match', () => {
    const long = `${'lorem '.repeat(40)}needle ${'ipsum '.repeat(60)}`;
    const window = windowAround(long, ['needle']);
    expect(window?.startsWith('…')).toBe(true);
    expect(window?.endsWith('…')).toBe(true);
    expect(window).toContain('needle');
    expect(windowAround('nothing here', ['needle'])).toBeNull();
  });
});

describe('loadSearchIndex', () => {
  afterEach(() => clearSearchIndexCache());

  it('fetches the C3 file once per URL and indexes its documents', async () => {
    const file = JSON.parse(readFileSync(SAMPLE, 'utf8')) as SearchDocuments;
    const fetcher = vi.fn(async () => new Response(JSON.stringify(file), { status: 200 }));
    const url = '/_portal/search-docs.3f9a2c41d0b7.json';
    const [a, b] = await Promise.all([loadSearchIndex(url, fetcher), loadSearchIndex(url, fetcher)]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(url, { credentials: 'same-origin' });
    expect(a.search('texts').hits.map((h) => h.id)).toContain('op:get-v3-texts');
  });

  it('does not cache a failure', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 404 }));
    await expect(loadSearchIndex('/x.json', fetcher)).rejects.toThrow('HTTP 404');
    await expect(loadSearchIndex('/x.json', fetcher)).rejects.toThrow('HTTP 404');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
