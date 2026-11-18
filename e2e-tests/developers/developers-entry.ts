/**
 * Shared entry points and test data for the DEV-* suites (W14). Every suite enters through the
 * house entry point (goToPageWithLang) on an absolute developers URL, so the tag-scoped
 * `*-sanity` and `chrome-pr` projects can run the tagged tests under the Library baseURL.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserContext, Page } from '@playwright/test';
import { goToPageWithLang } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { developersUrl } from '../pages/developers/developersCommon';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Open a portal page as an anonymous English visitor. */
export async function enterPortal(context: BrowserContext, pagePath = '/'): Promise<{ page: Page; pm: PageManager }> {
  const page = await goToPageWithLang(context, developersUrl(pagePath), LANGUAGES.EN);
  return { page, pm: new PageManager(page, LANGUAGES.EN) };
}

/**
 * Enter on a plain-text route that loads no script (robots.txt), so a test can install
 * interceptors (GA4 capture, recorded API responses, Formstack) before the page under test
 * loads, then go there with pm.onDevelopersShell().openPath().
 */
export async function enterBlank(context: BrowserContext): Promise<{ page: Page; pm: PageManager }> {
  return enterPortal(context, '/robots.txt');
}

/**
 * Answer requests to an external site locally (a tiny HTML page), so a new tab opened on it
 * proves where it went without loading the real site (rule: never depend on third parties).
 */
export async function stubExternalSites(context: BrowserContext, pattern: RegExp): Promise<void> {
  await context.route(pattern, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' })
  );
}

/** Read a JSON file from the repository (contracts, captured research data). */
export function readRepoJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')) as T;
}

interface NavItem {
  kind: string;
  href: string;
  newTab: boolean;
  children?: NavItem[];
}

/**
 * The flattened sidebar order prev/next follow (PLAN §6.2 F): every row of the section's navigation tree
 * (C3 `/_portal/nav/<section>.json`), children after their parent, without group rows (tag groups,
 * categories) and external link items.
 */
export async function flattenedSidebarOrder(pm: PageManager, section: 'docs' | 'reference'): Promise<string[]> {
  const nav = JSON.parse((await pm.onDevelopersCopyPage().httpGet(`/_portal/nav/${section}.json`)).body) as {
    categories: { items: NavItem[] }[];
  };
  const order: string[] = [];
  const walk = (items: NavItem[]) => {
    for (const item of items) {
      if (!['tag_group', 'category', 'link'].includes(item.kind) && !item.newTab) order.push(item.href);
      walk(item.children ?? []);
    }
  };
  for (const category of nav.categories) walk(category.items);
  return order;
}

/** Pages that carry each docs component (found by rendering every page of the seeded content). */
export const DOC_PAGES = {
  welcome: '/docs/welcome',
  callouts: '/docs/local-installation-instructions',
  codeTabs: '/docs/categories',
  captionedImages: '/docs/the-disambiguator',
  table: '/docs/text-references',
  embeds: '/docs/sefaria-research-at-pyconn-2024',
  htmlBlocks: '/docs/powered-by-sefaria',
  hebrew: '/docs/איך-ליצור-מראי-מקורות-להפניה',
  hidden: '/docs/shape-api',
  deprecated: '/docs/linker-v2',
  contact: '/page/contact-us',
} as const;

/** Endpoint pages used by DEV-REF / DEV-TRY. */
export const ENDPOINTS = {
  texts: { slug: 'get-v3-texts', path: '/reference/get-v3-texts', title: 'Texts (v3)', operationId: 'get-v3-texts' },
  findRefs: { slug: 'post-find-refs', path: '/reference/post-find-refs', operationId: 'post-find-refs' },
  deprecated: ['/reference/get-v1-texts', '/reference/get-topic-slug'],
} as const;

/** A recorded GET /api/v3/texts/Genesis 1:1 response, trimmed (PLAN §6.1.2). */
export const RECORDED_TEXTS_200 = JSON.stringify({
  versions: [
    {
      status: 'locked',
      priority: 1,
      license: 'CC-BY-SA',
      versionTitle: 'The Contemporary Torah, Jewish Publication Society, 2006',
      language: 'en',
      text: 'When God began to create heaven and earth—',
    },
  ],
  available_versions: [],
  ref: 'Genesis 1:1',
  heRef: 'בראשית א׳:א׳',
  sections: [1, 1],
  toSections: [1, 1],
  sectionRef: 'Genesis 1',
  firstAvailableSectionRef: 'Genesis 1',
  isSpanning: false,
  title: 'Genesis 1:1',
  book: 'Genesis',
});

/** The API's error body for a reference that does not exist. */
export const RECORDED_TEXTS_404 = JSON.stringify({ error: 'Could not find title in reference: Notabook 1:1' });
