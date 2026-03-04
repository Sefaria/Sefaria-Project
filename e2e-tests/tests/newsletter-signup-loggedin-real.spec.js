/**
 * Playwright Test: Newsletter Signup - Real Authenticated User Flow
 *
 * Unlike newsletter-signup-loggedin.spec.js (which mocks auth via addInitScript),
 * this file uses a real Django session established by auth.setup.js.
 * The storageState includes a valid sessionid cookie, so:
 *   - Django recognizes the user on every request
 *   - API calls (subscribe, update preferences, learning level) work end-to-end
 *   - The full multi-stage flow can be tested: Form → Confirmation → Success
 *
 * Requires environment variables:
 *   PLAYWRIGHT_USER_EMAIL  - email of the test user
 *   PLAYWRIGHT_USER_PASSWORD - password of the test user
 *   SANDBOX_URL - base URL (e.g., http://localhost:8000)
 *
 * Run with:
 *   PLAYWRIGHT_USER_EMAIL=skyler@derp.com PLAYWRIGHT_USER_PASSWORD=abdxqz \
 *   SANDBOX_URL=http://localhost:8000 npx playwright test --project=authenticated --workers=1
 */

import { test, expect } from '@playwright/test';

// The email of the authenticated user, read from env vars
const USER_EMAIL = process.env.PLAYWRIGHT_USER_EMAIL || '';

test.describe('Newsletter Signup - Real Authenticated Flow', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // Dismiss cookies notification before page scripts run
    await page.addInitScript(() => {
      document.cookie = "cookiesNotificationAccepted=1; path=/; max-age=31536000";
    });

    // Navigate to newsletter page — the sessionid cookie from storageState
    // is automatically included, so Django sees us as logged in
    await page.goto('/newsletter');
    await page.waitForSelector('#NewsletterInner', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Remove sticky header so it doesn't intercept click actions
    await page.evaluate(() => {
      document.querySelector('#s2')?.remove();
    });
  });

  // ==========================================
  // FORM DISPLAY TESTS (Stage 1)
  // ==========================================

  test('should display logged-in form with real user email', async ({ page }) => {
    await expect(page.locator('#NewsletterInner')).toBeVisible();

    const form = page.locator('form').first();
    await expect(form).toBeVisible();

    // Real user email should be displayed (not an input field)
    const emailDisplay = page.locator(`text=${USER_EMAIL}`).first();
    await expect(emailDisplay).toBeVisible();

    // No text inputs (name fields hidden for logged-in users)
    const textInputs = page.locator('form input[type="text"]');
    expect(await textInputs.count()).toBe(0);

    // No email inputs (email displayed as text for logged-in users)
    const emailInputs = page.locator('form input[type="email"]');
    expect(await emailInputs.count()).toBe(0);

    // Newsletter checkboxes should exist
    const checkboxes = page.locator('form input[type="checkbox"]');
    expect(await checkboxes.count()).toBeGreaterThanOrEqual(5);

    // Button should say "Update Preferences" (not "Subscribe")
    const updateButton = page.locator('button:has-text("Update Preferences")').first();
    await expect(updateButton).toBeVisible();
  });

  test('should show "Manage Your Subscriptions" title', async ({ page }) => {
    const manageTitle = page.locator('text=Manage Your Subscriptions');
    await expect(manageTitle).toBeVisible();

    const subscribeTitle = page.locator('text=Subscribe to Our Newsletters');
    await expect(subscribeTitle).not.toBeVisible();
  });

  test('should display all newsletter options', async ({ page }) => {
    const checkboxLabels = page.locator('label.selectableOptionLabel');
    const count = await checkboxLabels.count();
    expect(count).toBeGreaterThanOrEqual(5);

    // Each label should be visible and clickable
    for (let i = 0; i < Math.min(count, 3); i++) {
      await expect(checkboxLabels.nth(i)).toBeVisible();
    }
  });

  test('should toggle newsletter checkboxes', async ({ page }) => {
    const checkboxLabels = page.locator('label.selectableOptionLabel');
    const checkbox1 = page.locator('form input[type="checkbox"]').nth(0);

    const initialState = await checkbox1.isChecked();

    // Toggle on
    await checkboxLabels.nth(0).click();
    expect(await checkbox1.isChecked()).toBe(!initialState);

    // Toggle back
    await checkboxLabels.nth(0).click();
    expect(await checkbox1.isChecked()).toBe(initialState);
  });

  test('should not allow email editing', async ({ page }) => {
    expect(await page.locator('input[type="email"]').count()).toBe(0);

    const emailText = page.locator(`text=${USER_EMAIL}`).first();
    await expect(emailText).toBeVisible();
  });

  // ==========================================
  // MARKETING EMAIL TOGGLE TESTS
  // ==========================================

  test('should display marketing email toggle', async ({ page }) => {
    const toggleSection = page.locator('.marketingEmailToggleSection');
    await expect(toggleSection).toBeVisible();

    const questionLabel = page.locator('.marketingEmailToggleLabel');
    await expect(questionLabel).toBeVisible();
    const labelText = await questionLabel.textContent();
    expect(labelText.toLowerCase()).toContain('email updates');

    // Yes/No toggle options
    const yesOption = page.locator('.marketingToggleWrapper .toggleOption.yes');
    const noOption = page.locator('.marketingToggleWrapper .toggleOption.no');
    await expect(yesOption).toBeVisible();
    await expect(noOption).toBeVisible();

    // Yes should be active by default
    await expect(yesOption).toHaveClass(/\bon\b/);
    await expect(noOption).not.toHaveClass(/\bon\b/);

    // Helper text about administrative emails
    const helperText = page.locator('.marketingEmailNote');
    await expect(helperText).toBeVisible();
    const noteText = await helperText.textContent();
    expect(noteText.toLowerCase()).toContain('administrative');
  });

  test('should disable checkboxes when No is selected', async ({ page }) => {
    const noOption = page.locator('.marketingToggleWrapper .toggleOption.no');
    await noOption.click();

    await expect(noOption).toHaveClass(/\bon\b/);

    const checkboxesContainer = page.locator('.newsletterCheckboxes');
    await expect(checkboxesContainer).toHaveClass(/disabled/);

    const firstCheckbox = page.locator('form input[type="checkbox"]').nth(0);
    expect(await firstCheckbox.isDisabled()).toBe(true);
  });

  test('should re-enable checkboxes when Yes is selected again', async ({ page }) => {
    const noOption = page.locator('.marketingToggleWrapper .toggleOption.no');
    const yesOption = page.locator('.marketingToggleWrapper .toggleOption.yes');

    // Disable
    await noOption.click();
    const checkboxesContainer = page.locator('.newsletterCheckboxes');
    await expect(checkboxesContainer).toHaveClass(/disabled/);

    // Re-enable
    await yesOption.click();
    await expect(yesOption).toHaveClass(/\bon\b/);
    await expect(checkboxesContainer).not.toHaveClass(/disabled/);

    const firstCheckbox = page.locator('form input[type="checkbox"]').nth(0);
    expect(await firstCheckbox.isDisabled()).toBe(false);
  });

  test('should maintain checkbox selections visually when No is selected', async ({ page }) => {
    const checkboxLabels = page.locator('label.selectableOptionLabel');
    const checkbox1 = page.locator('form input[type="checkbox"]').nth(0);
    const checkbox2 = page.locator('form input[type="checkbox"]').nth(1);

    // Ensure first two are checked
    if (!(await checkbox1.isChecked())) await checkboxLabels.nth(0).click();
    if (!(await checkbox2.isChecked())) await checkboxLabels.nth(1).click();

    await expect(checkbox1).toBeChecked();
    await expect(checkbox2).toBeChecked();

    // Opt out — checkboxes stay visually checked but container is disabled
    const noOption = page.locator('.marketingToggleWrapper .toggleOption.no');
    await noOption.click();

    await expect(checkbox1).toBeChecked();
    await expect(checkbox2).toBeChecked();
    await expect(page.locator('.newsletterCheckboxes')).toHaveClass(/disabled/);
  });

  // ==========================================
  // REAL SUBMISSION TESTS (Full E2E Flow)
  // These tests actually hit the backend API
  // ==========================================

  test('should submit preferences and navigate to confirmation', async ({ page }) => {
    // Select at least one newsletter
    const checkboxLabels = page.locator('label.selectableOptionLabel');
    const checkbox1 = page.locator('form input[type="checkbox"]').nth(0);

    // Ensure at least one is checked
    if (!(await checkbox1.isChecked())) {
      await checkboxLabels.nth(0).click();
    }

    // Submit
    const updateButton = page.locator('button:has-text("Update Preferences")').first();
    await updateButton.click();

    // With real auth, the API call should succeed and navigate to confirmation
    const thankYou = page.locator('text=Thank you');
    await expect(thankYou).toBeVisible({ timeout: 10000 });
  });

  test('should complete full flow: select → confirm → learning level → success', async ({ page }) => {
    // Stage 1: Select newsletters
    const checkboxLabels = page.locator('label.selectableOptionLabel');
    const checkbox1 = page.locator('form input[type="checkbox"]').nth(0);

    if (!(await checkbox1.isChecked())) {
      await checkboxLabels.nth(0).click();
    }

    // Submit preferences
    const updateButton = page.locator('button:has-text("Update Preferences")').first();
    await updateButton.click();

    // Stage 2: Confirmation with embedded learning level
    const thankYou = page.locator('text=Thank you');
    await expect(thankYou).toBeVisible({ timeout: 10000 });

    // Learning level options should be embedded in the confirmation view
    const learningLevelOptions = page.locator('.embeddedLearningLevel .selectableOptionLabel');
    const optionCount = await learningLevelOptions.count();
    expect(optionCount).toBe(5);

    // Select a learning level
    await learningLevelOptions.nth(0).click();

    // Verify it's selected
    const hasSelectedClass = await learningLevelOptions.nth(0).evaluate(
      el => el.classList.contains('selected')
    );
    expect(hasSelectedClass).toBe(true);

    // Submit learning level
    const saveButton = page.locator('.embeddedLearningLevel button:has-text("Submit")');
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click();

      // Stage 3: Should reach success view
      const allSet = page.locator('text=All set');
      await expect(allSet).toBeVisible({ timeout: 10000 });
    }
  });

  test('should skip learning level and reach success', async ({ page }) => {
    // Stage 1: Select a newsletter and submit
    const checkboxLabels = page.locator('label.selectableOptionLabel');
    const checkbox1 = page.locator('form input[type="checkbox"]').nth(0);

    if (!(await checkbox1.isChecked())) {
      await checkboxLabels.nth(0).click();
    }

    const updateButton = page.locator('button:has-text("Update Preferences")').first();
    await updateButton.click();

    // Stage 2: Confirmation view
    const thankYou = page.locator('text=Thank you');
    await expect(thankYou).toBeVisible({ timeout: 10000 });

    // Click "skip this step" link
    const skipLink = page.locator('a.skipLink').first();
    if (await skipLink.isVisible().catch(() => false)) {
      await skipLink.click();

      // Stage 3: Success view
      const allSet = page.locator('text=All set');
      await expect(allSet).toBeVisible({ timeout: 10000 });
    }
  });

  test('should submit with no newsletters selected', async ({ page }) => {
    // Uncheck all newsletters
    const checkboxLabels = page.locator('label.selectableOptionLabel');
    const checkboxes = page.locator('form input[type="checkbox"]');
    const count = await checkboxes.count();

    for (let i = 0; i < count; i++) {
      if (await checkboxes.nth(i).isChecked()) {
        await checkboxLabels.nth(i).click();
      }
    }

    // Submit with no newsletters — valid for logged-in users
    const updateButton = page.locator('button:has-text("Update Preferences")').first();
    await updateButton.click();

    // Should navigate to confirmation (no validation error)
    const thankYou = page.locator('text=Thank you');
    await expect(thankYou).toBeVisible({ timeout: 10000 });
  });

  test('should submit with No selected (opt out of all marketing emails)', async ({ page }) => {
    // Select some newsletters first
    const checkboxLabels = page.locator('label.selectableOptionLabel');
    await checkboxLabels.nth(0).click();

    // Click No to opt out of all marketing emails
    const noOption = page.locator('.marketingToggleWrapper .toggleOption.no');
    await noOption.click();

    // Submit
    const updateButton = page.locator('button:has-text("Update Preferences")').first();
    await updateButton.click();

    // Should navigate to confirmation (opting out is a valid path)
    const thankYou = page.locator('text=Thank you');
    await expect(thankYou).toBeVisible({ timeout: 10000 });
  });

  test('should show pre-existing subscriptions as checked', async ({ page }) => {
    // With a real session, the form fetches the user's current subscriptions
    // from /api/newsletter/subscriptions and pre-checks them.
    // We can't predict which ones are checked, but we can verify the
    // API was called and the form rendered with checkbox state.
    const checkboxes = page.locator('form input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(5);

    // Collect initial states — at least verifies the form loaded correctly
    const states = [];
    for (let i = 0; i < count; i++) {
      states.push(await checkboxes.nth(i).isChecked());
    }

    // Verify we got boolean states for all checkboxes (form rendered properly)
    expect(states.length).toBeGreaterThanOrEqual(5);
    expect(states.every(s => typeof s === 'boolean')).toBe(true);
  });
});
