import { test, expect, Page } from '@playwright/test';
import { goToPageWithUser } from '../../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Feedback (RP-160, RP-161).
 *
 * Mode anchor: `.feedbackBox`. Reached from Resources by clicking
 * `data-name="Feedback"`. Source: Misc.jsx FeedbackBox class (line 2699).
 *
 * Submitting POSTs to `/api/send_feedback`. RP-161 verifies the flow without
 * actually sending feedback to production — we intercept the request with
 * `page.route()` and assert the call was made with the typed message.
 */
test.describe('Resource Panel — Feedback — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    // Use the logged-in QA user. When logged out, the feedback form requires
    // an email address and fails validation otherwise. Logged-in users
    // bypass the email field entirely (Misc.jsx:2791-2793).
    page = await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openFeedback();
  });

  test('RP-160: Feedback form mounts with textarea and submit button', async () => {
    const state = await pm.onResourcePanel().expectFeedbackFormReady();
    expect(state.hasTextarea).toBeTruthy();
    expect(state.hasSubmit).toBeTruthy();
  });

  test('RP-161: Submitting feedback POSTs to /api/send_feedback with the message body', async () => {
    const msg = '<AUTO TEST> Playwright RP-161 — message intercepted, not delivered';
    const { posted, bodyPreview } = await pm.onResourcePanel()
      .submitFeedbackWithInterception(msg);
    expect(posted).toBeTruthy();
    expect(bodyPreview).toBeTruthy();
    // jQuery's $.post serializes the payload as urlencoded with `+` for
    // spaces. Some message characters (e.g. raw `<` / `>`) round-trip as
    // literal text rather than escape sequences, so a naive
    // `decodeURIComponent` throws "URI malformed". Normalize manually: swap
    // `+` to space and assert on a tolerant substring.
    const decoded = bodyPreview!.replace(/\+/g, ' ');
    expect(decoded).toContain('RP-161');
    expect(decoded).toContain('Playwright');
  });
});
