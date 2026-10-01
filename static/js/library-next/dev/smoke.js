#!/usr/bin/env node
/**
 * Headless smoke test for the Library Next shell against the dev harness (serve.js).
 * Starts the harness on a free port, opens a few library URLs in Chromium (Playwright), fails
 * on any console error or uncaught page error, and checks the shell rendered with the right
 * direction. Run after `npm run build-library-next`:
 *
 *   node static/js/library-next/dev/smoke.js            # PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers if needed
 *   SMOKE_URLS="/,/Genesis.1" node static/js/library-next/dev/smoke.js
 */
const path = require('path');
const { server } = require('./serve');

const CASES = (process.env.SMOKE_URLS
  ? process.env.SMOKE_URLS.split(',').map(u => ({ url: u.trim(), dir: 'ltr' }))
  : [
    { url: '/', dir: 'ltr', heading: 'Welcome to the Library' },
    { url: '/Genesis.1', dir: 'ltr', heading: 'Genesis.1' },
    { url: '/texts', dir: 'ltr', heading: 'Browse texts' },
    { url: '/texts?lang=he', dir: 'rtl', heading: 'עיון בטקסטים' },
  ]);

const IGNORED_CONSOLE = [/favicon/i];

/**
 * Playwright's own download is used when it exists; otherwise the newest Chromium under
 * PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers), whatever its build number. CHROMIUM_PATH
 * overrides both.
 */
function findChromium() {
  const fs = require('fs');
  if (process.env.CHROMIUM_PATH) { return process.env.CHROMIUM_PATH; }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) { return undefined; }
  const candidates = [];
  for (const dir of fs.readdirSync(root)) {
    if (!/^chromium/.test(dir)) { continue; }
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome']) {
      const exe = path.join(root, dir, rel);
      if (fs.existsSync(exe)) { candidates.push({ exe, build: Number((dir.match(/(\d+)$/) || [0, 0])[1]), headless: /headless/.test(rel) }); }
    }
  }
  candidates.sort((a, b) => b.build - a.build || (a.headless ? -1 : 1));
  return candidates.length ? candidates[0].exe : undefined;
}

async function main() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('playwright is not installed; skipping the browser smoke test');
    process.exit(0);
  }
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const browser = await playwright.chromium.launch({ executablePath: findChromium() });
  const failures = [];
  try {
    for (const c of CASES) {
      const context = await browser.newContext({ locale: 'en-US' });
      const page = await context.newPage();
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error' && !IGNORED_CONSOLE.some(re => re.test(msg.text()))) { errors.push(`console: ${msg.text()}`); }
      });
      page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
      page.on('requestfailed', r => { if (!/fonts\.|typekit/.test(r.url())) { errors.push(`requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`); } });
      const started = Date.now();
      await page.goto(base + c.url, { waitUntil: 'load' });
      await page.waitForSelector('.ln-shell', { timeout: 15000 });
      const dir = await page.getAttribute('.ln-shell', 'dir');
      const htmlDir = await page.getAttribute('html', 'dir');
      const heading = (await page.textContent('main h1')) || '';
      const title = await page.title();
      const hasHeader = await page.$('.ln-header .ln-search input');
      const dock = await page.$('.ln-dock-button');
      const onboarding = await page.$('.ln-modal .ln-persona-grid');
      const problems = [...errors];
      if (dir !== c.dir) { problems.push(`dir: expected ${c.dir}, got ${dir}`); }
      if (htmlDir !== c.dir) { problems.push(`<html dir>: expected ${c.dir}, got ${htmlDir}`); }
      if (c.heading && heading.trim() !== c.heading) { problems.push(`heading: expected "${c.heading}", got "${heading.trim()}"`); }
      if (!hasHeader) { problems.push('no search box in header'); }
      if (!dock) { problems.push('no assistant dock button'); }
      if (!onboarding) { problems.push('onboarding did not open on first visit'); }
      if (!/Sefaria Library|ספריית ספריא/.test(title)) { problems.push(`title: ${title}`); }
      // second visit in the same context: onboarding closed by choosing a persona, chip updates
      await page.click('.ln-persona-card[data-persona="learner"]');
      const chip = await page.textContent('.ln-chip');
      if (!/Learner|לומד/.test(chip || '')) { problems.push(`persona chip after choosing: "${chip}"`); }
      const ms = Date.now() - started;
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${c.url}  (${dir}, "${heading.trim()}", ${ms}ms)`);
      problems.forEach(p => console.log(`      ${p}`));
      if (problems.length) { failures.push(c.url); }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) {
    console.error(`\n${failures.length} of ${CASES.length} pages failed`);
    process.exit(1);
  }
  console.log(`\nall ${CASES.length} pages ok`);
}

main().catch(err => { console.error(err); process.exit(1); });
