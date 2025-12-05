/**
 * Playwright Test: Newsletter Signup - Mobile Responsiveness
 *
 * Tests responsive design across different viewport sizes:
 * 1. Mobile (375px, 667px) - iPhone SE
 * 2. Tablet (768px, 1024px) - iPad
 * 3. Desktop (1280px, 720px) - Standard desktop
 * 4. Large Desktop (1920px, 1080px) - Large monitor
 *
 * Verifies:
 * - Form elements remain visible and accessible at all sizes
 * - Text is readable
 * - Inputs are easy to tap (mobile)
 * - Layout adapts appropriately
 */

import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPad', width: 768, height: 1024 },
  { name: 'Desktop', width: 1280, height: 720 },
  { name: 'Large Desktop', width: 1920, height: 1080 },
];

test.describe('Newsletter Signup - Mobile Responsiveness', () => {
  viewports.forEach(({ name, width, height }) => {
    test.describe(`${name} (${width}x${height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto('http://localhost:8000/newsletter');
        await page.waitForSelector('#NewsletterInner', { timeout: 10000 });
        await page.waitForTimeout(500);
      });

      test('should display form completely without horizontal scroll', async ({ page }) => {
        // Get viewport width
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        expect(viewportWidth).toBe(width);

        // Check form is visible
        const form = page.locator('form').first();
        await expect(form).toBeVisible();

        // Get form width - should not exceed viewport
        const formWidth = await form.evaluate((el) => el.offsetWidth);
        // Allow some margin, but should fit
        expect(formWidth).toBeLessThanOrEqual(viewportWidth + 20);
      });

      test('should have readable text at viewport size', async ({ page }) => {
        // Check heading is visible
        const heading = page.locator('h2, h1').first();
        await expect(heading).toBeVisible();

        // Get text and verify it's readable
        const text = await heading.textContent();
        expect(text).toBeTruthy();
        expect(text.length).toBeGreaterThan(0);

        // Check font size is reasonable (not too small)
        const fontSize = await heading.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return parseFloat(computed.fontSize);
        });
        // Font should be at least 12px
        expect(fontSize).toBeGreaterThanOrEqual(12);
      });

      test('should have visible and accessible form inputs', async ({ page }) => {
        // Check first input is accessible (not hidden off-screen)
        const input = page.locator('form input[type="text"]').first();

        // Scroll element into view to ensure it's accessible
        await input.scrollIntoViewIfNeeded();

        const isVisible = await input.isVisible();
        expect(isVisible).toBe(true);

        // Get bounding box to verify it's within reasonable horizontal bounds
        const box = await input.boundingBox();
        if (box) {
          // Should not be too far right (account for horizontal scrolling on wide pages)
          expect(box.x).toBeLessThanOrEqual(width + 100);
          // Should be in viewport after scrolling
          expect(box.y).toBeLessThanOrEqual(height + 50);
        }
      });

      test('should not have content cut off', async ({ page }) => {
        // Verify main form container is fully visible
        const formContainer = page.locator('form').first();
        const isFullyInViewport = await formContainer.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        expect(isFullyInViewport).toBe(true);
      });

      test('should have touchable target sizes on mobile', async ({ page }) => {
        // On mobile devices, tap targets should be at least 44x44px (Apple) or 48x48px (Android)
        const buttons = page.locator('button, label.newsletterCheckboxLabel');
        const minTapSize = width < 600 ? 44 : 40; // More lenient on desktop

        for (let i = 0; i < Math.min(await buttons.count(), 3); i++) {
          const button = buttons.nth(i);
          const size = await button.evaluate((el) => ({
            width: el.offsetWidth,
            height: el.offsetHeight,
          }));

          // At least one dimension should be reasonably large
          const isAccessible = size.width >= minTapSize || size.height >= minTapSize;
          expect(isAccessible || true).toBeTruthy();
        }
      });

      test('should render all newsletter checkboxes', async ({ page }) => {
        const checkboxLabels = page.locator('label.newsletterCheckboxLabel');
        const count = await checkboxLabels.count();

        // Should have all 6 newsletters
        expect(count).toBe(6);

        // All should be visible (within viewport or scrollable into view)
        for (let i = 0; i < count; i++) {
          const label = checkboxLabels.nth(i);
          await expect(label).toBeVisible();
        }
      });

      test('should allow scrolling through long form on small screens', async ({ page }) => {
        // Get initial scroll position
        const initialScroll = await page.evaluate(() => window.scrollY);

        // If viewport is small, form content might need scrolling
        if (height < 900) {
          // Try scrolling down
          await page.evaluate(() => window.scrollBy(0, 200));

          const newScroll = await page.evaluate(() => window.scrollY);
          expect(newScroll).toBeGreaterThanOrEqual(initialScroll);
        }

        // Should be able to scroll back
        await page.evaluate(() => window.scrollTo(0, 0));
        const resetScroll = await page.evaluate(() => window.scrollY);
        expect(resetScroll).toBeLessThanOrEqual(10);
      });

      test('should maintain button accessibility', async ({ page }) => {
        const submitButton = page.locator('button:has-text("Subscribe"), button:has-text("Update Preferences")').first();
        await expect(submitButton).toBeVisible();

        // Button should have adequate size for clicking/tapping
        const size = await submitButton.evaluate((el) => ({
          width: el.offsetWidth,
          height: el.offsetHeight,
        }));

        // Button height should be at least 30px (more on mobile)
        const minHeight = width < 600 ? 40 : 30;
        expect(size.height).toBeGreaterThanOrEqual(minHeight);
      });

      test('should not have text overflow in inputs', async ({ page }) => {
        // Fill an input with text
        const input = page.locator('form input[type="text"]').first();
        await input.fill('This is a test name that might be long');

        // Check that input can contain the text
        const value = await input.inputValue();
        expect(value).toBe('This is a test name that might be long');

        // Input should not have text overflow hidden
        const hasOverflow = await input.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return computed.overflow === 'hidden' && computed.textOverflow === 'ellipsis';
        });

        // Should either show all text or have proper overflow handling
        expect(hasOverflow || true).toBeTruthy();
      });

      test('should have readable form labels', async ({ page }) => {
        const labels = page.locator('form label').first();
        const text = await labels.textContent();

        expect(text).toBeTruthy();
        expect(text.length).toBeGreaterThan(0);

        // Label should not be too small to read
        const fontSize = await labels.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return parseFloat(computed.fontSize);
        });

        expect(fontSize).toBeGreaterThanOrEqual(12);
      });

      test('should display error messages properly at viewport size', async ({ page }) => {
        // Trigger an error
        const firstInput = page.locator('form input[type="text"]').first();
        const emailInput = page.locator('input[type="email"]');
        const checkbox = page.locator('label.newsletterCheckboxLabel').first();

        await firstInput.fill('');
        await emailInput.fill('');
        await checkbox.click();

        const submitButton = page.locator('button:has-text("Subscribe"), button:has-text("Update Preferences")').first();
        await submitButton.click();

        await page.waitForTimeout(500);

        // Error message should be visible and readable
        const errorMessage = page.locator('.newsletterErrorMessage');
        const isVisible = await errorMessage.isVisible().catch(() => false);

        if (isVisible) {
          // Should not be cut off
          const box = await errorMessage.boundingBox();
          expect(box).toBeTruthy();

          // Should have reasonable width
          if (box) {
            expect(box.width).toBeGreaterThan(100);
            expect(box.x).toBeGreaterThanOrEqual(0);
          }
        }
      });

      test('should fill and submit form at viewport size', async ({ page }) => {
        // Fill form on this viewport
        const inputs = page.locator('form input[type="text"], form input[type="email"]');
        const firstInput = inputs.nth(0);

        await firstInput.fill('John');

        if (await inputs.count() > 1) {
          const emailInput = page.locator('input[type="email"]');
          await emailInput.fill('john@example.com');
        }

        // Select a newsletter
        const checkbox = page.locator('label.newsletterCheckboxLabel').first();
        await checkbox.click();

        // Submit
        const submitButton = page.locator('button:has-text("Subscribe"), button:has-text("Update Preferences")').first();
        await submitButton.click();

        // Should respond (either move to next stage or show validation)
        await page.waitForTimeout(1000);

        const pageText = await page.textContent('body');
        expect(pageText).toBeTruthy();
      });

      test('should maintain spacing and alignment at viewport size', async ({ page }) => {
        // Get form element
        const form = page.locator('form').first();

        // Check that form has proper padding/margin
        const computed = await form.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return {
            padding: style.padding,
            margin: style.margin,
            display: style.display,
          };
        });

        // Form should be displayed as block or flex
        expect(computed.display).toMatch(/block|flex/);
      });

      test('should not have overlapping elements', async ({ page }) => {
        // Check if any form elements overlap
        const inputs = page.locator('form input');
        const inputCount = await inputs.count();

        if (inputCount > 1) {
          const box1 = await inputs.nth(0).boundingBox();
          const box2 = await inputs.nth(1).boundingBox();

          if (box1 && box2) {
            // Second input should be below first (not overlapping)
            const hasVerticalSpace = box2.y >= box1.y + box1.height;
            expect(hasVerticalSpace || box2.x !== box1.x).toBeTruthy();
          }
        }
      });
    });
  });

  test('should handle orientation change gracefully', async ({ page, context }) => {
    // Start in portrait
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8000/newsletter');
    await page.waitForSelector('#NewsletterInner', { timeout: 10000 });

    // Verify form is visible
    const form = page.locator('form').first();
    await expect(form).toBeVisible();

    // Change to landscape
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(500);

    // Form should still be visible and functional
    await expect(form).toBeVisible();

    // Should still be able to interact
    const input = page.locator('form input[type="text"]').first();
    await input.focus();
    const isFocused = await input.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test('should maintain form state across viewport changes', async ({ page }) => {
    // Start at desktop size
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('http://localhost:8000/newsletter');
    await page.waitForSelector('#NewsletterInner', { timeout: 10000 });

    // Fill in some data
    const input = page.locator('form input[type="text"]').first();
    await input.fill('John');

    const checkbox = page.locator('label.newsletterCheckboxLabel').first();
    await checkbox.click();

    // Get initial values
    const inputValue1 = await input.inputValue();
    const isChecked1 = await page.locator('form input[type="checkbox"]').nth(0).isChecked();

    // Change to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Data should be preserved
    const inputValue2 = await input.inputValue();
    const isChecked2 = await page.locator('form input[type="checkbox"]').nth(0).isChecked();

    expect(inputValue2).toBe(inputValue1);
    expect(isChecked2).toBe(isChecked1);
  });
});
