// Steps for features/assistant/opening-by-default.feature (general scope).
import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { t } from '../../globals';
import { Visitor } from '../support/fixtures';

const A_DAY_AND_AN_HOUR = 25 * 60 * 60 * 1000;
const SETTLE_MS = 2000; // long enough for a late default-open to show

/** After a page load: the Ask button shows, and the panel stays closed while things settle. */
async function closedAfterLoad(visitor: Visitor): Promise<boolean> {
  const la = await visitor.la();
  await expect(la.askButton.or(la.panel).first(), 'the assistant has loaded').toBeVisible({ timeout: t(15000) });
  if (!(await la.askButton.isVisible())) return false;
  return la.staysHidden(la.panel, SETTLE_MS);
}

Given('the visitor closed the assistant', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureOpen();
  await la.close();
});

When('the visitor loads another library page, or comes back another day in the same browser', async ({ visitor }) => {
  await visitor.goto(visitor.libraryUrl('/topics'));
  visitor.notes.closedOnAnotherPage = await closedAfterLoad(visitor);
  await visitor.comeBackLater(A_DAY_AND_AN_HOUR, visitor.libraryUrl('/texts'));
});

Then('the assistant is closed and the Ask button is shown', async ({ visitor }) => {
  expect(await closedAfterLoad(visitor), 'closed, with the Ask button, after coming back another day').toBe(true);
  if ('closedOnAnotherPage' in visitor.notes) expect(visitor.notes.closedOnAnotherPage, 'closed on another library page').toBe(true);
});

Given('the visitor opened the assistant and left it open', async ({ visitor }) => {
  // Make the open state the visitor's own choice, not first-visit default-open: close
  // it, check a new page keeps it closed (so default-open no longer applies), then
  // open it with the Ask button.
  const la = await visitor.la();
  await la.ensureOpen();
  await la.close();
  await visitor.goto(visitor.libraryUrl('/texts'));
  expect(await closedAfterLoad(visitor), 'after closing, a new page starts closed (default-open is out of the picture)').toBe(true);
  await la.open();
});

When('the visitor loads another library page', async ({ visitor }) => {
  await visitor.goto(visitor.libraryUrl('/topics'));
});
