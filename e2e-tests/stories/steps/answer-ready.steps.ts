// Steps for features/assistant/answer-ready.feature (the red dot on the Ask button).
import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { LANGUAGES, t } from '../../globals';
import { Motion, SEARCHES, normalizeLabel, rgb, searchFor, translateYs } from '../support/assistant';
import { copy } from '../support/copy';
import { QUESTION, answerArrivesWhileClosed, expectAskLabel, expectDot, expectFullyRounded, near, stubAnswerText } from './_helpers';

import { KEYS } from './_expected';

const SEARCH_LABEL = KEYS.searchLabel;

/** Animations that move the Ask button itself up and down (not the dot's ping). */
const bounces = (m: Motion[]) => m.filter(a => a.inButton && !a.inDot && a.duration > 10 && translateYs(a.keyframes).some(y => Math.abs(y) > 0.5));
/** Fading animations on the dot (its ping), including its pseudo-elements. */
const pings = (m: Motion[]) => m.filter(a => a.inDot && a.duration > 10 && a.keyframes.some(k => k.opacity !== undefined && k.opacity !== null && String(k.opacity) !== ''));

Given('the visitor asked a question', async ({ visitor }) => {
  // The answer is held until a later step lets it arrive ("When the answer arrives").
  visitor.chat.holdAnswers = true;
  await (await visitor.la()).ask(QUESTION, visitor.chat);
});

Given('closed the assistant before the answer arrived', async ({ visitor }) => {
  expect(visitor.chat.pending, 'an answer is still on its way').toBeGreaterThan(0);
  await (await visitor.la()).close();
});

When('the answer arrives', async ({ visitor }) => {
  await answerArrivesWhileClosed(visitor);
});

Then('a red dot appears on the Ask button', async ({ visitor }) => {
  const la = await visitor.la();
  await expectDot(la);
  const dot = await la.box(la.answerReadyDot);
  const btn = await la.box(la.askButton);
  const cx = dot.x + dot.width / 2, cy = dot.y + dot.height / 2;
  expect(cx >= btn.x - 8 && cx <= btn.x + btn.width + 8 && cy >= btn.y - 8 && cy <= btn.y + btn.height + 8, 'the dot is on the button').toBe(true);
  const bg = (await la.styles(la.answerReadyDot, ['background-color']))['background-color'];
  expect(bg, 'the dot is red').toBe(rgb('#C03522'));
});

Then('the button bounces twice, then stays still with the dot', async ({ visitor }) => {
  const la = await visitor.la();
  const found = bounces(await la.motion('answer-ready'));
  expect(found.length, 'the Ask button bounced').toBeGreaterThan(0);
  const count = found.reduce((n, a) => n + (a.iterations < 0 ? Infinity : a.iterations), 0);
  expect(count, 'number of bounces').toBe(2);
  await expect.poll(() => la.askButton.evaluate(el =>
    el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length), { timeout: t(5000), message: 'the button stays still' }).toBe(0);
  await expectDot(la);
});

Then(/^screen readers hear "([^"]*)" \[([\w.]+)\]$/, async ({ visitor }, _words: string, key: string) => {
  const la = await visitor.la();
  await expect(la.announcement(copy(key, visitor.lang)).first()).toBeAttached({ timeout: t(5000) });
});

Then(/^the button's accessible name is "([^"]*)" \[([\w.]+)\]$/, async ({ visitor }, _words: string, key: string) => {
  const la = await visitor.la();
  await expect(la.askButton).toHaveAccessibleName(copy(key, visitor.lang));
});

Given('the answer-ready dot is shown', async ({ visitor }) => {
  await answerArrivesWhileClosed(visitor);
  await expectDot(await visitor.la());
});

Given('the Ask button shows the answer-ready dot', async ({ visitor }) => {
  await answerArrivesWhileClosed(visitor);
  await expectDot(await visitor.la());
});

Then("the dot is a 12px circle, #C03522, with a 2px white ring, at the button's top corner on the start side", async ({ visitor }) => {
  const la = await visitor.la();
  const dot = la.answerReadyDot;
  const s = await la.styles(dot, ['background-color', 'border-top-width', 'border-top-style', 'border-top-color', 'box-shadow', 'outline-width', 'outline-style', 'outline-color']);
  expect(s['background-color']).toBe(rgb('#C03522'));
  const box = await la.box(dot);
  const border = s['border-top-style'] !== 'none' ? parseFloat(s['border-top-width']) : 0;
  near(box.width - 2 * border, 12);
  near(box.height - 2 * border, 12);
  await expectFullyRounded(la, dot);
  const white = rgb('#FFFFFF');
  const ring =
    (border > 0 && Math.abs(border - 2) <= 0.5 && s['border-top-color'] === white) ||
    (s['box-shadow'].includes(white) && /\b0px 0px 0px 2px\b/.test(s['box-shadow'])) ||
    (s['outline-style'] !== 'none' && parseFloat(s['outline-width']) === 2 && s['outline-color'] === white);
  expect(ring, `a 2px white ring (border ${s['border-top-width']} ${s['border-top-color']}; box-shadow ${s['box-shadow']}; outline ${s['outline-width']} ${s['outline-color']})`).toBe(true);
  const btn = await la.box(la.askButton);
  const startX = visitor.lang === LANGUAGES.HE ? btn.x + btn.width : btn.x;
  near(box.y + box.height / 2, btn.y, 14);
  near(box.x + box.width / 2, startX, 14);
});

Then('each bounce lasts 0.6s, rising 6px, then a 2px hop', async ({ visitor }) => {
  const la = await visitor.la();
  const found = bounces(await la.motion('answer-ready'));
  expect(found.length, 'the Ask button bounced').toBeGreaterThan(0);
  for (const a of found) {
    near(a.duration, 600, 20);
    const ys = translateYs(a.keyframes);
    near(Math.min(...ys), -6, 0.5);
    expect(ys.some(y => Math.abs(y + 2) <= 0.5), `a 2px hop among ${JSON.stringify(ys)}`).toBe(true);
  }
});

Then('with each bounce the dot sends out a fading ping', async ({ visitor }) => {
  const la = await visitor.la();
  const motion = await la.motion('answer-ready');
  const bounce = bounces(motion);
  const ping = pings(motion);
  expect(ping.length, 'the dot pinged').toBeGreaterThan(0);
  for (const p of ping) {
    const last = p.keyframes[p.keyframes.length - 1];
    expect(Number(last.opacity), 'the ping fades out').toBe(0);
  }
  const count = (list: Motion[]) => list.reduce((n, a) => n + a.iterations, 0);
  expect(count(ping), 'one ping per bounce').toBe(count(bounce));
  near(ping[0].duration, bounce[0]?.duration ?? 600, 20);
});

Then('the answer is shown and the dot is gone', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.message(stubAnswerText(visitor)).last()).toBeVisible({ timeout: t(5000) });
  await expect(la.answerReadyDot).toBeHidden();
});

When('the visitor closes the assistant again', async ({ visitor }) => {
  await (await visitor.la()).close();
});

Then('the button shows no dot', async ({ visitor }) => {
  const la = await visitor.la();
  await expect(la.askButton).toBeVisible();
  await expect(la.answerReadyDot).toBeHidden();
});

Given('the button reads "Search with Library Assistant"', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  const s = SEARCHES.someTabsEmpty;
  await searchFor(visitor, s.query, s.emptyTab);
  await expect(la.noResults.first()).toBeVisible({ timeout: t(10000) });
  visitor.notes.search = s;
  await expectAskLabel(la, SEARCH_LABEL);
});

Given('an answer arrives while the assistant is closed', async ({ visitor }) => {
  await answerArrivesWhileClosed(visitor);
});

Then('the dot appears and the label stays "Search with Library Assistant"', async ({ visitor }) => {
  const la = await visitor.la();
  await expectDot(la);
  await expectAskLabel(la, SEARCH_LABEL);
  const expected = normalizeLabel(copy(SEARCH_LABEL, visitor.lang));
  expect(await la.texts('answer-ready'), 'the label never changed while the answer landed').toEqual([expected]);
});

Then('the dot appears without bouncing or pinging', async ({ visitor }) => {
  const la = await visitor.la();
  await expectDot(la);
  const moving = (await la.motion('answer-ready')).filter(a => (a.inButton || a.inDot) && a.duration > 10);
  expect(moving, 'animations on the button or dot').toEqual([]);
});
