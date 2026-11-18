/**
 * Local adapter: drives the rebuilt portal (the `developers.` host, `baseURL` of
 * `playwright.devportal-visual.config.ts`) through the same recipes the live adapter runs on ReadMe.
 *
 * Selectors. Comparison regions, masks and mapped elements use the portal's `data-visual-region`,
 * `data-visual-mask` and `data-visual` attributes (regions.ts, mapped-elements.ts). Interactions use
 * roles, aria labels, form ids (`input[id$="_<param>"]` matches the portal and live alike) and a few
 * `data-visual` hooks. The page objects in `e2e-tests/pages/developers/` are mostly stubs while W14
 * writes them, so the adapter keeps its own locators; it never depends on CSS-module class names.
 *
 * Network. `LocalAdapter.create(context)` installs the guard before the first navigation: requests to
 * the portal's own origin go through; Try It requests (the portal calls the Sefaria API origin
 * directly) are fulfilled from `fixtures/tryit-responses.ts` by a `TryItController`; everything else
 * outside the portal (analytics, embeds, the real API) is aborted, so no run reaches the network.
 *
 * The portal scrolls the window (live scrolls `.ContentWithOwlbot-content`); a full-page screenshot
 * therefore needs no preparation.
 */
import type { BrowserContext, Locator, Page, Route } from 'playwright';
import type { PlaygroundLanguage, ScrollOptions, TryItOptions, VisualAdapter } from '../adapter.ts';
import { REGIONS, MASKS, type MaskId, type RegionId } from '../regions.ts';
import { MAPPED_ELEMENTS } from '../mapped-elements.ts';
import { TryItController, tryItFixtures } from '../fixtures/tryit-responses.ts';

const POPOVER = '[data-visual-region="popover"]';
const LANGUAGE_LABELS: Record<PlaygroundLanguage, string> = {
  shell: 'Shell',
  node: 'Node',
  ruby: 'Ruby',
  php: 'PHP',
  python: 'Python',
};

export interface LocalGuardLog {
  aborted: string[];
  fulfilled: string[];
  /** Image GETs to ReadMe's CDN let through (the content's images, until mirrored). */
  passed: string[];
}

export class LocalAdapter implements VisualAdapter {
  readonly name = 'local' as const;
  readonly page: Page;
  readonly tryIt = new TryItController();
  readonly guardLog: LocalGuardLog = { aborted: [], fulfilled: [], passed: [] };

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Installs the network guard on the context (before any navigation) and returns an adapter for
   * `page`. `origin` is the portal's origin (the config's `baseURL`).
   */
  static async create(context: BrowserContext, page: Page, origin: string): Promise<LocalAdapter> {
    const adapter = new LocalAdapter(page);
    const portal = new URL(origin);
    await context.route('**/*', async (route: Route) => {
      const req = route.request();
      let url: URL;
      try {
        url = new URL(req.url());
      } catch {
        return route.abort();
      }
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
      if (url.host === portal.host) return route.continue();
      // The content's images still point at ReadMe's CDN until the image mirror serves them (PLAN §8.2,
      // DEVPORTAL_ALLOW_README_IMAGES); live's baselines show the same files. Image GETs only; nothing else
      // leaves the machine.
      if (url.host === 'files.readme.io' && req.method() === 'GET' && req.resourceType() === 'image') {
        adapter.guardLog.passed.push(`${req.method()} ${req.url()}`);
        return route.continue();
      }
      if (adapter.isTryItRequest(url)) {
        adapter.guardLog.fulfilled.push(`${req.method()} ${req.url()}`);
        return adapter.tryIt.handle(route);
      }
      adapter.guardLog.aborted.push(`${req.method()} ${req.url()}`);
      return route.abort();
    });
    return adapter;
  }

  private isTryItRequest(url: URL): boolean {
    return Object.values(tryItFixtures()).some((f) => f.pathPattern.test(url.pathname));
  }

  // ------------------------------------------------------------------ helpers

  private visible(selector: string): Locator {
    return this.page.locator(`${selector} >> visible=true`).first();
  }

  private async frames(n = 2): Promise<void> {
    for (let i = 0; i < n; i++)
      await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }

  /** Wait until finite CSS animations and transitions have finished. */
  private async animationsDone(): Promise<void> {
    await this.page
      .waitForFunction(
        () =>
          document.getAnimations().every((a) => {
            const t = a.effect?.getComputedTiming();
            if (!t || t.iterations === Infinity) return true;
            return a.playState !== 'running';
          }),
        undefined,
        { timeout: 5000, polling: 100 }
      )
      .catch(() => undefined);
  }

  /** Settle after navigation or an interaction that loads content. */
  async settle(): Promise<void> {
    const page = this.page;
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    // The portal mounts with createRoot on #dp-root (app/mount.tsx); an endpoint page waits for its spec first.
    await page
      .waitForFunction(
        () => {
          const root = document.getElementById('dp-root');
          if (!root) return true;
          return Object.keys(root).some((k) => k.startsWith('__reactContainer'));
        },
        undefined,
        { timeout: 20000, polling: 100 }
      )
      .catch(() => undefined);
    // The request sample renders its lines after mount (the first carries data-visual="codeLine").
    await page
      .waitForFunction(
        () => {
          const req = document.querySelector('[data-visual-region="requestCard"]');
          if (req && !req.querySelector('[data-visual="codeLine"]')) return false;
          return true;
        },
        undefined,
        { timeout: 20000, polling: 100 }
      )
      .catch(() => undefined);
    // Fonts and eager images; bounded, so an image that never settles cannot stall the run.
    await page.evaluate(async () => {
      await document.fonts.ready;
      const images = Promise.all(
        Array.from(document.images)
          .filter((i) => !i.complete && i.loading !== 'lazy')
          .map((i) => new Promise((r) => ((i.onload = r), (i.onerror = r))))
      );
      await Promise.race([images, new Promise((r) => setTimeout(r, 5000))]);
    });
    await this.animationsDone();
    await this.frames();
  }

  private async waitPopover(): Promise<void> {
    await this.visible(POPOVER).waitFor({ state: 'visible', timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  private async click(selector: string, opts: { force?: boolean } = {}): Promise<void> {
    const el = this.visible(selector);
    await el.scrollIntoViewIfNeeded();
    await el.click({ force: opts.force });
  }

  // ------------------------------------------------------------------ navigation and framing

  async goto(p: string): Promise<void> {
    await this.page.goto(p, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Live was captured with --hide-scrollbars (baselines/ENV.json): its scroll container keeps the classic 10px
    // gutter but paints nothing there (every baseline's right 10px is page white). The config drops
    // --hide-scrollbars so the portal's window keeps the same gutter; here the window's scrollbar is made
    // transparent so it paints nothing either, as on live. Without this, the thumb (sized by the portal's
    // document height, not live's container) is compared as content. CSSOM: the portal's CSP has no
    // 'unsafe-inline'. scrollbar-color is inherited, so <body> resets it: inner scrollers (the sidebar) keep theirs.
    await this.page.evaluate(() => {
      document.documentElement.style.setProperty('scrollbar-color', 'transparent transparent', 'important');
      document.body.style.setProperty('scrollbar-color', 'auto');
    });
    await this.settle();
    await this.parkPointer();
  }

  async scrollToRegion(region: RegionId, options: ScrollOptions = {}): Promise<void> {
    const sel = REGIONS[region].local;
    await this.visible(sel).waitFor({ state: 'attached', timeout: 10000 });
    await this.page.evaluate(
      ({ sel, offset }) => {
        const el = Array.from(document.querySelectorAll(sel)).find((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        });
        if (!el) throw new Error('scrollToRegion: nothing visible for ' + sel);
        window.scrollBy(0, el.getBoundingClientRect().top - offset);
      },
      { sel, offset: options.offset ?? 0 }
    );
    await this.animationsDone();
    await this.frames();
  }

  async scrollToTop(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.frames();
  }

  async prepareFullPage(): Promise<void> {
    // The window is the scrolling element already, so a full-page screenshot sees the whole page. Live's
    // prepareFullPage unpins its scroll container, so its full-page baselines have no scrollbar and the full
    // viewport width (1440 at 1440): the window's scrollbar, painted for the viewport states (the config drops
    // --hide-scrollbars), is removed here the same way.
    // (CSSOM, not a <style> tag: the portal's CSP has no 'unsafe-inline'.)
    await this.page.evaluate(() => document.documentElement.style.setProperty('scrollbar-width', 'none', 'important'));
    // The reference layout reserves 10px for live's scrollbar when the window draws none (PortalFrame.module.css);
    // live's full-page baselines have no scrollbar and no gutter, so the reserve is lifted too.
    await this.page.evaluate(() =>
      document
        .querySelector<HTMLElement>('main[data-layout="reference"]')
        ?.style.setProperty('padding-right', '0px', 'important')
    );
    await this.frames();
    await this.animationsDone();
  }

  async freezeAnimations(): Promise<void> {
    await this.page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const t = a.effect?.getComputedTiming();
        if (t && t.iterations !== Infinity && typeof t.endTime === 'number') {
          a.finish();
        } else {
          a.pause();
          a.currentTime = 0;
        }
      }
    });
    await this.frames();
  }

  async parkPointer(): Promise<void> {
    const vp = this.page.viewportSize();
    await this.page.mouse.move((vp?.width ?? 1) - 1, (vp?.height ?? 1) - 1);
    await this.animationsDone();
  }

  // ------------------------------------------------------------------ header

  async openLinksMenu(): Promise<void> {
    await this.click('button[aria-label="Open links menu"]');
    await this.visible('[role="dialog"][aria-label="Links menu"]').waitFor({ timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  async openMobileNav(): Promise<void> {
    await this.click('button[aria-label="Toggle navigation menu"]');
    await this.visible('[data-visual-region="mobileNav"]').waitFor({ timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  async openMobileSubnav(): Promise<void> {
    await this.click('[data-visual="mobileSubnav"]');
    await this.visible('[data-visual-region="mobileSubnavPanel"]').waitFor({ timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  async openSearch(): Promise<void> {
    await this.click('button[aria-label^="Search"]');
    await this.visible('dialog[aria-label="Search"] input').waitFor({ timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  async searchFor(query: string): Promise<void> {
    await this.visible('dialog[aria-label="Search"] input').fill(query);
    await this.visible('dialog[aria-label="Search"] ol[aria-label="Search results"] li').waitFor({ timeout: 30000 });
    await this.settle();
  }

  // ------------------------------------------------------------------ sidebar

  async collapseSidebar(): Promise<void> {
    await this.click('button[aria-label="Hide sidebar navigation"]', { force: true });
    await this.page
      .waitForFunction(() => !document.querySelector('button[aria-label="Hide sidebar navigation"]'), undefined, {
        timeout: 5000,
      })
      .catch(() => undefined);
    await this.animationsDone();
    await this.scrollToTop();
    await this.parkPointer();
  }

  private sidebarToggles(label: string): string {
    return [
      `nav[aria-label="Secondary navigation"] button[aria-label="Show subpages for ${label}"]`,
      `nav[aria-label="Secondary navigation"] button[aria-label="Hide subpages for ${label}"]`,
    ].join(', ');
  }

  async expandSidebarGroup(label: string, nth = 0): Promise<void> {
    const sel = this.sidebarToggles(label);
    const btn = this.page.locator(sel).nth(nth);
    if ((await btn.getAttribute('aria-expanded')) !== 'true') {
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
    }
    await this.page.waitForFunction(
      ({ sel, nth }) => document.querySelectorAll(sel)[nth]?.getAttribute('aria-expanded') === 'true',
      { sel, nth },
      { timeout: 5000 }
    );
    await this.animationsDone();
    await this.parkPointer();
  }

  async filterSidebar(text: string): Promise<void> {
    await this.visible('[data-visual="filter"]').fill(text);
    await this.page.waitForTimeout(500);
    await this.animationsDone();
    await this.frames();
  }

  async scrollSidebarTo(label: string, nth = 0): Promise<void> {
    await this.page.evaluate(
      ({ label, nth }) => {
        const nav = document.querySelector('nav[aria-label="Secondary navigation"]') as HTMLElement;
        const links = Array.from(nav.querySelectorAll('a')).filter((a) => a.textContent?.trim() === label);
        const target = links[nth] as HTMLElement | undefined;
        if (!target) throw new Error('scrollSidebarTo: no sidebar link ' + label);
        let sc: HTMLElement | null = target.parentElement;
        while (sc && sc !== document.body) {
          const oy = getComputedStyle(sc).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight) break;
          sc = sc.parentElement;
        }
        if (!sc || sc === document.body) return;
        sc.scrollTop += target.getBoundingClientRect().top - sc.getBoundingClientRect().top - 40;
      },
      { label, nth }
    );
    await this.frames();
  }

  // ------------------------------------------------------------------ headline

  async openCopyPageMenu(): Promise<void> {
    await this.click('[data-visual="copyPage"] button[aria-haspopup="menu"]');
    await this.waitPopover();
  }

  async openTagsPopover(): Promise<void> {
    await this.click('button[aria-label="View tags"]');
    await this.waitPopover();
  }

  // ------------------------------------------------------------------ parameters

  async openParamExamples(param: string): Promise<void> {
    await this.click(`input[role="combobox"][id$="_${param}"]`);
    await this.waitPopover();
  }

  async fillParam(param: string, value: string): Promise<void> {
    const input = this.visible(`input[id$="_${param}"], textarea[id$="_${param}"]`);
    await input.scrollIntoViewIfNeeded();
    await input.fill(value);
    await this.page.keyboard.press('Tab');
    await this.settle();
    await this.parkPointer();
  }

  async selectParamOption(param: string, value: string): Promise<void> {
    const sel = this.visible(`select[id$="_${param}"]`);
    await sel.scrollIntoViewIfNeeded();
    await sel.selectOption(value);
    await this.settle();
    await this.parkPointer();
  }

  async expandBodyParam(_param: string): Promise<void> {
    // As on live: the first closed object expander of the parameter cards (find-refs has one, `text`).
    await this.click('[data-visual-region="paramCard"] button[aria-expanded="false"]');
    await this.animationsDone();
    await this.parkPointer();
  }

  // ------------------------------------------------------------------ response schema

  async expandResponseSchema(status: string): Promise<void> {
    const toggle = this.page
      .locator('[data-visual-region="responseAccordion"] h3 > button[aria-expanded]')
      .filter({ has: this.page.locator(`[data-visual="statusChit"][aria-label="${status}"]`) })
      .first();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
    }
    await this.page.waitForFunction(
      (status) =>
        Array.from(
          document.querySelectorAll('[data-visual-region="responseAccordion"] h3 > button[aria-expanded="true"]')
        ).some((b) => b.querySelector(`[data-visual="statusChit"][aria-label="${status}"]`)),
      status,
      { timeout: 5000 }
    );
    await this.animationsDone();
    await this.parkPointer();
  }

  async expandSchemaChildAttributes(): Promise<void> {
    await this.click('[data-visual-region="responseAccordion"] section > button[aria-expanded="false"]');
    await this.animationsDone();
    await this.parkPointer();
  }

  // ------------------------------------------------------------------ playground

  async selectLanguage(lang: PlaygroundLanguage): Promise<void> {
    const label = LANGUAGE_LABELS[lang];
    await this.page
      .locator('[data-visual-region="languagePicker"] button[aria-pressed]', { hasText: label })
      .first()
      .click();
    await this.page.waitForFunction(
      (label) =>
        Array.from(document.querySelectorAll('[data-visual-region="languagePicker"] button[aria-pressed="true"]')).some(
          (b) => b.textContent?.trim() === label
        ),
      label
    );
    await this.settle();
    await this.parkPointer();
  }

  async openLibraryMenu(): Promise<void> {
    await this.click('[data-visual-region="requestCard"] button[title="Toggle library"]');
    await this.waitPopover();
  }

  async openMoreLanguages(): Promise<void> {
    await this.click('button[aria-label="More Languages"]');
    await this.waitPopover();
  }

  async hoverTryIt(): Promise<void> {
    await this.visible('[data-visual="tryIt"]').hover();
    await this.animationsDone();
    await this.frames();
  }

  private async waitForResult(): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const card = document.querySelector('[data-visual-region="responseCard"]');
        return (
          !!card &&
          !document.querySelector('[data-visual="tryIt"] [role="progressbar"]') &&
          !!card.querySelector('[aria-expanded]')
        );
      },
      undefined,
      { timeout: 15000 }
    );
  }

  async runTryIt(options: TryItOptions): Promise<void> {
    this.tryIt.arm(options.fixture, options.hold ?? false);
    const before = this.tryIt.served.length;
    await this.visible('[data-visual="tryIt"]').click();
    if (options.hold) {
      // As on live, the spinner is in the Try It button; the response card keeps its view meanwhile.
      await this.visible('[data-visual="tryIt"] [role="progressbar"]').waitFor({ timeout: 10000 });
      await this.page.waitForTimeout(400);
      await this.parkPointer();
      return;
    }
    await this.waitForResult();
    if (this.tryIt.served.length === before) throw new Error('Try It was not fulfilled from the fixture');
    await this.settle();
    await this.parkPointer();
  }

  async releaseTryIt(): Promise<void> {
    this.tryIt.release();
    await this.waitForResult();
    await this.settle();
    await this.parkPointer();
  }

  async openResponseMenu(): Promise<void> {
    await this.click('[data-visual-region="responseCard"] header button[aria-expanded]');
    await this.waitPopover();
  }

  async openResponseExampleMenu(): Promise<void> {
    await this.click('[data-visual-region="responseCard"] header button[aria-expanded]');
    await this.waitPopover();
  }

  async openResponseHeaders(): Promise<void> {
    await this.click('[data-visual-region="responseCard"] button[aria-haspopup="dialog"]');
    await this.visible('[data-visual-region="modal"]').waitFor({ timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  async selectRecentRequestRow(index: number): Promise<void> {
    await this.page.locator('[data-visual-region="recentRequests"] tbody tr').nth(index).click();
    await this.animationsDone();
    await this.settle();
    await this.parkPointer();
  }

  // ------------------------------------------------------------------ footer

  async openFeedback(answer: 'yes' | 'no'): Promise<void> {
    const label = answer === 'yes' ? 'Yes, this page helped me' : 'No, this page did not help me';
    await this.click(`button[aria-label="${label}"]`);
    await this.waitPopover();
  }

  // ------------------------------------------------------------------ docs pages

  async openImageLightbox(): Promise<void> {
    // The same rule as live's recipe: the first image with a box. Which one that is depends on what lazy loading
    // has drawn (the flowchart at 1440; the impact chart at 390, where the flowchart has no box yet), which is why
    // the content's images must load from ReadMe's CDN here (see create()): with them aborted, the local side
    // opened a different image than live's baseline.
    await this.click(`${REGIONS.lightboxImage.local} img, img${REGIONS.lightboxImage.local}`);
    await this.animationsDone();
    await this.frames();
  }

  // ------------------------------------------------------------------ selectors

  regionSelector(region: RegionId): string | null {
    return REGIONS[region].local;
  }

  maskSelector(mask: MaskId): string | null {
    return MASKS[mask].local;
  }

  mappedSelector(key: string): string | null {
    return MAPPED_ELEMENTS.find((e) => e.key === key)?.local ?? null;
  }
}
