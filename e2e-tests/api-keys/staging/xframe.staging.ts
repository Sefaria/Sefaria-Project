// X-Frame-Options: DENY on the auth pages (phase 1). Before the merge these fail on staging (no header); after it,
// every one passes. No first-party client frames these pages (the mobile app logs in through /api/login/, the
// extensions never frame sefaria.org, the Docs add-on and the linker have no login UI), so the risk is a page that
// breaks at top level or a proxy that adds a second, conflicting header.
import { test, expect } from '@playwright/test';

const PAGES = ['/login', '/register', '/password/reset/confirm/MA/set-password/'];
const MAX_HOPS = 6;

for (const p of PAGES) {
  test(`${p}: exactly one X-Frame-Options, DENY, on every redirect hop`, async ({ request, baseURL }) => {
    let url = new URL(p, baseURL).toString();
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const r = await request.get(url, { maxRedirects: 0 });
      const xfo = r.headersArray().filter((h) => h.name.toLowerCase() === 'x-frame-options');
      expect(xfo.length, `${url} (${r.status()}) has ${xfo.length} X-Frame-Options header(s)`).toBe(1);
      expect(xfo[0].value.trim().toUpperCase(), url).toBe('DENY');
      const loc = r.headers()['location'];
      if (r.status() < 300 || r.status() > 399 || !loc) {
        expect(r.status(), `${url}: the last hop answers`).toBeLessThan(500);
        return;
      }
      url = new URL(loc, url).toString();
    }
    throw new Error(`${p}: still redirecting after ${MAX_HOPS} hops (a loop?)`);
  });
}

test('a page on another origin cannot frame /login', async ({ page, request, baseURL }) => {
  const target = new URL('/login', baseURL).toString();
  // The page itself must load, so an empty frame below means "refused", not "unreachable".
  expect((await request.get(target)).status(), `${target} answers at top level`).toBe(200);
  let framedStatus = 0;
  const blocked: string[] = [];
  page.on('response', (r) => {
    if (r.frame() !== page.mainFrame() && (r.url() === target || r.url().startsWith(target + '?')))
      framedStatus = r.status();
  });
  page.on('console', (m) => {
    if (/X-Frame-Options|frame-ancestors|refused to (display|connect)/i.test(m.text())) blocked.push(m.text());
  });
  await page.route('https://embed.example.test/', (r) =>
    r.fulfill({ contentType: 'text/html', body: `<iframe id="f" src="${target}" width="600" height="400"></iframe>` })
  );
  await page.goto('https://embed.example.test/');
  // The framed request must succeed (200): a 403 or a proxy error would also leave the frame empty.
  await expect
    .poll(() => framedStatus, { message: 'the framed /login request answered 200', timeout: 30_000 })
    .toBe(200);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  expect(frame, 'the iframe exists').toBeTruthy();
  // The browser's own refusal: an error page in the frame, or its console message about the header.
  await expect
    .poll(async () => frame!.url().startsWith('chrome-error://') || blocked.length > 0, {
      message: 'the browser refused to display /login in the frame',
      timeout: 15_000,
    })
    .toBe(true);
  expect(await frame!.locator('h1, button').count(), 'the login page rendered inside a cross-origin iframe').toBe(0);
});

test('/login and /register still work at top level', async ({ page }) => {
  const xfoErrors: string[] = [];
  page.on('console', (m) => {
    if (/X-Frame-Options|frame-ancestors|refused to display/i.test(m.text())) xfoErrors.push(m.text());
  });
  for (const p of ['/login', '/register']) {
    const r = await page.goto(p);
    expect(r?.status(), p).toBe(200);
    // The pages open on a choice of methods; the password field appears after the email option.
    const email = page
      .getByRole('button', { name: /continue with email|sign up with email|email|המשך עם דוא״ל|דוא״ל/i })
      .first();
    const password = page.locator('input[type="password"]').first();
    // Server-rendered buttons ignore clicks until React hydrates, so retry the choice until the form appears.
    await expect(async () => {
      if (!(await password.isVisible()) && (await email.isVisible())) await email.click();
      await expect(password, `${p} shows its password field`).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
  }
  expect(xfoErrors, 'no framing errors at top level').toEqual([]);
});

test('the reset page with an invalid token answers without a server error', async ({ page }) => {
  // A real reset link needs a mailed token; this checks only that the page renders its invalid-link answer.
  const r = await page.goto('/password/reset/confirm/MA/set-password/');
  expect(r?.status(), 'invalid-token reset page').toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});
