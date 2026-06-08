import { chromium } from 'playwright';

const BASE = 'http://localhost:6018/iframe.html?viewMode=story&id=';
const screens = [
  ['Choose — Sign In', 'common-authcard--choose-sign-in'],
  ['Email — Create Account', 'common-authcard--email-register'],
];

const cards = screens.map(([label, id]) => `
  <div style="display:flex;flex-direction:column;gap:6px;">
    <div style="font:600 13px/1.2 sans-serif;color:#333;">${label}</div>
    <iframe src="${BASE}${id}" style="width:720px;height:760px;border:0;"></iframe>
  </div>`).join('');

const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#fff;">
  <div style="display:flex;gap:16px;align-items:flex-start;">${cards}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 800 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/auth-screens.png', fullPage: true });
await browser.close();
console.log('wrote /tmp/auth-screens.png');
