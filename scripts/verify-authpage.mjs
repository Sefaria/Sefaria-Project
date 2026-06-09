import { chromium } from 'playwright';
const base = 'http://localhost:6018/iframe.html?viewMode=story&id=';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 720 }, deviceScaleFactor: 2 });

await page.goto(base + 'auth-authpage--login-choose', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/authpage-choose.png' });

await page.getByRole('button', { name: 'Continue with Email' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/authpage-email.png' });

await browser.close();
console.log('ok');
