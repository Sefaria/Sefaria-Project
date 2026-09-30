#!/usr/bin/env node
/*
 * Dark-mode accessibility audit over live www.sefaria.org HTML with THIS branch's CSS, client
 * bundle and static files (the same routing as screenshots.js; see README.md).
 *
 *   node scripts/darkmode/a11y-audit.js --out /tmp/a11y [--axe /path/to/axe.min.js]
 *
 * For every page x viewport x theme it records, in <out>/a11y-report.json:
 *   - contrast of every visible text node's element against its effective background
 *     (e2e-tests/support/a11y-scan.js scanTextContrast: WCAG 1.4.3, 4.5:1 / 3:1 large);
 *   - links in running text and whether they are told apart by more than colour (1.4.1);
 *   - duplicate ids, in the whole document and inside the header / mobile menu (4.1.1);
 *   - an axe-core run with the wcag2a, wcag21a, wcag2aa and wcag21aa tags, when axe-core is
 *     available (--axe, AXE_CORE_PATH, or an installed `axe-core`). axe-core is not a dependency
 *     of this repo, so without it the audit simply records `axe: null`.
 * and on the pages marked `keyboard` below:
 *   - desktop: the Tab sequence from the top of the page (skip link first, the toggle after the
 *     module switcher, the account menu after it, focus keeps moving past the header), the focus
 *     ring of every stop with its contrast, the skip link's target, activating the toggle with
 *     Enter and Space (theme flips, same URL, no navigation, focus stays, `lang` kept), and single
 *     character keys doing nothing (2.1.1, 2.1.2, 2.1.4, 2.4.1, 2.4.3, 2.4.7, 3.2.1, 3.2.2);
 *   - mobile: the menu opened, the switch reached with Tab, Space toggles it, the menu stays open,
 *     focus stays, and Tab moves on.
 *
 * Exit code 0 unless a page failed to load; the report is for people to read. A summary of dark
 * contrast failures, split into "dark only" (not failing in light on the same page) and "both
 * themes", is printed at the end.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROXY_SET = !!(process.env.HTTPS_PROXY || process.env.https_proxy);
if (require.main === module && PROXY_SET && process.env.NODE_USE_ENV_PROXY !== '1' && !process.env.__DARKMODE_REEXEC) {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', __DARKMODE_REEXEC: '1' },
  });
  process.exit(r.status === null ? 1 : r.status);
}
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.code !== 'UNDICI-EHPA') console.warn(String(w)); });

const { chromium } = require('playwright');
const H = require('./screenshots');
const S = require('../../e2e-tests/support/a11y-scan');

const REPO_DEFAULT = path.resolve(__dirname, '..', '..');

/** Pages audited by default. `keyboard` runs the keyboard/toggle checks there; `menu` opens the mobile menu. */
const PAGES = [
  { path: '/texts', ready: '.navBlock', keyboard: true, menu: true },
  { path: '/Genesis.1', ready: '.segment', menu: true },
  { path: '/Genesis.1.1?with=all', ready: '.categoryFilterGroup', label: 'Genesis.1.1_connections' },
  { path: '/topics', ready: '.topic-salad-item' },
  { path: '/calendars', ready: '.calendarListing' },
  { path: '/login', ready: '.sefaria-auth-card' },
  { path: 'he:/texts', ready: '.navBlock', keyboard: true, menu: true },
];

const SEL = {
  DESKTOP_TOGGLE: '.header .header-icons button.themeToggle',
  MOBILE_TOGGLE: '.mobileNavMenu .mobileThemeToggle',
  MOBILE_MENU_OPEN: '.mobileNavMenu:not(.closed)',
  MODULE_SWITCHER: '.headerDropdownMenu[data-anl-feature_name="module_switcher"]',
  ACCOUNT: '.headerDropdownMenu:has(.profile-pic), .headerDropdownMenu:has(img[src*="profile_loggedout_mdl"])',
  LANGUAGE_ROW: '.mobileNavMenu .mobileInterfaceLanguageToggle',
};

function parseArgs(argv) {
  const opts = {
    repo: REPO_DEFAULT, out: path.resolve('darkmode-a11y'), themes: ['light', 'dark'], viewports: ['desktop', 'mobile'],
    pages: null, axe: null, baseUrl: 'https://www.sefaria.org', concurrency: 3, settle: 800,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    switch (a) {
      case '--repo': opts.repo = path.resolve(next()); break;
      case '--out': opts.out = path.resolve(next()); break;
      case '--themes': opts.themes = next().split(','); break;
      case '--viewports': opts.viewports = next().split(','); break;
      case '--pages': opts.pages = next().split(','); break;
      case '--axe': opts.axe = path.resolve(next()); break;
      case '--concurrency': opts.concurrency = Math.max(1, parseInt(next(), 10) || 1); break;
      case '--help': case '-h':
        console.log('node scripts/darkmode/a11y-audit.js [--out dir] [--axe axe.min.js] [--pages /texts,he:/texts] [--themes light,dark] [--viewports desktop,mobile] [--repo dir] [--concurrency n]');
        process.exit(0); break;
      default: throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function pageSpecs(opts) {
  const known = new Map(PAGES.map((p) => [p.path, p]));
  const raw = opts.pages ? opts.pages.map((p) => known.get(p) || { path: p }) : PAGES;
  return raw.map((p) => {
    const hebrew = p.path.startsWith('he:');
    const pagePath = hebrew ? p.path.slice(3) : p.path;
    const slug = (hebrew ? 'he_' : '') + (p.label || pagePath.replace(/^\//, '').replace(/[^A-Za-z0-9._-]+/g, '_'));
    return { ...p, hebrew, pagePath, slug };
  });
}

/** Load one page the way screenshots.js does; returns { context, page, errors, url }. */
async function openPage(browser, opts, shared, spec, viewport, theme) {
  const host = new URL(opts.baseUrl).hostname;
  const cookieDomain = '.' + host.replace(/^www\./, '');
  const context = await browser.newContext({ ...H.VIEWPORTS[viewport], colorScheme: 'light', locale: spec.hebrew ? 'he-IL' : 'en-US' });
  await context.addCookies([
    { name: 'theme', value: theme, domain: cookieDomain, path: '/' },
    { name: 'cookiesNotificationAccepted', value: '1', domain: cookieDomain, path: '/' },
  ]);
  await context.addInitScript(() => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      if (typeof k === 'string' && (k.startsWith('modal_') || k.startsWith('banner_'))) return 'true';
      return orig.call(this, k);
    };
  });
  const run = { theme, hebrew: spec.hebrew, bundle: shared.bundle, themeHead: shared.themeHead, cssFiles: shared.cssFiles };
  const stats = { local: 0, remote: 0, failed: [], missingCss: new Set(), inject: null };
  await H.installRoutes(context, { ...opts, cssDir: path.join(opts.repo, 'static', 'css'), render: 'client', localStatic: true }, run, stats);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e).slice(0, 200)));
  const inflight = new Set();
  page.on('request', (r) => inflight.add(r));
  page.on('requestfinished', (r) => inflight.delete(r));
  page.on('requestfailed', (r) => inflight.delete(r));
  const requested = opts.baseUrl + spec.pagePath;
  const url = await H.resolveRedirects(requested, `theme=${theme}; cookiesNotificationAccepted=1`).catch(() => requested);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!(window.Sefaria && document.querySelector('#s2 .header, #s2 .readerApp')), null, { timeout: 45000 });
  let contentReady = null;
  if (spec.ready) contentReady = await page.waitForSelector(spec.ready, { state: 'attached', timeout: 25000 }).then(() => true, () => false);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await H.waitForQuiet(page, inflight, 10000);
  await page.addStyleTag({ content: H.FREEZE_CSS });
  await page.waitForTimeout(opts.settle);
  return { context, page, errors, url, contentReady, stats };
}

async function runAxe(page, axe, include) {
  if (!axe) return null;
  const has = await page.evaluate(() => typeof window.axe === 'object');
  if (!has) await page.addScriptTag({ content: axe.source });
  return page.evaluate(async ({ include, tags }) => {
    const ctx = include ? { include: include.filter((s) => document.querySelector(s)).map((s) => [s]) } : document;
    if (include && !ctx.include.length) return { skipped: 'scope not found' };
    const r = await window.axe.run(ctx, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] });
    const slim = (list) => list.map((v) => ({
      id: v.id, impact: v.impact, tags: v.tags.filter((t) => /^wcag|^best/.test(t)), help: v.help,
      nodes: v.nodes.length,
      samples: v.nodes.slice(0, 6).map((n) => ({
        target: n.target.join(' '), html: n.html.slice(0, 160),
        data: (n.any[0] && n.any[0].data && typeof n.any[0].data === 'object')
          ? (({ fgColor, bgColor, contrastRatio, expectedContrastRatio, fontSize, fontWeight, messageKey }) =>
            ({ fgColor, bgColor, contrastRatio, expectedContrastRatio, fontSize, fontWeight, messageKey }))(n.any[0].data)
          : undefined,
      })),
    }));
    return { version: window.axe.version, violations: slim(r.violations), incomplete: slim(r.incomplete) };
  }, { include, tags: S.AXE_TAGS });
}

/** Press Tab from the top of the document `max` times; one describeFocus() per stop. */
/** Put the sequential-focus starting point at the very start of <body>, as on a fresh load. */
async function focusFromTop(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const s = document.createElement('span');
    s.tabIndex = -1;
    document.body.prepend(s);
    s.focus();
    s.remove();
  });
}

/**
 * Pixel measurement of the focused element's indicator: screenshots of its box (plus 8px)
 * focused and unfocused, compared with compareFocusPixels. Leaves the element focused again.
 */
async function ringPixels(page) {
  const vp = page.viewportSize();
  const box = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    const r = a.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  if (!box || !box.w || !box.h) return null;
  const x = Math.max(0, Math.floor(box.x - 8)), y = Math.max(0, Math.floor(box.y - 8));
  const clip = { x, y, width: Math.min(vp.width - x, Math.ceil(box.w + 16)), height: Math.min(vp.height - y, Math.ceil(box.h + 16)) };
  if (clip.width <= 0 || clip.height <= 0) return null;
  const focused = (await page.screenshot({ clip })).toString('base64');
  await page.evaluate(() => { window.__a11yRefocus = document.activeElement; document.activeElement.blur(); });
  const unfocused = (await page.screenshot({ clip })).toString('base64');
  await page.evaluate(() => { window.__a11yRefocus.focus(); delete window.__a11yRefocus; });
  return page.evaluate(S.compareFocusPixels, { focused, unfocused });
}

async function tabWalk(page, max) {
  await focusFromTop(page);
  const stops = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(S.describeFocus);
    d.pixels = d.inViewport ? await ringPixels(page) : null;
    d.isToggle = await page.evaluate((s) => document.activeElement && document.activeElement.matches(s), SEL.DESKTOP_TOGGLE);
    d.inModuleSwitcher = await page.evaluate((s) => !!(document.activeElement && document.activeElement.closest(s)), SEL.MODULE_SWITCHER);
    d.inAccount = await page.evaluate((s) => !!(document.activeElement && document.activeElement.closest(s)), SEL.ACCOUNT);
    d.inHeader = await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('.header')));
    stops.push(d);
  }
  return stops;
}

async function keyboardDesktop(page) {
  const out = {};
  const stops = await tabWalk(page, 24);
  out.stops = stops.map((d) => ({
    tag: d.tag, name: d.name, cls: d.className && d.className.slice(0, 40), href: d.href, isToggle: d.isToggle,
    inHeader: d.inHeader, inViewport: d.inViewport, ring: d.ring, pixels: d.pixels,
  }));
  const ti = stops.findIndex((d) => d.isToggle);
  out.toggleIndex = ti;
  out.firstStop = stops[0] && { name: stops[0].name, href: stops[0].href, inViewport: stops[0].inViewport, ring: stops[0].ring };
  out.prevIsModuleSwitcher = ti > 0 && stops[ti - 1].inModuleSwitcher;
  out.nextIsAccount = ti >= 0 && !!stops[ti + 1] && stops[ti + 1].inAccount;
  const after = stops.slice(ti + 1).map((d) => `${d.tag}|${d.name}|${d.href}`);
  out.distinctStopsAfterToggle = new Set(after).size;
  out.leftHeader = stops.slice(ti + 1).some((d) => !d.inHeader);
  out.toggleRing = ti >= 0 ? stops[ti].ring : null;

  // Skip link (2.4.1): first stop, visible when focused, and it moves focus/scroll to its target.
  await focusFromTop(page);
  await page.keyboard.press('Tab');
  const skip = await page.evaluate(S.describeFocus);
  skip.pixels = skip.inViewport ? await ringPixels(page) : null;
  skip.textContrast = (await page.evaluate(S.scanTextContrast, { roots: ['a.skip-link'] })).rows;
  const target = skip.href && skip.href.startsWith('#') ? skip.href : null;
  let targetExists = false; let afterSkip = null;
  if (target) {
    targetExists = await page.evaluate((t) => !!document.getElementById(t.slice(1)), target);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    afterSkip = await page.evaluate((t) => {
      const el = document.getElementById(t.slice(1));
      const a = document.activeElement;
      return {
        hash: location.hash, focusedInTarget: !!(el && a && (a === el || el.contains(a))),
        targetTop: el ? Math.round(el.getBoundingClientRect().top) : null,
      };
    }, target);
    // Next Tab should land inside (or after) the target, not back in the header.
    await page.keyboard.press('Tab');
    afterSkip.nextTabInHeader = await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('.header')));
  }
  out.skipLink = {
    name: skip.name, href: skip.href, className: skip.className, inViewport: skip.inViewport, rect: skip.rect, ring: skip.ring,
    pixels: skip.pixels, textContrast: skip.textContrast, targetExists, afterSkip,
  };

  // Toggle with Enter and Space (2.1.1, 3.2.1, 3.2.2).
  const toggle = page.locator(SEL.DESKTOP_TOGGLE);
  const navs = []; const onNav = (f) => { if (f === page.mainFrame()) navs.push(f.url()); };
  page.on('framenavigated', onNav);
  const state = () => page.evaluate((s) => ({
    theme: document.documentElement.getAttribute('data-theme'), lang: document.documentElement.getAttribute('lang'),
    url: location.href, pressed: document.querySelector(s) && document.querySelector(s).getAttribute('aria-pressed'),
    focusOnToggle: !!(document.activeElement && document.activeElement.matches(s)),
    title: document.title,
  }), SEL.DESKTOP_TOGGLE);
  await toggle.focus();
  const before = await state();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const afterEnter = await state();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const afterSpace = await state();
  // Focus alone must not change anything (3.2.1).
  await page.locator(SEL.MODULE_SWITCHER).locator('button, a, [tabindex]').first().focus().catch(() => {});
  await toggle.focus();
  const afterFocus = await state();
  // Single character keys (2.1.4): none may switch the theme.
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  for (const k of ['d', 'D', 't', 'l', 'm', 'n']) await page.keyboard.press(k);
  await page.waitForTimeout(200);
  const afterChars = await state();
  page.off('framenavigated', onNav);
  out.toggleKeys = { before, afterEnter, afterSpace, afterFocus, afterChars, navigations: navs };
  return out;
}

/**
 * Header pop-ups in the current theme: each header dropdown (language, module switcher, account)
 * opened with the mouse, its text contrast and an axe run scoped to it, then Escape: the menu
 * must close and focus return to its button (2.1.2). Then the search autocomplete.
 */
async function headerPopups(page, axe) {
  const out = [];
  const triggers = page.locator('.header .header-icons .headerDropdownMenu .dropdownLinks-button > :is(button, a, [tabindex])');
  const n = await triggers.count();
  for (let i = 0; i < n; i++) {
    const trig = triggers.nth(i);
    const name = ((await trig.getAttribute('aria-label')) || (await trig.textContent()) || '').trim().slice(0, 40);
    const row = { name };
    try {
      await trig.click({ timeout: 5000 });
      await page.waitForSelector('.header .dropdownLinks-menu.open', { state: 'visible', timeout: 5000 });
      await page.waitForTimeout(200);
      row.contrast = await page.evaluate(S.scanTextContrast, { roots: ['.header .dropdownLinks-menu.open'] });
      row.axe = await runAxe(page, axe, ['.header .dropdownLinks-menu.open']);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      row.escape = await page.evaluate(() => ({
        stillOpen: !!document.querySelector('.header .dropdownLinks-menu.open'),
        focusInButton: !!(document.activeElement && document.activeElement.closest('.dropdownLinks-button')),
      }));
      if (row.escape.stillOpen) { await trig.click({ timeout: 5000 }).catch(() => {}); }
    } catch (e) {
      row.error = String(e.message || e).split('\n')[0];
    }
    out.push(row);
  }
  const search = page.locator('.header .searchBox input').first();
  if (await search.count()) {
    const row = { name: 'search autocomplete' };
    try {
      await search.click();
      await search.fill('genes');
      const got = await page.waitForSelector('.header .autocomplete-dropdown', { state: 'visible', timeout: 10000 }).then(() => true, () => false);
      await page.waitForTimeout(500);
      if (got) {
        row.contrast = await page.evaluate(S.scanTextContrast, { roots: ['.header .autocomplete-dropdown'] });
        row.axe = await runAxe(page, axe, ['.header .autocomplete-dropdown']);
      } else {
        row.error = 'autocomplete did not open';
      }
      await search.fill('');
      await page.keyboard.press('Escape');
    } catch (e) {
      row.error = String(e.message || e).split('\n')[0];
    }
    out.push(row);
  }
  return out;
}

async function openMobileMenu(page) {
  const btn = page.locator('button.menuButton:visible, .readerNavMenuMenuButton:visible').first();
  if (!(await btn.count())) return false;
  await btn.tap({ timeout: 10000 });
  await page.waitForSelector(SEL.MOBILE_MENU_OPEN, { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(400);
  return true;
}

async function keyboardMobile(page) {
  const out = {};
  const lang = page.locator(`${SEL.LANGUAGE_ROW} a, ${SEL.LANGUAGE_ROW} button`).last();
  await lang.focus();
  const seq = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(S.describeFocus);
    d.isSwitch = await page.evaluate((s) => !!(document.activeElement && document.activeElement.matches(s)), SEL.MOBILE_TOGGLE);
    seq.push(d);
    if (d.isSwitch) break;
  }
  out.stepsFromLanguageRow = seq.length;
  out.reached = seq.some((d) => d.isSwitch);
  out.ring = seq.length ? seq[seq.length - 1].ring : null;
  out.pixels = out.reached ? await ringPixels(page) : null;
  const state = () => page.evaluate((s) => ({
    theme: document.documentElement.getAttribute('data-theme'), lang: document.documentElement.getAttribute('lang'),
    checked: document.querySelector(s.MOBILE_TOGGLE) && document.querySelector(s.MOBILE_TOGGLE).getAttribute('aria-checked'),
    menuOpen: !!document.querySelector(s.MOBILE_MENU_OPEN), url: location.href,
    focusOnSwitch: !!(document.activeElement && document.activeElement.matches(s.MOBILE_TOGGLE)),
  }), SEL);
  const before = await state();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const afterSpace = await state();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const afterEnter = await state();
  await page.keyboard.press('Tab');
  const next = await page.evaluate(S.describeFocus);
  out.toggleKeys = { before, afterSpace, afterEnter };
  out.nextAfterSwitch = { tag: next.tag, name: next.name, focused: next.focused };
  return out;
}

async function auditOne(browser, opts, shared, spec, viewport, theme) {
  const t0 = Date.now();
  const row = { page: spec.path, slug: spec.slug, viewport, theme, hebrew: spec.hebrew };
  let ctx;
  try {
    ctx = await openPage(browser, opts, shared, spec, viewport, theme);
    const { page } = ctx;
    row.url = ctx.url; row.contentReady = ctx.contentReady;
    row.dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    row.lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    row.contrast = await page.evaluate(S.scanTextContrast, {});
    row.links = await page.evaluate(S.scanInlineLinks, {});
    row.duplicateIds = { document: await page.evaluate(S.duplicateIds, null), header: await page.evaluate(S.duplicateIds, '.header') };
    row.axe = await runAxe(page, shared.axe, null);
    if (viewport === 'desktop' && spec.keyboard) {
      row.keyboard = await keyboardDesktop(page);
      row.popups = await headerPopups(page, shared.axe);
    }
    if (viewport === 'mobile' && spec.menu) {
      if (await openMobileMenu(page)) {
        row.menu = {
          contrast: await page.evaluate(S.scanTextContrast, { roots: ['.mobileNavMenu'] }),
          axe: await runAxe(page, shared.axe, ['.mobileNavMenu']),
          duplicateIds: await page.evaluate(S.duplicateIds, '.mobileNavMenu'),
        };
        if (spec.keyboard) row.menu.keyboard = await keyboardMobile(page);
      } else {
        row.menu = { skipped: 'no menu button on this page' };
      }
    }
    row.errors = ctx.errors.slice(0, 5);
  } catch (e) {
    row.fatal = String(e.message || e).split('\n')[0];
  } finally {
    if (ctx) await ctx.context.close().catch(() => {});
  }
  row.ms = Date.now() - t0;
  return row;
}

function summarise(rows) {
  const fails = (r) => (r && r.rows ? r.rows.filter((x) => x.status === 'fail') : []);
  const key = (x) => `${x.selector}|${x.text}`;
  const lines = [];
  for (const dark of rows.filter((r) => r.theme === 'dark')) {
    const light = rows.find((r) => r.theme === 'light' && r.slug === dark.slug && r.viewport === dark.viewport);
    for (const [label, d, l] of [['page', dark.contrast, light && light.contrast], ['menu', dark.menu && dark.menu.contrast, light && light.menu && light.menu.contrast]]) {
      const df = fails(d); if (!df.length) continue;
      const lk = new Set(fails(l).map(key));
      const only = df.filter((x) => !lk.has(key(x)));
      lines.push(`${dark.slug} ${dark.viewport} ${label}: ${df.length} dark contrast failures (${only.length} dark only)`);
      for (const x of only.slice(0, 12)) lines.push(`   dark-only ${x.ratio}:1 < ${x.min} ${x.fg} on ${x.bg}  ${x.selector}  "${x.text}"`);
    }
    for (const p of dark.popups || []) {
      const pf = fails(p.contrast);
      if (pf.length) lines.push(`${dark.slug} popup "${p.name}": ${pf.length} dark contrast failures: ` + pf.slice(0, 5).map((x) => `${x.ratio} ${x.fg}/${x.bg} "${x.text}"`).join('; '));
      if (p.axe && p.axe.violations && p.axe.violations.length) lines.push(`${dark.slug} popup "${p.name}" axe: ${p.axe.violations.map((v) => v.id).join(', ')}`);
    }
    const ax = dark.axe && dark.axe.violations;
    if (ax && ax.length) {
      const lids = new Set(((light && light.axe && light.axe.violations) || []).map((v) => v.id));
      lines.push(`${dark.slug} ${dark.viewport} axe: ${ax.map((v) => `${v.id}(${v.nodes})${lids.has(v.id) ? '' : '*'}`).join(', ')}   (* = not in light)`);
    }
  }
  return lines;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.out, { recursive: true });
  const axePath = opts.axe || process.env.AXE_CORE_PATH;
  if (axePath) process.env.AXE_CORE_PATH = axePath;
  const axe = S.axeSource();
  const shared = {
    bundle: H.findBundle(path.join(opts.repo, 'static', 'bundles', 'client')),
    themeHead: H.readThemeHead(opts.repo),
    cssFiles: {
      themeTokens: fs.existsSync(path.join(opts.repo, 'static', 'css', 'theme-tokens.css')),
      darkOverrides: fs.existsSync(path.join(opts.repo, 'static', 'css', 'theme-dark-overrides.css')),
    },
    axe,
  };
  console.log(`bundle ${shared.bundle}\naxe    ${axe ? axe.path : '(not available: pass --axe or set AXE_CORE_PATH)'}`);
  const jobs = [];
  for (const spec of pageSpecs(opts)) {
    for (const vp of opts.viewports) {
      if (vp === 'mobile' && !spec.menu) continue;
      for (const th of opts.themes) jobs.push([spec, vp, th]);
    }
  }
  const browser = await chromium.launch(H.launchOptions());
  const rows = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const [spec, vp, th] = jobs[next++];
      const r = await auditOne(browser, opts, shared, spec, vp, th);
      rows.push(r);
      const f = r.contrast ? r.contrast.rows.filter((x) => x.status === 'fail').length : '-';
      console.log(`${r.fatal ? 'FAIL' : 'ok  '} ${r.slug.padEnd(28)} ${vp.padEnd(7)} ${th.padEnd(5)} contrast-fails=${f} axe=${r.axe ? r.axe.violations.length : '-'} ${r.ms}ms ${r.fatal || ''}`);
    }
  }));
  await browser.close();
  rows.sort((a, b) => `${a.slug}${a.viewport}${a.theme}`.localeCompare(`${b.slug}${b.viewport}${b.theme}`));
  const report = { generatedAt: new Date().toISOString(), baseUrl: opts.baseUrl, repo: opts.repo, bundle: shared.bundle, axe: axe ? axe.path : null, rows };
  fs.writeFileSync(path.join(opts.out, 'a11y-report.json'), JSON.stringify(report, null, 1));
  console.log('\n' + summarise(rows).join('\n'));
  console.log(`\nreport: ${path.join(opts.out, 'a11y-report.json')}`);
  return rows.some((r) => r.fatal) ? 1 : 0;
}

if (require.main === module) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { PAGES, SEL, parseArgs };
