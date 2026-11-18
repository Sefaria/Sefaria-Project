// Fixtures and step functions for the BDD story suite (e2e-tests/feature-specs/README.md).
//
// Every *.steps.ts file imports Given / When / Then from HERE, never from playwright-bdd
// directly. The wrappers below refuse a step whose body is empty: bddgen prints snippets
// with empty bodies, and a pasted, unfilled snippet would otherwise pass while checking
// nothing.
import { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../../globals';
import { MODULE_URLS } from '../../constants';
import { PageManager } from '../../pages/pageManager';

export type Who = 'logged out' | 'logged in';
export type Module = 'Library' | 'Voices';

/**
 * The person a story talks about ("I", "the visitor"). Given-steps describe the visitor
 * (logged in, interface language) and the browser page opens lazily the first time a step
 * needs one, so Given-steps can come in any order.
 */
export class Visitor {
  who: Who = 'logged out';
  lang: string = LANGUAGES.EN;
  /** Facts one step records for a later step. */
  readonly notes: Record<string, unknown> = {};
  private _page?: Page;
  private _pm?: PageManager;

  constructor(
    readonly context: BrowserContext,
    /** A request client with its own cookie jar, for API set-up that must not touch the page's session. */
    readonly request?: APIRequestContext,
    readonly baseURL?: string,
  ) {}

  /** Make `page` the current page, e.g. after a step opened a new tab or another browser. */
  use(page: Page): void {
    this._page = page;
    this._pm = undefined;
  }

  urlFor(module: Module, path = '/'): string {
    const site = this.lang === LANGUAGES.HE ? MODULE_URLS.HE : MODULE_URLS.EN;
    const base = module === 'Voices' ? site.VOICES : site.LIBRARY;
    return new URL(path, base.endsWith('/') ? base : base + '/').toString();
  }

  /** The current page, opening the Library home page if nothing is open yet. */
  async page(): Promise<Page> {
    if (!this._page) await this.goto(this.urlFor('Library'));
    return this._page!;
  }

  /** The suite's page objects (e2e-tests/pages) bound to the current page. */
  async pm(): Promise<PageManager> {
    const page = await this.page();
    if (!this._pm) this._pm = new PageManager(page, this.lang);
    return this._pm;
  }

  /** Navigate, entering the site through the suite's helpers on first use. */
  async goto(url: string): Promise<Page> {
    if (this._page) {
      await this._page.goto(url, { waitUntil: 'domcontentloaded' });
      await hideAllModalsAndPopups(this._page);
      return this._page;
    }
    await useChatbotVersion(this.context, url);
    if (this.who === 'logged in') {
      const profile = this.lang === LANGUAGES.HE ? BROWSER_SETTINGS.heUser : BROWSER_SETTINGS.enUser;
      this._page = await goToPageWithUser(this.context, url, profile);
    } else {
      this._page = await goToPageWithLang(this.context, url, this.lang);
    }
    return this._page;
  }
}

/**
 * CHATBOT_VERSION (optional): the ai-chatbot PR whose Library Assistant build to load, for
 * testing an assistant change before it ships. Sefaria keeps the choice in the session, so one
 * request on the context's cookie jar sets it for every page after. It asks /texts, since the
 * home page redirects there and the redirect drops the parameter.
 */
export async function useChatbotVersion(context: BrowserContext, siteUrl: string): Promise<void> {
  const version = process.env.CHATBOT_VERSION;
  if (!version) return;
  await context.request.get(new URL(`/texts?chatbot_version=${encodeURIComponent(version)}`, siteUrl).toString());
}

type Fixtures = { visitor: Visitor };

export const test = base.extend<Fixtures>({
  visitor: async ({ context, request, baseURL }, use) => {
    await use(new Visitor(context, request, baseURL));
  },
});

export { expect } from '@playwright/test';

// ---------------------------------------------------------------------------------------
// Guarded step functions
// ---------------------------------------------------------------------------------------

const bdd = createBdd(test);

/** True when a step function's body has no code (comments only). Exported for its test. */
export function hasEmptyBody(fn: Function): boolean {
  const src = fn
    .toString()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  return /(=>|\))\s*\{\s*\}\s*$/.test(src);
}

function guarded<T extends (...args: any[]) => any>(keyword: string, register: T): T {
  return ((...args: any[]) => {
    const fn = args[args.length - 1];
    if (typeof fn === 'function' && hasEmptyBody(fn)) {
      throw new Error(
        `${keyword}(${JSON.stringify(String(args[0]))}) has an empty body. ` +
          `A pasted bddgen snippet must be filled in before it can run: an empty step ` +
          `passes without checking anything. See e2e-tests/feature-specs/README.md.`
      );
    }
    return register(...args);
  }) as T;
}

export const Given = guarded('Given', bdd.Given);
export const When = guarded('When', bdd.When);
export const Then = guarded('Then', bdd.Then);
export const Step = guarded('Step', bdd.Step);
export const { Before, After, BeforeAll, AfterAll } = bdd;
