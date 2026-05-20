// THROWAWAY research spec — do NOT commit. Validates two candidate
// suppression mechanisms for the Strapi-driven InterruptingMessage banner.
import { test } from '@playwright/test';
import { LANGUAGES, t } from '../../globals';
import { MODULE_URLS } from '../../constants';
import { goToPageWithLang } from '../../utils';

test.describe('overlay suppression — research', () => {
  test('R1: addInitScript localStorage monkey-patch — banner should never paint', async ({ context }) => {
    // Pre-install: anything starting with "modal_" returns "true" from getItem.
    await context.addInitScript(() => {
      const origGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (typeof key === 'string' && key.startsWith('modal_')) return 'true';
        return origGet.call(this, key);
      };
    });
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY + '/Genesis.1.1', LANGUAGES.EN);

    // Sit on the page well past the strapi.modal.showDelay (max ~10s).
    await page.waitForTimeout(t(15000));

    const box = page.locator('#interruptingMessageBox');
    const visible = await box.isVisible().catch(() => false);
    const className = await box.getAttribute('class').catch(() => null);
    console.log(JSON.stringify({ scenario: 'R1', box_visible: visible, box_class: className }));
  });

  test('R2: route-intercept /api/strapi/graphql-cache — empty modals/banners', async ({ context }) => {
    await context.route('**/api/strapi/graphql-cache*', async route => {
      const empty = { data: { modals: { data: [] }, banners: { data: [] }, sidebarAds: { data: [] } } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(empty) });
    });
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY + '/Genesis.1.1', LANGUAGES.EN);
    await page.waitForTimeout(t(15000));

    const box = page.locator('#interruptingMessageBox');
    const visible = await box.isVisible().catch(() => false);
    const className = await box.getAttribute('class').catch(() => null);
    console.log(JSON.stringify({ scenario: 'R2', box_visible: visible, box_class: className }));
  });

  test('R3: baseline — no suppression, observe banner', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY + '/Genesis.1.1', LANGUAGES.EN);
    await page.waitForTimeout(t(20000));

    const box = page.locator('#interruptingMessageBox');
    const visible = await box.isVisible().catch(() => false);
    const className = await box.getAttribute('class').catch(() => null);
    // Walk DOM to inventory ALL overlays > 50% viewport coverage
    const overlays = await page.evaluate(() => {
      const found: Array<{ tag: string; id: string; cls: string; rect: any; z: string }> = [];
      const vw = window.innerWidth, vh = window.innerHeight;
      document.querySelectorAll('body *').forEach(el => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        if (cs.position === 'fixed' && r.width * r.height > vw * vh * 0.25 && cs.display !== 'none') {
          found.push({ tag: el.tagName, id: (el as HTMLElement).id, cls: (el as HTMLElement).className, rect: { w: r.width, h: r.height }, z: cs.zIndex });
        }
      });
      return found;
    });
    console.log(JSON.stringify({ scenario: 'R3', box_visible: visible, box_class: className, overlays }, null, 2));
  });
});
