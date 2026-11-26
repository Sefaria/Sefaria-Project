// Shared step vocabulary: generic sentences any feature file may use without new code.
// The list is in e2e-tests/feature-specs/STEP-VOCABULARY.md; keep the two in sync.
// Feature-specific steps go in their own file (e.g. steps/library/reader.steps.ts).
import { Given, When, Then, expect, Module } from './fixtures';
import { LANGUAGES, t } from '../../globals';

// ---- Who the visitor is ---------------------------------------------------------------

Given('I am a logged-out visitor', async ({ visitor }) => {
  visitor.who = 'logged out';
});

Given('I am logged in', async ({ visitor }) => {
  visitor.who = 'logged in';
});

Given('the interface language is {word}', async ({ visitor }, language: string) => {
  const lang = { english: LANGUAGES.EN, hebrew: LANGUAGES.HE }[language.toLowerCase()];
  if (!lang) throw new Error(`Unknown interface language "${language}" (use English or Hebrew)`);
  visitor.lang = lang;
});

// ---- Going places -----------------------------------------------------------------------

When('I open the {word} page {string}', async ({ visitor }, module: string, path: string) => {
  if (module !== 'Library' && module !== 'Voices') {
    throw new Error(`Unknown module "${module}" (use Library or Voices)`);
  }
  await visitor.goto(visitor.urlFor(module as Module, path));
});

When('I click the {string} link', async ({ visitor }, name: string) => {
  const page = await visitor.page();
  await page.getByRole('link', { name, exact: true }).first().click();
});

When('I click the {string} button', async ({ visitor }, name: string) => {
  const page = await visitor.page();
  await page.getByRole('button', { name, exact: true }).first().click();
});

// ---- What the visitor sees ---------------------------------------------------------------

Then('I see {string}', async ({ visitor }, text: string) => {
  const page = await visitor.page();
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout: t(15000) });
});

Then('I do not see {string}', async ({ visitor }, text: string) => {
  const page = await visitor.page();
  await expect(page.getByText(text, { exact: false })).toHaveCount(0, { timeout: t(15000) });
});

Then('I see a {string} link', async ({ visitor }, name: string) => {
  const page = await visitor.page();
  await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible({ timeout: t(15000) });
});

Then('I see a {string} button', async ({ visitor }, name: string) => {
  const page = await visitor.page();
  await expect(page.getByRole('button', { name, exact: true }).first()).toBeVisible({ timeout: t(15000) });
});

Then('the address contains {string}', async ({ visitor }, fragment: string) => {
  const page = await visitor.page();
  await expect(page).toHaveURL(new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
    timeout: t(15000),
  });
});

Then('the page title contains {string}', async ({ visitor }, fragment: string) => {
  const page = await visitor.page();
  await expect(page).toHaveTitle(new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
    timeout: t(15000),
  });
});
