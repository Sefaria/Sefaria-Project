import { test } from '@playwright/test';

test('Debug newsletter page', async ({ page }) => {
  // Capture console messages
  page.on('console', msg => console.log(`[LOG] ${msg.text()}`));
  page.on('pageerror', err => console.log(`Page error: ${err}`));

  // Navigate to page
  await page.goto('http://localhost:8000/newsletter');

  // Wait a bit for JS to execute
  await page.waitForTimeout(3000);

  // Check what's in the NewsletterInner div
  const content = await page.locator('#NewsletterInner').innerHTML();
  console.log('NewsletterInner content:', content.substring(0, 200));

  // Check if still loading
  const loading = await page.locator('#appLoading').isVisible();
  console.log('Still showing loading:', loading);

  // Check for any text content
  const text = await page.locator('#NewsletterInner').textContent();
  console.log('NewsletterInner text:', text);

  // Try to find any form elements
  const forms = await page.locator('form').count();
  console.log('Number of forms:', forms);

  const inputs = await page.locator('input[type="text"]').count();
  console.log('Number of text inputs:', inputs);

  const divs = await page.locator('#NewsletterInner div').count();
  console.log('Number of divs inside:', divs);
});
