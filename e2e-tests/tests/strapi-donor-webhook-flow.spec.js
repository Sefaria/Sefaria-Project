/**
 * Playwright Tests: the gold-standard donor flow, end to end with real server rendering.
 *
 *   1. A brand-new user (throwaway, because donor status is permanent) sees non-donor modal A
 *      and banner A′.
 *   2. They click A's call-to-action (the external donation page is aborted at the network).
 *   3. A webhook reports them as a donor: a real POST to /api/webhooks/salesforce with the
 *      shared secret, or to /api/webhooks/classy signed the way Svix signs Classy's deliveries.
 *      The test runs once per source.
 *   4. The next day (the fake clock moves a day; content windows roll over), non-donor B/B′
 *      are HIDDEN and donor-only thank-you C/C′ are VISIBLE.
 *
 * WHY NEW DOCUMENTS B/B′ rather than re-checking A: clicking A's button writes A's dismissal
 * key, so "A is gone" would pass even with donor targeting broken.
 *
 * WHY B/B′ ARE BUILT TO WIN IF THE DONOR GATE BREAKS: selection ranks audience specificity
 * first (strapiSelection.js, selectionPriorityKey), and a donor-only document counts as
 * restricted (1) while a non-donor-only one does not (0). Left like that, donor-only C would
 * outrank B even with the donor gate deleted, and "B is hidden" could never fail. So B is also
 * `showTo: logged_in_only` (specificity 1, tying C; the throwaway user is logged in, so B stays
 * otherwise eligible) and has a SHORTER window than C that still contains day 2 (the next
 * tier, shorter wins). With the donor gate broken B beats C and the C assertions fail; with it
 * working B is filtered out and C is all that is left. Same construction for B′/C′.
 *
 * WHY EVERY DOCUMENT GETS ITS OWN internalModalName / internalBannerName: the dismissal key is
 * `modal_<internalModalName>`, and the factory derives a default name from the document's
 * POSITION in the payload. Day 2's first modal (B) would then share day 1's name with A, inherit
 * A's dismissal from localStorage, and be hidden for THAT reason instead of the donor gate —
 * exactly the vacuous pass the paragraph above exists to prevent.
 *
 * TIME BUDGET: see the test.setTimeout in the test body.
 *
 * WAITING: the webhook's 202 body says whether processing ran inline (local: no wait at all) or
 * was queued (integration: the real Celery worker). Only the queued case waits, bounded at 20s,
 * on a condition that is permanent once true — so it cannot flicker.
 *
 * GUARANTEES: endpoint, secret check, parsing, dispatcher, task (inline or real worker),
 * profile write, base_props → Sefaria.donor_status → isConfirmedDonor, and targeting in both
 * directions on both surfaces, for each source. NOT covered: a Classy payload without
 * member_email_address (the task then asks Classy's production API for the address, and Classy
 * has no sandbox, so that stays in pytest), real Strapi (payloads are synthetic, as in every
 * Strapi spec), or a queued path slower than 20s.
 *
 * SKIPS (with a reason) when MOBILE_APP_KEY, or that source's webhook secret
 * (SALESFORCE_WEBHOOK_SECRET / CLASSY_WEBHOOK_SECRET), is not set for the run.
 *
 * HOW THIS SUITE DIFFERS FROM THE REST OF e2e-tests/ (read before "fixing" it):
 *   Bare page.goto plus a synthetic Strapi route, because goToPageWithLang / goToPageWithUser
 *   would suppress the very content under test (see e2e-tests/CLAUDE.md §22).
 */

import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { routeWithStrapiPayload, expectStrapiServed } from '../support/strapi-payload-fixture.js';
import { SYNTHETIC_NOW, banner, daysFromNow, modal, strapiPayload } from '../support/strapi-payload-factory.js';
import {
  prepareStrapiPage,
  useInterfaceLanguage,
  expectInterfaceLanguage,
  advanceBy,
  waitForTimerArmed,
  waitForStrapiResponse,
  strapiResponseCount,
} from './strapi.fixtures.js';
import { registerThrowawayUser, throwawayUserPrerequisitesMissing } from '../support/throwaway-user.js';
import { LANGUAGES, t } from '../globals';

const PAGE_PATH = '/texts';
const BANNER_DELAY_SECONDS = 5;
const MODAL_DELAY_SECONDS = 9;
const QUEUED_PROCESSING_BOUND_MS = t(20000);

const modalBox = (page) => page.locator('#interruptingMessageBox');
const bannerBox = (page) => page.locator('#bannerMessage');

const DONOR_ONLY = { showToDonor: true, showToNonDonor: false };
const NON_DONOR_ONLY = { showToDonor: false, showToNonDonor: true };

// Day 1 = SYNTHETIC_NOW; day 2 = one day later. A's window ends between them and B/C's begins,
// so moving the clock one day is what swaps the content.
const DAY_ONE_WINDOW = { start: daysFromNow(-1), end: daysFromNow(0.5) };
const DAY_TWO_WINDOW = { start: daysFromNow(0.5), end: daysFromNow(3) };
// Strictly inside DAY_TWO_WINDOW and still containing day 2 (+1 day). Shorter than C's window,
// which is what lets B win the "shorter window first" ranking tier if the donor gate breaks.
const DAY_TWO_SHORTER_WINDOW = { start: daysFromNow(0.75), end: daysFromNow(1.5) };
// Ties donor-only C on audience specificity (both 1) while staying visible to the logged-in
// throwaway user, so B can only lose to C through the donor gate.
const AS_SPECIFIC_AS_DONOR_ONLY = { showTo: 'logged_in_only' };

const docText = {
  A: 'Synthetic day-1 non-donor modal A', A_PRIME: 'Synthetic day-1 non-donor banner A-prime',
  B: 'Synthetic day-2 non-donor modal B', B_PRIME: 'Synthetic day-2 non-donor banner B-prime',
  C: 'Synthetic day-2 donor thank-you modal C', C_PRIME: 'Synthetic day-2 donor thank-you banner C-prime',
};

// Distinct per document, so no dismissal key is ever shared between two of them (see header).
const docName = {
  A: 'donor-flow-day1-ask-modal-A', A_PRIME: 'donor-flow-day1-ask-banner-A-prime',
  B: 'donor-flow-day2-ask-modal-B', B_PRIME: 'donor-flow-day2-ask-banner-B-prime',
  C: 'donor-flow-day2-thanks-modal-C', C_PRIME: 'donor-flow-day2-thanks-banner-C-prime',
};

const flowModal = (dateWindow, flags, text, internalModalName, extra = {}) =>
  modal({ window: dateWindow, shared: { showDelay: MODAL_DELAY_SECONDS, internalModalName, ...flags, ...extra }, locales: { en: { modalText: text } } });
const flowBanner = (dateWindow, flags, text, internalBannerName, extra = {}) =>
  banner({ window: dateWindow, shared: { showDelay: BANNER_DELAY_SECONDS, internalBannerName, ...flags, ...extra }, locales: { en: { bannerText: text } } });

const salesforcePayloadFor = (email) => ({
  source: 'salesforce',
  eventType: 'UserBecameDonor',
  sourceEventId: `playwright:UserBecameDonor:${Date.now()}`,
  // The Salesforce contract requires an explicit UTC offset (a bare local time is rejected as
  // malformed); SYNTHETIC_NOW is an ISO string ending in "Z", so it satisfies that as is.
  occurredAt: SYNTHETIC_NOW,
  person: { email, salesforceContactId: 'playwright-contact', classySupporterId: null },
  donation: null,
});

// The transaction.created payload Classy sends, with the personal and card values replaced by
// fake ones. It is the file the pytest suite parses, so both test layers send the same shape.
const CLASSY_TRANSACTION_CREATED = JSON.parse(readFileSync(
  path.join(__dirname, '../../webhooks/tests/fixtures/classy_transaction_created.json'), 'utf8'));

// The same algorithm as webhooks/adapters/svix_signature.py: HMAC-SHA256 over
// "<message id>.<timestamp>.<body>", keyed with the base64 part of the "whsec_" secret.
function svixSignatureFor(secret, messageId, timestamp, body) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return `v1,${createHmac('sha256', key).update(`${messageId}.${timestamp}.${body}`).digest('base64')}`;
}

function classyRequestFor(email) {
  const secret = process.env.CLASSY_WEBHOOK_SECRET;
  // member_email_address is set, as it is in Classy's real deliveries, so the server never has to
  // ask Classy's API for the donor's address.
  const body = JSON.stringify({ ...CLASSY_TRANSACTION_CREATED, data: { ...CLASSY_TRANSACTION_CREATED.data, member_email_address: email } });
  // The message id is the event's id, so each run sends a new one.
  const messageId = `msg_playwright_${Date.now()}`;
  // The real time, not the fake clock (page.clock only changes time inside the browser): the
  // server rejects a signature whose timestamp is more than 5 minutes from its own clock.
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    headers: {
      'Content-Type': 'application/json',
      'svix-id': messageId,
      'svix-timestamp': String(timestamp),
      'svix-signature': svixSignatureFor(secret, messageId, timestamp, body),
    },
    // A string, so Playwright sends exactly the bytes that were signed.
    data: body,
  };
}

const salesforceRequestFor = (email) => ({
  headers: { 'X-Sefaria-Webhook-Secret': process.env.SALESFORCE_WEBHOOK_SECRET },
  data: salesforcePayloadFor(email),
});

const DONATION_SOURCES = [
  { name: 'Salesforce', endpointPath: '/api/webhooks/salesforce', secretVariable: 'SALESFORCE_WEBHOOK_SECRET', requestFor: salesforceRequestFor },
  { name: 'Classy', endpointPath: '/api/webhooks/classy', secretVariable: 'CLASSY_WEBHOOK_SECRET', requestFor: classyRequestFor },
];

async function loadAt(page, pinnedNow) {
  await prepareStrapiPage(page, { pinnedNow });
  await useInterfaceLanguage(page, LANGUAGES.EN);
  const before = strapiResponseCount(page);
  await page.goto(PAGE_PATH);
  // Without this, a cookie that silently failed to apply would leave the Hebrew interface up and
  // the English-text assertions would fail for a reason nowhere near the cause.
  await expectInterfaceLanguage(page, LANGUAGES.EN);
  await waitForStrapiResponse(page, before);
}

async function elapseBothDelays(page) {
  await waitForTimerArmed(page, BANNER_DELAY_SECONDS * 1000);
  await waitForTimerArmed(page, MODAL_DELAY_SECONDS * 1000);
  await advanceBy(page, MODAL_DELAY_SECONDS * 1000 + 1000);
}

test.describe('Strapi donor flow — a non-donor donates and the site notices', () => {
  const handles = [];
  // Cleared per attempt: Playwright retries re-run the test in the same worker, and a handle
  // left over from a failed attempt (never served) would fail this attempt's afterEach.
  test.beforeEach(() => { handles.length = 0; });
  test.afterEach(() => handles.forEach(expectStrapiServed));

  for (const source of DONATION_SOURCES) {
    test(`non-donor content gives way to donor content after the ${source.name} webhook`, async ({ page, context, request, baseURL }) => {
      // Every missing variable in ONE message, so the person fixing the run is not sent back for a
      // second round to discover the next one.
      const missingPrerequisites = [
        throwawayUserPrerequisitesMissing(),
        process.env[source.secretVariable] ? null : `${source.secretVariable} is not set for the Playwright run`,
      ].filter(Boolean);
      test.skip(missingPrerequisites.length > 0, missingPrerequisites.join('; '));

      // The default test timeout (50s) is too short for what this single test does in sequence:
      // registration (password hashing, a gravatar lookup and a CRM call on the server), a UI
      // login, two fake-clock page loads with their Strapi round trips, the webhook, and — on
      // integration — up to QUEUED_PROCESSING_BOUND_MS waiting for the real Celery worker.
      test.setTimeout(t(120000));
      const { email } = await registerThrowawayUser(page, request, baseURL, { purpose: 'donor-flow' });

      // ── Day 1: the non-donor ask ────────────────────────────────────────────
      handles.push(await routeWithStrapiPayload(context, strapiPayload({
        modals: [flowModal(DAY_ONE_WINDOW, NON_DONOR_ONLY, docText.A, docName.A, { buttonURL: 'https://example.org/donate-campaign' })],
        banners: [flowBanner(DAY_ONE_WINDOW, NON_DONOR_ONLY, docText.A_PRIME, docName.A_PRIME)],
      })));
      await context.route('https://example.org/**', (route) => route.abort());
      // Close the page registerThrowawayUser logged in with before the fake clock is installed.
      // page.clock belongs to the whole browser context, and on a page that already has a document
      // clock.install() starts the clock ticking at once. The pauseAt(SYNTHETIC_NOW) that follows
      // then finds that instant already in the past and throws "Cannot fast-forward to the past"
      // (intermittently: only when a millisecond passes between the two calls). Day 2 is immune
      // because it pauses at a LATER time. The session cookies live on the context, so the fresh
      // page is still logged in.
      await page.close();
      const firstDay = await context.newPage();
      await loadAt(firstDay, SYNTHETIC_NOW);
      await elapseBothDelays(firstDay);
      await expect(modalBox(firstDay)).toContainText(docText.A);
      await expect(bannerBox(firstDay)).toContainText(docText.A_PRIME);

      // target=_blank: the CTA opens (and the route aborts) a popup; this page stays put.
      const popup = context.waitForEvent('page');
      await firstDay.locator('#interruptingMessageContent a.button.int-en').click();
      await (await popup).close();
      await expect(modalBox(firstDay)).toHaveCount(0);

      // ── The donation reaches Sefaria through the source's webhook ───────────
      // baseURL may carry a path (CI sets SANDBOX_URL to ".../texts"); resolving against it, rather
      // than concatenating, replaces that path.
      const webhookResponse = await request.post(new URL(source.endpointPath, baseURL).href, source.requestFor(email));
      expect(webhookResponse.status(), await webhookResponse.text()).toBe(202);
      const { processing_mode: processingMode } = await webhookResponse.json();

      if (processingMode === 'queued') {
        // Bounded, and on a condition that never flips back once true.
        await expect(async () => {
          await firstDay.reload();
          expect(await firstDay.evaluate(() => window.Sefaria.donor_status)).toBe('donor');
        }, 'queued but never applied. Is the sandbox\'s Celery tasks worker running?')
          .toPass({ timeout: QUEUED_PROCESSING_BOUND_MS });
      } else {
        expect(processingMode).toBe('inline');
      }

      // ── Day 2: donor content only ───────────────────────────────────────────
      // A new page, for the same fake-clock reason as day 1. The newest route wins in
      // Playwright, so this payload replaces day 1's.
      handles.push(await routeWithStrapiPayload(context, strapiPayload({
        modals: [
          flowModal(DAY_TWO_SHORTER_WINDOW, NON_DONOR_ONLY, docText.B, docName.B, AS_SPECIFIC_AS_DONOR_ONLY),
          flowModal(DAY_TWO_WINDOW, DONOR_ONLY, docText.C, docName.C),
        ],
        banners: [
          flowBanner(DAY_TWO_SHORTER_WINDOW, NON_DONOR_ONLY, docText.B_PRIME, docName.B_PRIME, AS_SPECIFIC_AS_DONOR_ONLY),
          flowBanner(DAY_TWO_WINDOW, DONOR_ONLY, docText.C_PRIME, docName.C_PRIME),
        ],
      })));
      const nextDay = await context.newPage();
      await loadAt(nextDay, daysFromNow(1));
      expect(await nextDay.evaluate(() => window.Sefaria.donor_status)).toBe('donor');
      await elapseBothDelays(nextDay);

      // B/B′ are built to outrank C/C′ unless the donor gate filters them out (see the header), so
      // C/C′ being on screen is itself the proof that the gate ran; the not.toContainText lines
      // then make the reason explicit in a failure message.
      await expect(modalBox(nextDay)).toContainText(docText.C);
      await expect(bannerBox(nextDay)).toContainText(docText.C_PRIME);
      await expect(modalBox(nextDay)).not.toContainText(docText.B);
      await expect(bannerBox(nextDay)).not.toContainText(docText.B_PRIME);
    });
  }
});
