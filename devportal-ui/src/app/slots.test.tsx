import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type DataRouter } from 'react-router';
import type { DocPayload, PagePayload, SiteConfig } from '../contracts';
import projects from '../gallery/lib/__fixtures__/projects.json';
import { resetNavTrees } from './loader';
import { navigateTarget } from './links';
import { createRoutes, PAGE_ROUTE_ID, PAGE_SLOTS } from './routes';

// Count SearchLauncher mounts and keep the props of the latest render.
const launcher = vi.hoisted(() => ({
  mounts: 0,
  props: null as null | { docsUrl: string; onNavigate?: (p: string) => void },
}));
vi.mock('../search', async (importOriginal) => {
  const { useEffect } = await import('react');
  const original = await importOriginal<typeof import('../search')>();
  function SearchLauncher(props: { docsUrl: string; onNavigate?: (path: string) => void }) {
    launcher.props = props;
    useEffect(() => {
      launcher.mounts += 1;
    }, []);
    return <div data-testid="search-launcher" data-docs-url={props.docsUrl} />;
  }
  return { ...original, SearchLauncher };
});

const FIXTURES = resolve(import.meta.dirname, '../../../devportal/contracts/fixtures/shapes/page-payload');

function fixture<T extends PagePayload = PagePayload>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as T;
}

/** The fixture's site without GA4 ids, so the gallery does not load gtag in tests. */
function siteOf(payload: PagePayload): SiteConfig {
  if (payload.kind === 'redirect') throw new Error('no site');
  return { ...payload.site, ga4: {} };
}

function mockFetch(pages: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const key = url.pathname === '/_portal/page.json' ? url.searchParams.get('path')! : url.pathname;
    if (!(key in pages)) return new Response('missing', { status: 500 });
    return new Response(JSON.stringify(pages[key]), { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string, initial: PagePayload | null, site: SiteConfig | null): DataRouter {
  const hydration = initial && initial.kind !== 'redirect' ? { loaderData: { [PAGE_ROUTE_ID]: initial } } : undefined;
  const router = createMemoryRouter(createRoutes(PAGE_SLOTS, { site }), {
    initialEntries: [path],
    hydrationData: hydration,
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  launcher.mounts = 0;
  launcher.props = null;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetNavTrees();
});

describe('docs slots (W7)', () => {
  it('renders a docs page with DocPage: sidebar tree, article, table of contents, in main.dp-main', async () => {
    mockFetch({});
    const doc = fixture<DocPayload>('doc');
    renderAt(doc.path, doc, siteOf(doc));
    const main = await waitFor(() => {
      const el = document.querySelector('main.dp-main#dp-main');
      expect(el).not.toBeNull();
      return el!;
    });
    const sidebar = main.querySelector('.dp-docs__sidebar#dp-sidebar')!;
    expect(sidebar.querySelector('nav[aria-label="Secondary navigation"]')).not.toBeNull();
    expect(sidebar.querySelector('a[aria-current="page"]')).toHaveAttribute('href', doc.path);
    expect(main.querySelector('article#content h1')).toHaveTextContent(doc.page.title);
    expect(main.querySelector('#dp-article-body')).toHaveTextContent('What is Sefaria?');
    expect(screen.getByRole('navigation', { name: 'Table of Contents' })).toBeInTheDocument();
    // One article: the shell's PortalFrame is not used around DocPage.
    expect(document.querySelectorAll('article#content')).toHaveLength(1);
  });

  it('opens the sidebar panel from the mobile sub-nav button', async () => {
    mockFetch({});
    const doc = fixture<DocPayload>('doc');
    renderAt(doc.path, doc, siteOf(doc));
    const button = await screen.findByRole('button', { name: doc.page.title });
    expect(button).toHaveAttribute('aria-controls', 'dp-sidebar');
    expect(document.getElementById('dp-sidebar')).not.toHaveAttribute('data-open');
    act(() => button.click());
    expect(document.getElementById('dp-sidebar')).toHaveAttribute('data-open', 'true');
  });

  it('renders a custom page without sidebar or rail', async () => {
    mockFetch({});
    const custom = fixture<DocPayload>('doc-custom-page');
    renderAt(custom.path, custom, siteOf(custom));
    await screen.findByRole('heading', { level: 1, name: custom.page.title });
    expect(document.querySelector('.dp-docs--custom')).not.toBeNull();
    expect(document.querySelector('.dp-docs__sidebar')).toBeNull();
    expect(document.querySelector('.dp-docs__rail')).toBeNull();
  });
});

describe('search (W10)', () => {
  it('mounts SearchLauncher once, with the payload docs URL, across navigations', async () => {
    const doc = fixture<DocPayload>('doc');
    const endpoint = fixture('endpoint');
    mockFetch({ [endpoint.path]: endpoint });
    const router = renderAt(doc.path, doc, siteOf(doc));
    await screen.findByRole('heading', { level: 1, name: doc.page.title });
    expect(screen.getAllByTestId('search-launcher')).toHaveLength(1);
    expect(launcher.props?.docsUrl).toBe(doc.site.searchDocsUrl);
    await act(() => router.navigate(endpoint.path));
    await screen.findByRole('heading', { level: 1, name: 'Texts (v3)' });
    expect(screen.getAllByTestId('search-launcher')).toHaveLength(1);
    expect(launcher.mounts).toBe(1);
  });

  it('navigates to a result through the router', async () => {
    const doc = fixture<DocPayload>('doc');
    const endpoint = fixture('endpoint');
    mockFetch({ [endpoint.path]: endpoint });
    const router = renderAt(doc.path, doc, siteOf(doc));
    await screen.findByRole('heading', { level: 1, name: doc.page.title });
    act(() => launcher.props!.onNavigate!(endpoint.path));
    await waitFor(() => expect(router.state.location.pathname).toBe(endpoint.path));
  });

  it("dispatches the search module's own event from the header, so no bridge is needed", async () => {
    mockFetch({});
    const doc = fixture<DocPayload>('doc');
    renderAt(doc.path, doc, siteOf(doc));
    await screen.findByRole('heading', { level: 1, name: doc.page.title });
    const opened = vi.fn();
    window.addEventListener('dp:open-search', opened);
    screen.getAllByRole('button', { name: 'Search ⌘k' })[0]!.click();
    window.removeEventListener('dp:open-search', opened);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('sends routable paths to the router and everything else to the browser', () => {
    expect(navigateTarget('/docs/welcome#intro')).toBe('router');
    expect(navigateTarget('/powered-by/projects/12-koveah')).toBe('router');
    expect(navigateTarget('/docs/welcome.md')).toBe('document');
    expect(navigateTarget('https://www.sefaria.org/texts')).toBe('document');
    expect(navigateTarget('//evil.example/x')).toBe('document');
  });
});

describe('gallery (W12)', () => {
  it('mounts the gallery app with the portal header for kind gallery', async () => {
    mockFetch({ '/api/powered-by': projects });
    const gallery = {
      ...fixture('gallery-project'),
      path: '/powered-by',
      view: 'index',
      projectId: null,
    } as PagePayload;
    renderAt('/powered-by', gallery, siteOf(gallery));
    await waitFor(() => expect(document.querySelector('.dp-gallery main#main')).not.toBeNull());
    // The portal header, drawn by the gallery's PageLayout; not the docs page.
    expect(document.querySelector('header')).not.toBeNull();
    expect(document.querySelector('.dp-app')).toBeNull();
    expect(screen.getAllByTestId('search-launcher')).toHaveLength(1);
  });
});
