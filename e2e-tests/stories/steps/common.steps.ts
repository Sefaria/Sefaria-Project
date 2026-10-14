// Steps shared across the assistant features: who the visitor is, the window, the
// page, and opening/closing the assistant.
import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { LANGUAGES, t } from '../../globals';

const WHO = { 'logged out': 'logged out', 'logged in with the assistant on': 'assistant on' } as const;

Given('the visitor prefers reduced motion', async ({ visitor }) => {
  await visitor.preferReducedMotion();
});

Given(/^the interface is (English|Hebrew)$/, async ({ visitor }, lang: string) => {
  expect(visitor.isOpen, 'the interface language is chosen before the first page opens').toBe(false);
  visitor.lang = lang === 'Hebrew' ? LANGUAGES.HE : LANGUAGES.EN;
});

Given(/^the window is (\d+)px wide$/, async ({ visitor }, width: string) => {
  await visitor.setWindow(Number(width));
});

Given(/^the visitor is (logged out|logged in with the assistant on) on (sefaria\.org|sefaria\.org\.il)$/, async ({ visitor }, who: keyof typeof WHO, site: string) => {
  visitor.who = WHO[who];
  visitor.lang = site === 'sefaria.org.il' ? LANGUAGES.HE : LANGUAGES.EN;
});

Given(/^the visitor is (logged out|logged in with the assistant on)$/, async ({ visitor }, who: keyof typeof WHO) => {
  visitor.who = WHO[who];
});

Given(/^the visitor is (logged out|logged in with the assistant on) and has never closed the assistant in this browser$/, async ({ visitor }, who: keyof typeof WHO) => {
  // Every scenario starts in a fresh browser context, so nothing was ever closed in it.
  expect(visitor.isOpen).toBe(false);
  visitor.who = WHO[who];
});

Given('the visitor is logged in with the assistant turned off', async ({ visitor }) => {
  visitor.who = 'assistant off';
  await visitor.page();
});

Given('the visitor is logged in and turned the assistant off in their settings', async ({ visitor }) => {
  visitor.who = 'assistant off';
  await visitor.page();
});

Given('the visitor is on a library page with the assistant on', async ({ visitor }) => {
  visitor.who = 'assistant on';
  await visitor.goto(visitor.libraryUrl('/texts'));
});

When('a library page loads', async ({ visitor }) => {
  await visitor.goto(visitor.libraryUrl('/texts'));
});

Given('the assistant is closed', async ({ visitor }) => {
  await (await visitor.la()).ensureClosed();
});

Given('the assistant is on and closed', async ({ visitor }) => {
  expect(visitor.who).toBe('assistant on');
  await (await visitor.la()).ensureClosed();
});

Given('a device with a mouse', async ({ visitor }) => {
  expect(visitor.hasTouch, 'this project emulates a mouse, not touch').toBe(false);
});

When('the visitor opens the assistant', async ({ visitor }) => {
  await (await visitor.la()).ensureOpen();
});

Then('the assistant opens', async ({ visitor }) => {
  await expect((await visitor.la()).panel).toBeVisible({ timeout: t(5000) });
});

Then('the assistant is open', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.panel.or(la.askButton).first(), 'the assistant has loaded').toBeVisible({ timeout: t(15000) });
  await expect(la.panel).toBeVisible();
});

When('the visitor clicks it', async ({ visitor }) => {
  expect(visitor.it, 'an earlier step named what "it" is').toBeTruthy();
  const la = await visitor.la();
  // "When the visitor clicks it / Then the assistant opens" is only observable from closed.
  if (visitor.notes.itOpensAssistant) await la.ensureClosed();
  visitor.notes.clickedAt = Date.now();
  await la.press(visitor.it!);
});
