// Steps for features/assistant/accessibility-hebrew.feature (reduced motion, Hebrew layout).
import { expect } from '@playwright/test';
import { Then } from '../support/fixtures';
import { LANGUAGES, t } from '../../globals';
import { SEARCHES, searchFor, translateYs } from '../support/assistant';
import { copy } from '../support/copy';
import { KEYS } from './_expected';
import { announcementsSoFar, answerArrivesWhileClosed, expectAskLabel, expectDot, near, reachLoginPrompt } from './_helpers';

Then("the Ask button doesn't bounce and its width doesn't animate when relabelled", async ({ visitor }) => {
  const la = await visitor.la();
  // Bounce: make the answer-ready moment happen, then look at what moved.
  await answerArrivesWhileClosed(visitor);
  await expectDot(la);
  const moved = (await la.motion('answer-ready')).filter(a => a.inButton && a.duration > 10 && translateYs(a.keyframes).some(y => Math.abs(y) > 0.5));
  expect(moved, 'bounce animations on the Ask button').toEqual([]);
  // Relabel: a search with no results changes the label; its width must not animate.
  const before = await la.askText();
  await la.startMotionRecorder(la.askButton, 'relabel');
  const how = await searchFor(visitor, SEARCHES.noResults);
  expect(how, 'the search happened in the page, so the motion log covers the relabel').toBe('in-page');
  await expect.poll(() => la.askText(), { timeout: t(5000), message: 'the Ask button was relabelled by a search with no results' }).not.toBe(before);
  const widthMotion = (await la.motion('relabel')).filter(a => a.inButton && a.duration > 10 && (a.name === 'width' || a.keyframes.some(k => k.width)));
  expect(widthMotion, 'width animations on the Ask button').toEqual([]);
});

Then('the login prompt appears without moving', async ({ visitor }) => {
  await reachLoginPrompt(visitor);
  const la = await visitor.la();
  const moved = (await la.motion('login-prompt')).filter(a => a.inButton && a.duration > 10 && translateYs(a.keyframes).some(y => Math.abs(y) > 0.5));
  expect(moved, 'movement in the assistant while the login prompt appeared').toEqual([]);
});

Then(/^the button's move above the cookie banner still slides \(a decision: a jump reads as a glitch\)$/, async ({ visitor }) => {
  // The button moves above the banner on narrow windows (cookie-banner.feature).
  visitor.cookiesAccepted = false;
  await visitor.setWindow(393, 852);
  await visitor.context.clearCookies({ name: 'cookiesNotificationAccepted' });
  const la = await visitor.la();
  await la.page.reload({ waitUntil: 'domcontentloaded' });
  await expect(la.cookieBanner, 'the cookie banner is shown').toBeVisible({ timeout: t(10000) });
  await la.ensureClosed();
  await expect(la.askButton).toBeVisible({ timeout: t(10000) });
  await la.startMotionRecorder(la.askButton, 'cookie-slide', 3000);
  await la.press(la.cookieBannerOk);
  await expect(la.cookieBanner).toBeHidden({ timeout: t(5000) });
  const slides = (await la.motion('cookie-slide')).filter(a => a.inButton && a.duration >= 100
    && (/bottom|inset|transform|translate|top/.test(a.name) || translateYs(a.keyframes).length > 0));
  expect(slides.length, 'the Ask button slid (not jumped) back down with reduced motion').toBeGreaterThan(0);
});

Then('the Ask button shows the Hebrew value of [assistant.floating_button.label] and sits in the bottom-left corner, star on the right', async ({ visitor }) => {
  const la = await visitor.la();
  await la.ensureClosed();
  await expectAskLabel(la, KEYS.askLabel, LANGUAGES.HE);
  const box = await la.box(la.askButton);
  const vp = la.page.viewportSize()!;
  expect(box.x, 'near the left edge').toBeLessThanOrEqual(40);
  expect(vp.height - (box.y + box.height), 'near the bottom edge').toBeLessThanOrEqual(40);
  const star = await la.star(la.askButton);
  const label = await la.labelFont(la.askButton);
  expect(star, 'a star').not.toBeNull();
  expect(star!.x, 'the star is to the right of the label').toBeGreaterThan(label.x);
});

Then("the answer-ready dot sits at the button's top-right corner", async ({ visitor }) => {
  const la = await visitor.la();
  await answerArrivesWhileClosed(visitor);
  await expectDot(la);
  const dot = await la.box(la.answerReadyDot);
  const btn = await la.box(la.askButton);
  near(dot.x + dot.width / 2, btn.x + btn.width, 14);
  near(dot.y + dot.height / 2, btn.y, 14);
});

Then('the login prompt shows the Hebrew values of [assistant.anon.limit_reached] and [assistant.anon.login_button]', async ({ visitor }) => {
  await reachLoginPrompt(visitor);
  const la = await visitor.la();
  await expect(la.loginPromptText(copy(KEYS.limitReached, LANGUAGES.HE))).toBeVisible();
  await expect(la.loginPromptButton(copy(KEYS.loginButton, LANGUAGES.HE))).toBeVisible();
});

Then('announcements are in Hebrew', async ({ visitor }) => {
  // Judged on what was announced earlier in the scenario (the answer-ready moment), so
  // it doesn't need a new answer: by now the visitor may be at the free-answer limit.
  const text = copy(KEYS.readyAnnouncement, LANGUAGES.HE);
  if (!(await announcementsSoFar(visitor)).length) await answerArrivesWhileClosed(visitor);
  await expect.poll(() => announcementsSoFar(visitor), { timeout: t(5000), message: 'the answer-ready announcement, in Hebrew' }).toContain(text);
});
