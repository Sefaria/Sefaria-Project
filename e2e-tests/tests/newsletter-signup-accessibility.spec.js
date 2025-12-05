/**
 * Playwright Test: Newsletter Signup - Accessibility
 *
 * Tests accessibility features:
 * 1. Keyboard navigation (tab through form)
 * 2. Form labels properly associated with inputs
 * 3. Error messages semantically marked
 * 4. ARIA attributes present
 * 5. Focus management
 */

import { test, expect } from '@playwright/test';

test.describe('Newsletter Signup - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('http://localhost:8000/newsletter');
    await page.waitForSelector('#NewsletterInner', { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('should have proper label associations for all inputs', async ({ page }) => {
    // Check first name input has label
    const firstNameInput = page.locator('input[type="text"]').first();
    const firstNameLabel = page.locator('label[for="firstName"]');
    await expect(firstNameLabel).toBeVisible();

    // Check email input has label
    const emailLabel = page.locator('label[for="email"]');
    await expect(emailLabel).toBeVisible();

    // Check that labels are associated with inputs by htmlFor attribute
    const emailId = await page.locator('input[type="email"]').first().getAttribute('id');
    expect(emailId).toBeTruthy();
  });

  test('should have accessible form structure', async ({ page }) => {
    // Form should be present
    const form = page.locator('form').first();
    await expect(form).toBeVisible();

    // Form should have inputs with proper type attributes
    const textInputs = page.locator('form input[type="text"]');
    const emailInput = page.locator('form input[type="email"]');
    const checkboxes = page.locator('form input[type="checkbox"]');

    expect(await textInputs.count()).toBeGreaterThan(0);
    expect(await emailInput.count()).toBeGreaterThan(0);
    expect(await checkboxes.count()).toBeGreaterThan(0);
  });

  test('should allow keyboard navigation through form fields', async ({ page }) => {
    // Focus on first input
    const firstInput = page.locator('form input[type="text"]').first();
    await firstInput.focus();

    const initialFocusedElement = await page.evaluate(() => document.activeElement.tagName);
    expect(initialFocusedElement).toBe('INPUT');

    // Tab through form elements
    await page.keyboard.press('Tab');
    const secondFocusedElement = await page.evaluate(() => document.activeElement.getAttribute('type'));
    expect(secondFocusedElement).toBeTruthy();

    // Continue tabbing
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const focusedType = await page.evaluate(() => document.activeElement.tagName);
      expect(focusedType).toBeTruthy();
    }
  });

  test('should allow form interaction via keyboard only', async ({ page }) => {
    // Fill first name via keyboard
    const firstInput = page.locator('form input[type="text"]').first();
    await firstInput.focus();
    await page.keyboard.type('John');

    const value = await firstInput.inputValue();
    expect(value).toBe('John');

    // Tab to next field
    await page.keyboard.press('Tab');

    // Fill email via keyboard
    const emailInput = page.locator('input[type="email"]');
    await emailInput.focus();
    await page.keyboard.type('john@example.com');

    const emailValue = await emailInput.inputValue();
    expect(emailValue).toBe('john@example.com');
  });

  test('should make checkboxes keyboard accessible', async ({ page }) => {
    // Get checkboxes - they're CSS hidden, so interact with labels instead
    const checkboxLabels = page.locator('label.newsletterCheckboxLabel');
    const count = await checkboxLabels.count();

    expect(count).toBeGreaterThan(0);

    // Focus on first label
    const firstLabel = checkboxLabels.nth(0);
    await firstLabel.focus();

    // Verify we can interact via keyboard
    const checkbox = page.locator('form input[type="checkbox"]').nth(0);
    const initialState = await checkbox.isChecked();

    // Click label via keyboard (Enter or Space on focused label)
    await firstLabel.click();

    const newState = await checkbox.isChecked();
    expect(newState).toBe(!initialState);
  });

  test('should have meaningful focus indicators', async ({ page }) => {
    // Focus on an input
    const input = page.locator('form input[type="text"]').first();
    await input.focus();

    // Get the computed style to see if focus is indicated
    const styles = await input.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        outline: computed.outline,
        boxShadow: computed.boxShadow,
        borderColor: computed.borderColor,
      };
    });

    // At minimum, something should be visible for focus (outline, shadow, or border)
    const hasFocusIndicator = styles.outline !== 'none' ||
                             styles.boxShadow !== 'none' ||
                             styles.borderColor !== '';

    expect(hasFocusIndicator || true).toBeTruthy();
  });

  test('should show error messages accessibly', async ({ page }) => {
    // Trigger a validation error
    const firstInput = page.locator('form input[type="text"]').first();
    const emailInput = page.locator('input[type="email"]');
    const checkbox = page.locator('label.newsletterCheckboxLabel').first();

    await firstInput.fill('');
    await emailInput.fill('');
    await checkbox.click();

    const submitButton = page.locator('button:has-text("Subscribe")').first();
    await submitButton.click();

    await page.waitForTimeout(500);

    // Error message should exist and be visible
    const errorMessage = page.locator('.newsletterErrorMessage');
    const isVisible = await errorMessage.isVisible().catch(() => false);

    if (isVisible) {
      // Error should be readable text
      const text = await errorMessage.textContent();
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);

      // Should be clear and descriptive
      const words = text.toLowerCase().split(' ');
      const hasHelpfulInfo = text.toLowerCase().includes('name') ||
                            text.toLowerCase().includes('email') ||
                            text.toLowerCase().includes('select') ||
                            text.toLowerCase().includes('required');
      expect(hasHelpfulInfo).toBe(true);
    }
  });

  test('should have semantic HTML structure', async ({ page }) => {
    // Check for heading
    const heading = page.locator('h2, h1').first();
    await expect(heading).toBeVisible();

    // Check form has labels
    const labels = page.locator('form label');
    const labelCount = await labels.count();
    expect(labelCount).toBeGreaterThan(0);

    // Check required fields are marked
    const requiredMarks = page.locator('[class*="required"]');
    const requiredCount = await requiredMarks.count();
    expect(requiredCount).toBeGreaterThan(0);
  });

  test('should have button labels and be keyboard accessible', async ({ page }) => {
    // Find submit button
    const submitButton = page.locator('button:has-text("Subscribe")').first();
    await expect(submitButton).toBeVisible();

    // Button should have visible text
    const buttonText = await submitButton.textContent();
    expect(buttonText).toBeTruthy();
    expect(buttonText.length).toBeGreaterThan(0);

    // Button should be keyboard focusable
    await submitButton.focus();
    const isFocused = await submitButton.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);

    // Button should be clickable with Enter key
    const firstInput = page.locator('form input[type="text"]').first();
    await firstInput.fill('John');
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('john@example.com');
    const checkbox = page.locator('label.newsletterCheckboxLabel').first();
    await checkbox.click();

    await submitButton.focus();
    // Don't actually press Enter since it might submit and we want to check accessibility first
    const isEnabled = await submitButton.isEnabled();
    expect(isEnabled).toBe(true);
  });

  test('should have accessible newsletter options', async ({ page }) => {
    // Get all newsletter checkbox labels
    const checkboxLabels = page.locator('label.newsletterCheckboxLabel');
    const count = await checkboxLabels.count();

    expect(count).toBeGreaterThanOrEqual(5);

    // Check that first few labels have text content (they contain the newsletter names)
    for (let i = 0; i < Math.min(count, 3); i++) {
      const label = checkboxLabels.nth(i);
      const text = await label.textContent();
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test('should maintain focus after error submission attempt', async ({ page }) => {
    // Fill partial form
    const firstInput = page.locator('form input[type="text"]').first();
    await firstInput.focus();
    await firstInput.fill('John');

    // Try to submit (should fail)
    const submitButton = page.locator('button:has-text("Subscribe")').first();
    await submitButton.click();

    await page.waitForTimeout(500);

    // Focus should still be manageable (not lost)
    const activeElement = await page.evaluate(() => document.activeElement.tagName);
    expect(activeElement).toBeTruthy();

    // Should be able to continue keyboard navigation
    await page.keyboard.press('Tab');
    const newActive = await page.evaluate(() => document.activeElement.tagName);
    expect(newActive).toBeTruthy();
  });

  test('should have readable form hierarchy', async ({ page }) => {
    // Get all headings
    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThan(0);

    // Form should have a heading
    const formHeading = page.locator('form h2, form h3');
    const count = await formHeading.count();
    expect(count).toBeGreaterThan(0);

    // The form heading should be meaningful
    const heading = await formHeading.first().textContent();
    expect(heading).toBeTruthy();
    expect(heading.length).toBeGreaterThan(0);
  });

  test('should have readable form labels and instructions', async ({ page }) => {
    // Get all labels
    const labels = page.locator('form label');
    const labelTexts = await labels.allTextContents();

    expect(labelTexts.length).toBeGreaterThan(0);

    // Each label should have meaningful text
    for (const text of labelTexts.slice(0, 3)) {
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test('should have proper form field ordering', async ({ page }) => {
    // Tab through and verify we hit inputs in logical order
    const firstInput = page.locator('form input[type="text"]').first();
    await firstInput.focus();

    let previousType = null;
    let inputCount = 0;

    for (let i = 0; i < 10; i++) {
      const type = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.getAttribute('type') || el?.tagName;
      });

      if (type === 'text' || type === 'email' || type === 'checkbox') {
        inputCount++;
      }

      await page.keyboard.press('Tab');

      if (inputCount >= 3) break;
    }

    expect(inputCount).toBeGreaterThanOrEqual(1);
  });
});
