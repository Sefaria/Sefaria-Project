/**
 * Checks the live selectors of `mapped-elements.ts` against the research measurements in
 * `docs/dev-portal/research/reference/data/computed-get-v3-texts.json`: loads
 * /reference/get-v3-texts on live at each width (system fonts, nothing injected) and prints, per
 * key, the rect found now and the rect recorded then. GET only; the live guard is installed.
 *
 * Known at deploy 5.968.3: every research key matches at 1440. The research measured every width
 * with a 900px-tall viewport, so at the other widths keys tied to the viewport height (html, body,
 * sidebar, playground, response card) differ by exactly that; at 768 and 390 it measured the
 * sidebar with the mobile sub-nav panel open. Keys the research did not record (ABSENT: logo,
 * search, respToggle, and the page footer below 1440) are measured now.
 *
 *   node e2e-tests/developers-visual/capture/verify-mapped.ts [width ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPPED_ELEMENTS } from '../mapped-elements.ts';
import { measureElements } from './metrics.ts';
import { launchChromium } from './browser.ts';
import { LiveAdapter } from '../adapters/live.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const research = JSON.parse(
  fs.readFileSync(
    path.join(here, '../../../docs/dev-portal/research/reference/data/computed-get-v3-texts.json'),
    'utf8'
  )
);
const HEIGHTS: Record<string, number> = { 1440: 900, 1280: 800, 1024: 768, 768: 1024, 390: 844 };
const widths = process.argv.slice(2).length ? process.argv.slice(2) : ['1440', '1024', '390'];

const browser = await launchChromium();
let bad = 0;
for (const w of widths) {
  const context = await browser.newContext({ viewport: { width: Number(w), height: HEIGHTS[w] } });
  const adapter = await LiveAdapter.create(context, { fonts: 'system' });
  const page = adapter.page;
  await adapter.goto('/reference/get-v3-texts');
  const sel = Object.fromEntries(MAPPED_ELEMENTS.filter((e) => e.research).map((e) => [e.key, e.live]));
  const got = await measureElements(page, sel);
  console.log(`\n=== ${w}`);
  for (const key of Object.keys(research[w])) {
    const want = research[w][key]?.rect ? research[w][key].rect.map(Math.round).join(',') : 'ABSENT';
    const have = got[key] ? got[key].rect.map(Math.round).join(',') : 'MISSING';
    const ok = want === have || (want === 'ABSENT' && have === 'MISSING');
    if (!ok) bad++;
    const fs_ = got[key] ? `${got[key].style.fontSize}/${got[key].style.lineHeight} ${got[key].style.fontWeight}` : '';
    const rfs = !research[w][key]?.rect
      ? fs_
      : `${research[w][key].fontSize}/${research[w][key].lineHeight} ${research[w][key].fontWeight}`;
    console.log(
      `${ok ? '  ' : '!!'} ${key.padEnd(15)} now ${have.padEnd(22)} research ${want.padEnd(22)} ${fs_ === rfs ? '' : `style now ${fs_} research ${rfs}`}`
    );
  }
  await context.close();
}
await browser.close();
console.log(`\n${bad} rect mismatches (see the header of this file for the known ones)`);
