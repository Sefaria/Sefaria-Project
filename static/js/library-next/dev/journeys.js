#!/usr/bin/env node
/**
 * Persona journeys for Library Next against the dev harness (serve.js), in headless Chromium.
 * For each persona (newcomer, learner, educator, scholar) in English and Hebrew: onboarding →
 * home modules; /texts → category → book → "Start reading" → reader; select a segment → the
 * persona's toolbelt → every tool run → /my/* reflects the writes; search (Hebrew and English)
 * → a result; topics → a topic → a source; calendars → follow → /my/plans; the discover inbox
 * drains into My Library; interface toggle keeps the route; footer classic link; back/forward;
 * a 390px viewport for the reader, dock and sheets; the lesson handout in print media.
 *
 * Every page is audited: zero console errors / page errors / failed requests (environment
 * noise listed in IGNORED is reported separately), no raw i18n keys in text or labels, the
 * right `dir`, and a screenshot in SHOTS_DIR (default: ./journeys-shots) named qa-<run>-<step>.png.
 *
 *   npm run build-library-next && npm run library-next-journeys
 *   PERSONAS=educator LANGS=he SHOTS_DIR=/tmp/shots node static/js/library-next/dev/journeys.js
 */
const fs = require('fs');
const path = require('path');
const { server } = require('./serve');

const SHOTS_DIR = process.env.SHOTS_DIR || path.resolve('journeys-shots');
const PERSONAS = (process.env.PERSONAS || 'newcomer,learner,educator,scholar').split(',');
const LANGS = (process.env.LANGS || 'en,he').split(',');

// What the persona definitions in persona.js promise (minus `apparatus`, which has no tool); every persona also gets the built-ins.
const EXPECTED_TOOLS = {
  newcomer: ['explain', 'whosWho', 'readAloud'],
  learner: ['highlight', 'note', 'flashcard', 'markRead', 'vocab', 'connections'],
  educator: ['lessonBuilder', 'discussionPrompts', 'handout', 'translations', 'connections'],
  scholar: ['versions', 'manuscripts', 'lexicon', 'cite', 'linkGraph', 'connections'],
};
const BUILTIN_TOOLS = ['shelf', 'cite'];

// Environment noise (not product defects) — reported under "env" so it stays visible.
const IGNORED = [
  /favicon/i, /fonts\.(googleapis|gstatic)|typekit/i, /googletagmanager|google-analytics/i, /net::ERR_BLOCKED_BY_CLIENT/i,
  /manuscripts\.sefaria\.org/i, /storage\.googleapis\.com/i, /ERR_CERT_AUTHORITY_INVALID/,   // images this sandbox's proxy cannot fetch
  /dicta/i, /ERR_TUNNEL_CONNECTION_FAILED/,                                                   // Hebrew search also calls Dicta: no egress here
  /net::ERR_ABORTED/,                                                                         // a fetch cancelled by the next navigation
];
// Text that looks like a dotted key but is not one.
const NOT_A_KEY = /sefaria|www\.|\.org|\.com|\.il|\.js|\.css|^e\.g|^i\.e|^etc\./i;
const KEY_RE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;

const T = {   // the few UI strings the journeys click by text (EN / HE), from the feature strings.js files
  start: /^(Start reading|התחלת קריאה)/, follow: /^(Follow this schedule|מעקב אחרי לוח הזמנים|עקבו אחרי לוח הזמנים|Follow)/, addToLesson: /^(Add to lesson|הוספה לשיעור)/,
  saveSearch: /^(Save this search|שמירת החיפוש)/, addTopicPlan: /^(Add topic to my plan|הוספת הנושא לתוכנית)/, addTopicNotebook: /^(Add topic to notebook|הוספת הנושא למחברת)/,
};

function findChromium() {
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

/** Text nodes and labelling attributes that look like untranslated keys, plus the document title. */
async function rawKeys(page) {
  return page.evaluate(({ keyRe, notKey }) => {
    const key = new RegExp(keyRe); const not = new RegExp(notKey, 'i');
    const out = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE|CODE)$/.test(parent.tagName)) { continue; }
      const text = node.textContent.trim();
      if (text && key.test(text) && !not.test(text)) { out.add(text); }
    }
    for (const el of document.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) {
      for (const attr of ['aria-label', 'placeholder', 'title', 'alt']) {
        const v = (el.getAttribute(attr) || '').trim();
        if (v && key.test(v) && !not.test(v)) { out.add(`${attr}=${v}`); }
      }
    }
    if (key.test(document.title.trim())) { out.add(`title=${document.title}`); }
    return Array.from(out);
  }, { keyRe: KEY_RE.source, notKey: NOT_A_KEY.source });
}

async function storage(page, name) {
  await page.waitForTimeout(250);   // writes are debounced 150ms
  return page.evaluate((key) => { try { const raw = JSON.parse(localStorage.getItem(key) || 'null'); return raw && raw.items ? Object.values(raw.items) : (raw && raw.items === undefined && raw.v !== undefined ? [] : []); } catch (e) { return []; } }, `sefaria.libnext.${name}`);
}
const kvGet = async (page, key) => (await storage(page, 'kv')).find(i => i.id === key);

async function clickText(page, selector, re) {
  const handle = await page.evaluateHandle(({ selector, source, flags }) => {
    const re = new RegExp(source, flags);
    return Array.from(document.querySelectorAll(selector)).find(el => re.test(el.textContent.trim())) || null;
  }, { selector, source: re.source, flags: re.flags });
  const el = handle.asElement();
  if (!el) { throw new Error(`no ${selector} matching ${re}`); }
  await el.click();
  return el;
}

async function main() {
  let playwright;
  try { playwright = require('playwright'); } catch (e) { console.error('playwright is not installed'); process.exit(1); }
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const browser = await playwright.chromium.launch({ executablePath: findChromium() });
  const results = [];
  const env = new Set();
  try {
    for (const lang of LANGS) {
      for (const persona of PERSONAS) {
        await runJourney({ browser, base, persona, lang, results, env });
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(SHOTS_DIR, 'journeys.json'), JSON.stringify({ results, env: Array.from(env) }, null, 2));
  if (env.size) { console.log(`\nenvironment noise (ignored): \n  ${Array.from(env).slice(0, 12).join('\n  ')}`); }
  console.log(`\n${results.length - failed.length} of ${results.length} steps ok; screenshots in ${SHOTS_DIR}`);
  if (failed.length) { console.error(`${failed.length} failing steps:`); failed.forEach(f => console.error(`  ${f.run} › ${f.step}: ${f.problems.join(' | ')}`)); process.exit(1); }
}

async function runJourney({ browser, base, persona, lang, results, env }) {
  const run = `${persona}-${lang}`;
  const context = await browser.newContext({ locale: lang === 'he' ? 'he-IL' : 'en-US', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  const noise = (text) => IGNORED.some(re => re.test(text));
  page.on('console', msg => { if (msg.type() === 'error') { const t = msg.text(); if (noise(t)) { env.add(t.slice(0, 120)); } else { errors.push(`console: ${t.slice(0, 300)}`); } } });
  page.on('pageerror', err => errors.push(`pageerror: ${err.message.slice(0, 300)}`));
  page.on('requestfailed', r => { const t = `${r.url()} ${(r.failure() || {}).errorText || ''}`; if (noise(t)) { env.add(t.slice(0, 120)); } else { errors.push(`requestfailed: ${t.slice(0, 300)}`); } });
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  let shot = 0;

  /** Run a step, then audit the page: errors since the last step, raw keys, dir, screenshot. */
  const step = async (name, fn, { screenshot = true, fullPage = false } = {}) => {
    const problems = [];
    let notes = [];
    try {
      const out = await fn();
      if (Array.isArray(out)) { notes = out; }
      await page.waitForTimeout(150);
      const keys = await rawKeys(page);
      if (keys.length) { problems.push(`raw keys: ${keys.slice(0, 6).join(', ')}`); }
      const htmlDir = await page.getAttribute('html', 'dir');
      if (htmlDir !== dir) { problems.push(`<html dir>=${htmlDir}, expected ${dir}`); }
    } catch (e) {
      problems.push(`error: ${e.message.split('\n')[0].slice(0, 300)}`);
    }
    if (errors.length) { problems.push(...errors.splice(0)); }
    if (screenshot) {
      const file = `qa-${run}-${String(++shot).padStart(2, '0')}-${name}.png`;
      try { await page.screenshot({ path: path.join(SHOTS_DIR, file), fullPage }); } catch (e) { problems.push(`screenshot: ${e.message.slice(0, 100)}`); }
    }
    results.push({ run, step: name, ok: !problems.length, problems, notes, url: page.url().replace(base, '') });
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${run.padEnd(13)} ${name.padEnd(28)} ${page.url().replace(base, '').slice(0, 60)}${notes.length ? '  ' + notes.join('; ') : ''}`);
    problems.forEach(p => console.log(`      ${p}`));
  };
  const goto = (p) => page.goto(base + p, { waitUntil: 'load' }).then(() => page.waitForSelector('.ln-shell'));
  const count = (sel) => page.$$eval(sel, els => els.length);
  const texts = (sel) => page.$$eval(sel, els => els.map(e => e.textContent.trim()));
  const tools = async () => page.$$eval('.ln-toolbelt [data-tool]', els => els.map(e => e.dataset.tool));
  const select = async () => {
    await page.waitForSelector('.ln-seg[data-ref]');
    if (!(await page.$('.ln-toolbelt'))) { await page.click('.ln-seg[data-ref] >> nth=1'); await page.waitForSelector('.ln-toolbelt'); }
  };
  const closePanel = async () => { if (await page.$('.ln-panel-close')) { await page.click('.ln-panel-close'); await page.waitForSelector('.ln-reader-panel', { state: 'detached' }); } };

  // 1. onboarding → persona → home modules
  await step('onboarding', async () => {
    await goto(`/?lang=${lang}`);
    await page.waitForSelector('.ln-modal .ln-persona-grid');
    await page.click(`.ln-persona-card[data-persona="${persona}"]`);
    await page.waitForSelector('.ln-modal', { state: 'detached' });
    const chip = await page.textContent('.ln-chip');
    const sections = await count('main section');
    if (sections < 3) { throw new Error(`only ${sections} home modules`); }
    return [`chip "${chip.trim()}"`, `${sections} home modules`];
  }, { fullPage: true });

  // 2. /texts → category → book → Start reading → reader
  await step('texts', async () => { await goto('/texts'); await page.waitForSelector('.ln-cat-card-link'); return [`${await count('.ln-cat-card-link')} categories`]; });
  await step('category', async () => {
    await page.click('.ln-cat-card-link >> nth=0');
    for (let i = 0; i < 3 && !(await page.$('.ln-book-row-link')); i++) {
      await page.waitForSelector('.ln-cat-card-link, .ln-book-row-link');
      if (!(await page.$('.ln-book-row-link'))) { await page.click('.ln-cat-card-link >> nth=0'); }
    }
    await page.waitForSelector('.ln-book-row-link');
    return [page.url().replace(base, '')];
  });
  await step('book', async () => {
    await page.click('.ln-book-row-link >> nth=0');
    await page.waitForSelector('main h1');
    await page.waitForFunction((re) => Array.from(document.querySelectorAll('a.ln-btn')).some(a => new RegExp(re).test(a.textContent.trim())), T.start.source);
    return [await page.textContent('main h1')];
  });
  await step('start-reading', async () => {
    await clickText(page, 'a.ln-btn', T.start);
    await page.waitForSelector('.ln-seg[data-ref]');
    if (!/^\/[^/]+\.\d/.test(new URL(page.url()).pathname)) { throw new Error(`reader URL: ${page.url()}`); }
    return [`${await count('.ln-seg[data-ref]')} segments`];
  });

  // 3. reader tools on /Genesis.1
  let lessonId = null;
  await step('reader-select', async () => {
    await goto('/Genesis.1');
    await select();
    const ids = await tools();
    const missing = EXPECTED_TOOLS[persona].filter(id => !ids.includes(id));
    const extra = ids.filter(id => !EXPECTED_TOOLS[persona].includes(id) && !BUILTIN_TOOLS.includes(id));
    if (missing.length) { throw new Error(`toolbelt missing ${missing.join(', ')} (has ${ids.join(', ')})`); }
    return [`tools: ${ids.join(', ')}${extra.length ? ` (+${extra.join(', ')})` : ''}`];
  });
  const toolIds = (await page.$('.ln-toolbelt')) ? await tools() : [];
  for (const id of toolIds) {
    await step(`tool-${id}`, async () => {
      await select();
      await page.click(`.ln-toolbelt [data-tool="${id}"]`);
      await page.waitForSelector(`.ln-reader-panel[data-tool="${id}"]`);
      const notes = [];
      const panel = `.ln-reader-panel[data-tool="${id}"]`;
      const primary = `${panel} .ln-btn-primary:not([disabled])`;
      switch (id) {
        case 'highlight': await page.click(primary); await page.waitForSelector('.ln-seg.is-highlight, .ln-seg[data-ln-highlight]'); notes.push(`${(await storage(page, 'highlights')).length} highlights`); break;
        case 'note': await page.fill(`${panel} textarea`, 'QA note'); await page.click(`${panel} button[type="submit"]`); await page.waitForTimeout(200); notes.push(`${(await storage(page, 'notes')).length} notes`); break;
        case 'flashcard': if (await page.$(`${panel} button[type="submit"]:not([disabled])`)) { await page.click(`${panel} button[type="submit"]`); } notes.push(`${(await storage(page, 'flashcards')).length} cards`); break;
        case 'markRead': await page.click(primary); await page.waitForTimeout(200); notes.push(`${(await storage(page, 'plans')).length} plans`); break;
        case 'vocab': await page.click(`${panel} button[lang="he"] >> nth=0`); await page.waitForSelector(`${panel} .ln-learn-entry, ${panel} .ln-empty, ${panel} p.ln-muted`, { timeout: 12000 }).catch(() => {}); notes.push(`${await count(`${panel} .ln-learn-entry`)} entries`); break;
        case 'shelf': await page.click(`${panel} form button[type="submit"]`); await page.waitForTimeout(200); notes.push(`${(await storage(page, 'shelf')).length} on shelf`); break;
        case 'lessonBuilder': {
          if (await page.$(`${panel} .ln-lesson-new input`)) { await page.fill(`${panel} .ln-lesson-new input`, 'QA lesson'); await page.click(`${panel} .ln-lesson-new .ln-btn`); }
          await page.waitForSelector(`${panel} button[type="submit"]:not([disabled])`);
          await page.click(`${panel} button[type="submit"]`);
          await page.waitForSelector(`${panel} a[href^="/my/lessons/"]`);
          lessonId = (await page.getAttribute(`${panel} a[href^="/my/lessons/"]`, 'href')).split('/').pop();
          notes.push(`lesson ${lessonId}`); break;
        }
        case 'discussionPrompts': await page.waitForSelector(primary); await page.click(primary); await page.waitForTimeout(200); notes.push(`${((await storage(page, 'lessons'))[0] || { questions: [] }).questions.length} questions`); break;
        case 'versions': await page.waitForSelector(primary, { timeout: 15000 }); await page.click(primary); await page.waitForTimeout(300); notes.push(`${(await storage(page, 'notebook')).length} notebook entries`); break;
        case 'lexicon': await page.click(`${panel} .ln-lex-word >> nth=0`); await page.waitForSelector(`${panel} .ln-lex-entry, ${panel} .ln-lex-empty, ${panel} p.ln-muted`, { timeout: 12000 }).catch(() => {}); notes.push(`${await count(`${panel} .ln-lex-entry`)} entries`); break;
        case 'linkGraph': await page.waitForSelector(`${panel} .ln-graph`, { timeout: 15000 }); notes.push(`${await count(`${panel} .ln-graph-node`)} nodes`); break;
        case 'manuscripts': await page.waitForSelector(`${panel} .ln-ms-grid, ${panel} .ln-empty, ${panel} p`, { timeout: 15000 }); notes.push(`${await count(`${panel} .ln-ms-card`)} pages`); break;
        case 'connections': await page.waitForFunction((p) => document.querySelector(p).textContent.trim().length > 20, panel, { timeout: 15000 }); break;
        case 'translations': await page.waitForFunction((p) => document.querySelectorAll(`${p} .ln-input, ${p} button`).length > 0, panel, { timeout: 15000 }); break;
        default: await page.waitForFunction((p) => document.querySelector(p).textContent.trim().length > 10, panel);
      }
      await closePanel();
      return notes;
    });
  }

  // 4. /my/* reflects the writes
  await step('my-overview', async () => { await goto('/my'); await page.waitForSelector('.ln-my-nav'); return [`${await count('.ln-my-nav a')} sections`]; });
  await step('my-shelf', async () => { await goto('/my/shelf'); await page.waitForSelector('.ln-my'); const n = await count('.ln-my-list li'); if (toolIds.includes('shelf') && n < 1) { throw new Error('shelf item missing'); } return [`${n} items`]; });
  await step('my-history', async () => { await goto('/my/history'); const body = await page.textContent('.ln-my-body'); if (!/Genesis|בראשית/.test(body)) { throw new Error('Genesis 1 not in history'); } });
  if (persona === 'learner') {
    await step('my-notes', async () => { await goto('/my/notes'); const body = await page.textContent('.ln-my-body'); if (!body.includes('QA note')) { throw new Error('note missing'); } if (!/highlight|הדגש/i.test(body)) { throw new Error('highlight missing'); } });
    await step('my-flashcards', async () => { await goto('/my/flashcards'); return [`${(await storage(page, 'flashcards')).length} cards`]; });
    await step('my-plans', async () => { await goto('/my/plans'); await page.waitForSelector('.ln-my-plan'); return [`${await count('.ln-my-plan')} plans`]; });
  }
  if (persona === 'educator') {
    await step('my-lessons', async () => { await goto('/my/lessons'); await page.waitForSelector('.ln-my-lesson'); const meta = await texts('.ln-my-lesson .ln-small'); if (!/1 source|מקור/.test(meta.join(' '))) { throw new Error(`lesson meta: ${meta.join(' | ')}`); } return meta.slice(0, 1); });
    await step('lesson-editor', async () => { await goto(`/my/lessons/${lessonId}`); await page.waitForSelector('.ln-my-editor'); return [`${await count('.ln-my-source')} sources, ${await count('.ln-my-questions li')} questions`]; }, { fullPage: true });
    await step('handout-print', async () => {
      await goto(`/my/lessons/${lessonId}/handout`);
      await page.waitForSelector('.ln-my-handout');
      await page.emulateMedia({ media: 'print' });
      const hidden = await page.$eval('.ln-header', el => getComputedStyle(el).display === 'none');
      const dockHidden = await page.$$eval('.ln-dock-button', els => els.every(el => getComputedStyle(el).display === 'none'));
      if (!hidden || !dockHidden) { throw new Error(`print view shows chrome (header hidden: ${hidden}, dock hidden: ${dockHidden})`); }
    }, { fullPage: true });
    await page.emulateMedia({ media: 'screen' });
  }
  if (persona === 'scholar') {
    await step('my-notebook', async () => { await goto('/my/notebook'); await page.waitForSelector('.ln-my-entry'); return [`${await count('.ln-my-entry')} entries`]; });
  }

  // 5. search (Hebrew and English) → result → reader; persona actions into the inbox
  for (const q of ['שבת', 'shabbat']) {
    await step(`search-${q === 'שבת' ? 'he' : 'en'}`, async () => {
      await goto(`/search?q=${encodeURIComponent(q)}`);
      await page.waitForSelector('.ln-sr', { timeout: 20000 });
      const notes = [`${await count('.ln-sr')} results`];
      if (q === 'shabbat' && persona === 'educator') { await clickText(page, '.ln-sr button.ln-btn', T.addToLesson); notes.push(`lesson inbox ${((await kvGet(page, 'lessonInbox')) || { value: [] }).value.length}`); }
      if (q === 'shabbat' && persona === 'learner') { await clickText(page, 'button', T.saveSearch).catch(() => {}); notes.push(`saved searches ${((await kvGet(page, 'savedSearches')) || { value: [] }).value.length}`); }
      return notes;
    }, { fullPage: true });
  }
  await step('search-result', async () => { await page.click('.ln-sr-title a >> nth=0'); await page.waitForSelector('.ln-seg[data-ref]'); return [page.url().replace(base, '')]; });

  // 6. topics → topic → source → reader; topic actions into the inbox
  await step('topics', async () => { await goto('/topics'); await page.waitForSelector('a[href^="/topics/"]:not([href*="/category/"]):not([href="/topics/all"])', { timeout: 20000 }); return [`${await count('a[href^="/topics/"]')} links`]; }, { fullPage: true });
  await step('topic', async () => {
    await page.click('a[href^="/topics/"]:not([href*="/category/"]):not([href="/topics/all"]) >> nth=0');
    await page.waitForSelector('.ln-topic-page h1');
    await page.waitForSelector('.ln-source', { timeout: 20000 });
    const notes = [await page.textContent('.ln-topic-page h1')];
    if (persona === 'learner') { await clickText(page, 'button', T.addTopicPlan); notes.push(`plan inbox ${((await kvGet(page, 'planInbox')) || { value: [] }).value.length}`); }
    if (persona === 'scholar') { await clickText(page, 'button', T.addTopicNotebook); notes.push(`notebook inbox ${((await kvGet(page, 'notebookInbox')) || { value: [] }).value.length}`); }
    if (persona === 'educator') { await clickText(page, '.ln-topic-header button', T.addToLesson); notes.push(`lesson inbox ${((await kvGet(page, 'lessonInbox')) || { value: [] }).value.length}`); }
    return notes;
  }, { fullPage: true });
  await step('topic-source', async () => { await page.click('.ln-source-ref a >> nth=0'); await page.waitForSelector('.ln-seg[data-ref]'); return [page.url().replace(base, '')]; });

  // 7. calendars → follow / add to lesson → /my/plans
  await step('calendars', async () => {
    await goto('/calendars');
    await page.waitForSelector('.ln-cal-card', { timeout: 20000 });
    const notes = [`${await count('.ln-cal-card')} schedules`];
    if (persona === 'learner' || persona === 'newcomer') { await clickText(page, '.ln-cal-card button', T.follow); await page.waitForSelector('.ln-following'); notes.push('followed'); }
    if (persona === 'educator') { await clickText(page, '.ln-cal-card button', T.addToLesson); notes.push('added to lesson'); }
    return notes;
  }, { fullPage: true });
  if (persona === 'learner' || persona === 'newcomer') {
    await step('plans-after-follow', async () => {
      await goto('/my/plans');
      await page.waitForSelector('.ln-my-plan');
      const plans = await storage(page, 'plans');
      const followed = plans.find(p => p.calendar);
      if (!followed) { throw new Error('no plan with a calendar'); }
      if (!Array.isArray(followed.units) || !followed.startDate) { throw new Error(`followed plan has units=${JSON.stringify(followed.units)} startDate=${followed.startDate}`); }
      return [`"${followed.title}" ${followed.units.length} units`];
    }, { fullPage: true });
  }

  // 8. the discover inbox drains into My Library
  if (persona === 'learner') {
    await step('inbox-plan', async () => {
      await goto('/my/plans'); await page.waitForSelector('.ln-my-inbox');
      const unitCount = async () => (await storage(page, 'plans')).reduce((n, p) => n + (p.units || []).length, 0);   // the drain targets the newest plan
      const before = await unitCount();
      await page.click('.ln-my-inbox .ln-btn-primary'); await page.waitForSelector('.ln-my-inbox', { state: 'detached', timeout: 20000 });
      const after = await unitCount();
      if (after <= before) { throw new Error(`plan units ${before} → ${after}`); }
      return [`plan units ${before} → ${after}`];
    }, { fullPage: true });
    await step('inbox-searches', async () => { await goto('/my'); await page.waitForSelector('#my-searches'); return [`${await count('#my-searches ~ ul li')} saved searches`]; });
  }
  if (persona === 'educator') {
    await step('inbox-lesson', async () => {
      await goto('/my/lessons'); await page.waitForSelector('.ln-my-inbox');
      const n = await count('.ln-my-inbox-item');
      await page.click('.ln-my-inbox .ln-btn-primary'); await page.waitForTimeout(1500);
      const left = await count('.ln-my-inbox-item');
      if (left !== n - 1) { throw new Error(`inbox ${n} → ${left}`); }
      return [`inbox ${n} → ${left}`, `${((await storage(page, 'lessons')).find(l => l.id === lessonId) || { sources: [] }).sources.length} sources in the tool's lesson`];
    }, { fullPage: true });
  }
  if (persona === 'scholar') {
    await step('inbox-notebook', async () => {
      await goto('/my/notebook'); await page.waitForSelector('.ln-my-inbox');
      const before = (await storage(page, 'notebook')).length;
      await page.click('.ln-my-inbox .ln-btn-primary'); await page.waitForSelector('.ln-my-inbox', { state: 'detached' });
      return [`notebook ${before} → ${(await storage(page, 'notebook')).length}`];
    }, { fullPage: true });
  }

  // 9. interface toggle keeps the route; footer classic link; back/forward
  await step('interface-toggle', async () => {
    await goto('/texts');
    const other = lang === 'he' ? 'ltr' : 'rtl';
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('.ln-lang-toggle')]);
    await page.waitForSelector('.ln-shell');
    if (new URL(page.url()).pathname !== '/texts') { throw new Error(`route changed to ${page.url()}`); }
    if ((await page.getAttribute('html', 'dir')) !== other) { throw new Error('dir did not flip'); }
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('.ln-lang-toggle')]);
    await page.waitForSelector('.ln-shell');
    const classic = await page.$('.ln-footer a[href="/texts?library=classic"]');
    if (!classic) { throw new Error('footer classic link missing'); }
  });
  await step('back-forward', async () => {
    await page.click('.ln-nav a[href="/topics"]'); await page.waitForSelector('main h1');
    await page.click('.ln-nav a[href="/calendars"]'); await page.waitForSelector('.ln-calendars');
    await page.goBack(); await page.waitForFunction(() => location.pathname === '/topics'); await page.waitForSelector('main h1');
    await page.goForward(); await page.waitForFunction(() => location.pathname === '/calendars'); await page.waitForSelector('.ln-calendars');
  }, { screenshot: false });

  // 10. 390px: reader + toolbelt + sheet, dock button, home, lesson editor's "Add" vs the dock button
  await page.setViewportSize({ width: 390, height: 844 });
  await step('mobile-home', async () => { await goto('/'); await page.waitForSelector('main h1'); const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); if (wide) { throw new Error('horizontal overflow'); } }, { fullPage: true });
  await step('mobile-reader', async () => {
    await goto('/Genesis.1'); await select();
    const dock = await page.$eval('.ln-dock-button', el => el.getBoundingClientRect().toJSON());
    const belt = await page.$eval('.ln-toolbelt', el => el.getBoundingClientRect().toJSON());
    const overlap = dock.width && belt.width && dock.left < belt.right && dock.right > belt.left && dock.top < belt.bottom && dock.bottom > belt.top;
    if (overlap) { throw new Error('dock button overlaps the toolbelt'); }
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); if (wide) { throw new Error('horizontal overflow'); }
  });
  await step('mobile-sheet', async () => {
    await select();
    const ids = await tools();
    await page.click(`.ln-toolbelt [data-tool="${ids[0]}"]`); await page.waitForSelector('.ln-reader-panel');
    await page.waitForTimeout(300);
    return [ids[0]];
  });
  await closePanel().catch(() => {});
  if (persona === 'educator' && lessonId) {
    await step('mobile-lesson-add', async () => {
      await goto(`/my/lessons/${lessonId}`); await page.waitForSelector('.ln-my-inline-form button[type="submit"]');
      await page.$eval('.ln-my-inline-form button[type="submit"]', el => el.scrollIntoView({ block: 'end' }));
      await page.waitForTimeout(200);
      const dock = await page.$eval('.ln-dock-button', el => el.getBoundingClientRect().toJSON());
      const add = await page.$eval('.ln-my-inline-form button[type="submit"]', el => el.getBoundingClientRect().toJSON());
      const overlap = dock.width && dock.left < add.right && dock.right > add.left && dock.top < add.bottom && dock.bottom > add.top;
      if (overlap) { throw new Error(`dock button overlaps the lesson "Add" control (dock ${Math.round(dock.left)},${Math.round(dock.top)} add ${Math.round(add.left)},${Math.round(add.top)})`); }
    });
  }
  await context.close();
}

main().catch(err => { console.error(err); process.exit(1); });
