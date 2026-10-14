// Steps for features/assistant/entry-points.feature (the header pill; general scope).
import { expect } from '@playwright/test';
import { Then, When } from '../support/fixtures';
import { t } from '../../globals';
import { rgb } from '../support/assistant';
import { copy } from '../support/copy';
import { PageManager } from '../../pages/pageManager';
import { expectFullyRounded, near } from './_helpers';
import { KEYS } from './_expected';
import { Assistant } from '../support/assistant';
import { Visitor } from '../support/fixtures';

/** The header pill, found by its label [header.library_assistant]. */
const pillOf = (la: Assistant, visitor: Visitor) => la.headerPill(copy(KEYS.headerPill, visitor.lang));

const MOBILE_BREAKPOINT = 843;

Then('the header shows a "✦ Library Assistant" pill [header.library_assistant] just before the search box', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(pillOf(la, visitor), 'the header pill is shown').toBeVisible({ timeout: t(10000) });
  await expect(pillOf(la, visitor)).toContainText(copy(KEYS.headerPill, visitor.lang));
  const pill = await la.box(pillOf(la, visitor));
  const search = await la.box(la.headerSearchBox);
  near(pill.y + pill.height / 2, search.y + search.height / 2, 10);
  const gap = visitor.lang === 'hebrew' ? pill.x - (search.x + search.width) : search.x - (pill.x + pill.width);
  expect(gap, 'the pill comes just before the search box').toBeGreaterThanOrEqual(0);
  expect(gap, 'the pill comes just before the search box').toBeLessThanOrEqual(64);
  visitor.it = pillOf(la, visitor);
  visitor.notes.itOpensAssistant = true;
});

When('the visitor tabs to the header pill', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(pillOf(la, visitor), 'the header pill is shown').toBeVisible({ timeout: t(10000) });
  await la.ensureClosed();
  visitor.notes.unfocusedRing = await la.ringStyles(pillOf(la, visitor));
  await la.tabTo(pillOf(la, visitor));
  visitor.it = pillOf(la, visitor);
});

Then('a focus ring is visible', async ({ visitor }) => {
  const la = await visitor.la();
  expect(await la.isFocused(visitor.it!), 'it has keyboard focus').toBe(true);
  const ring = await la.focusRing(visitor.it!, visitor.notes.unfocusedRing);
  expect(ring.visible, `focus draws a ring the resting pill lacks: ${JSON.stringify(ring)}`).toBe(true);
});

Then('pressing Enter or Space opens the assistant', async ({ visitor }) => {
  const la = await visitor.la();
  for (const key of ['Enter', 'Space']) {
    await la.ensureClosed();
    await visitor.it!.focus();
    await la.page.keyboard.press(key);
    await expect(la.panel, `${key} opens the assistant`).toBeVisible({ timeout: t(5000) });
  }
});

When('the visitor is on a Voices page', async ({ visitor }) => {
  // Positive control: the same visitor sees the pill on a library page, timed so the
  // Voices page can be watched for at least as long.
  const started = Date.now();
  await visitor.goto(visitor.libraryUrl('/texts'));
  const la = await visitor.la();
  await expect(pillOf(la, visitor), 'control: the same visitor sees the pill on a library page').toBeVisible({ timeout: t(15000) });
  visitor.notes.pillMountMs = Date.now() - started;
  await visitor.goto(visitor.voicesUrl());
});

Then('the header has no Library Assistant pill', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.headerSearchBox, 'the header is rendered').toBeVisible({ timeout: t(10000) });
  const watchMs = Math.max(visitor.notes.pillMountMs ?? 0, t(3000));
  expect(await la.staysAbsent(pillOf(la, visitor), watchMs), `a Library Assistant pill appeared within ${watchMs}ms`).toBe(true);
});

Then('the pill is 30px tall, fully rounded, #7C416F with white 14px text and a 16px star', async ({ visitor }) => {
  const la = await visitor.la();
  const pill = pillOf(la, visitor);
  await expect(pill, 'the header pill is shown').toBeVisible({ timeout: t(10000) });
  near((await la.box(pill)).height, 30);
  await expectFullyRounded(la, pill);
  await expect(pill).toHaveCSS('background-color', rgb('#7C416F'));
  const label = await la.labelFont(pill);
  expect(label.color).toBe(rgb('#FFFFFF'));
  near(label.fontSize, 14, 0.5);
  const star = await la.star(pill);
  expect(star, 'a star').not.toBeNull();
  if (star!.kind === 'graphic') { near(star!.width, 16); near(star!.height, 16); }
  else near(star!.fontSize, 16, 0.5);
  visitor.it = pill;
});

Then('hovering or pressing it turns it #653259', async ({ visitor }) => {
  const la = await visitor.la();
  const pill = visitor.it ?? pillOf(la, visitor);
  await pill.hover();
  await expect(pill, 'hovered').toHaveCSS('background-color', rgb('#653259'), { timeout: t(2000) });
  const box = await la.box(pill);
  await la.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await la.page.mouse.down();
  await expect(pill, 'pressed').toHaveCSS('background-color', rgb('#653259'), { timeout: t(2000) });
  await la.page.mouse.move(0, 0); // leave before releasing, so the press doesn't open anything
  await la.page.mouse.up();
});

Then('there is no header pill, no mobile menu item and no Ask button', async ({ visitor }) => {
  const page = await visitor.page();
  const la = await visitor.la();
  // Control: the visitor is signed in and the page has settled, which is when the assistant mounts.
  expect(await la.showsSignedIn(), 'control: the page shows a signed-in visitor').toBe(true);
  await la.settled();
  expect(await la.staysAbsent(la.askButton, t(3000)), 'an Ask button appeared').toBe(true);
  const label = copy(KEYS.headerPill, visitor.lang);
  if ((page.viewportSize()?.width ?? 1280) >= MOBILE_BREAKPOINT) {
    await expect(la.headerSearchBox, 'the header is shown').toBeVisible();
    await expect(pillOf(la, visitor)).toHaveCount(0);
  } else {
    await new PageManager(page, visitor.lang).onMobileHamburger().openMenu();
  }
  // No site control (outside the assistant itself) is named after the assistant.
  const named = await page.evaluate(text => Array.from(document.querySelectorAll('a, button, [role="button"], [role="menuitem"]'))
    .filter(el => (el as HTMLElement).getClientRects().length > 0 && (el.textContent ?? '').includes(text)).length, label);
  expect(named, `site controls labelled "${label}"`).toBe(0);
});
