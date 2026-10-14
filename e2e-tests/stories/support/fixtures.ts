// BINDING LAYER: how story steps reach the app. Implementers may edit this folder
// (locators, seams, stubs); they may not change what a step asserts, which lives in
// ../steps. See ../README.md.
import { BrowserContext, Locator, Page } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../../globals';
import { MODULE_URLS } from '../../constants';
import { PageManager } from '../../pages/pageManager';
import { ChatStub } from './chatStub';
import { Assistant } from './assistant';

import { SeamMissing } from './seams';
export { SeamMissing };

export type Who = 'logged out' | 'assistant on' | 'assistant off';

/**
 * The visitor a story talks about. Steps describe the visitor first ("logged out",
 * "the interface is Hebrew", "the window is 900px wide") and the page opens lazily
 * the first time a step needs it, so Given-steps can come in any order.
 */
export class Visitor {
  who: Who = 'assistant on';
  lang: string = LANGUAGES.EN;
  viewport?: { width: number; height: number };
  reducedMotion = false;
  /** False when the story needs the cookie banner: the suite's entry helpers accept cookies by default. */
  cookiesAccepted = true;
  /** The thing the last step talked about, for steps that say "it" ("When the visitor clicks it"). */
  it?: Locator;
  /** Facts one step records for a later step (e.g. what a When saw before the Then). */
  readonly notes: Record<string, any> = {};
  private _page?: Page;

  constructor(readonly context: BrowserContext, readonly chat: ChatStub, readonly hasTouch = false) {}

  get isOpen() { return !!this._page; }

  /** The current page, opening the Library home page if nothing is open yet. */
  async page(): Promise<Page> {
    if (!this._page) await this.goto(this.libraryUrl());
    return this._page!;
  }

  libraryUrl(path = '') {
    return (this.lang === LANGUAGES.HE ? MODULE_URLS.HE.LIBRARY : MODULE_URLS.EN.LIBRARY) + path;
  }

  voicesUrl(path = '') {
    return (this.lang === LANGUAGES.HE ? MODULE_URLS.HE.VOICES : MODULE_URLS.EN.VOICES) + path;
  }

  /** Navigate the visitor to `url`, entering the site through the suite's helpers on first use. */
  async goto(url: string): Promise<Page> {
    if (this._page) {
      await this._page.goto(url, { waitUntil: 'domcontentloaded' });
      if (this.cookiesAccepted) await hideAllModalsAndPopups(this._page);
      return this._page;
    }
    await this.chat.install(this.context);
    // Enter through a light page on the same host (robots.txt), so the suite's entry
    // helpers still do their cookie and overlay setup, but the window size, motion
    // preference and cookie-banner state are in place before the first real page loads.
    const entry = new URL(url).origin + '/robots.txt';
    let page: Page;
    if (this.who === 'logged out') {
      page = await goToPageWithLang(this.context, entry, this.lang);
    } else if (this.who === 'assistant off') {
      if (!process.env.PLAYWRIGHT_LA_OFF_USER_EMAIL) {
        throw new SeamMissing('Needs an account with the assistant turned off: set PLAYWRIGHT_LA_OFF_USER_EMAIL / _PASSWORD (see e2e-tests/example.env).');
      }
      page = await goToPageWithUser(this.context, entry, BROWSER_SETTINGS.enLAOffUser);
    } else {
      page = await goToPageWithUser(this.context, entry, this.lang === LANGUAGES.HE ? BROWSER_SETTINGS.heLAUser : BROWSER_SETTINGS.enLAUser);
    }
    if (this.viewport) await page.setViewportSize(this.viewport);
    if (this.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    // The entry helpers pre-seed the cookies-accepted cookie; a first-time visitor has none.
    if (!this.cookiesAccepted) await this.context.clearCookies({ name: 'cookiesNotificationAccepted' });
    this._page = page;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (this.cookiesAccepted) await hideAllModalsAndPopups(page);
    return page;
  }

  /**
   * The visitor leaves and comes back `ms` later in the same browser: the tab is
   * closed, the clock moves forward, and the same URL opens in a new tab. Storage and
   * cookies are kept, as they would be.
   */
  async comeBackLater(ms: number, url?: string): Promise<Page> {
    const old = await this.page();
    const target = url ?? old.url();
    await old.close();
    // Cookies that would have expired while the visitor was away are gone when they return.
    const returnAt = (Date.now() + ms) / 1000;
    for (const c of await this.context.cookies()) {
      if (c.expires > 0 && c.expires < returnAt) await this.context.clearCookies({ name: c.name, domain: c.domain, path: c.path });
    }
    await this.context.clock.install({ time: Date.now() + ms });
    const page = await this.context.newPage();
    if (this.viewport) await page.setViewportSize(this.viewport);
    if (this.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    if (this.cookiesAccepted) await hideAllModalsAndPopups(page);
    this._page = page;
    return page;
  }

  /** The Library Assistant on the current page (see ./assistant.ts). */
  async la(): Promise<Assistant> {
    return new Assistant(await this.page(), this.lang, this.hasTouch);
  }

  /** Resize the window now if a page is open, and remember the size for pages opened later. */
  async setWindow(width: number, height?: number) {
    const current = this._page?.viewportSize() ?? this.viewport;
    this.viewport = { width, height: height ?? current?.height ?? 800 };
    if (this._page) await this._page.setViewportSize(this.viewport);
  }

  async preferReducedMotion() {
    this.reducedMotion = true;
    if (this._page) await this._page.emulateMedia({ reducedMotion: 'reduce' });
  }

  async pm(): Promise<PageManager> {
    return new PageManager(await this.page(), this.lang);
  }
}

type StoryFixtures = { chat: ChatStub; visitor: Visitor };

export const test = base.extend<StoryFixtures>({
  chat: async ({}, use) => { await use(new ChatStub()); },
  visitor: async ({ context, chat, hasTouch }, use, testInfo) => {
    // A story walks through several full page loads of the live site, and the
    // assistant mounts asynchronously after each; give it more than a single spec's budget.
    testInfo.setTimeout(Math.max(testInfo.timeout, t(120000)));
    await use(new Visitor(context, chat, !!hasTouch));
  },
});

export const { Given, When, Then } = createBdd(test);
