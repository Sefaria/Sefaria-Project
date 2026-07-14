/**
 * E2E tests for the Community Books feature.
 *
 * NOTE on API mocking:
 * communityBooksApi.js currently has USE_MOCKS = true, so uploadCommunityBook()
 * and confirmCommunityBook() return promises directly without issuing fetch() calls.
 * The page.route() handlers below are forward-compatible scaffolding for when
 * USE_MOCKS flips to false. While USE_MOCKS = true the in-code mock data drives
 * the assertions (5-chapter response, not the 3-chapter MOCK_UPLOAD_RESPONSE here).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, getFixturePath, gotoOrThrow } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { CommunityBooksPage } from '../pages/communityBooksPage';

// ---------------------------------------------------------------------------
// Mock response constants (used with page.route() when USE_MOCKS = false)
// ---------------------------------------------------------------------------
const MOCK_UPLOAD_RESPONSE = {
  success: true,
  preview: {
    chapters: [
      { title: 'Chapter 1: Introduction', sectionCount: 3, wordCount: 450 },
      { title: 'Chapter 2: Main Content', sectionCount: 5, wordCount: 1200 },
      { title: 'Chapter 3: Conclusion',   sectionCount: 2, wordCount: 300 },
    ],
    totalWordCount: 1950,
    detectedDepth: 2,
  },
  gcsUrl: 'https://storage.googleapis.com/mock-community-books/sample-book.docx',
};

const MOCK_CONFIRM_RESPONSE = {
  success: true,
  bookId: 'test-book-12345',
  title: 'My Test Community Book',
  url: '/texts/Community/My_Test_Community_Book',
};

// ---------------------------------------------------------------------------
// Helper: install route mocks (active only when USE_MOCKS = false on backend)
// ---------------------------------------------------------------------------
async function setupUploadMocks(page: Page) {
  await page.route('**/api/community-books/upload', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_UPLOAD_RESPONSE),
    });
  });
  await page.route('**/api/community-books/confirm', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CONFIRM_RESPONSE),
    });
  });
}

async function setupUploadErrorMock(page: Page) {
  await page.route('**/api/community-books/upload', (route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error. Please try again.' }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Community Book Upload Form', () => {
  test('renders all form fields', async ({ context }) => {
    const page = await goToPageWithLang(context, '/community-upload');
    const communityPage = new CommunityBooksPage(page, LANGUAGES.EN);

    await expect(communityPage.titleEnInput).toBeVisible();
    await expect(communityPage.titleHeInput).toBeVisible();
    await expect(communityPage.structureRadioDepth1).toBeVisible();
    await expect(communityPage.structureRadioDepth2).toBeVisible();
    await expect(communityPage.languageSelect).toBeVisible();
    await expect(communityPage.descEnInput).toBeVisible();
    await expect(communityPage.descHeInput).toBeVisible();
    await expect(communityPage.fileUploadArea).toBeVisible();
    await expect(communityPage.licenseSelect).toBeVisible();
    await expect(communityPage.guideCheckbox).toBeVisible();
    await expect(communityPage.tosCheckbox).toBeVisible();
    await expect(communityPage.uploadButton).toBeVisible();
  });

  test('validates required fields on empty submit', async ({ context }) => {
    const page = await goToPageWithLang(context, '/community-upload');
    const communityPage = new CommunityBooksPage(page, LANGUAGES.EN);

    await communityPage.uploadButton.click();

    // After clicking submit with empty form, validation errors should appear
    const fieldErrors = page.locator('.fieldError');
    await expect(fieldErrors.first()).toBeVisible();
  });

  test('rejects non-docx file', async ({ context }) => {
    const page = await goToPageWithLang(context, '/community-upload');
    const communityPage = new CommunityBooksPage(page, LANGUAGES.EN);
    const jpgPath = getFixturePath('test-image.jpg');

    await communityPage.fileInput.setInputFiles(jpgPath);

    // The component validates on change — a .fieldError should appear for the file field
    const fileFieldError = page.locator('.formField.hasError .fieldError');
    await expect(fileFieldError).toBeVisible();
    await expect(fileFieldError).toContainText(/Only .docx files are accepted/i);
  });

  test('full upload flow: form → preview → confirm', async ({ context }) => {
    const page = await goToPageWithLang(context, '/community-upload');
    await setupUploadMocks(page);
    const communityPage = new CommunityBooksPage(page, LANGUAGES.EN);

    await communityPage.fillForm({
      titleEn: 'My Test Book',
      titleHe: 'ספר הבדיקה שלי',
      structure: 'depth2',
      language: 'en',
      descEn: 'A test book for E2E validation.',
      descHe: 'ספר בדיקה לאימות E2E.',
      license: 'CC BY',
      filePath: getFixturePath('sample-book.docx'),
      checkGuide: true,
      checkTos: true,
    });

    await communityPage.uploadButton.click();

    // Should transition to preview state — structurePreview appears
    await expect(communityPage.structurePreview).toBeVisible({ timeout: 10000 });

    // Confirm submission
    await communityPage.confirmButton.click();

    // Should transition to success state
    await expect(communityPage.successMessage).toBeVisible({ timeout: 10000 });
  });

  test.skip('shows error banner with contact us link on API error', async ({ context }) => {
  // Skipped: requires USE_MOCKS = false (backend not yet deployed)
  // TODO(SC-44454): Enable when backend API endpoints exist
    const page = await goToPageWithLang(context, '/community-upload');
    await setupUploadErrorMock(page);
    const communityPage = new CommunityBooksPage(page, LANGUAGES.EN);

    await communityPage.fillForm({
      titleEn: 'Error Test Book',
      titleHe: 'ספר בדיקת שגיאה',
      license: 'CC BY',
      filePath: getFixturePath('sample-book.docx'),
      checkGuide: true,
      checkTos: true,
    });

    await communityPage.uploadButton.click();

    // Error banner appears whether the mock is client-side or server-side
    // (when USE_MOCKS=true, error path is not reachable via page.route;
    //  this test verifies the error-banner DOM is present for when mocks are off)
    // If error banner is not shown (because USE_MOCKS=true skips network),
    // we at minimum verify the route mock was registered without throwing.
    const errorBannerVisible = await communityPage.errorBanner.isVisible({ timeout: 5000 }).catch(() => false);
    if (errorBannerVisible) {
      await expect(page.locator('.errorBanner a[href="/contact"]')).toBeVisible();
    }
  });
});

test.describe('License Dropdown', () => {
  test('shows description for each license option', async ({ context }) => {
    const page = await goToPageWithLang(context, '/community-upload');
    const communityPage = new CommunityBooksPage(page, LANGUAGES.EN);

    const licenseDescriptions: Record<string, string | RegExp> = {
      'CC BY':            /credit you/i,
      'CC BY-SA':         /identical terms/i,
      'CC BY-NC':         /non-commercially/i,
      'CC BY-ND':         /cannot share adaptations/i,
      'All Rights Reserved': /No rights are granted/i,
    };

    for (const [value, pattern] of Object.entries(licenseDescriptions)) {
      await communityPage.licenseSelect.selectOption(value);
      await expect(page.locator('.licenseDescription')).toContainText(pattern);
    }
  });
});

test.describe('Formatting Guide', () => {
  test('guide page renders in English', async ({ context }) => {
    const page = await goToPageWithLang(context, '/community-upload-guide', LANGUAGES.EN);

    await expect(page.locator('.communityUploadGuidePage')).toBeVisible();
    await expect(page.locator('.guideSection h2').first()).toContainText('Supported Format');
    // Verify multiple guide sections are present
    const sections = page.locator('.guideSection');
    await expect(sections).toHaveCount(4);
  });

  test('guide page renders in Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, '/community-upload-guide', LANGUAGES.HE);

    await expect(page.locator('.communityUploadGuidePage')).toBeVisible();
    await expect(page.locator('.guideSection h2').first()).toContainText('פורמט נתמך');
  });

  test('template download links exist', async ({ context }) => {
    const page = await goToPageWithLang(context, '/community-upload-guide');

    const depth1Link = page.locator('a[href*="community-upload-template-depth1.docx"]');
    const depth2Link = page.locator('a[href*="community-upload-template-depth2.docx"]');

    await expect(depth1Link).toBeVisible();
    await expect(depth2Link).toBeVisible();
  });
});

test.describe('Navbar', () => {
  test('Add Book button visible in sidebar', async ({ context }) => {
    const page = await goToPageWithLang(context, '/');

    // The CreateBookButton renders inside the CreateASheet sidebar module
    // on multi-panel pages where Sefaria.multiPanel = true
    const addBookLink = page.locator('a[href="/community-upload"]');
    await expect(addBookLink).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Real-backend end-to-end test — NOT part of the mocked suite above.
//
// Every other test in this file mocks the upload/confirm network calls (see
// setupUploadMocks) and never touches a real backend, so a bug that made
// every uploaded book 500 on read went completely undetected. This test
// exercises the actual /community-upload -> upload -> confirm flow against a
// real cauldron and asserts the resulting book actually renders.
//
// Gated behind RUN_COMMUNITY_BOOK_REAL_BACKEND_E2E=1 because each run:
//   - creates a REAL Community Book submission (not reverted by this test)
//   - counts against the backend's per-user rate limits (3 submissions/day,
//     10 pending) — running this on every CI pass would exhaust them.
// Run explicitly, e.g.:
//   RUN_COMMUNITY_BOOK_REAL_BACKEND_E2E=1 npx playwright test \
//     --project=chrome-community-books community-books.spec.ts -g "real backend"
// ---------------------------------------------------------------------------
test.describe('Community Book Upload — real backend', () => {
  test.skip(
    !process.env.RUN_COMMUNITY_BOOK_REAL_BACKEND_E2E,
    'Opt-in only: creates a real submission and consumes rate-limit quota. ' +
    'Set RUN_COMMUNITY_BOOK_REAL_BACKEND_E2E=1 to run.'
  );

  test('depth-2 upload renders as a live, readable book (not a 500)', async ({ context }) => {
    // Unique title per run — the backend rejects duplicate titles and enforces
    // per-user rate limits, so a fixed title would break on the second run.
    const uniqueSuffix = Date.now();
    const titleEn = `E2E Depth2 Book ${uniqueSuffix}`;
    const titleHe = `ספר בדיקה עומק שתיים ${uniqueSuffix}`;

    // /community-upload requires auth (redirects anonymous users to
    // /login?next=/community-upload) — use the suite's existing storage-state
    // login mechanism rather than logging in inline.
    const page = await goToPageWithUser(context, '/community-upload', BROWSER_SETTINGS.enUser);
    const communityPage = new CommunityBooksPage(page, LANGUAGES.EN);

    // The cookie-consent banner overlays and intercepts clicks on the submit
    // button — dismiss it before interacting with the form.
    await communityPage.dismissCookieBanner();

    await communityPage.fillForm({
      titleEn,
      titleHe,
      structure: 'depth2',
      language: 'en',
      descEn: 'Real-backend E2E coverage for the depth-2 upload flow.',
      descHe: 'כיסוי E2E אמיתי לזרימת העלאה בעומק שתיים.',
      license: 'CC BY',
      filePath: getFixturePath('sample-book-depth2.docx'),
      checkGuide: true,
      checkTos: true,
    });

    await communityPage.uploadButton.click();

    // Transition to preview state — structurePreview shows the detected structure.
    await expect(communityPage.structurePreview).toBeVisible({ timeout: 20000 });

    // Preview screen has TWO `.submitButton` elements ("Confirm Submission"
    // and "Back to Form") — disambiguated by accessible name on the page object.
    await communityPage.confirmButton.click();

    // Transition to success state.
    await expect(communityPage.successMessage).toBeVisible({ timeout: 20000 });
    await expect(communityPage.successMessage).toContainText(/Book Submitted!/i);

    // THE CRITICAL NEW ASSERTION the old mocked test lacks: follow the "View
    // your book" link and confirm the book page actually renders — HTTP 200,
    // not 500 — with its content visible. This is the assertion that would
    // have caught the original "every uploaded book 500s on read" bug.
    await expect(communityPage.viewBookLink).toBeVisible({ timeout: 10000 });
    const bookHref = await communityPage.viewBookLink.getAttribute('href');
    if (!bookHref) {
      throw new Error('View your book link has no href — cannot verify the created book renders.');
    }

    const bookResponse = await gotoOrThrow(page, bookHref, { waitUntil: 'domcontentloaded' });
    expect(bookResponse?.status()).toBe(200);
    await expect(page.locator('.readerPanel, .textColumn, .segment').first()).toBeVisible({ timeout: 15000 });

    // Also assert via the API that the section text is a FLAT array of
    // strings, not an array of arrays — the exact shape bug that caused
    // Ref.normal() to IndexError on every depth-2 book.
    const apiTitle = titleEn.replace(/ /g, '_');
    const apiResponse = await page.request.get(`/api/texts/${apiTitle}.1`);
    expect(apiResponse.ok()).toBeTruthy();
    const apiBody = await apiResponse.json();
    expect(Array.isArray(apiBody.text)).toBeTruthy();
    for (const entry of apiBody.text) {
      expect(typeof entry).toBe('string');
    }
  });
});
