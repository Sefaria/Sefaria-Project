// Round-2 slot wiring (Integrator): the reference (W3) in PortalFrame under one EndpointProvider, the homepage
// (W11), the Discord placements (W11) and analytics (W11) started by mount.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type DataRouter } from 'react-router';
import { ANALYTICS_EVENT } from '../analytics';
import type { DocPayload, EndpointPayload, PagePayload } from '../contracts';
import { resetEndpointSpecs } from './endpointSpecs';
import { resetNavTrees } from './loader';
import { mount } from './mount';
import { mountPagePlacements } from './placements';
import { createRoutes, PAGE_ROUTE_ID, PAGE_SLOTS } from './routes';

const SHAPES = resolve(import.meta.dirname, '../../../devportal/contracts/fixtures/shapes');

function read<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(SHAPES, path), 'utf8')) as T;
}

function payload<T extends PagePayload = PagePayload>(name: string, ga4: Record<string, string> = {}): T {
  const data = read<T>(`page-payload/${name}.json`);
  return (data.kind === 'redirect' ? data : { ...data, site: { ...data.site, ga4 } }) as T;
}

const SPEC_V3 = read<unknown>('operation-spec/get-v3-texts.json');

/** Answers page.json, the spec files and Try It's request to the API origin; records every URL. */
function mockFetch(pages: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url.href);
    if (url.origin === 'https://www.sefaria.org') {
      return new Response(JSON.stringify({ ref: 'Genesis 1:1' }), { headers: { 'Content-Type': 'application/json' } });
    }
    const key = url.pathname === '/_portal/page.json' ? url.searchParams.get('path')! : url.pathname;
    if (!(key in pages)) return new Response('missing', { status: 404 });
    return new Response(JSON.stringify(pages[key]), { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function renderAt(initial: PagePayload): DataRouter {
  const router = createMemoryRouter(createRoutes(PAGE_SLOTS), {
    initialEntries: [initial.path],
    hydrationData: { loaderData: { [PAGE_ROUTE_ID]: initial } },
  });
  render(<RouterProvider router={router} />);
  return router;
}

/** The playground, once the gate has loaded the spec (hydrated first pages have no loader run to preload it). */
async function waitForPlayground(): Promise<HTMLElement> {
  await waitFor(() => expect(document.getElementById('ReferencePlayground')).not.toBeNull());
  return document.getElementById('ReferencePlayground')!;
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetNavTrees();
  resetEndpointSpecs();
  window.localStorage.clear();
  document.body.innerHTML = '';
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  delete window.dataLayer;
  delete window.gtag;
});

describe('endpoint pages (W3)', () => {
  it('renders the article and the playground in PortalFrame, sharing one EndpointProvider', async () => {
    const endpoint = payload<EndpointPayload>('endpoint');
    mockFetch({ [endpoint.operation.specUrl]: SPEC_V3 });
    renderAt(endpoint);
    const playground = await waitForPlayground();
    const article = screen.getByRole('article');
    const main = article.closest('main')!;
    expect(main).toHaveAttribute('data-layout', 'reference');
    expect(within(article).getByRole('heading', { level: 1 })).toHaveTextContent('Texts (v3)');
    expect(main).toContainElement(playground);
    // One provider: a parameter typed in the article shows in the playground's sample.
    const user = userEvent.setup();
    await user.type(within(article).getByRole('combobox', { name: 'version' }), 'english');
    expect(within(playground).getByLabelText('Shell request sample')).toHaveTextContent('version=english');
    // The reference sidebar from nav.tree, and the page footer with prev/next.
    expect(document.querySelector('#dp-sidebar nav[aria-label="Secondary navigation"]')).not.toBeNull();
    const pager = within(article).getByRole('navigation', { name: 'Pagination Controls' });
    expect(within(pager).getByRole('link', { name: 'Previous Page: Frequently Asked Questions' })).toHaveAttribute(
      'href',
      '/reference/others-have-asked'
    );
    expect(within(pager).getByRole('link', { name: 'Next Page: Texts (v1)' })).toBeInTheDocument();
    // Live's two copies of the page footer (CSS shows one): the article's, and the stacked one, the columns' last
    // child after the playground, as the server's prerendered page has them (devportal_endpoint.py).
    expect(article.querySelector('.dp-endpoint-footer--article')).not.toBeNull();
    const stacked = document.querySelector('.dp-endpoint-footer--stacked')!;
    expect(stacked).not.toBeNull();
    expect(article).not.toContainElement(stacked as HTMLElement);
    expect(stacked.parentElement!.lastElementChild).toBe(stacked);
    expect(stacked.previousElementSibling).toContainElement(playground);
    expect(within(stacked as HTMLElement).getByRole('navigation', { name: 'Pagination Controls' })).toBeInTheDocument();
  });

  it('puts the Discord button in the request panel and reports Try It runs on the analytics bus', async () => {
    const endpoint = payload<EndpointPayload>('endpoint');
    const calls = mockFetch({ [endpoint.operation.specUrl]: SPEC_V3 });
    const events: unknown[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener(ANALYTICS_EVENT, listener);
    renderAt(endpoint);
    const playground = await waitForPlayground();
    const discord = playground.querySelector('a[data-discord-cta="reference_request_panel"]');
    expect(discord).toHaveTextContent('Join our Discord');
    await userEvent.setup().click(within(playground).getByRole('button', { name: 'Try It!' }));
    await waitFor(() => expect(events).toHaveLength(1));
    window.removeEventListener(ANALYTICS_EVENT, listener);
    expect(events[0]).toEqual({
      name: 'try_it_run',
      params: { operation_id: 'get-v3-texts', method: 'GET', status: 200 },
    });
    expect(calls.some((url) => url.startsWith('https://www.sefaria.org/api/v3/texts/'))).toBe(true);
  });

  it('shows the title-only frame when the spec cannot be loaded', async () => {
    const endpoint = payload<EndpointPayload>('endpoint');
    mockFetch({});
    renderAt({
      ...endpoint,
      operation: { ...endpoint.operation, specUrl: '/static/bundles/devportal/spec/gone.json' },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Texts (v3)' })).toBeInTheDocument();
    expect(document.getElementById('ReferencePlayground')).toBeNull();
  });
});

describe('homepage and Discord placements (W11)', () => {
  it('renders the homepage slot', async () => {
    const home = payload('home');
    mockFetch({});
    renderAt(home);
    const main = await waitFor(() => document.querySelector('main#content[data-visual="main"]')!);
    expect(main).not.toBeNull();
  });

  it('puts the Discord button at the end of docs pages', async () => {
    mockFetch({});
    renderAt(payload<DocPayload>('doc'));
    const slot = await waitFor(() => document.querySelector('[data-slot="discord"]')!);
    expect(slot.querySelector('a[data-discord-cta="docs_page_end"]')).toHaveTextContent('Join our Discord');
  });

  it('adds the Discord line after the contact form on /page/contact-us', async () => {
    mockFetch({});
    renderAt(payload<DocPayload>('doc-custom-page'));
    await waitFor(() => expect(document.querySelector('[data-discord-placement="contact_page"]')).not.toBeNull());
    const placement = document.querySelector('[data-discord-placement="contact_page"]')!;
    expect(placement.previousElementSibling?.tagName).toBe('IFRAME');
    expect(placement.querySelector('a[data-discord-cta="contact_page"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-discord-placement="contact_page"]')).toHaveLength(1);
    // The one Discord button of the page: custom pages get no docs_page_end button.
    expect(document.querySelectorAll('a[data-discord-cta]')).toHaveLength(1);
  });

  it('fills empty placeholders in the server HTML and leaves filled ones alone', () => {
    document.body.innerHTML =
      '<main id="content"><div data-discord-placement="home_community"></div>' +
      '<div data-discord-placement="home_hero"><a>kept</a></div></main>' +
      '<div data-discord-placement="sidebar_footer"></div>';
    mountPagePlacements(payload('home'));
    expect(document.querySelector('[data-discord-placement="home_community"] a')).toHaveAttribute(
      'data-discord-cta',
      'home_community'
    );
    expect(document.querySelector('[data-discord-placement="home_hero"]')).toHaveTextContent('kept');
    // Outside the page's server HTML (placeholders React renders) nothing is touched.
    expect(document.querySelector('[data-discord-placement="sidebar_footer"]')).toBeEmptyDOMElement();
  });
});

describe('analytics started by mount (W11)', () => {
  function shell(data: PagePayload) {
    document.body.innerHTML = '<div id="dp-root"></div>';
    const island = document.createElement('script');
    island.type = 'application/json';
    island.id = 'dp-data';
    island.textContent = JSON.stringify(data);
    document.body.appendChild(island);
  }

  it('loads nothing when no GA4 id is configured', async () => {
    mockFetch({});
    shell(payload('doc'));
    let root: ReturnType<typeof mount> = null;
    await act(async () => {
      root = mount(document);
    });
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
    act(() => root!.unmount());
  });

  it('sends one page_view for the first page when an id is configured', async () => {
    mockFetch({});
    shell(payload('doc', { default: 'G-TEST1234' }));
    let root: ReturnType<typeof mount> = null;
    await act(async () => {
      root = mount(document);
    });
    expect(document.querySelector('script[src*="googletagmanager.com/gtag/js?id=G-TEST1234"]')).not.toBeNull();
    const views = (window.dataLayer ?? []).filter((entry) => {
      const args = Array.from(entry as ArrayLike<unknown>);
      return args[0] === 'event' && args[1] === 'page_view';
    });
    expect(views).toHaveLength(1);
    act(() => root!.unmount());
  });

  it('waits for the spec before replacing an endpoint page', async () => {
    const endpoint = payload<EndpointPayload>('endpoint');
    mockFetch({ [endpoint.operation.specUrl]: SPEC_V3 });
    shell(endpoint);
    document.getElementById('dp-root')!.innerHTML = '<p>prerendered</p>';
    let root: ReturnType<typeof mount> = null;
    act(() => {
      root = mount(document);
    });
    expect(document.getElementById('dp-root')).toHaveTextContent('prerendered');
    await waitFor(() => expect(document.getElementById('ReferencePlayground')).not.toBeNull());
    expect(document.getElementById('dp-root')).not.toHaveTextContent('prerendered');
    act(() => root!.unmount());
  });
});
