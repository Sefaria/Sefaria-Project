import { test, expect, Page } from '@playwright/test';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, ENDPOINTS, enterPortal } from '../developers-entry';

// The agent surface over HTTP (PLAN §2.10, §6.2 I): .md pages and Accept negotiation, the llms files,
// the Link header, the discovery files, the OpenAPI file and the hidden "For AI agents" banner.
test.describe('Developers Agent Surface, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, DOC_PAGES.welcome));
  });

  test('DEV-AI-001: /docs/welcome.md returns Markdown with front matter', { tag: ['@sanity', '@pr'] }, async () => {
    const result = await pm.onDevelopersCopyPage().httpGet('/docs/welcome.md');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/^text\/markdown/);
    expect(result.body).toMatch(
      /^---\nupdatedAt: \S+\nagentTools:\n {2}projectIndex: https?:\/\/[^\n]+\/llms\.txt\n---\n/
    );
    expect(result.body).toContain("# Welcome to Sefaria's Technical Documentation");
  });

  test('DEV-AI-002: /llms.txt lists the docs and reference sections', { tag: ['@sanity', '@pr'] }, async () => {
    const result = await pm.onDevelopersCopyPage().httpGet('/llms.txt');
    expect(result.status).toBe(200);
    expect(result.body).toMatch(/^# Sefaria Documentation\n/);
    const headings = result.body.split('\n').filter((line) => line.startsWith('## '));
    expect(headings.some((h) => h.startsWith('## Docs: '))).toBe(true);
    expect(headings.some((h) => h.startsWith('## API Reference: '))).toBe(true);
    expect(result.body).toMatch(/\(https?:\/\/[^)]+\/docs\/welcome\.md\)/);
    expect(result.body).toMatch(/\(https?:\/\/[^)]+\/reference\/get-v3-texts\.md\)/);
  });

  test('DEV-AI-003: A page answers Markdown to Accept: text/markdown, with Vary: Accept', async () => {
    const copy = pm.onDevelopersCopyPage();
    const markdown = await copy.httpGet(DOC_PAGES.welcome, { accept: 'text/markdown' });
    expect(markdown.status).toBe(200);
    expect(markdown.headers['content-type']).toMatch(/^text\/markdown/);
    expect(markdown.headers['vary']).toMatch(/Accept/);
    expect(markdown.body).toBe((await copy.httpGet('/docs/welcome.md')).body);
    const html = await copy.httpGet(DOC_PAGES.welcome, { accept: 'text/html' });
    expect(html.headers['content-type']).toMatch(/^text\/html/);
    expect(html.headers['vary']).toMatch(/Accept/);
  });

  test('DEV-AI-004: Every page type answers at <path>.md', async () => {
    const copy = pm.onDevelopersCopyPage();
    for (const path of [DOC_PAGES.welcome, ENDPOINTS.texts.path, '/reference/getting-started', DOC_PAGES.contact]) {
      const result = await copy.httpGet(`${path}.md`);
      expect(result.status, path).toBe(200);
      expect(result.headers['content-type'], path).toMatch(/^text\/markdown/);
    }
  });

  test("DEV-AI-005: An endpoint's .md ends with the OpenAPI slice for that endpoint", async () => {
    const { body } = await pm.onDevelopersCopyPage().httpGet(`${ENDPOINTS.texts.path}.md`);
    expect(body).toContain('# Texts (v3)');
    const at = body.indexOf('# OpenAPI definition');
    expect(at).toBeGreaterThan(0);
    const fence = body.slice(at).match(/```json\n([\s\S]+)\n```\s*$/);
    expect(fence, 'a json fence at the end').not.toBeNull();
    const slice = JSON.parse(fence![1]);
    expect(Object.keys(slice.paths)).toEqual(['/api/v3/texts/{tref}']);
    expect(slice.paths['/api/v3/texts/{tref}'].get.operationId).toBeTruthy();
  });

  test("DEV-AI-006: In-portal links in the Markdown are absolute URLs on the request's host", async () => {
    const { body } = await pm.onDevelopersCopyPage().httpGet('/docs/welcome.md');
    const origin = new URL(page.url()).origin;
    expect(body).toContain(`(${origin}/reference/getting-started)`);
    expect(body).not.toMatch(/\]\(\/(docs|reference|page)\//);
  });

  test('DEV-AI-007: /docs/llms.txt and /reference/llms.txt list their own section; /llms-full.txt inlines pages', async () => {
    const copy = pm.onDevelopersCopyPage();
    const docs = await copy.httpGet('/docs/llms.txt');
    expect(docs.status).toBe(200);
    expect(docs.body).toContain('/docs/welcome.md');
    expect(docs.body).not.toContain('/reference/get-v3-texts.md');
    const reference = await copy.httpGet('/reference/llms.txt');
    expect(reference.status).toBe(200);
    expect(reference.body).toContain('/reference/get-v3-texts.md');
    expect(reference.body).not.toContain('/docs/welcome.md');
    const full = await copy.httpGet('/llms-full.txt');
    expect(full.status).toBe(200);
    expect(full.body.length).toBeGreaterThan(docs.body.length * 5);
    expect(full.body).toContain('This section is home to Sefaria');
  });

  test('DEV-AI-008: llms.txt leaves out hidden pages', async () => {
    const { body } = await pm.onDevelopersCopyPage().httpGet('/llms.txt');
    expect(body).not.toContain(`${DOC_PAGES.hidden}.md`);
  });

  // Live sends the Markdown alternate on documentation pages (SITE_ATLAS §1.3); the homepage has no .md version.
  test('DEV-AI-009: Every documentation page sends the five Link relations', async () => {
    const copy = pm.onDevelopersCopyPage();
    for (const path of [DOC_PAGES.welcome, ENDPOINTS.texts.path, DOC_PAGES.contact]) {
      const relations = await copy.linkRelations(path);
      expect(Object.keys(relations).sort(), path).toEqual(
        ['agent-skills', 'alternate', 'api-catalog', 'mcp-server', 'service-doc'].sort()
      );
      expect(relations['api-catalog'], path).toMatch(/\/\.well-known\/api-catalog$/);
      expect(relations['agent-skills'], path).toMatch(/\/\.well-known\/agent-skills\/index\.json$/);
      expect(relations['mcp-server'], path).toMatch(/\/\.well-known\/mcp\/server-card\.json$/);
      expect(relations['alternate'], path).toMatch(/\.md$/);
    }
    expect((await copy.linkRelations(DOC_PAGES.welcome)).alternate).toMatch(/\/docs\/welcome\.md$/);
  });

  test('DEV-AI-018: The homepage sends the four site-wide Link relations', async () => {
    const relations = await pm.onDevelopersCopyPage().linkRelations('/');
    expect(Object.keys(relations).sort()).toEqual(['agent-skills', 'api-catalog', 'mcp-server', 'service-doc']);
  });

  test("DEV-AI-010: The four discovery files answer with live's content types", async () => {
    const copy = pm.onDevelopersCopyPage();
    const expected: [string, RegExp][] = [
      ['/.well-known/api-catalog', /^application\/linkset\+json/],
      ['/.well-known/agent-skills/index.json', /^application\/json/],
      ['/.well-known/agent-skills/read-the-docs/SKILL.md', /^text\/markdown/],
      ['/.well-known/mcp/server-card.json', /^application\/json/],
    ];
    for (const [path, type] of expected) {
      const result = await copy.httpGet(path);
      expect(result.status, path).toBe(200);
      expect(result.headers['content-type'], path).toMatch(type);
    }
  });

  test("DEV-AI-011: The server card names org.sefaria/developers and points at this host's /mcp", async () => {
    const card = JSON.parse((await pm.onDevelopersCopyPage().httpGet('/.well-known/mcp/server-card.json')).body);
    expect(card.name).toBe('org.sefaria/developers');
    const origin = new URL(page.url()).origin;
    expect(JSON.stringify(card.remotes)).toContain(`${origin}/mcp`);
  });

  test('DEV-AI-012: /openapi/sefaria-api.json returns the spec', async () => {
    const result = await pm.onDevelopersCopyPage().httpGet('/openapi/sefaria-api.json');
    expect(result.status).toBe(200);
    const spec = JSON.parse(result.body);
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths['/api/v3/texts/{tref}']).toBeDefined();
  });

  test('DEV-AI-013: The hidden "For AI agents" banner is the first content in <body>', async () => {
    const banner = await pm.onDevelopersCopyPage().agentBanner();
    expect(banner.text).toMatch(/^For AI agents: the docs index is at https?:\/\/\S+\/llms\.txt\./);
    expect(banner.isFirstInBody).toBe(true);
    expect(banner.isVisuallyHidden).toBe(true);
  });

  test('DEV-AI-014: The banner is on every page type', async () => {
    const copy = pm.onDevelopersCopyPage();
    for (const path of ['/', ENDPOINTS.texts.path, DOC_PAGES.contact]) {
      await pm.onDevelopersShell().openPath(path);
      expect((await copy.agentBanner()).isFirstInBody, path).toBe(true);
    }
  });

  test('DEV-AI-015: /docs.md redirects to /docs/llms.txt', async () => {
    const result = await pm.onDevelopersCopyPage().httpGet('/docs.md');
    expect(result.status).toBe(302);
    expect(result.headers['location']).toMatch(/\/docs\/llms\.txt$/);
  });

  test('DEV-AI-016: The sitemap lists visible pages only; robots.txt keeps crawlers off /_portal/', async () => {
    const copy = pm.onDevelopersCopyPage();
    const sitemap = await copy.httpGet('/sitemap.xml');
    expect(sitemap.status).toBe(200);
    expect(sitemap.body).toMatch(/<loc>[^<]+\/docs\/welcome<\/loc>/);
    expect(sitemap.body).not.toContain(`${DOC_PAGES.hidden}<`);
    const robots = await copy.httpGet('/robots.txt');
    expect(robots.status).toBe(200);
    // Outside production (DEVPORTAL_ALLOW_INDEXING off) everything is disallowed, which includes /_portal/.
    expect(robots.body).toMatch(/Disallow: \/(_portal\/)?\s*$/m);
  });

  test("DEV-AI-017: Every slug the main site's static/llms.txt links to exists here", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const text = fs.readFileSync(path.resolve(__dirname, '../../../static/llms.txt'), 'utf8');
    const urls = [...text.matchAll(/https:\/\/developers\.sefaria\.org(\/[^\s)]+)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    const copy = pm.onDevelopersCopyPage();
    for (const url of new Set(urls)) {
      const result = await copy.httpGet(url, { followRedirects: true });
      expect(result.status, url).toBe(200);
    }
  });
});
