// Steps for features/assistant/ask-button.feature (the floating Ask button).
import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { t } from '../../globals';
import { rgb } from '../support/assistant';
import { expectAskLabel, expectFullyRounded, near } from './_helpers';

Then(/^a button labelled "([^"]*)" \[([\w.]+)\] with a star shows in the bottom corner$/, async ({ visitor }, _words: string, key: string) => {
  const la = await visitor.la();
  await expectAskLabel(la, key);
  expect(await la.star(la.askButton), 'a star beside the label').not.toBeNull();
  const box = await la.box(la.askButton);
  const vp = la.page.viewportSize()!;
  expect(vp.height - (box.y + box.height), 'near the bottom edge').toBeLessThanOrEqual(40);
  expect(Math.min(box.x, vp.width - (box.x + box.width)), 'near a side edge').toBeLessThanOrEqual(40);
});

When('the visitor opens the login page or the sign-up page', async ({ visitor }) => {
  // Only logged-out visitors can open these pages: signed-in visitors are redirected
  // to /texts (observed on production), so a story about them is about logged-out use.
  if (!visitor.isOpen) visitor.who = 'logged out';
  // Positive control: this visitor gets the Ask button on a library page, so its
  // absence on the login pages means something.
  // The control also times how long the button takes to appear after navigating;
  // the login pages are then watched for at least that long.
  const library = await visitor.la();
  const started = Date.now();
  await visitor.goto(visitor.libraryUrl('/texts'));
  await expect(library.askButton, 'control: the same visitor sees the Ask button on a library page').toBeVisible({ timeout: t(15000) });
  const mountMs = Date.now() - started;
  const counts: Record<string, number> = {};
  for (const path of ['/login', '/register']) {
    const page = await visitor.goto(visitor.libraryUrl(path));
    await expect(page).toHaveURL(new RegExp(path));
    await expect(page.getByRole('main').getByRole('heading', { level: 1 }), `the ${path} page is shown`).toBeVisible({ timeout: t(10000) });
    const la = await visitor.la();
    await la.settled();
    counts[path] = (await la.staysAbsent(la.askButton, Math.max(mountMs, t(3000)))) ? 0 : 1;
  }
  visitor.notes.askButtonsOnPages = counts;
});

Then('no Ask button is shown', async ({ visitor }) => {
  const la = await visitor.la();
  // Control for signed-in visitors (assistant turned off): the page shows them signed in.
  if (visitor.who !== 'logged out') expect(await la.showsSignedIn(), 'control: the page shows a signed-in visitor').toBe(true);
  await la.settled();
  expect(await la.staysAbsent(la.askButton, t(3000)), 'an Ask button appeared').toBe(true);
  for (const [path, count] of Object.entries(visitor.notes.askButtonsOnPages ?? {})) {
    expect(count, `Ask buttons on ${path}`).toBe(0);
  }
});

Given('the Ask button is shown', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await expect(la.askButton).toBeVisible({ timeout: t(10000) });
  visitor.it = la.askButton;
});

Then('it is 56px tall and fully rounded', async ({ visitor }) => {
  const la = await visitor.la();
  near((await la.box(visitor.it!)).height, 56);
  await expectFullyRounded(la, visitor.it!);
});

Then(/^its background is #7C416F \(Sefaria's mussar purple\) with white text$/, async ({ visitor }) => {
  const la = await visitor.la();
  await expect(visitor.it!).toHaveCSS('background-color', rgb('#7C416F'));
  expect((await la.labelFont(visitor.it!)).color).toBe(rgb('#FFFFFF'));
});

Then('its label is 16px, weight 500, beside an 18px four-point star', async ({ visitor }) => {
  const la = await visitor.la();
  const label = await la.labelFont(visitor.it!);
  near(label.fontSize, 16, 0.5);
  expect(label.fontWeight).toBe(500);
  const star = await la.star(visitor.it!);
  expect(star, 'a star beside the label').not.toBeNull();
  if (star!.kind === 'graphic') { near(star!.width, 18); near(star!.height, 18); }
  else near(star!.fontSize, 18, 0.5);
  expect(Math.abs(star!.x - label.x), 'the star is beside the label, not on it').toBeGreaterThan(4);
});

When('the pointer hovers over the Ask button', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await la.askButton.hover();
  visitor.it = la.askButton;
});

Then(/^its background is (#[0-9A-Fa-f]{6})$/, async ({ visitor }, hex: string) => {
  await expect(visitor.it!).toHaveCSS('background-color', rgb(hex), { timeout: t(2000) });
});

When('the visitor presses it', async ({ visitor }) => {
  const la = await visitor.la();
  const box = await la.box(visitor.it!);
  await la.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await la.page.mouse.down(); // held: the Then looks at the pressed state
});

When('the visitor moves keyboard focus to the Ask button', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await expect(la.askButton).toBeVisible({ timeout: t(10000) });
  visitor.notes.unfocusedRing = await la.ringStyles(la.askButton);
  await la.tabTo(la.askButton);
  visitor.it = la.askButton;
});

Then('a focus ring is visible around it', async ({ visitor }) => {
  const la = await visitor.la();
  expect(await la.isFocused(visitor.it!), 'it has keyboard focus').toBe(true);
  const ring = await la.focusRing(visitor.it!, visitor.notes.unfocusedRing);
  expect(ring.visible, `focus draws a ring the resting button lacks: ${JSON.stringify(ring)}`).toBe(true);
});

Then('pressing Enter opens the assistant', async ({ visitor }) => {
  const la = await visitor.la();
  await la.page.keyboard.press('Enter');
  await expect(la.panel).toBeVisible({ timeout: t(5000) });
});

Then(/^the Ask button sits (\d+)px from the bottom and (\d+)px from the (left|right) edge$/, async ({ visitor }, bottom: string, side: string, edge: string) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await expect(la.askButton).toBeVisible({ timeout: t(10000) });
  const box = await la.box(la.askButton);
  const vp = la.page.viewportSize()!;
  near(vp.height - (box.y + box.height), Number(bottom));
  near(edge === 'left' ? box.x : vp.width - (box.x + box.width), Number(side));
});
