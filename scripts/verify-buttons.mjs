import { chromium } from 'playwright';

const BASE = 'http://localhost:6018/iframe.html?viewMode=story&id=';
const stories = [
  ['Auth button set (Google / Apple / Email primary)', 'common-providerbutton--auth-button-set', 320, 200],
  ['Google', 'common-providerbutton--google', 320, 80],
  ['Apple', 'common-providerbutton--apple', 320, 80],
  ['Google disabled', 'common-providerbutton--google-disabled', 320, 80],
  ['Hebrew', 'common-providerbutton--hebrew', 320, 140],
];

const cards = stories.map(([label, id, w, h]) => `
  <div style="display:flex;flex-direction:column;gap:6px;">
    <div style="font:600 12px/1.2 sans-serif;color:#444;">${label}</div>
    <iframe src="${BASE}${id}" style="width:${w}px;height:${h}px;border:1px dashed #ccc;border-radius:8px;background:#fff;"></iframe>
  </div>`).join('');

const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#eee;">
  <div style="display:grid;grid-template-columns:repeat(2,340px);gap:24px;align-items:start;">${cards}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 700 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/button-states.png', fullPage: true });
await browser.close();
console.log('wrote /tmp/button-states.png');
