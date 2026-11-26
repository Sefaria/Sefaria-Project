import type { PagePayload } from '../contracts';
import {
  ANALYTICS_EVENT,
  GTAG_SRC,
  loadGtag,
  measurementId,
  sanitizeEvent,
  startAnalytics,
  track,
  type Gtag,
  type RouterLike,
  type StopAnalytics,
} from '.';

const ID = 'G-6SXQFSB219';

function payload(kind: string, title: string, ga4: Record<string, string> = { default: ID }, section = 'default') {
  return { kind, title, path: '/', site: { ga4, analyticsSection: section } } as unknown as PagePayload;
}

type State = RouterLike['state'];

/** A stand-in for React Router's data router: `emit` plays a state change. */
function fakeRouter() {
  const listeners = new Set<(state: State) => void>();
  const router: RouterLike & { emit(state: Partial<State> & { path?: string; data?: unknown }): void } = {
    state: { navigation: { state: 'idle' }, location: { pathname: '/', search: '' }, loaderData: {} },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit({ path = '/', data, navigation = { state: 'idle' } }) {
      const [pathname, search = ''] = path.split(/(?=\?)/);
      const state: State = { navigation, location: { pathname: pathname!, search }, loaderData: { page: data } };
      router.state = state;
      listeners.forEach((l) => l(state));
    },
  };
  return router;
}

describe('analytics', () => {
  let calls: unknown[][];
  let load: ReturnType<typeof vi.fn<(id: string, win: Window) => Gtag>>;
  let stop: StopAnalytics | undefined;

  beforeEach(() => {
    calls = [];
    load = vi.fn(() => ((...args: unknown[]) => calls.push(args)) as Gtag);
    window.history.replaceState(null, '', '/');
    document.title = 'Sefaria';
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    delete window.gtag;
    delete window.dataLayer;
  });

  const pageViews = () => calls.filter((c) => c[0] === 'event' && c[1] === 'page_view');
  const keyEvents = () => calls.filter((c) => c[0] === 'event' && c[1] !== 'page_view');

  describe('loading', () => {
    it('loads nothing and sends nothing when DEVPORTAL_GA4 is empty', () => {
      stop = startAnalytics({ data: payload('home', 'Sefaria', {}), load });
      track('discord_cta_click', { placement: 'home_hero' });
      expect(load).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      stop = startAnalytics({ data: payload('home', 'Sefaria', {}) });
      expect(document.querySelector(`script[src^="${GTAG_SRC}"]`)).toBeNull();
      expect(window.dataLayer).toBeUndefined();
    });

    it('uses the property of the page’s section, and leaves the gallery to its own module', () => {
      expect(measurementId({ ga4: { default: ID, gallery: 'G-44RHV2ZWQ1' }, analyticsSection: 'default' })).toBe(ID);
      expect(measurementId({ ga4: { default: ID, gallery: 'G-44RHV2ZWQ1' }, analyticsSection: 'gallery' })).toBeNull();
      expect(measurementId({ ga4: { default: ID }, analyticsSection: 'other' })).toBeNull();
      expect(measurementId({ ga4: { default: 'not-an-id' }, analyticsSection: 'default' })).toBeNull();
      expect(measurementId(null)).toBeNull();
    });

    it('inserts gtag.js once and configures the property with send_page_view false', () => {
      loadGtag(ID);
      loadGtag(ID);
      const scripts = document.querySelectorAll(`script[src="${GTAG_SRC}?id=${ID}"]`);
      expect(scripts).toHaveLength(1);
      expect((scripts[0] as HTMLScriptElement).async).toBe(true);
      const layer = window.dataLayer!.map((args) => Array.from(args as IArguments));
      expect(layer.filter((a) => a[0] === 'config')).toEqual([
        ['config', ID, { send_page_view: false }],
        ['config', ID, { send_page_view: false }],
      ]);
      // gtag.js only reads Arguments objects from the data layer.
      expect(Object.prototype.toString.call(window.dataLayer![0])).toBe('[object Arguments]');
    });
  });

  describe('page views', () => {
    it('sends exactly one page_view on load, after setting document.title', () => {
      window.history.replaceState(null, '', '/docs/welcome?x=1#top');
      document.title = 'stale';
      stop = startAnalytics({ data: payload('doc', 'Welcome'), load });
      expect(load).toHaveBeenCalledWith(ID, window);
      expect(document.title).toBe('Welcome');
      expect(pageViews()).toEqual([
        ['event', 'page_view', { page_title: 'Welcome', page_location: `${window.location.origin}/docs/welcome?x=1` }],
      ]);
    });

    it('sends one page_view per client-side navigation, none for loading states, repeats or fragments', () => {
      const router = fakeRouter();
      stop = startAnalytics({ data: payload('home', 'Sefaria'), router, load });
      expect(pageViews()).toHaveLength(1);

      router.emit({ path: '/docs/welcome', navigation: { state: 'loading' }, data: payload('home', 'Sefaria') });
      expect(pageViews()).toHaveLength(1);
      router.emit({ path: '/docs/welcome', data: payload('doc', 'Welcome to the docs') });
      router.emit({ path: '/docs/welcome', data: payload('doc', 'Welcome to the docs') }); // revalidation
      expect(pageViews()).toHaveLength(2);
      expect(pageViews()[1]![2]).toEqual({
        page_title: 'Welcome to the docs',
        page_location: `${window.location.origin}/docs/welcome`,
      });
      expect(document.title).toBe('Welcome to the docs');

      router.emit({ path: '/reference/get-v3-texts', data: payload('endpoint', 'Texts (v3)') });
      router.emit({ path: '/nowhere', data: payload('notfound', '404 Not Found') });
      expect(pageViews().map((c) => (c[2] as { page_title: string }).page_title)).toEqual([
        'Sefaria',
        'Welcome to the docs',
        'Texts (v3)',
        '404 Not Found',
      ]);
    });

    it('does not count a redirect payload as a page', () => {
      const router = fakeRouter();
      stop = startAnalytics({ data: payload('home', 'Sefaria'), router, load });
      router.emit({ path: '/docs', data: { kind: 'redirect', location: '/docs/welcome' } });
      expect(pageViews()).toHaveLength(1);
    });

    it('stops listening when stopped', () => {
      const router = fakeRouter();
      stop = startAnalytics({ data: payload('home', 'Sefaria'), router, load });
      stop();
      router.emit({ path: '/docs/welcome', data: payload('doc', 'Welcome') });
      track('copy_page_action', { action: 'copy_markdown' });
      expect(calls.filter((c) => c[0] === 'event')).toHaveLength(1);
    });
  });

  describe('key events (C8)', () => {
    beforeEach(() => {
      stop = startAnalytics({ data: payload('doc', 'Contact Us'), router: fakeRouter(), load });
    });

    it('sends discord_cta_click with its placement', () => {
      track('discord_cta_click', { placement: 'contact_page' });
      expect(keyEvents()).toEqual([['event', 'discord_cta_click', { placement: 'contact_page' }]]);
    });

    it('sends try_it_run with operation_id, method and status', () => {
      track('try_it_run', { operation_id: 'getV3Texts', method: 'GET', status: 200 });
      track('try_it_run', { operation_id: 'postLinks', method: 'POST', status: 0 });
      expect(keyEvents()).toEqual([
        ['event', 'try_it_run', { operation_id: 'getV3Texts', method: 'GET', status: 200 }],
        ['event', 'try_it_run', { operation_id: 'postLinks', method: 'POST', status: 0 }],
      ]);
    });

    it('sends copy_page_action with its action', () => {
      track('copy_page_action', { action: 'open_claude' });
      expect(keyEvents()).toEqual([['event', 'copy_page_action', { action: 'open_claude' }]]);
    });

    it('sends contact_form_start once per page view (W7 dispatches it on the bus)', () => {
      const start = () =>
        window.dispatchEvent(new CustomEvent(ANALYTICS_EVENT, { detail: { name: 'contact_form_start' } }));
      start();
      start();
      expect(keyEvents()).toEqual([['event', 'contact_form_start', {}]]);
    });

    it('drops anything outside C8: other names, extra parameters, values, keys', () => {
      const send = (detail: unknown) => window.dispatchEvent(new CustomEvent(ANALYTICS_EVENT, { detail }));
      send({ name: 'page_view', params: { page_title: 'x' } });
      send({ name: 'search', params: { q: 'Genesis 1:1' } });
      send({ name: 'discord_cta_click', params: { placement: 'footer' } });
      send({ name: 'copy_page_action', params: { action: 'steal' } });
      send({
        name: 'try_it_run',
        params: { operation_id: 'https://www.sefaria.org/api/v3/texts/Genesis 1:1', method: 'GET', status: 200 },
      });
      send({ name: 'try_it_run', params: { operation_id: 'getV3Texts', method: 'TRACE', status: 200 } });
      send({ name: 'try_it_run', params: { operation_id: 'getV3Texts', method: 'get', status: 2000 } });
      send({ name: 'discord_cta_click', params: { placement: 'home_hero', key: 'secret', query: 'x' } });
      send({ name: 'try_it_run', params: { operation_id: 'getV3Texts', method: 'get', status: 404, apiKey: 'k' } });
      expect(keyEvents()).toEqual([
        ['event', 'discord_cta_click', { placement: 'home_hero' }],
        ['event', 'try_it_run', { operation_id: 'getV3Texts', method: 'GET', status: 404 }],
      ]);
    });
  });

  it('sanitizeEvent returns null for non-objects', () => {
    expect(sanitizeEvent(null)).toBeNull();
    expect(sanitizeEvent('discord_cta_click')).toBeNull();
  });
});
