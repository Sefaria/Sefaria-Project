import fs from 'fs';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import { Browser, BrowserContext, Page, Route, devices } from '@playwright/test';
import { test, expect, pageFetch } from '../fixtures';
import { RESULTS_DIR, TargetName, baseURLFor, loadManifest, maskSecrets } from '../env';
import { contextAs, prepareContext } from '../session';
import { t } from '../../globals';

/**
 * Accessibility audit of developer settings, the React Account tab and the Powered by form:
 * axe-core with the WCAG 2.1 A/AA rules in every reachable state, in English and Hebrew, at
 * desktop and phone width, plus keyboard, live-region, naming and zoom checks axe cannot make.
 *
 * Read-only on the server: states the seeded a11y accounts are not in are rendered by rewriting
 * the developer state the page boots from, and every write a state needs is answered by a route
 * that never reaches Django. Violations outside the feature (site header, footer, page shell)
 * are recorded but not asserted, because the same markup is on master.
 */

const SUITE = 'a11y';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const FEATURE_ROOTS = '.settingsPage, .devPocPage, .poweredByFormPage, .devPocModalStage';
const OUT_DIR = path.join(RESULTS_DIR, 'a11y-axe');
const ROLE: Record<Lang, string> = { english: 'setUp', hebrew: 'hebrew' };
const LANG_OF = new WeakMap<BrowserContext, Lang>();
/** A listing for the Hebrew account, which has none seeded; answering it is blocked. */
const SAMPLE_LISTING = { id: 0, name: 'E2E listing (a11y audit)', url: 'https://site-b.example.com', description: 'Never claimed.' };
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

type Lang = 'english' | 'hebrew';
type Width = 'desktop' | 'phone';
type DevState = Record<string, any>;
type Ctx = { page: Page; lang: Lang; width: Width; target: TargetName };

const langOf = (page: Page): Lang => LANG_OF.get(page.context()) || 'english';

/** The seeded project of the account a page is logged in as (one per language). */
function projectId(page: Page): string {
  const role = ROLE[langOf(page)];
  const key = loadManifest().keys.find((k: any) => k.suite === SUITE && k.role === role);
  if (!key) throw new Error(`The manifest has no a11y key for ${role}.`);
  return String(key.projectId);
}

// Contexts

async function openContext(browser: Browser, target: TargetName, lang: Lang, width: Width,
  { anonymous = false, host, viewport }: { anonymous?: boolean; host?: string; viewport?: { width: number; height: number } } = {},
): Promise<BrowserContext> {
  const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
  const options = width === 'phone'
    ? { ...iphone, viewport: viewport || PHONE }
    : { viewport: viewport || DESKTOP };
  if (anonymous) {
    const baseURL = host ? baseURLFor(target).replace(/www\.gateway\.test/, host) : baseURLFor(target);
    const context = await browser.newContext({ baseURL, locale: lang === 'hebrew' ? 'he-IL' : 'en-US', ...options });
    await prepareContext(context, baseURL, lang);
    await blockWrites(context);
    LANG_OF.set(context, lang);
    return context;
  }
  const deadline = Date.now() + 180000;
  for (;;) {
    try {
      const context = await contextAs(browser, target, SUITE, ROLE[lang], { lang, host, options });
      await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      await blockWrites(context);
      LANG_OF.set(context, lang);
      return context;
    } catch (error) {
      if (!/^No session for /.test(String((error as Error).message)) || Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

/** Closes a context without the polling routes still in flight reporting errors. */
async function closeQuietly(context: BrowserContext) {
  for (const page of context.pages()) await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await context.close().catch(() => {});
}

// Developer state rewriting

/** How a state differs from the seeded account's real developer state. */
type Shape = {
  keepListing?: boolean;
  notStarted?: boolean;
  verified?: boolean;
  confirmationSent?: boolean;
  noProfile?: boolean;
  noProjects?: boolean;
  publicProjectId?: string;
  listing?: Record<string, unknown>;
};

/** Self-contained (it is also serialised into the page): the real state, reshaped. */
function applyShape(state: DevState, shape: Shape): DevState {
  const out = Object.assign({}, state);
  if (!shape.keepListing) out.yourListing = shape.listing || null;
  if (shape.notStarted) {
    out.developerEnabled = false;
    out.profile = null;
    out.projects = [];
    out.confirmationSentAt = null;
  }
  if (shape.verified !== undefined) {
    out.emailVerified = shape.verified;
    out.ssoConnected = false;
  }
  if (shape.confirmationSent !== undefined) out.confirmationSentAt = shape.confirmationSent ? new Date().toISOString() : null;
  if (shape.noProfile) out.profile = null;
  if (shape.noProjects) out.projects = [];
  if (shape.publicProjectId) {
    out.projects = out.projects.map((p: any) => (String(p.id) === String(shape.publicProjectId) ? Object.assign({}, p, { visibility: 'public' }) : p));
  }
  return out;
}

/** Rewrites the page's boot data (DJANGO_VARS.props) as the inline script assigns it. */
async function patchBootProps(page: Page, patch: { shapeSrc?: string; shape?: Shape; props?: Record<string, unknown> }) {
  await page.addInitScript(({ shapeSrc, shape, props }) => {
    const apply = shapeSrc ? (0, eval)(`(${shapeSrc})`) : null;
    let stored: any;
    Object.defineProperty(window, 'DJANGO_VARS', {
      configurable: true,
      get: () => stored,
      set: (value: any) => {
        if (value && value.props) {
          if (apply && shape && value.props.initialDeveloper) value.props.initialDeveloper = apply(value.props.initialDeveloper, shape);
          if (props) Object.assign(value.props, props);
        }
        stored = value;
      },
    });
  }, patch);
}

/**
 * route.fetch() for a *.gateway.test URL: Node does not use the browser's resolver, so the
 * request goes to 127.0.0.1 with the original Host (CONTRACT.md §2).
 */
async function fetchOriginal(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const host = url.host;
  if (url.hostname.endsWith('gateway.test')) url.hostname = '127.0.0.1';
  return route.fetch({ url: url.toString(), headers: { ...(await request.allHeaders()), host } });
}

/**
 * Boots the developer tab from the reshaped real state, and answers state reads the same way, so
 * the polling for a confirmed email does not undo it.
 */
async function rewriteDeveloperState(page: Page, shape: Shape = {}) {
  await patchBootProps(page, { shapeSrc: applyShape.toString(), shape });
  await page.route('**/api/developer/state', async route => {
    const response = await fetchOriginal(route);
    return route.fulfill({ status: response.status(), contentType: 'application/json', body: JSON.stringify(applyShape(await response.json(), shape)) });
  });
}

/** The state as the page sees it (through rewriteDeveloperState's route, when there is one). */
async function pageState(page: Page): Promise<DevState> {
  const response = await pageFetch(page, '/api/developer/state');
  expect(response.status, response.text.slice(0, 200)).toBe(200);
  return response.json;
}

/** Answers one developer API write, without reaching the server. */
async function answerWrite(page: Page, pattern: RegExp, method: string, reply: (body: any) => Promise<{ status?: number; json: any }>) {
  await page.route(pattern, async route => {
    if (route.request().method() !== method) return route.fallback();
    const { status = 200, json } = await reply(route.request().postDataJSON?.() ?? null);
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  });
}

/**
 * Refuses every developer API write the page's own routes do not answer, so a stray click never
 * changes the seeded data. Registered on the context, which page routes take precedence over.
 */
async function blockWrites(context: BrowserContext) {
  await context.route(/\/api\/developer(-poc)?\//, async route => {
    if (route.request().method() === 'GET') return route.fallback();
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Blocked by the a11y audit.' }) });
  });
}

// Navigation

async function gotoSettings(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: t(60000) });
  await page.waitForFunction(() => !!(window as any).Sefaria, null, { timeout: t(45000) });
}

async function gotoDeveloper(page: Page, url = '/settings/developer') {
  await gotoSettings(page, url);
  await expect(page.locator('.devPocPage .devPocPageHeader')).toBeVisible({ timeout: t(30000) });
}

const projectCard = (page: Page) => page.locator('article.devPocProject').filter({ has: page.locator('button.devPocProjectToggle[aria-expanded="true"]') });
const keyRow = (page: Page) => projectCard(page).locator('article.devPocKey').first();
const dialogBy = (page: Page, titleId: string) => page.locator(`[role="dialog"][aria-labelledby="${titleId}"]`);

async function openProject(page: Page, shape: Shape = {}) {
  await rewriteDeveloperState(page, shape);
  await gotoDeveloper(page, `/settings/developer/projects/${projectId(page)}`);
  await expect(keyRow(page)).toBeVisible({ timeout: t(15000) });
}

async function openEditor(page: Page) {
  await projectCard(page).locator('button.devPocProjectEdit').click();
  await expect(projectCard(page).locator('#devPocProjectUrl')).toBeVisible();
}

async function openNewProject(page: Page) {
  await rewriteDeveloperState(page);
  await gotoDeveloper(page);
  await page.locator('[data-agent-action="new-project"]').first().click();
  await expect(page.locator('section.devPocNewProject')).toBeVisible();
}

/** A linked email page (expired, used, or sent to an old address), booted from the thank-you page. */
async function openLinkPage(page: Page, status: string) {
  await patchBootProps(page, { props: { initialMenu: 'developerEmailLink', initialDeveloperEmailLink: { status, key: 'a11y-audit-not-a-key' } } });
  await answerWrite(page, /\/api\/developer\/confirmation\/new-link$/, 'POST', async () => ({ json: {} }));
  await gotoSettings(page, '/settings/developer/email-confirmed');
  await expect(page.locator('.devPocEmailConfirmed h1')).toBeVisible({ timeout: t(15000) });
}

// States

type State = {
  id: string;
  what: string;
  anonymous?: boolean;
  host?: string;
  open: (c: Ctx) => Promise<void>;
};

const STATES: State[] = [
  {
    id: 'get-started', what: 'Get started (verified account, developer settings off)',
    open: async ({ page }) => {
      await rewriteDeveloperState(page, { notStarted: true, verified: true });
      await gotoDeveloper(page);
      await expect(page.locator('[data-agent-action="get-started"]')).toBeVisible();
    },
  },
  {
    id: 'confirm-email', what: '"Confirm your email address" after Get started (unverified)',
    open: async ({ page }) => {
      await rewriteDeveloperState(page, { notStarted: true, verified: false });
      await gotoDeveloper(page);
      await page.locator('[data-agent-action="get-started"]').click();
      await expect(page.locator('[data-agent-action="send-confirmation"]')).toBeVisible();
    },
  },
  {
    id: 'check-email', what: '"Check your email", after Resend ("Sent again.")',
    open: async ({ page }) => {
      await rewriteDeveloperState(page, { notStarted: true, verified: false, confirmationSent: true });
      await answerWrite(page, /\/api\/developer\/confirmation$/, 'POST', async () => ({ json: await pageState(page) }));
      await gotoDeveloper(page);
      await page.locator('[data-agent-action="resend-confirmation"]').click();
      await expect(page.locator('.devPocSsoPrompt [role="status"]')).toBeVisible();
    },
  },
  {
    id: 'setting-up', what: '"Setting up developer settings…" spinner',
    open: async ({ page }) => {
      await rewriteDeveloperState(page, { notStarted: true, verified: true });
      await answerWrite(page, /\/api\/developer\/enable$/, 'POST', async () => ({ json: { ...(await pageState(page)), developerEnabled: true } }));
      await gotoDeveloper(page);
      await page.locator('[data-agent-action="get-started"]').click();
      await expect(page.locator('.devPocSettingUp')).toBeVisible();
    },
  },
  {
    id: 'profile-terms', what: '"About you" profile and terms, after Continue with nothing filled in',
    open: async ({ page }) => {
      await rewriteDeveloperState(page, { noProfile: true, noProjects: true });
      await gotoDeveloper(page);
      await page.locator('[data-agent-action="save-profile"]').click();
      await expect(page.locator('.devPocOnboarding [role="alert"]')).toBeVisible();
    },
  },
  {
    id: 'projects-empty', what: 'No projects yet',
    open: async ({ page }) => {
      await rewriteDeveloperState(page, { noProjects: true });
      await gotoDeveloper(page);
      await expect(page.locator('.devPocEmpty')).toBeVisible();
    },
  },
  {
    id: 'reconfirm-email', what: 'Account email changed: "Confirm your new email address"',
    open: async ({ page }) => {
      await rewriteDeveloperState(page, { verified: false });
      await gotoDeveloper(page);
      await expect(page.locator('.devPocReconfirm')).toBeVisible();
    },
  },
  {
    id: 'claim-dialog', what: '"Is this your project?" claim dialog (pending listing)',
    open: async ({ page }) => {
      await rewriteDeveloperState(page, langOf(page) === 'hebrew' ? { listing: SAMPLE_LISTING } : { keepListing: true });
      await gotoDeveloper(page);
      await expect(dialogBy(page, 'devPocYourListingTitle')).toBeVisible({ timeout: t(15000) });
    },
  },
  {
    id: 'project-list', what: 'Project list, collapsed',
    open: async ({ page }) => {
      await rewriteDeveloperState(page);
      await gotoDeveloper(page);
      await expect(page.locator('article.devPocProject').first()).toBeVisible();
    },
  },
  {
    id: 'profile-edit', what: 'Profile editor ("Edit" on the profile summary)',
    open: async ({ page }) => {
      await rewriteDeveloperState(page);
      await gotoDeveloper(page);
      await page.locator('.devPocProfileSummary button').click();
      await expect(page.locator('.devPocProfile form')).toBeVisible();
    },
  },
  {
    id: 'project-detail', what: 'Project detail with a key, restriction switch and explainer open',
    open: async ({ page }) => {
      await openProject(page);
      await projectCard(page).locator('.devPocExplainerToggle').first().click();
      await expect(projectCard(page).locator('.devPocExplainer').first()).toBeVisible();
    },
  },
  {
    id: 'key-revealed-copied', what: 'Key shown and copied ("Copied" status)',
    open: async ({ page }) => {
      await openProject(page);
      await keyRow(page).locator('[data-agent-action="show-key"]').click();
      await keyRow(page).locator('[data-agent-action="copy-key"]').click();
      await expect(keyRow(page).locator('.devPocCopied')).not.toBeEmpty();
    },
  },
  {
    id: 'key-create-form', what: 'Create key form, after Create with no name',
    open: async ({ page }) => {
      await openProject(page);
      await projectCard(page).locator('[data-agent-action="new-key"]').click();
      await projectCard(page).locator('[data-agent-action="create-key"]').click();
      await expect(projectCard(page).locator('.devPocCreateKey [role="alert"]')).toBeVisible();
    },
  },
  {
    id: 'key-setting-up', what: '"Setting up your key…" while a key is created',
    open: async ({ page }) => {
      await stubKeyCreation(page);
      await projectCard(page).locator('[data-agent-action="new-key"]').click();
      await projectCard(page).locator('#devPocKeyLabel').fill('A11y audit key');
      await projectCard(page).locator('[data-agent-action="create-key"]').click();
      await expect(projectCard(page).locator('.devPocSettingUp')).toBeVisible();
    },
  },
  {
    id: 'key-ready', what: 'New key ready ("Ready to use")',
    open: async ({ page }) => {
      await stubKeyCreation(page);
      await projectCard(page).locator('[data-agent-action="new-key"]').click();
      await projectCard(page).locator('#devPocKeyLabel').fill('A11y audit key');
      await projectCard(page).locator('[data-agent-action="create-key"]').click();
      await expect(projectCard(page).locator('.devPocKeyReady')).toBeVisible({ timeout: t(15000) });
    },
  },
  {
    id: 'delete-key-dialog', what: 'Delete key confirmation dialog',
    open: async ({ page }) => {
      await openProject(page);
      await keyRow(page).locator('.devPocKeyHeading button').click();
      await expect(dialogBy(page, 'devPocConfirmTitle')).toBeVisible();
    },
  },
  {
    id: 'project-editor', what: 'Project editor open',
    open: async ({ page }) => {
      await openProject(page);
      await openEditor(page);
    },
  },
  {
    id: 'delete-project-dialog', what: 'Delete project confirmation dialog',
    open: async ({ page }) => {
      await openProject(page);
      await openEditor(page);
      await projectCard(page).locator('button.devPocDanger').filter({ hasText: /Delete project|מחיקת הפרויקט/ }).click();
      await expect(dialogBy(page, 'devPocConfirmTitle')).toBeVisible();
    },
  },
  {
    id: 'make-private-dialog', what: '"Make it private?" dialog on a public project',
    open: async ({ page }) => {
      await openProject(page, { publicProjectId: projectId(page) });
      await openEditor(page);
      await projectCard(page).locator('#devPocVisibilityPrivate').click();
      await expect(dialogBy(page, 'devPocPrivateTitle')).toBeVisible();
    },
  },
  {
    id: 'new-project', what: 'New project panel, after Create with nothing filled in',
    open: async ({ page }) => {
      await openNewProject(page);
      await page.locator('section.devPocNewProject [data-agent-action="create-project"]').click();
      await expect(page.locator('section.devPocNewProject [role="alert"], section.devPocNewProject [aria-invalid="true"]').first()).toBeVisible();
    },
  },
  {
    id: 'public-preview-dialog', what: '"What will be public" dialog',
    open: async ({ page }) => {
      await openNewProject(page);
      await page.locator('section.devPocNewProject [data-agent-action="show-public-preview"]').click();
      await expect(dialogBy(page, 'devPocPublicTitle')).toBeVisible();
    },
  },
  {
    id: 'no-website-dialog', what: '"Save without a website?" dialog',
    open: async ({ page }) => {
      await openNewProject(page);
      const panel = page.locator('section.devPocNewProject');
      await panel.locator('#devPocProjectName').fill('A11y audit project');
      await panel.locator('#devPocProjectDescription').fill('Never saved.');
      await panel.locator('#devPocVisibilityPrivate').check({ force: true });
      await panel.locator('[data-agent-action="create-project"]').click();
      await expect(dialogBy(page, 'devPocNoWebsiteTitle')).toBeVisible();
    },
  },
  {
    id: 'email-confirmed', what: 'Confirmation link: "Thank you for confirming your email"', anonymous: true,
    open: async ({ page }) => {
      await gotoSettings(page, '/settings/developer/email-confirmed');
      await expect(page.locator('.devPocEmailConfirmed h1')).toBeVisible({ timeout: t(15000) });
    },
  },
  {
    id: 'link-expired', what: 'Confirmation link expired, after "Send a new link"', anonymous: true,
    open: async ({ page }) => {
      await openLinkPage(page, 'expired');
      await page.locator('[data-agent-action="send-new-link"]').click();
      await expect(page.locator('.devPocEmailConfirmed [role="status"]')).toBeVisible();
    },
  },
  {
    id: 'link-used', what: 'Confirmation link already used ("Already confirmed")', anonymous: true,
    open: async ({ page }) => openLinkPage(page, 'already-confirmed'),
  },
  {
    id: 'link-outdated', what: 'Confirmation link for an old address ("no longer valid")', anonymous: true,
    open: async ({ page }) => openLinkPage(page, 'not-account-email'),
  },
  {
    id: 'account-tab', what: 'React Account settings tab (flag on)',
    open: async ({ page }) => {
      await rewriteDeveloperState(page);
      await gotoSettings(page, '/settings/account');
      await expect(page.locator('.settingsPanel:not([hidden]) .section').first()).toBeVisible({ timeout: t(30000) });
    },
  },
  {
    id: 'account-tab-flag-off', what: 'Account settings tab with developer settings off (flag-off server)', host: 'flagoff.gateway.test',
    open: async ({ page }) => {
      await gotoSettings(page, '/settings/account');
      await expect(page.locator('.settingsPanel:not([hidden]) .section').first()).toBeVisible({ timeout: t(30000) });
    },
  },
  {
    id: 'powered-by-form', what: 'Powered by form, after Submit with nothing filled in', anonymous: true,
    open: async ({ page }) => {
      await gotoSettings(page, '/powered-by/form');
      const form = page.locator('form.pbfForm');
      await expect(form).toBeVisible({ timeout: t(30000) });
      await form.locator('button[type="submit"]').last().click();
      await expect(page.locator('.pbfPageError, .pbfErrorNote').first()).toBeVisible();
    },
  },
];

/** Opens the project and answers key creation with a made-up key, so nothing is created. */
async function stubKeyCreation(page: Page) {
  await rewriteDeveloperState(page);
  await answerWrite(page, new RegExp(`/api/developer/projects/${projectId(page)}/keys$`), 'POST', async body => {
    const real = await pageState(page);
    const key = { id: 'a11y-audit-key', label: body?.label || 'A11y audit key', value: 'a11y-audit-not-a-real-key', created: new Date().toISOString(), restrictToWebsite: false };
    return { json: { ...real, keyId: key.id, projects: real.projects.map((p: any) => (String(p.id) === projectId(page) ? { ...p, keys: [...p.keys, key] } : p)) } };
  });
  await gotoDeveloper(page, `/settings/developer/projects/${projectId(page)}`);
  await expect(keyRow(page)).toBeVisible({ timeout: t(15000) });
}

/**
 * Violations found in a state, as `A11Y-<n>` ids from the accessibility audit. A
 * state × variant listed here has a test titled @known-gap with those ids; it stays failing
 * until the violations are fixed.
 */
const KNOWN: Record<string, string[]> = {
  'get-started': ['A11Y-6'],
  'confirm-email': ['A11Y-6'],
  'check-email': ['A11Y-6'],
  'setting-up': ['A11Y-6'],
  'profile-terms.phone': ['A11Y-6'],
  'projects-empty': ['A11Y-6'],
  'reconfirm-email': ['A11Y-6'],
  'project-list': ['A11Y-6'],
  'profile-edit': ['A11Y-6'],
  'project-detail.phone': ['A11Y-6'],
  'key-revealed-copied': ['A11Y-6'],
  'key-create-form': ['A11Y-6'],
  'key-setting-up': ['A11Y-6'],
  'key-ready': ['A11Y-6'],
  'project-editor': ['A11Y-6'],
  'make-private-dialog.english.phone': ['A11Y-10'],
  'new-project.phone': ['A11Y-6'],
  'account-tab': ['A11Y-6', 'A11Y-8'],
  'account-tab-flag-off': ['A11Y-6', 'A11Y-8'],
};

function knownFor(stateId: string, lang: Lang, width: Width): string[] {
  return [...new Set([...(KNOWN[stateId] || []), ...(KNOWN[`${stateId}.${lang}`] || []),
    ...(KNOWN[`${stateId}.${width}`] || []), ...(KNOWN[`${stateId}.${lang}.${width}`] || [])])];
}

// axe

type Finding = { rule: string; impact: string; help: string; scope: 'feature' | 'site' | 'behind-modal'; targets: string[]; html: string[]; summaries: string[] };

const VISUAL_RULES = new Set(['color-contrast', 'link-in-text-block']);

/**
 * Runs axe and sorts each failing node into the feature, the site around it, or (for colour
 * rules) page content dimmed behind an open modal, which nobody can read or reach then.
 */
/** The arrival highlight is a 2.4 s flash with its own check; scans run once it has finished. */
async function highlightDone(page: Page) {
  await page.waitForFunction(() => document.getAnimations()
    .every(a => (a as any).animationName !== 'settingsHighlight' || a.playState !== 'running'), null, { timeout: t(10000) });
}

async function audit(page: Page, name: string, lang: Lang): Promise<Finding[]> {
  await page.waitForTimeout(300);
  await highlightDone(page);
  const interfaceLang = await page.evaluate(() => (window as any).Sefaria?.interfaceLang);
  expect(interfaceLang, 'the page renders in the language under test').toBe(lang);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const findings: Finding[] = [];
  for (const v of results.violations) {
    const nodes = await Promise.all(v.nodes.map(async node => {
      const selector = String(node.target[node.target.length - 1]);
      const where = await page.evaluate(([sel, roots]) => {
        try {
          const el = document.querySelector(sel);
          const modal = Array.from(document.querySelectorAll('[aria-modal="true"]')).find(m => (m as HTMLElement).getClientRects().length > 0);
          return { inFeature: !!el && !!el.closest(roots), behindModal: !!modal && !!el && !modal.contains(el) };
        } catch { return { inFeature: false, behindModal: false }; }
      }, [selector, FEATURE_ROOTS] as const);
      const scope: Finding['scope'] = where.behindModal && VISUAL_RULES.has(v.id) ? 'behind-modal' : where.inFeature ? 'feature' : 'site';
      return { scope, selector, html: node.html, summary: node.failureSummary || '' };
    }));
    for (const scope of ['feature', 'site', 'behind-modal'] as const) {
      const mine = nodes.filter(n => n.scope === scope);
      if (!mine.length) continue;
      findings.push({
        rule: v.id, impact: v.impact || 'unknown', help: v.help, scope,
        targets: mine.map(n => n.selector), html: mine.map(n => n.html.slice(0, 300)),
        summaries: mine.map(n => n.summary.replace(/\s+/g, ' ').slice(0, 400)),
      });
    }
  }
  const incomplete = results.incomplete
    .filter(v => v.id === 'color-contrast')
    .map(v => ({ rule: v.id, targets: v.nodes.map(n => String(n.target[n.target.length - 1])).slice(0, 10) }));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), maskSecrets(JSON.stringify({ url: page.url(), interfaceLang, findings, incomplete }, null, 2)));
  return findings;
}

const describeFindings = (findings: Finding[]) =>
  maskSecrets(findings.map(f => `${f.rule} (${f.impact}) ×${f.targets.length}: ${f.targets.slice(0, 4).join(' | ')}`).join('\n'));

test.describe('developer settings: axe WCAG 2.1 AA audit', () => {
  test.describe.configure({ timeout: t(120000) });

  test.beforeEach(async ({ target }) => {
    test.skip(target.name !== 'local', 'The a11y audit runs on the local stack.');
  });

  for (const width of ['desktop', 'phone'] as Width[]) {
    for (const lang of ['english', 'hebrew'] as Lang[]) {
      for (const state of STATES) {
        const gaps = knownFor(state.id, lang, width);
        const tag = gaps.length ? ` @known-gap ${gaps.join(' ')}` : '';
        test(`C10 (axe, ${lang}, ${width}): ${state.what} has no WCAG 2.1 AA violations in the feature${tag}`, async ({ browser, target }) => {
          if (state.host) test.skip(!target.hasFlagOffServer, 'Needs the flag-off server.');
          const context = await openContext(browser, target.name, lang, width, { anonymous: state.anonymous, host: state.host });
          try {
            const page = await context.newPage();
            await state.open({ page, lang, width, target: target.name });
            const findings = await audit(page, `${state.id}.${lang}.${width}`, lang);
            const site = findings.filter(f => f.scope !== 'feature');
            if (site.length) test.info().annotations.push({ type: 'site-wide or behind a modal (not asserted)', description: describeFindings(site) });
            const feature = findings.filter(f => f.scope === 'feature');
            expect(feature.map(f => f.rule), describeFindings(feature)).toEqual([]);
          } finally {
            await closeQuietly(context);
          }
        });
      }
    }
  }
});

// Checks axe does not make

async function describeFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''} "${name}"`;
  });
}

/**
 * Tabs through the page from the top and, for every stop inside the feature, compares the
 * focused look with the unfocused one. Returns the stops with no visible change.
 */
async function tabStopsWithoutFocusIndicator(page: Page, maxStops = 60): Promise<{ stops: string[]; invisible: string[]; offscreen: string[] }> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.click(1, 1);
  const stops: string[] = [];
  const invisible: string[] = [];
  const offscreen: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate((roots) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || !el.closest(roots)) return null;
      const look = (s: CSSStyleDeclaration) => [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine, s.color].join('|');
      const focused = look(getComputedStyle(el));
      const clone = el.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      clone.style.position = 'absolute';
      clone.style.pointerEvents = 'none';
      el.parentElement!.appendChild(clone);
      const unfocused = look(getComputedStyle(clone));
      clone.remove();
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0;
      const s = getComputedStyle(el);
      const indicator = focused !== unfocused && !(s.outlineStyle === 'none' && s.boxShadow === 'none' && focused.split('|').slice(4).join() === unfocused.split('|').slice(4).join());
      return { visible, indicator, key: el.outerHTML.slice(0, 120) };
    }, FEATURE_ROOTS);
    if (!info) continue;
    const label = await describeFocus(page);
    if (seen.has(info.key)) break;
    seen.add(info.key);
    stops.push(label);
    if (!info.visible) offscreen.push(label);
    else if (!info.indicator) invisible.push(label);
  }
  return { stops, invisible, offscreen };
}

async function noHorizontalScroll(page: Page): Promise<{ scrollWidth: number; clientWidth: number; wide: string[] }> {
  return page.evaluate((roots) => {
    const doc = document.documentElement;
    const wide = Array.from(document.querySelectorAll(roots.split(',').map(r => `${r.trim()} *`).join(',')))
      .filter(el => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1);
      })
      .slice(0, 5)
      .map(el => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).trim().split(/\s+/).join('.')}`);
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide };
  }, FEATURE_ROOTS);
}

/**
 * Starts recording, for each live-region message that appears, whether its region was already
 * in the page before the text arrived (screen readers reliably announce only that case).
 */
async function watchLiveRegions(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__liveLog = [] as { text: string; regionWasThere: boolean }[];
    const isLive = (el: Element | null) => !!el && !!el.closest('[role="status"], [role="alert"], [aria-live]');
    const regionsBefore = new WeakSet<Element>();
    document.querySelectorAll('[role="status"], [role="alert"], [aria-live]').forEach(el => regionsBefore.add(el));
    new MutationObserver(records => {
      for (const r of records) {
        const nodes = r.type === 'characterData' ? [r.target] : Array.from(r.addedNodes);
        for (const n of nodes) {
          const el = n.nodeType === 1 ? n as Element : n.parentElement;
          if (!el || !isLive(el)) continue;
          const region = el.closest('[role="status"], [role="alert"], [aria-live]')!;
          const text = (n.textContent || '').trim();
          if (!text) continue;
          w.__liveLog.push({ text: text.slice(0, 60), regionWasThere: regionsBefore.has(region) });
        }
      }
      document.querySelectorAll('[role="status"], [role="alert"], [aria-live]').forEach(el => regionsBefore.add(el));
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

const liveLog = (page: Page) => page.evaluate(() => (window as any).__liveLog as { text: string; regionWasThere: boolean }[]);

test.describe('developer settings: keyboard, names, live regions and zoom (C10)', () => {
  test.describe.configure({ timeout: t(120000) });

  test.beforeEach(async ({ target }) => {
    test.skip(target.name !== 'local', 'The a11y audit runs on the local stack.');
  });

  for (const lang of ['english', 'hebrew'] as Lang[]) {
    test(`C10 (keyboard, ${lang}): every Tab stop on a project's page is visible and shows focus`, async ({ browser, target }) => {
      const context = await openContext(browser, target.name, lang, 'desktop');
      try {
        const page = await context.newPage();
        await openProject(page);
        const { stops, invisible, offscreen } = await tabStopsWithoutFocusIndicator(page);
        test.info().annotations.push({ type: 'tab order', description: stops.join(' → ') });
        expect(stops.length, 'Tab reaches the feature').toBeGreaterThan(5);
        expect(offscreen, 'Tab stops with no size on screen').toEqual([]);
        expect(invisible, 'Tab stops whose look does not change on focus').toEqual([]);
      } finally {
        await closeQuietly(context);
      }
    });
  }

  test('C10 (keyboard): every Tab stop on the Account tab and the Powered by form shows focus', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await rewriteDeveloperState(page);
      await gotoSettings(page, '/settings/account');
      await expect(page.locator('.settingsPanel:not([hidden]) .section').first()).toBeVisible({ timeout: t(30000) });
      const account = await tabStopsWithoutFocusIndicator(page);
      await gotoSettings(page, '/powered-by/form');
      await expect(page.locator('form.pbfForm')).toBeVisible({ timeout: t(30000) });
      const form = await tabStopsWithoutFocusIndicator(page, 80);
      test.info().annotations.push({ type: 'tab order', description: `account: ${account.stops.join(' → ')}\nform: ${form.stops.join(' → ')}` });
      expect([...account.offscreen, ...form.offscreen], 'Tab stops with no size on screen').toEqual([]);
      expect([...account.invisible, ...form.invisible], 'Tab stops whose look does not change on focus').toEqual([]);
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (keyboard): "Make it private?" starts inside, traps Tab, and Escape returns focus to Private', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await openProject(page, { publicProjectId: projectId(page) });
      await openEditor(page);
      const privateRadio = projectCard(page).locator('#devPocVisibilityPrivate');
      await privateRadio.focus();
      await page.keyboard.press('Space');
      const dialog = dialogBy(page, 'devPocPrivateTitle');
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(d => d.contains(document.activeElement)), `focus is on ${await describeFocus(page)}`).toBe(true);
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
        expect(await dialog.evaluate(d => d.contains(document.activeElement)), `focus is on ${await describeFocus(page)}`).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(await describeFocus(page)).toContain('devPocVisibility');
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (keyboard): the new-project panel opens on its first field, and Cancel returns focus to New project @known-gap A11Y-5', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await rewriteDeveloperState(page);
      await gotoDeveloper(page);
      const opener = page.locator('[data-agent-action="new-project"]').first();
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#devPocProjectName')).toBeFocused();
      await page.locator('section.devPocNewProject button').filter({ hasText: /^Cancel$/ }).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('section.devPocNewProject')).toHaveCount(0);
      expect(await describeFocus(page), 'focus after Cancel').toContain('New project');
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (names): key buttons, the restriction switch and the project toggle have names and states', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await openProject(page);
      const row = keyRow(page);
      await expect(row.getByRole('button', { name: 'Show key', exact: true })).toHaveAttribute('aria-pressed', 'false');
      await row.getByRole('button', { name: 'Show key', exact: true }).click();
      await expect(row.getByRole('button', { name: 'Hide key', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(row.getByRole('button', { name: 'Copy key', exact: true })).toBeVisible();
      await expect(projectCard(page).locator('button.devPocProjectToggle')).toHaveAttribute('aria-expanded', 'true');
      await expect(row.locator('input.devPocSwitch')).toHaveAccessibleName(/^Only accept requests from .+ \(.+\)$/);
      await expect(projectCard(page).locator('.devPocExplainerToggle').first()).toHaveAttribute('aria-expanded', 'false');
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (names): the restriction switch\'s name contains its visible label (WCAG 2.5.3) @known-gap A11Y-1', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await openProject(page);
      const toggle = keyRow(page).locator('input.devPocSwitch');
      const visible = (await keyRow(page).locator('.devPocRestrictionRow label').innerText()).replace(/\s+/g, ' ').trim();
      const name = await toggle.evaluate(el => el.getAttribute('aria-label') || '');
      expect(name.toLowerCase(), `visible "${visible}", name "${name}"`).toContain(visible.toLowerCase());
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (names): each Delete key button says which key it deletes @known-gap A11Y-2', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await stubKeyCreation(page);
      const labels = await projectCard(page).locator('article.devPocKey .devPocKeyHeading strong').allInnerTexts();
      const names = await projectCard(page).locator('article.devPocKey .devPocKeyHeading button').evaluateAll(buttons =>
        buttons.map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()));
      for (const [i, label] of labels.entries()) expect(names[i], `button ${i}`).toContain(label);
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (dialogs): every confirmation dialog points aria-describedby at its message @known-gap A11Y-3', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await openProject(page);
      await keyRow(page).locator('.devPocKeyHeading button').click();
      const dialog = dialogBy(page, 'devPocConfirmTitle');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAccessibleDescription(/stops working/);
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (live regions): "Copied" is announced from a region that was already in the page', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await openProject(page);
      await watchLiveRegions(page);
      await keyRow(page).locator('[data-agent-action="copy-key"]').click();
      await expect(keyRow(page).locator('.devPocCopied')).not.toBeEmpty();
      const log = await liveLog(page);
      expect(log.length, JSON.stringify(log)).toBeGreaterThan(0);
      expect(log.filter(l => !l.regionWasThere), JSON.stringify(log)).toEqual([]);
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (live regions): "Setting up your key…" and "Ready to use" are announced from regions already in the page @known-gap A11Y-4', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await stubKeyCreation(page);
      await projectCard(page).locator('[data-agent-action="new-key"]').click();
      await projectCard(page).locator('#devPocKeyLabel').fill('A11y audit key');
      await watchLiveRegions(page);
      await projectCard(page).locator('[data-agent-action="create-key"]').click();
      await expect(projectCard(page).locator('.devPocKeyReady')).toBeVisible({ timeout: t(15000) });
      const log = await liveLog(page);
      expect(log.some(l => /Setting up/.test(l.text)), JSON.stringify(log)).toBe(true);
      expect(log.filter(l => !l.regionWasThere), JSON.stringify(log)).toEqual([]);
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (live regions): form errors and "Sent again." are announced from regions already in the page @known-gap A11Y-4', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await rewriteDeveloperState(page, { notStarted: true, verified: false, confirmationSent: true });
      await answerWrite(page, /\/api\/developer\/confirmation$/, 'POST', async () => ({ json: await pageState(page) }));
      await gotoDeveloper(page);
      await watchLiveRegions(page);
      await page.locator('[data-agent-action="resend-confirmation"]').click();
      await expect(page.locator('.devPocSsoPrompt [role="status"]')).toBeVisible();
      const log = await liveLog(page);
      expect(log.filter(l => !l.regionWasThere), JSON.stringify(log)).toEqual([]);
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (contrast): text keeps 4.5:1 while the arrival highlight is showing @known-gap A11Y-7', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await rewriteDeveloperState(page, { notStarted: true, verified: true });
      await page.goto('/settings/developer', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.settingsHighlight').first()).toBeVisible({ timeout: t(30000) });
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).include('.settingsHighlight').analyze();
      const nodes = results.violations.flatMap(v => v.nodes.map(n => `${n.target.join(' ')}: ${(n.failureSummary || '').replace(/\s+/g, ' ').slice(60, 200)}`));
      expect(nodes, nodes.join('\n')).toEqual([]);
    } finally {
      await closeQuietly(context);
    }
  });

  test('C10 (contrast): the contact email link in a dialog is told apart from its sentence by more than colour @known-gap A11Y-10', async ({ browser, target }) => {
    const context = await openContext(browser, target.name, 'english', 'desktop');
    try {
      const page = await context.newPage();
      await openProject(page, { publicProjectId: projectId(page) });
      await openEditor(page);
      await projectCard(page).locator('#devPocVisibilityPrivate').click();
      const link = dialogBy(page, 'devPocPrivateTitle').locator('a[href^="mailto:"]');
      await expect(link).toBeVisible();
      const style = await link.evaluate(a => {
        const own = getComputedStyle(a);
        const around = getComputedStyle(a.parentElement!);
        const lum = (c: string) => {
          const [r, g, b] = (c.match(/\d+(\.\d+)?/g) || ['0', '0', '0']).slice(0, 3).map(Number).map(v => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const [hi, lo] = [lum(own.color), lum(around.color)].sort((x, y) => y - x);
        return { underline: own.textDecorationLine.includes('underline'), contrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, color: own.color, around: around.color };
      });
      expect(style.underline || style.contrast >= 3, JSON.stringify(style)).toBe(true);
    } finally {
      await closeQuietly(context);
    }
  });

  for (const { label, viewport } of [{ label: '200% zoom (640 px)', viewport: { width: 640, height: 450 } }, { label: 'reflow at 320 px (400% zoom)', viewport: { width: 320, height: 256 } }]) {
    test(`C10 (zoom): ${label}: project page, dialogs, Account tab and Powered by form fit without horizontal scrolling`, async ({ browser, target }) => {
      const context = await openContext(browser, target.name, 'english', 'desktop', { viewport });
      try {
        const page = await context.newPage();
        const problems: string[] = [];
        const check = async (where: string) => {
          const r = await noHorizontalScroll(page);
          if (r.scrollWidth > r.clientWidth) problems.push(`${where}: ${r.scrollWidth}px in ${r.clientWidth}px; widest ${r.wide.join(', ')}`);
        };
        await openProject(page);
        await check('project detail');
        await keyRow(page).locator('.devPocKeyHeading button').click();
        const dialog = dialogBy(page, 'devPocConfirmTitle');
        await expect(dialog).toBeVisible();
        for (const button of await dialog.getByRole('button').all()) {
          await button.scrollIntoViewIfNeeded();
          const box = await button.boundingBox();
          if (!box || box.x < 0 || box.x + box.width > viewport.width + 1) problems.push(`delete-key dialog button "${await button.innerText()}" is outside the viewport`);
        }
        await check('delete-key dialog');
        await page.keyboard.press('Escape');
        await openEditor(page);
        await check('project editor');
        await gotoSettings(page, '/settings/account');
        await expect(page.locator('.settingsPanel:not([hidden]) .section').first()).toBeVisible({ timeout: t(30000) });
        await check('account tab');
        await gotoSettings(page, '/powered-by/form');
        await expect(page.locator('form.pbfForm')).toBeVisible({ timeout: t(30000) });
        await check('powered by form');
        expect(problems).toEqual([]);
      } finally {
        await closeQuietly(context);
      }
    });
  }
});
