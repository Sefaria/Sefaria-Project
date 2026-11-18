import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, type DataRouter } from 'react-router';
import { RouterProvider } from 'react-router';
import { axe } from 'vitest-axe';
import type { DocPayload, PagePayload } from '../contracts';
import { fetchPagePayload, PAGE_JSON_URL, rememberNavTree, resetNavTrees } from './loader';
import { createRoutes, PAGE_ROUTE_ID } from './routes';

const FIXTURES = resolve(import.meta.dirname, '../../../devportal/contracts/fixtures/shapes/page-payload');

function fixture<T extends PagePayload = PagePayload>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as T;
}

type Responses = Record<string, unknown>;

/** Answers /_portal/page.json?path=… and other GETs from `responses`, keyed by path (or URL). */
function mockFetch(responses: Responses) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.pathname + url.search);
    const key = url.pathname === PAGE_JSON_URL ? url.searchParams.get('path')! : url.pathname;
    if (!(key in responses)) return new Response('missing', { status: 500 });
    return new Response(JSON.stringify(responses[key]), { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function renderRouter(initialPath: string, initial: PagePayload | null): DataRouter {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: [initialPath],
    hydrationData: initial ? { loaderData: { [PAGE_ROUTE_ID]: initial } } : undefined,
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetNavTrees();
  document.title = '';
});

describe('router and page loader', () => {
  it('renders the data island payload without a request', async () => {
    const calls = mockFetch({});
    const doc = fixture<DocPayload>('doc');
    renderRouter(doc.path, doc);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(doc.page.title);
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('article')).toHaveTextContent('What is Sefaria?');
    expect(document.title).toBe(doc.title);
    expect(calls).toEqual([]);
  });

  it('loads /_portal/page.json on navigation', async () => {
    const endpoint = fixture('endpoint');
    const calls = mockFetch({ [endpoint.path]: endpoint });
    const doc = fixture<DocPayload>('doc');
    const router = renderRouter(doc.path, doc);
    await act(() => router.navigate(endpoint.path));
    expect(await screen.findByRole('heading', { level: 1, name: 'Texts (v3)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'API Reference' })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Texts (v3)');
    expect(calls).toEqual([`${PAGE_JSON_URL}?path=${encodeURIComponent(endpoint.path)}`]);
  });

  it('follows a redirect payload (301 /docs → /docs/welcome)', async () => {
    const doc = fixture<DocPayload>('doc');
    const calls = mockFetch({ '/docs': fixture('redirect-permanent'), '/docs/welcome': doc });
    const router = renderRouter('/docs', null);
    await waitFor(() => expect(router.state.location.pathname).toBe('/docs/welcome'));
    expect(await screen.findByRole('heading', { level: 1, name: doc.page.title })).toBeInTheDocument();
    expect(calls.map((call) => new URLSearchParams(call.split('?')[1]).get('path'))).toEqual([
      '/docs',
      '/docs/welcome',
    ]);
  });

  it('keeps the query across a redirect', async () => {
    mockFetch({ '/reference/text': fixture('redirect-tag-group'), '/reference/get-v3-texts': fixture('endpoint') });
    const router = renderRouter('/reference/text?x=1#query-params', null);
    await waitFor(() => expect(router.state.location.pathname).toBe('/reference/get-v3-texts'));
    expect(router.state.location.search).toBe('?x=1');
  });

  it('renders the 404 page for a notfound payload', async () => {
    const notfound = fixture('notfound');
    mockFetch({ '/docs/get-text': notfound });
    const doc = fixture<DocPayload>('doc');
    const router = renderRouter(doc.path, doc);
    await act(() => router.navigate('/docs/get-text'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
    ).toEqual(['/reference/get-v3-texts', '/docs/text-references', '/reference/get-lexicon-entry']);
    expect(document.title).toBe('404 Not Found');
    expect(screen.getByRole('navigation', { name: 'Primary navigation' }).querySelector('[aria-current]')).toBeNull();
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('shows a retry link when the payload cannot be loaded on the first page', async () => {
    mockFetch({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRouter('/docs/broken', null);
    expect(await screen.findByRole('alert')).toHaveTextContent('This page could not be loaded.');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/docs/broken');
  });
});

describe('sidebar trees across navigations (C3 PageNav.tree)', () => {
  it('sends the known generation and fills an omitted tree from the remembered one', async () => {
    const doc = fixture<DocPayload>('doc');
    rememberNavTree(doc);
    const unchanged = fixture<DocPayload>('doc-nav-unchanged');
    const calls = mockFetch({ [unchanged.path]: unchanged });
    const payload = (await fetchPagePayload(unchanged.path, new AbortController().signal)) as DocPayload;
    expect(calls[0]).toContain('nav=42');
    expect(payload.nav?.tree).toEqual(doc.nav!.tree);
  });

  it('fetches the tree when the client has none for the section', async () => {
    const doc = fixture<DocPayload>('doc');
    const unchanged = fixture<DocPayload>('doc-nav-unchanged');
    const calls = mockFetch({ [unchanged.path]: unchanged, '/_portal/nav/docs.json': doc.nav!.tree });
    const payload = (await fetchPagePayload(unchanged.path, new AbortController().signal)) as DocPayload;
    expect(calls).toEqual([`${PAGE_JSON_URL}?path=${encodeURIComponent(unchanged.path)}`, '/_portal/nav/docs.json']);
    expect(payload.nav?.tree).toEqual(doc.nav!.tree);
  });

  it('rejects an answer that is not a page payload', async () => {
    mockFetch({ '/docs/x': { hello: 'world' } });
    await expect(fetchPagePayload('/docs/x', new AbortController().signal)).rejects.toThrow('page payload');
  });
});
