/**
 * Live adapter: drives ReadMe's DOM on developers.sefaria.org (deploy 5.968.3 at capture time).
 *
 * Create it with `LiveAdapter.create(context, { fonts })` on a fresh context: that installs the
 * network guard (capture/browser.ts) before any navigation, so nothing is POSTed to live, the
 * metrics proxy is blocked, and Try It is fulfilled from fixtures/tryit-responses.ts.
 *
 * ReadMe class names carry build hashes (`Sidebar-link2Dsha-r-GKh2`); selectors use the stable
 * `rm-*` classes, roles, aria labels and `[class*="Prefix-"]` matches only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Locator, Page } from 'playwright';
import type { PlaygroundLanguage, ScrollOptions, TryItOptions, VisualAdapter } from '../adapter.ts';
import { REGIONS, MASKS, type MaskId, type RegionId } from '../regions.ts';
import { MAPPED_ELEMENTS } from '../mapped-elements.ts';
import { guardLiveContext, LIVE_ORIGIN, type GuardLog } from '../capture/browser.ts';
import { TryItController } from '../fixtures/tryit-responses.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(here, '../fonts');

/** The design system's stack (research/design/design-system/tokens.css `--font-en-system`, `--font-he-system`). */
export const ROBOTO_STACK = 'Roboto, Heebo, "Helvetica Neue", Arial, sans-serif';

const FONT_ROUTE = '/__devportal_visual_fonts__/';

/** Font files: `devportal-ui/public/fonts/` once the portal ships them, else the vendored copies here. */
export function fontSource(): { dir: string; css: string } {
  const portal = path.resolve(here, '../../../devportal-ui/public/fonts');
  const dir = fs.existsSync(path.join(portal, 'fonts.css')) ? portal : FONT_DIR;
  return { dir, css: fs.readFileSync(path.join(dir, 'fonts.css'), 'utf8') };
}

/**
 * CSS injected for the Roboto baselines (PLAN §6.1.3): ReadMe's `--font-family` variable, and the
 * homepage's hard-coded `Inter` families, become the design system's stack. Monospace is untouched.
 */
export function robotoOverrideCss(fontFaceCss: string): string {
  return `${fontFaceCss}
*, *::before, *::after { --font-family: ${ROBOTO_STACK} !important; }
html, body { font-family: ${ROBOTO_STACK} !important; }
.project-button, .footer-header-bold, .footer-header, .footer-subheader, .inter-bold { font-family: ${ROBOTO_STACK} !important; }
`;
}

export interface LiveAdapterOptions {
  /** 'system': live as it is (raw baselines). 'roboto': Roboto and Heebo injected. */
  fonts: 'system' | 'roboto';
}

const POPOVER = '.tippy-box:has(.Dropdown-content_opened)';
/** ReadMe scrolls this container, not the window. */
const SCROLL_ROOT = '[class*="ContentWithOwlbot-content"]';

export class LiveAdapter implements VisualAdapter {
  readonly name = 'live' as const;
  readonly tryIt = new TryItController();
  guardLog!: GuardLog;
  private css = '';
  readonly page: Page;
  readonly options: LiveAdapterOptions;

  private constructor(page: Page, options: LiveAdapterOptions) {
    this.page = page;
    this.options = options;
  }

  static async create(context: BrowserContext, options: LiveAdapterOptions): Promise<LiveAdapter> {
    let fontDir = FONT_DIR;
    let css = '';
    if (options.fonts === 'roboto') {
      const src = fontSource();
      fontDir = src.dir;
      css = robotoOverrideCss(src.css);
    }
    const holder: { adapter?: LiveAdapter } = {};
    const log = await guardLiveContext(
      context,
      (route) => holder.adapter!.tryIt.handle(route),
      async (route) => {
        const url = new URL(route.request().url());
        if (url.host === 'developers.sefaria.org' && url.pathname.startsWith(FONT_ROUTE)) {
          const file = path.join(fontDir, path.basename(url.pathname));
          await route.fulfill({
            status: 200,
            headers: { 'content-type': 'font/woff2', 'access-control-allow-origin': '*' },
            body: fs.readFileSync(file),
          });
          return true;
        }
        return false;
      }
    );
    if (css) {
      await context.addInitScript((cssText: string) => {
        const add = () => {
          if (document.getElementById('devportal-visual-fonts')) return;
          const s = document.createElement('style');
          s.id = 'devportal-visual-fonts';
          s.textContent = cssText;
          (document.head || document.documentElement).appendChild(s);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
        else add();
      }, css);
    }
    const page = await context.newPage();
    const adapter = new LiveAdapter(page, options);
    adapter.css = css;
    adapter.guardLog = log;
    holder.adapter = adapter;
    return adapter;
  }

  // ------------------------------------------------------------------ helpers

  private visible(selector: string): Locator {
    return this.page.locator(`${selector} >> visible=true`).first();
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

  private async frames(n = 2): Promise<void> {
    for (let i = 0; i < n; i++)
      await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }

  /** Settle after navigation or an interaction that loads content. */
  async settle(): Promise<void> {
    const page = this.page;
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
    if (this.css) {
      await page.evaluate((cssText) => {
        if (!document.getElementById('devportal-visual-fonts')) {
          const s = document.createElement('style');
          s.id = 'devportal-visual-fonts';
          s.textContent = cssText;
          document.head.appendChild(s);
        }
      }, this.css);
    }
    // Code viewers (CodeMirror) render after hydration; spinners stand in until then.
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.Spinner')).every((s) => {
            const b = s.getBoundingClientRect();
            return b.width === 0 || b.height === 0;
          }),
        undefined,
        { timeout: 20000, polling: 200 }
      )
      .catch(() => undefined);
    await page
      .waitForFunction(
        () => {
          const req = document.querySelector('.rm-PlaygroundRequest');
          if (req && !req.querySelector('.CodeMirror-line')) return false;
          const resp = document.querySelector('.rm-PlaygroundResponse');
          if (resp && resp.querySelector('.CodeEditor') && !resp.querySelector('.CodeMirror-line')) return false;
          return true;
        },
        undefined,
        { timeout: 20000, polling: 200 }
      )
      .catch(() => undefined);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((i) => !i.complete && i.loading !== 'lazy')
          .map((i) => new Promise((r) => ((i.onload = r), (i.onerror = r))))
      );
    });
    await this.animationsDone();
    await this.frames();
  }

  private async waitPopover(): Promise<void> {
    await this.page.locator(POPOVER).first().waitFor({ state: 'visible', timeout: 10000 });
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
    await this.page.goto(LIVE_ORIGIN + p, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.settle();
    await this.parkPointer();
  }

  async scrollToRegion(region: RegionId, options: ScrollOptions = {}): Promise<void> {
    const sel = REGIONS[region].live;
    await this.visible(sel).waitFor({ state: 'attached', timeout: 10000 });
    await this.page.evaluate(
      ({ sel, offset, rootSel }) => {
        const el = Array.from(document.querySelectorAll(sel)).find((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        });
        if (!el) throw new Error('scrollToRegion: nothing visible for ' + sel);
        const root = document.querySelector(rootSel) as HTMLElement | null;
        const delta = el.getBoundingClientRect().top - offset;
        if (root && root.scrollHeight > root.clientHeight + 1) root.scrollTop += delta;
        else window.scrollBy(0, delta);
      },
      { sel, offset: options.offset ?? 0, rootSel: SCROLL_ROOT }
    );
    await this.animationsDone();
    await this.frames();
  }

  async scrollToTop(): Promise<void> {
    await this.page.evaluate((rootSel) => {
      window.scrollTo(0, 0);
      const root = document.querySelector(rootSel);
      if (root) root.scrollTop = 0;
    }, SCROLL_ROOT);
    await this.frames();
  }

  async prepareFullPage(): Promise<void> {
    // The scroll container and every ancestor up to <html> are pinned to the viewport height.
    await this.page.evaluate((rootSel) => {
      const root = document.querySelector(rootSel) as HTMLElement | null;
      for (let e: HTMLElement | null = root; e; e = e.parentElement) {
        e.style.setProperty('overflow', 'visible', 'important');
        e.style.setProperty('height', 'auto', 'important');
        e.style.setProperty('max-height', 'none', 'important');
      }
    }, SCROLL_ROOT);
    await this.frames();
    await this.animationsDone();
  }

  async freezeAnimations(): Promise<void> {
    // Jump every animation (typing effect, carousel) to its end state and stop the infinite ones.
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
    await this.waitPopover();
  }

  async openMobileNav(): Promise<void> {
    await this.click('button[aria-label="Toggle navigation menu"]');
    await this.visible('[data-testid="flyout"] a.rm-MobileFlyout-item').waitFor({ timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  async openMobileSubnav(): Promise<void> {
    await this.click('button[class*="MobileSubnav"]');
    await this.page.waitForTimeout(300);
    await this.animationsDone();
    await this.frames();
  }

  async openSearch(): Promise<void> {
    await this.click('button.rm-SearchToggle, button[aria-label^="Search"]');
    await this.visible('.rm-SearchModal input').waitFor({ timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  async searchFor(query: string): Promise<void> {
    const input = this.visible('.rm-SearchModal input');
    await input.fill(query);
    // Search answers in about 2.6s (GET /sefaria/api-next/v2/search, read-only).
    await this.visible('.rm-SearchModal .rm-SearchResults-item').waitFor({ timeout: 30000 });
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

  async expandSidebarGroup(label: string, nth = 0): Promise<void> {
    // nth counts every group with this label, open or closed (the two "Index" groups).
    const btn = this.page
      .locator(
        `nav.rm-Sidebar button[aria-label="Show subpages for ${label}"], nav.rm-Sidebar button[aria-label="Hide subpages for ${label}"]`
      )
      .nth(nth);
    if ((await btn.getAttribute('aria-expanded')) !== 'true') {
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
    }
    await this.page.waitForFunction(
      ({ label, nth }) =>
        Array.from(
          document.querySelectorAll(
            `nav.rm-Sidebar button[aria-label="Show subpages for ${label}"], nav.rm-Sidebar button[aria-label="Hide subpages for ${label}"]`
          )
        )[nth]?.getAttribute('aria-expanded') === 'true',
      { label, nth },
      { timeout: 5000 }
    );
    await this.animationsDone();
    await this.parkPointer();
  }

  async filterSidebar(text: string): Promise<void> {
    await this.visible('nav.rm-Sidebar input[aria-label="Filter pages"]').fill(text);
    await this.page.waitForTimeout(500);
    await this.animationsDone();
    await this.frames();
  }

  async scrollSidebarTo(label: string, nth = 0): Promise<void> {
    await this.page.evaluate(
      ({ label, nth }) => {
        const nav = document.querySelector('nav.rm-Sidebar[aria-label="Secondary navigation"]') as HTMLElement;
        const links = Array.from(nav.querySelectorAll('a.rm-Sidebar-link')).filter(
          (a) => a.textContent?.trim() === label
        );
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
    await this.click('.rm-AIDropdown button[aria-haspopup="dialog"]');
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

  async expandBodyParam(param: string): Promise<void> {
    const row = this.visible(`#body-params ~ * [id^="body-"][id$="_${param}"], [id="body-params-${param}"]`);
    const sel = `.rm-ParamContainer section[class*="Param-expand"] > button[aria-expanded="false"]`;
    void row;
    await this.click(sel);
    await this.animationsDone();
    await this.parkPointer();
  }

  // ------------------------------------------------------------------ response schema

  async expandResponseSchema(status: string): Promise<void> {
    const toggle = this.page
      .locator('.rm-APIResponseSchemaPicker h1 > button[aria-expanded]')
      .filter({ has: this.page.locator(`.HTTPStatus-chit[aria-label="${status}"]`) })
      .first();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
    }
    await this.page.waitForFunction(
      (status) =>
        Array.from(document.querySelectorAll('.rm-APIResponseSchemaPicker h1 > button[aria-expanded="true"]')).some(
          (b) => b.querySelector(`.HTTPStatus-chit[aria-label="${status}"]`)
        ),
      status,
      { timeout: 5000 }
    );
    await this.animationsDone();
    await this.parkPointer();
  }

  async expandSchemaChildAttributes(): Promise<void> {
    await this.click('.rm-APIResponseSchemaPicker section[class*="Param-expand"] > button[aria-expanded="false"]');
    await this.animationsDone();
    await this.parkPointer();
  }

  // ------------------------------------------------------------------ playground

  async selectLanguage(lang: PlaygroundLanguage): Promise<void> {
    const label = { shell: 'Shell', node: 'Node', ruby: 'Ruby', php: 'PHP', python: 'Python' }[lang];
    const btn = this.page.locator('.rm-LanguagePicker button.rm-LanguageButton', { hasText: label }).first();
    await btn.click();
    await this.page.waitForFunction(
      (label) =>
        Array.from(document.querySelectorAll('.rm-LanguagePicker button.rm-LanguageButton[aria-pressed="true"]')).some(
          (b) => b.textContent?.trim() === label
        ),
      label
    );
    await this.settle();
    await this.parkPointer();
  }

  async openLibraryMenu(): Promise<void> {
    await this.click('.rm-PlaygroundRequest button.Dropdown-toggle');
    await this.waitPopover();
  }

  async openMoreLanguages(): Promise<void> {
    await this.click('button[aria-label="More Languages"]');
    await this.waitPopover();
  }

  async hoverTryIt(): Promise<void> {
    await this.visible('button.rm-TryIt').hover();
    await this.animationsDone();
    await this.frames();
  }

  async runTryIt(options: TryItOptions): Promise<void> {
    this.tryIt.arm(options.fixture, options.hold ?? false);
    const before = this.tryIt.served.length;
    await this.visible('button.rm-TryIt').click();
    if (options.hold) {
      await this.page.waitForTimeout(400);
      await this.parkPointer();
      return;
    }
    await this.page.waitForFunction(
      () => !!document.querySelector('.rm-PlaygroundResponse [class*="APIResponse-header-button"]'),
      undefined,
      {
        timeout: 15000,
      }
    );
    if (this.tryIt.served.length === before) throw new Error('Try It was not fulfilled from the fixture');
    await this.settle();
    await this.parkPointer();
  }

  async releaseTryIt(): Promise<void> {
    this.tryIt.release();
    await this.page.waitForFunction(
      () => !!document.querySelector('.rm-PlaygroundResponse [class*="APIResponse-header-button"]'),
      undefined,
      {
        timeout: 15000,
      }
    );
    await this.settle();
    await this.parkPointer();
  }

  async openResponseMenu(): Promise<void> {
    await this.click('.rm-PlaygroundResponse button[class*="APIResponse-action-button"]');
    await this.waitPopover();
  }

  async openResponseExampleMenu(): Promise<void> {
    await this.click('.rm-PlaygroundResponse button[class*="APIResponse-action-button"]');
    await this.waitPopover();
  }

  async openResponseHeaders(): Promise<void> {
    await this.click('.rm-PlaygroundResponse button[class*="APIResponse-header-button"]');
    await this.visible('section[role="dialog"][class*="Modal_open"]').waitFor({ timeout: 10000 });
    await this.animationsDone();
    await this.frames();
  }

  async selectRecentRequestRow(index: number): Promise<void> {
    await this.page.locator('.rm-APILogsTable tbody tr').nth(index).click();
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
    await this.click(REGIONS.lightboxImage.live);
    await this.animationsDone();
    await this.frames();
  }

  // ------------------------------------------------------------------ selectors

  regionSelector(region: RegionId): string | null {
    return REGIONS[region].live;
  }

  maskSelector(mask: MaskId): string | null {
    return MASKS[mask].live;
  }

  mappedSelector(key: string): string | null {
    return MAPPED_ELEMENTS.find((e) => e.key === key)?.live ?? null;
  }
}
