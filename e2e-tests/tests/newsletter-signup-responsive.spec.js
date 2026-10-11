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

import { test, expect } from "@playwright/test";

const viewports = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPad", width: 768, height: 1024 },
  { name: "Desktop", width: 1280, height: 720 },
  { name: "Large Desktop", width: 1920, height: 1080 },
];

test.describe("Newsletter Signup - Mobile Responsiveness", () => {
  viewports.forEach(({ name, width, height }) => {
    test.describe(`${name} (${width}x${height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.addInitScript(() => {
          document.cookie = "cookiesNotificationAccepted=1; path=/; max-age=31536000";
        });
        await page.goto("/newsletter");
        await page.waitForSelector("#NewsletterInner", { timeout: 10000 });
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          document.querySelector("#s2")?.remove();
        });
      });

      test("should display form completely without horizontal scroll", async ({ page }) => {
        // Get viewport width
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        expect(viewportWidth).toBe(width);

        // Check form is visible
        const form = page.locator("form").first();
        await expect(form).toBeVisible();

        // Get form width - should not exceed viewport
        const formWidth = await form.evaluate((el) => el.offsetWidth);
        // Allow some margin, but should fit
        expect(formWidth).toBeLessThanOrEqual(viewportWidth + 20);
      });

      test("should have readable text at viewport size", async ({ page }) => {
        // Check heading is visible
        const heading = page.locator("h2, h1").first();
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

      test("should have visible and accessible form inputs", async ({ page }) => {
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

      test("should not have content cut off", async ({ page }) => {
        // Measure only once the newsletter list has loaded and web fonts are in,
        // since both change the layout.
        await expect(page.locator("label.selectableOptionLabel").first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        const layout = await page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth;
          const describe = (el) =>
            `${el.tagName.toLowerCase()}.${el.className.trim()} "${el.textContent.trim().slice(0, 30)}"`;
          const visible = [...document.querySelectorAll("#NewsletterInner *")].filter((el) => {
            const box = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            // Skip anything 1px or smaller: that's the visually-hidden pattern
            // (e.g. the real checkboxes behind the newsletter cards), which is
            // clipped on purpose so only screen readers see it.
            return box.width > 1 && box.height > 1 && style.visibility !== "hidden";
          });

          return {
            pageScrollWidth: document.documentElement.scrollWidth,
            viewportWidth,
            // Elements that stick out past the left or right edge of the screen.
            offScreen: visible
              .filter((el) => {
                const box = el.getBoundingClientRect();
                return box.left < -1 || box.right > viewportWidth + 1;
              })
              .map(describe),
            // Elements that cut off their own content. A page can have no
            // sideways scroll and still hide text this way, because overflow:
            // hidden both cuts the text and stops the page from scrolling.
            // Inputs are left out: they scroll their own text by design.
            clipped: visible
              .filter((el) => {
                const style = window.getComputedStyle(el);
                return (
                  el.tagName !== "INPUT" &&
                  /hidden|clip/.test(style.overflowX + style.overflowY) &&
                  (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
                );
              })
              .map(describe),
          };
        });

        // The page doesn't scroll sideways.
        expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.offScreen).toEqual([]);
        expect(layout.clipped).toEqual([]);
      });

      test("should have touchable target sizes on mobile", async ({ page }) => {
        // On mobile devices, tap targets should be at least 44x44px (Apple) or 48x48px (Android)
        const minTapSize = width < 600 ? 44 : 40; // More lenient on desktop

        // Check every target in the form, not just the first few. Scope to the
        // form: the site header has 18x18 icon buttons that this page doesn't own.
        const targets = page.locator(
          'form button, form label.selectableOptionLabel, form input:not([type="checkbox"])'
        );
        const sizes = await targets.evaluateAll((els) =>
          els.map((el) => ({
            target: `${el.tagName} ${el.id || el.textContent.trim()}`,
            width: el.offsetWidth,
            height: el.offsetHeight,
          }))
        );
        expect(sizes.length).toBeGreaterThan(0);

        // Both dimensions must be large enough: a 300x10 button is still hard to tap.
        const tooSmall = sizes.filter((s) => s.width < minTapSize || s.height < minTapSize);
        expect(tooSmall).toEqual([]);
      });

      test("should render all newsletter checkboxes", async ({ page }) => {
        const checkboxLabels = page.locator("label.selectableOptionLabel");
        const count = await checkboxLabels.count();

        // Should have all newsletters (currently 7, loaded from server)
        expect(count).toBeGreaterThanOrEqual(5);

        // All should be visible (within viewport or scrollable into view)
        for (let i = 0; i < count; i++) {
          const label = checkboxLabels.nth(i);
          await expect(label).toBeVisible();
        }
      });

      test("should allow scrolling through long form on small screens", async ({ page }) => {
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

      test("should maintain button accessibility", async ({ page }) => {
        const submitButton = page.locator('button:has-text("Submit"), button:has-text("Update Preferences")').first();
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

      test("should not cut off text vertically in inputs", async ({ page }) => {
        const inputs = page.locator('form input[type="text"], form input[type="email"]');
        // Letters that go above and below the line (G, J, g, y, q), so the
        // text is as tall as it gets in this font.
        const tallText = "Gypsy Jagqy";
        for (const input of await inputs.all()) {
          await input.fill(tallText);
        }
        // Web fonts change the text height, so measure after they've loaded.
        await page.evaluate(() => document.fonts.ready);

        const sizes = await inputs.evaluateAll((els) =>
          els.map((el) => {
            const style = window.getComputedStyle(el);
            // An input never reports scrollHeight > clientHeight, even when its
            // text is cut off, so measure the text with a hidden span in the
            // same font instead.
            const probe = document.createElement("span");
            probe.textContent = el.value;
            probe.style.cssText =
              `font: ${style.font}; line-height: ${style.lineHeight};` +
              "position: absolute; visibility: hidden; white-space: pre;";
            document.body.appendChild(probe);
            const textHeight = probe.getBoundingClientRect().height;
            probe.remove();
            return {
              input: el.id,
              textHeight,
              // The space inside the input that the text can use.
              spaceHeight: el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
            };
          })
        );
        expect(sizes.length).toBeGreaterThan(0);

        // Allow 1px for rounding: clientHeight is a whole number, the text height isn't.
        const cutOff = sizes.filter((s) => s.spaceHeight + 1 < s.textHeight);
        expect(cutOff).toEqual([]);
      });

      test("should have readable form labels", async ({ page }) => {
        // Check newsletter selection label is readable at this viewport
        const selectionLabel = page.locator(".newsletterSelectionLabel").first();
        await expect(selectionLabel).toBeVisible();
        const labelText = await selectionLabel.textContent();

        expect(labelText).toBeTruthy();
        expect(labelText.length).toBeGreaterThan(0);

        // Label should not be too small to read
        const fontSize = await selectionLabel.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return parseFloat(computed.fontSize);
        });

        expect(fontSize).toBeGreaterThanOrEqual(12);
      });

      test("should display error messages properly at viewport size", async ({ page }) => {
        // Trigger an error
        const firstInput = page.locator('form input[type="text"]').first();
        const emailInputs = page.locator('input[type="email"]');
        const checkbox = page.locator("label.selectableOptionLabel").first();

        await firstInput.fill("");
        await emailInputs.nth(0).fill("");
        await emailInputs.nth(1).fill("");
        await checkbox.click();

        const submitButton = page.locator('button:has-text("Submit"), button:has-text("Update Preferences")').first();
        await submitButton.click();

        await page.waitForTimeout(500);

        // Error summary should be visible and readable
        const errorSummary = page.locator(".newsletterErrorSummary");
        const isVisible = await errorSummary.isVisible().catch(() => false);

        if (isVisible) {
          // Should not be cut off
          const box = await errorSummary.boundingBox();
          expect(box).toBeTruthy();

          // Should have reasonable width
          if (box) {
            expect(box.width).toBeGreaterThan(100);
            expect(box.x).toBeGreaterThanOrEqual(0);
          }
        }
      });

      test("should fill and submit form at viewport size", async ({ page }) => {
        // Fill first name
        const firstNameInput = page.locator("input#firstName");
        await firstNameInput.fill("John");

        // Fill last name
        const lastNameInput = page.locator("input#lastName");
        if (await lastNameInput.isVisible()) {
          await lastNameInput.fill("Doe");
        }

        // Fill email and confirm email
        const emailInputs = page.locator('input[type="email"]');
        if ((await emailInputs.count()) >= 2) {
          await emailInputs.nth(0).fill("john@example.com");
          await emailInputs.nth(1).fill("john@example.com");
        }

        // Select a newsletter
        const checkbox = page.locator("label.selectableOptionLabel").first();
        await checkbox.click();

        // Submit
        const submitButton = page.locator('button:has-text("Submit"), button:has-text("Update Preferences")').first();
        await submitButton.click();

        // Should respond (either move to next stage or show validation)
        await page.waitForTimeout(1000);

        const pageText = await page.textContent("body");
        expect(pageText).toBeTruthy();
      });

      test("should maintain spacing and alignment at viewport size", async ({ page }) => {
        // Get form element
        const form = page.locator("form").first();

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

      test("should not have overlapping elements", async ({ page }) => {
        // Check if any form elements overlap
        const inputs = page.locator("form input");
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

  test("should handle orientation change gracefully", async ({ page, context }) => {
    // Start in portrait
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(() => {
      document.cookie = "cookiesNotificationAccepted=1; path=/; max-age=31536000";
    });
    await page.goto("/newsletter");
    await page.waitForSelector("#NewsletterInner", { timeout: 10000 });
    await page.evaluate(() => {
      document.querySelector("#s2")?.remove();
    });

    // Verify form is visible
    const form = page.locator("form").first();
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

  test("should maintain form state across viewport changes", async ({ page }) => {
    // Start at desktop size
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      document.cookie = "cookiesNotificationAccepted=1; path=/; max-age=31536000";
    });
    await page.goto("/newsletter");
    await page.waitForSelector("#NewsletterInner", { timeout: 10000 });
    await page.evaluate(() => {
      document.querySelector("#s2")?.remove();
    });

    // Fill in some data
    const input = page.locator('form input[type="text"]').first();
    await input.fill("John");

    const checkbox = page.locator("label.selectableOptionLabel").first();
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
