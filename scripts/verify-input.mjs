import { chromium } from 'playwright';

const BASE = 'http://localhost:6017/iframe.html?viewMode=story&id=';
const stories = [
  ['Default', 'common-input--default'],
  ['Filled (email)', 'common-input--filled'],
  ['Disabled', 'common-input--disabled'],
  ['Password masked + eye', 'common-input--password-masked'],
  ['With "Forgot password?" link', 'common-input--with-forgot-link'],
  ['Placeholder / error', 'common-input--placeholder-error'],
  ['Filled / error', 'common-input--filled-error'],
  ['HE label + error (RTL)', 'common-input--hebrew-label-error'],
  ['HE password, LTR value', 'common-input--hebrew-password-ltr-value'],
];

const cards = stories.map(([label, id]) => `
  <div style="display:flex;flex-direction:column;gap:6px;">
    <div style="font:600 12px/1.2 sans-serif;color:#444;">${label}</div>
    <iframe src="${BASE}${id}" style="width:360px;height:120px;border:1px dashed #ccc;border-radius:8px;background:#fff;"></iframe>
  </div>`).join('');

const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#eee;">
  <div style="display:grid;grid-template-columns:repeat(2,360px);gap:24px;">${cards}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/input-states.png', fullPage: true });
await browser.close();
console.log('wrote /tmp/input-states.png');
