import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, ENDPOINTS, RECORDED_TEXTS_200, enterBlank, stubExternalSites } from '../developers-entry';

// GA4 (PLAN §2.13, §6.5; contract C8), read from intercepted g/collect hits: nothing reaches Google.
// The event tests need a GA4 property configured (DEVPORTAL_GA4, e.g. {"default":"G-…"}); DEV-GA-020
// checks the other side, that an empty mapping sends nothing.
test.describe('Developers Analytics, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterBlank(context));
  });

  const named = (events: { name: string; params: Record<string, string> }[], name: string) =>
    events.filter((e) => e.name === name);

  test('DEV-GA-001: One page_view on load, with the page title and location', async () => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await shell.openPath(DOC_PAGES.welcome);
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(1);
    const [view] = named(ga.events, 'page_view');
    expect(view.params.page_title).toBe("Welcome to Sefaria's Technical Documentation");
    expect(view.params.page_location).toBe(new URL(DOC_PAGES.welcome, page.url()).toString());
  });

  test('DEV-GA-002: One page_view per client-side navigation, none duplicated', async () => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await shell.openPath(DOC_PAGES.welcome);
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(1);
    await shell.clickSidebarItem('Text References');
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(2);
    await shell.clickSidebarItem('Categories');
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(3);
    const views = named(ga.events, 'page_view');
    expect(views.map((v) => v.params.page_title)).toEqual([
      "Welcome to Sefaria's Technical Documentation",
      'Text References',
      'Categories',
    ]);
    expect(new Set(views.map((v) => v.params.page_location)).size).toBe(3);
  });

  test('DEV-GA-003: A fragment change is not a navigation', async () => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await shell.openPath(DOC_PAGES.welcome);
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(1);
    await pm.onDevelopersDocs().clickTocEntry('Quick Questions and Answers');
    await expect(page).toHaveURL(/#quick-questions-and-answers$/);
    await shell.clickSidebarItem('Text References');
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(2);
  });

  test('DEV-GA-004: Endpoint pages report the operation summary as the title', async () => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await shell.openPath(ENDPOINTS.texts.path);
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(1);
    expect(named(ga.events, 'page_view')[0].params.page_title).toBe(ENDPOINTS.texts.title);
    expect(await page.title()).toBe(ENDPOINTS.texts.title);
  });

  test('DEV-GA-005: The homepage is "Sefaria" and the 404 page is "404 Not Found"', async () => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await shell.openPath('/');
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(1);
    expect(await page.title()).toBe('Sefaria');
    expect(named(ga.events, 'page_view')[0].params.page_title).toBe('Sefaria');
    await shell.openPath('/no-such-page-e2e');
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(2);
    expect(await page.title()).toBe('404 Not Found');
    expect(named(ga.events, 'page_view')[1].params.page_title).toBe('404 Not Found');
  });

  test('DEV-GA-006: discord_cta_click carries the placement', async ({ context }) => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await stubExternalSites(context, /formstack\.com/);
    await shell.openPath('/');
    for (const placement of ['home_hero', 'home_community'] as const) {
      const tab = await shell.clickDiscordButton(placement);
      await tab.close();
    }
    await shell.openPath(DOC_PAGES.welcome);
    for (const placement of ['sidebar_footer', 'docs_page_end'] as const) {
      const tab = await shell.clickDiscordButton(placement);
      await tab.close();
    }
    await expect
      .poll(() => named(ga.events, 'discord_cta_click').map((e) => e.params.placement), { timeout: t(10000) })
      .toEqual(['home_hero', 'home_community', 'sidebar_footer', 'docs_page_end']);
  });

  test('DEV-GA-007: try_it_run carries the operation id, the method and the status, and no values', async () => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await pm.onDevelopersTryIt().fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await shell.openPath(ENDPOINTS.texts.path);
    await pm.onDevelopersReference().fillParameter('path', 'tref', 'Genesis 1:1');
    await pm.onDevelopersTryIt().clickTryIt();
    await pm.onDevelopersTryIt().waitForResult();
    await expect.poll(() => named(ga.events, 'try_it_run').length, { timeout: t(10000) }).toBe(1);
    const [run] = named(ga.events, 'try_it_run');
    expect(run.params).toMatchObject({ operation_id: ENDPOINTS.texts.operationId, method: 'GET', status: '200' });
    expect(JSON.stringify(ga.events)).not.toContain('Genesis');
  });

  test('DEV-GA-008: copy_page_action reports each action', async () => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await shell.openPath(DOC_PAGES.welcome);
    const copy = pm.onDevelopersCopyPage();
    await copy.copyMarkdown();
    await copy.copyMcpConfig();
    await copy.copyMcpCommand();
    await copy.connectTo('Cursor');
    // Following a deep link leaves the page waiting on an external app; continue from a fresh load.
    await shell.openPath(DOC_PAGES.welcome);
    await copy.connectTo('VS Code');
    await shell.openPath(DOC_PAGES.welcome);
    await copy.openInAssistant('ChatGPT');
    await copy.openInAssistant('Claude');
    const tab = await copy.viewAsMarkdown();
    await tab.close();
    await expect
      .poll(() => named(ga.events, 'copy_page_action').map((e) => e.params.action), { timeout: t(10000) })
      .toEqual([
        'copy_markdown',
        'copy_mcp_config',
        'copy_mcp_command',
        'connect_cursor',
        'connect_vscode',
        'open_chatgpt',
        'open_claude',
        'view_markdown',
      ]);
  });

  test('DEV-GA-009: contact_form_start is sent once, when focus first moves into the form', async () => {
    const shell = pm.onDevelopersShell();
    const docs = pm.onDevelopersDocs();
    const ga = await shell.captureAnalytics();
    await docs.interceptFormstack();
    await shell.openPath(DOC_PAGES.contact);
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(1);
    expect(named(ga.events, 'contact_form_start')).toHaveLength(0);
    await docs.focusFormstackFrame();
    await expect.poll(() => named(ga.events, 'contact_form_start').length, { timeout: t(10000) }).toBe(1);
    await docs.focusFormstackFrame();
    await expect.poll(() => named(ga.events, 'contact_form_start').length, { timeout: t(3000) }).toBe(1);
  });

  test('DEV-GA-010: Every event is a C8 event with C8 parameters only', async () => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await shell.openPath(DOC_PAGES.welcome);
    await shell.clickSidebarItem('Text References');
    await pm.onDevelopersSearch().openWithShortcut();
    await pm.onDevelopersSearch().search('secret-e2e-query');
    await expect.poll(() => named(ga.events, 'page_view').length, { timeout: t(15000) }).toBe(2);
    const allowed: Record<string, string[]> = {
      page_view: ['page_title', 'page_location'],
      discord_cta_click: ['placement'],
      try_it_run: ['operation_id', 'method', 'status'],
      copy_page_action: ['action'],
      contact_form_start: [],
    };
    for (const event of ga.events) {
      expect(Object.keys(allowed), event.name).toContain(event.name);
      for (const key of Object.keys(event.params)) expect(allowed[event.name], `${event.name}.${key}`).toContain(key);
    }
    expect(JSON.stringify(ga.events)).not.toContain('secret-e2e-query');
  });
});

test.describe('Developers Analytics, English (titles)', () => {
  test("DEV-GA-011: document.title equals live's title for every page in research/site/pages.json", async ({
    context,
  }) => {
    test.slow();
    const { pm } = await enterBlank(context);
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pages = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../docs/dev-portal/research/site/pages.json'), 'utf8')
    ) as { url: string; status: number; title: string }[];
    const copy = pm.onDevelopersCopyPage();
    const decode = (s: string) =>
      s
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    for (const live of pages.filter((p) => p.status === 200)) {
      const { pathname } = new URL(live.url);
      const result = await copy.httpGet(pathname, { followRedirects: true });
      const title = decode(result.body.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
      expect.soft(title, pathname).toBe(live.title.replace(/ \| Sefaria( Developers)?$/, ''));
    }
  });

  test("DEV-GA-012: Every endpoint page's title is its operation summary", async ({ context }) => {
    test.slow();
    const { pm } = await enterBlank(context);
    const copy = pm.onDevelopersCopyPage();
    const spec = JSON.parse((await copy.httpGet('/openapi/sefaria-api.json')).body) as {
      paths: Record<string, Record<string, { operationId?: string; summary?: string }>>;
    };
    const sitemap = (await copy.httpGet('/sitemap.xml')).body;
    let checked = 0;
    for (const methods of Object.values(spec.paths)) {
      for (const op of Object.values(methods)) {
        if (!op.operationId || !op.summary) continue;
        const pagePath = `/reference/${op.operationId}`;
        if (!sitemap.includes(`${pagePath}<`)) continue;
        const result = await copy.httpGet(pagePath);
        const title = result.body.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
        expect.soft(title.replace(/&#x27;/g, "'").replace(/&amp;/g, '&'), pagePath).toBe(op.summary);
        checked += 1;
      }
    }
    // The visible endpoint pages (hidden and unlisted ones are not in the sitemap).
    expect(checked).toBeGreaterThan(30);
  });

  test('DEV-GA-020: Nothing is sent to Google when DEVPORTAL_GA4 is empty, and gtag loads when it is set', async ({
    context,
  }) => {
    const { page, pm } = await enterBlank(context);
    const google: string[] = [];
    page.on('request', (request) => {
      if (/google(tagmanager|-analytics)\.com|analytics\.google\.com/.test(request.url())) google.push(request.url());
    });
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    const home = await pm.onDevelopersCopyPage().httpGet('/');
    const configured = !/"ga4":\s*\{\s*\}/.test(home.body);
    await shell.openPath(DOC_PAGES.welcome);
    await shell.clickSidebarItem('Text References');
    if (configured) {
      await expect.poll(() => google.some((u) => /gtag\/js\?id=G-/.test(u)), { timeout: t(10000) }).toBe(true);
    } else {
      await expect.poll(() => shell.pageTitle(), { timeout: t(10000) }).toBe('Text References');
      expect(google).toEqual([]);
      expect(ga.events).toEqual([]);
    }
  });
});
