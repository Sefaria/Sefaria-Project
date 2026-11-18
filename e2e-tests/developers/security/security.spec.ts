import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, ENDPOINTS, RECORDED_TEXTS_200, enterBlank, readRepoJson } from '../developers-entry';
import { enterEditorAsStaff } from '../editor/editor-entry';

// The browser items of PLAN §6.7 (S-1, S-2, S-3, S-4, S-9, S-12, S-13), against contract C10
// (devportal/contracts/security.json). Ports the security verifier's browser checks
// (V-security, browser_checks.cjs) onto the page objects. Try It calls are answered with recorded or
// hostile responses; nothing reaches www.sefaria.org.

interface SecurityContract {
  csp: {
    expected_default: string;
    conditional: { when: string; append?: Record<string, string[]>; add_directive?: string[] }[];
  };
  htmlblock_frame: { csp: string; iframe_sandbox: string; never: string[] };
  try_it: { recent_requests: { key: string; fields: string[] } };
  response_headers: Record<string, string>;
}
const contract = readRepoJson<SecurityContract>('devportal/contracts/security.json');

/**
 * The CSPs the contract allows: the default, or with files.readme.io while DEVPORTAL_ALLOW_README_IMAGES is
 * on; on editor responses each with `style-src-attr 'unsafe-inline'` appended.
 */
function allowedPolicies(editor = false): RegExp[] {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const base = contract.csp.expected_default;
  const readme = contract.csp.conditional.find((c) => c.append?.['img-src']?.includes('https://files.readme.io'));
  const withReadme = base.replace(/(img-src [^;]+)/, `$1 ${readme?.append?.['img-src'].join(' ')}`);
  const suffix = editor ? "; style-src-attr 'unsafe-inline'" : '';
  return [base, withReadme].map(
    (policy) =>
      new RegExp(`^${escape(policy + suffix).replace(escape("'nonce-{nonce}'"), "'nonce-[A-Za-z0-9+/_=-]{22,}'")}$`)
  );
}

/** The verifier's 13 page types: every template the portal serves, with the 404s. */
const PAGE_TYPES: [string, string][] = [
  ['020', '/'],
  ['021', DOC_PAGES.welcome],
  ['022', DOC_PAGES.hebrew],
  ['023', DOC_PAGES.contact],
  ['024', '/reference/getting-started'],
  ['025', ENDPOINTS.texts.path],
  ['026', ENDPOINTS.findRefs.path],
  ['027', '/powered-by'],
  ['028', '/powered-by/charts'],
  ['029', '/powered-by/projects/156-tehillim-opening'],
  ['030', '/powered-by/projects/999999999-no-such-project'],
  ['031', '/no-such-page-e2e'],
  ['032', '/docs/no-such-page-e2e'],
];

const HOSTILE_JSON = JSON.stringify({
  versions: [{ text: '<script>window.__dpPwned=1</script><img src=x onerror="window.__dpPwned=2">' }],
  html: '<b id="hostile-b">bold</b>',
});
const HOSTILE_HTML =
  '<!doctype html><script>window.__dpPwned=3</script><img src=x onerror="window.__dpPwned=4"><b id="hostile-b2">x</b>';

test.describe('Developers Security, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterBlank(context));
  });

  // ---- S-1 and S-2: what a Try It call carries -----------------------------------------------

  test('DEV-SEC-001: A Try It call carries no Cookie, Referer or credential, even with a staff session for the parent domain (S-1)', async ({
    context,
  }) => {
    const tryIt = pm.onDevelopersTryIt();
    const capture = await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    // The library shares its session cookie with every subdomain (SessionCookieDomainMiddleware).
    await context.addCookies([
      { name: 'sessionid', value: 'e2e-staff-session', domain: '.sefaria.org', path: '/', secure: true },
      { name: 'csrftoken', value: 'e2e-csrf', domain: '.sefaria.org', path: '/', secure: true },
    ]);
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    await pm.onDevelopersShell().openPath(ENDPOINTS.findRefs.path);
    await tryIt.clickTryIt();
    await expect.poll(() => capture.requests.length, { timeout: t(10000) }).toBe(2);
    for (const request of capture.requests) {
      const headers = Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v]));
      expect(headers['cookie'], request.url).toBeUndefined();
      expect(headers['authorization'], request.url).toBeUndefined();
      expect(headers['x-api-key'], request.url).toBeUndefined();
      expect(headers['referer'], request.url).toBeUndefined();
      expect(request.url.startsWith('https://www.sefaria.org/api/'), request.url).toBe(true);
    }
  });

  test('DEV-SEC-002: No value a visitor types moves a Try It call off <origin>/api/ (S-2)', async () => {
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    const reference = pm.onDevelopersReference();
    expect(await reference.urlLineText()).toMatch(/^https:\/\/www\.sefaria\.org\/api\//);
    expect(await reference.parameterNames('path')).not.toContain('server');
    const tryIt = pm.onDevelopersTryIt();
    const capture = await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    for (const value of [
      '../../../evil.example/x?y=#',
      '//evil.example/a',
      'https://evil.example/',
      '%2e%2e/%2e%2e/x',
    ]) {
      await reference.fillParameter('path', 'tref', value);
      await tryIt.clickTryIt();
      await tryIt.waitForResult();
    }
    await expect.poll(() => capture.requests.length, { timeout: t(10000) }).toBe(4);
    for (const request of capture.requests) {
      const url = new URL(request.url);
      expect(url.origin, request.url).toBe('https://www.sefaria.org');
      expect(url.pathname.startsWith('/api/v3/texts/'), request.url).toBe(true);
    }
  });

  // ---- S-3: hostile responses -----------------------------------------------------------------

  for (const [id, contentType, body, marker] of [
    ['003', 'application/json', HOSTILE_JSON, 'hostile-b'],
    ['004', 'text/html', HOSTILE_HTML, 'hostile-b2'],
  ] as const) {
    test(`DEV-SEC-${id}: A hostile ${contentType} response is shown as text; nothing executes or renders (S-3)`, async () => {
      const shell = pm.onDevelopersShell();
      const tryIt = pm.onDevelopersTryIt();
      await shell.trackCspViolations();
      await tryIt.fulfillApiWith({ status: 200, body, headers: { 'content-type': contentType } });
      await shell.openPath(ENDPOINTS.texts.path);
      await tryIt.clickTryIt();
      await tryIt.waitForResult();
      expect(await tryIt.responseBodyText()).toContain('<script>');
      expect(await shell.globalIsSet('__dpPwned')).toBe(false);
      expect(await shell.hasElementWithId(marker)).toBe(false);
      expect(await shell.cspViolations()).toEqual([]);
    });
  }

  // ---- S-4: the exact CSP and no violation, on every page type --------------------------------

  for (const [id, path] of PAGE_TYPES) {
    test(`DEV-SEC-${id}: ${path} sends the exact C10 CSP and an interactive session violates nothing (S-4)`, async () => {
      const shell = pm.onDevelopersShell();
      const { headers } = await pm.onDevelopersCopyPage().httpGet(path, { followRedirects: true });
      const policy = headers['content-security-policy'] ?? '';
      expect(
        allowedPolicies().some((p) => p.test(policy)),
        policy
      ).toBe(true);
      for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'"]) expect(policy).not.toContain(forbidden);
      await shell.trackCspViolations();
      await shell.openPath(path);
      await expect.poll(() => page.title(), { timeout: t(10000) }).not.toBe('');
      // A short interactive session: the header's links menu, then scroll the whole page (search, the
      // menus and Try It are DEV-SEC-006's longer session).
      await shell.openLinksMenu();
      await shell.closeLinksMenu();
      await page.mouse.wheel(0, 2000);
      expect(await shell.cspViolations()).toEqual([]);
    });
  }

  test('DEV-SEC-005: Every page type sends the C10 response headers', async () => {
    const copy = pm.onDevelopersCopyPage();
    for (const [, path] of PAGE_TYPES) {
      const { headers } = await copy.httpGet(path, { followRedirects: true });
      for (const [name, value] of Object.entries(contract.response_headers)) {
        if (name.startsWith('$')) continue;
        expect(headers[name.toLowerCase()], `${path} ${name}`).toBe(value);
      }
    }
  });

  test('DEV-SEC-006: A full interactive session across page types produces no CSP violation (S-4)', async () => {
    test.slow();
    const shell = pm.onDevelopersShell();
    const tryIt = pm.onDevelopersTryIt();
    await shell.trackCspViolations();
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    const violations: string[] = [];
    const collect = async () => violations.push(...(await shell.cspViolations()));

    await shell.openPath('/');
    await pm.onDevelopersHome().selectCarouselSlide(1);
    await shell.openLinksMenu();
    await shell.closeLinksMenu();
    await collect();

    await shell.openPath(DOC_PAGES.welcome);
    await pm.onDevelopersSearch().openWithShortcut();
    await pm.onDevelopersSearch().search('texts');
    await pm.onDevelopersSearch().close();
    await pm.onDevelopersDocs().clickTocEntry('Quick Questions and Answers');
    await pm.onDevelopersCopyPage().openMenu();
    await pm.onDevelopersCopyPage().closeMenu();
    await collect();

    await shell.openPath(DOC_PAGES.captionedImages);
    await pm.onDevelopersDocs().openImageLightbox(0);
    await pm.onDevelopersDocs().closeLightbox();
    await collect();

    await shell.openPath(DOC_PAGES.htmlBlocks);
    await pm.onDevelopersDocs().htmlBlockFrames();
    await collect();

    await shell.openPath(ENDPOINTS.texts.path);
    await pm.onDevelopersReference().selectLanguage('Python');
    await pm.onDevelopersReference().openMoreLanguages();
    await page.keyboard.press('Escape');
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    await tryIt.openHeadersModal();
    await tryIt.closeHeadersModal();
    await collect();

    await shell.openPath(DOC_PAGES.contact);
    await pm.onDevelopersDocs().formstackFrameSrc();
    await collect();

    expect(violations).toEqual([]);
  });

  // ---- S-9: HTML blocks ----------------------------------------------------------------------

  test('DEV-SEC-007: An HTML block frame is sandboxed without scripts; opened directly it has the frame CSP (S-9)', async () => {
    const shell = pm.onDevelopersShell();
    await shell.trackCspViolations();
    await shell.openPath(DOC_PAGES.htmlBlocks);
    const [frame] = await pm.onDevelopersDocs().htmlBlockFrames();
    expect(frame.sandbox).toBe(contract.htmlblock_frame.iframe_sandbox);
    for (const token of contract.htmlblock_frame.never) expect(frame.sandbox ?? '').not.toContain(token);
    expect(await shell.globalIsSet('__dpPwned')).toBe(false);
    expect(await shell.cspViolations()).toEqual([]);
    const direct = await pm.onDevelopersCopyPage().httpGet(new URL(frame.src).pathname);
    expect(direct.status).toBe(200);
    expect(direct.headers['content-security-policy']).toBe(contract.htmlblock_frame.csp);
    expect(direct.headers['content-security-policy'].split(';')[0]).toMatch(/^sandbox [^;]*$/);
  });

  test("DEV-SEC-008: Opening an HTML block's frame URL directly executes nothing (S-9)", async () => {
    const shell = pm.onDevelopersShell();
    await shell.openPath(DOC_PAGES.htmlBlocks);
    const [frame] = await pm.onDevelopersDocs().htmlBlockFrames();
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });
    await shell.openPath(new URL(frame.src).pathname);
    // The frame document loads no script, and its CSP (sandbox without allow-scripts, default-src 'none')
    // would block any inline one.
    expect(scripts).toEqual([]);
    expect(await page.title()).not.toBe('PWNED');
  });

  // ---- S-12: cookies -----------------------------------------------------------------------------

  test('DEV-SEC-009: Anonymous GETs of public routes set no cookie (S-12)', async () => {
    const copy = pm.onDevelopersCopyPage();
    const routes = [
      ...PAGE_TYPES.map(([, path]) => path),
      '/docs/welcome.md',
      '/llms.txt',
      '/sitemap.xml',
      '/robots.txt',
      '/openapi/sefaria-api.json',
      '/.well-known/mcp/server-card.json',
      '/mcp',
      '/docs',
      '/editor',
    ];
    for (const route of routes) {
      const { headers } = await copy.httpGet(route);
      expect(headers['set-cookie'], route).toBeUndefined();
    }
  });

  test("DEV-SEC-010: Browsing every page type leaves no cookie of the portal's own in the browser (S-12)", async ({
    context,
  }) => {
    const shell = pm.onDevelopersShell();
    const setCookies: string[] = [];
    page.on('response', async (response) => {
      const value = await response.headerValue('set-cookie').catch(() => null);
      if (value) setCookies.push(`${response.url()} ${value}`);
    });
    for (const [, path] of PAGE_TYPES) await shell.openPath(path);
    expect(setCookies).toEqual([]);
    // The harness itself sets interfaceLang (goToPageWithLang) and cookiesNotificationAccepted
    // (hideAllModalsAndPopups); the portal sets nothing.
    const harness = ['interfaceLang', 'cookiesNotificationAccepted'];
    expect((await context.cookies()).filter((c) => !harness.includes(c.name))).toEqual([]);
  });

  // ---- S-13: what is stored and sent ------------------------------------------------------------

  test('DEV-SEC-011: Recent Requests store only the C10 fields: no body, value or key (S-13)', async () => {
    const tryIt = pm.onDevelopersTryIt();
    const reference = pm.onDevelopersReference();
    await tryIt.fulfillApiWith({ status: 200, body: HOSTILE_JSON });
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    await reference.fillParameter('path', 'tref', 'Genesis 1:1');
    await reference.fillParameter('query', 'version', 'english|e2e-secret-version');
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    const { local, session } = await pm.onDevelopersShell().storageSnapshot();
    const stored = JSON.parse(JSON.parse(local)[contract.try_it.recent_requests.key] ?? '[]') as Record<
      string,
      unknown
    >[];
    expect(stored.length).toBeGreaterThan(0);
    expect(Object.keys(stored[0]).sort()).toEqual([...contract.try_it.recent_requests.fields].sort());
    for (const secret of ['Genesis', 'Esther', 'e2e-secret-version', '__dpPwned', 'hostile', 'api_key', 'apikey']) {
      expect(local, secret).not.toContain(secret);
      expect(session, secret).not.toContain(secret);
    }
  });

  test("DEV-SEC-012: A visitor's values never reach the developers host or analytics (S-13)", async () => {
    const tryIt = pm.onDevelopersTryIt();
    const reference = pm.onDevelopersReference();
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    const ownHost: string[] = [];
    const devHost = new URL(page.url()).host;
    page.on('request', (request) => {
      if (new URL(request.url()).host === devHost) ownHost.push(`${request.url()} ${request.postData() ?? ''}`);
    });
    await tryIt.fulfillApiWith({ status: 200, body: RECORDED_TEXTS_200 });
    await shell.openPath(ENDPOINTS.texts.path);
    await reference.fillParameter('path', 'tref', 'e2e-secret-ref');
    await tryIt.clickTryIt();
    await tryIt.waitForResult();
    expect(ownHost.join('\n')).not.toContain('e2e-secret-ref');
    expect(JSON.stringify(ga.events)).not.toContain('e2e-secret-ref');
  });

  // ---- Redirects and the feedback endpoint -------------------------------------------------------

  test('DEV-SEC-013: /v1.0// cannot redirect off the host (open redirect)', async () => {
    const copy = pm.onDevelopersCopyPage();
    for (const path of [
      '/v1.0//evil.example',
      '/v1.0//evil.example/x',
      '/v1.0/%2F%2Fevil.example',
      '/v1.0/\\evil.example',
    ]) {
      const result = await copy.httpGet(path);
      const location = result.headers['location'];
      if (location) {
        const target = new URL(location, page.url());
        expect(target.host, `${path} -> ${location}`).toBe(new URL(page.url()).host);
      } else {
        expect([400, 404], path).toContain(result.status);
      }
    }
  });

  test('DEV-SEC-014: The feedback endpoint refuses a POST without a CSRF token (S-14)', async () => {
    const status = await pm.onDevelopersCopyPage().postWithoutCsrf('/_portal/feedback', {
      path: DOC_PAGES.welcome,
      helpful: true,
      comment: '',
    });
    expect(status).toBe(403);
  });
});

test.describe('Developers Security, English (editor)', () => {
  test('DEV-SEC-040: The editor sends the editor CSP and a short editing session violates nothing (S-4)', async ({
    context,
  }) => {
    const { page, pm } = await enterEditorAsStaff(context);
    const shell = pm.onDevelopersShell();
    const editor = pm.onDevelopersEditor();
    const { headers } = await pm.onDevelopersCopyPage().httpGet('/editor');
    const policy = headers['content-security-policy'] ?? '';
    expect(
      allowedPolicies(true).some((p) => p.test(policy)),
      policy
    ).toBe(true);
    await shell.trackCspViolations();
    await editor.open();
    await editor.selectSection('docs');
    await editor.selectPage('Text References');
    // Typed HTML stays text; nothing is saved.
    await editor.appendParagraph('<img src=x onerror="window.__dpPwned=9">');
    await editor.openSlashMenu();
    await page.keyboard.press('Escape');
    await editor.setMode('view');
    await editor.openRevisionHistory();
    expect(await shell.cspViolations()).toEqual([]);
    expect(await shell.globalIsSet('__dpPwned')).toBe(false);
  });
});
