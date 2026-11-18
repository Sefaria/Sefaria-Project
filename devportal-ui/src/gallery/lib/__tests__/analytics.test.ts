import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsEnabled,
  ga4MeasurementId,
  GTAG_SRC,
  initAnalytics,
  initGa4,
  resetAnalytics,
  searchResultsBucket,
  track,
  trackPageview,
} from '../analytics';

const plausible = vi.fn();

function setPrivacy(signals: { doNotTrack?: string; globalPrivacyControl?: boolean }) {
  Object.defineProperty(navigator, 'doNotTrack', { value: signals.doNotTrack, configurable: true });
  Object.defineProperty(navigator, 'globalPrivacyControl', {
    value: signals.globalPrivacyControl,
    configurable: true,
  });
}

beforeEach(() => {
  resetAnalytics();
  plausible.mockReset();
  window.plausible = plausible;
  document.head.querySelectorAll('script[data-domain]').forEach((s) => s.remove());
  setPrivacy({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.plausible;
});

describe('analytics', () => {
  it('does nothing when VITE_ANALYTICS_DOMAIN is unset', () => {
    expect(initAnalytics()).toBe(false);
    track('project_source', { project_id: 1 });
    trackPageview('/powered-by');
    expect(analyticsEnabled()).toBe(false);
    expect(plausible).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-domain]')).toBeNull();
  });

  it('injects a deferred script for the domain, with a custom src when given', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'powered-by.sefaria.org');
    vi.stubEnv('VITE_ANALYTICS_SRC', 'https://stats.example/js/script.manual.js');
    expect(initAnalytics()).toBe(true);
    const script = document.querySelector<HTMLScriptElement>('script[data-domain]');
    expect(script?.defer).toBe(true);
    expect(script?.dataset.domain).toBe('powered-by.sefaria.org');
    expect(script?.src).toBe('https://stats.example/js/script.manual.js');
  });

  it.each([
    ['Do Not Track', { doNotTrack: '1' }],
    ['Global Privacy Control', { globalPrivacyControl: true }],
  ])('stays off when %s is on', (_name, signals) => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'powered-by.sefaria.org');
    setPrivacy(signals);
    expect(initAnalytics()).toBe(false);
    track('project_source', { project_id: 1 });
    expect(plausible).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-domain]')).toBeNull();
  });

  it('sends events with only the props given, and never throws', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'powered-by.sefaria.org');
    initAnalytics();
    track('search', { has_query: true, results: searchResultsBucket(3) });
    expect(plausible).toHaveBeenCalledWith('search', {
      u: `${window.location.origin}${window.location.pathname}`,
      props: { has_query: true, results: '1-5' },
    });
    plausible.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => track('view_change', { view: 'list' })).not.toThrow();
  });

  it('never counts the charts page', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'powered-by.sefaria.org');
    initAnalytics();
    trackPageview('/powered-by/charts');
    // the router matches case-insensitively, so these are the charts page too
    trackPageview('/powered-by/Charts');
    trackPageview('/powered-by/CHARTS/');
    expect(plausible).not.toHaveBeenCalled();
    trackPageview('/powered-by/projects/1-x');
    expect(plausible).toHaveBeenCalledWith('pageview', {
      u: `${window.location.origin}${window.location.pathname}`,
    });
  });

  it('reports the URL without its query or hash, so search text never leaves the page', () => {
    vi.stubEnv('VITE_ANALYTICS_DOMAIN', 'powered-by.sefaria.org');
    initAnalytics();
    window.history.replaceState(null, '', '/powered-by?q=secret+term#results');
    track('view_change', { view: 'list' });
    window.history.replaceState(null, '', '/powered-by');
    const options = plausible.mock.calls[0]?.[1] as { u: string };
    expect(options.u).toBe(`${window.location.origin}/powered-by`);
    expect(JSON.stringify(options)).not.toContain('secret');
  });

  it('buckets search results', () => {
    expect([0, 1, 5, 6, 100].map(searchResultsBucket)).toEqual(['0', '1-5', '1-5', '6+', '6+']);
  });

  describe('GA4', () => {
    type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: unknown };
    const gtagScripts = () => document.head.querySelectorAll(`script[src^="${GTAG_SRC}"]`);

    afterEach(() => {
      gtagScripts().forEach((s) => s.remove());
      delete (window as GtagWindow).gtag;
      delete (window as GtagWindow).dataLayer;
    });

    it('stays off without a measurement id from the page payload', () => {
      expect(initGa4(undefined)).toBe(false);
      expect(initGa4('')).toBe(false);
      expect(ga4MeasurementId()).toBeNull();
      expect(gtagScripts()).toHaveLength(0);
      expect((window as GtagWindow).gtag).toBeUndefined();
    });

    it('loads gtag.js once for the id it is given, as the gallery snippet did', () => {
      expect(initGa4('G-44RHV2ZWQ1')).toBe(true);
      expect(initGa4('G-44RHV2ZWQ1')).toBe(true);
      const scripts = gtagScripts();
      expect(scripts).toHaveLength(1);
      expect((scripts[0] as HTMLScriptElement).src).toBe(`${GTAG_SRC}?id=G-44RHV2ZWQ1`);
      expect((scripts[0] as HTMLScriptElement).async).toBe(true);
      const queued = ((window as GtagWindow).dataLayer ?? []).map((args) => Array.from(args as ArrayLike<unknown>));
      expect(queued[0]?.[0]).toBe('js');
      expect(queued[1]).toEqual(['config', 'G-44RHV2ZWQ1']);
      expect(ga4MeasurementId()).toBe('G-44RHV2ZWQ1');
    });

    it('does not load gtag a second time when the portal already did', () => {
      const gtag = vi.fn();
      (window as GtagWindow).gtag = gtag;
      expect(initGa4('G-44RHV2ZWQ1')).toBe(true);
      expect(gtagScripts()).toHaveLength(0);
      expect(gtag).not.toHaveBeenCalled();
    });
  });
});
