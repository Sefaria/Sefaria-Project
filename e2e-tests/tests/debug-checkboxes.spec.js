import { test } from '@playwright/test';

test('Debug checkbox structure', async ({ page }) => {
  await page.goto('http://localhost:8000/newsletter');
  await page.waitForSelector('#NewsletterInner', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // Get the first checkbox and its HTML
  const firstCheckbox = page.locator('form input[type="checkbox"]').first();
  const html = await firstCheckbox.evaluate(el => el.outerHTML);
  console.log('Checkbox HTML:', html);

  // Get parent HTML
  const parentHtml = await firstCheckbox.evaluate(el => el.parentElement.outerHTML);
  console.log('Checkbox parent HTML:', parentHtml.substring(0, 300));

  // Try to find associated label
  const label = await firstCheckbox.evaluate(el => {
    return el.parentElement?.querySelector('label')?.outerHTML || 'NO LABEL FOUND';
  });
  console.log('Associated label:', label);

  // Check if there's a clickable element nearby
  const siblings = await firstCheckbox.evaluate(el => {
    const parent = el.parentElement;
    return Array.from(parent?.children || [])
      .map(child => `${child.tagName} (${child.className})`)
      .join(', ');
  });
  console.log('Sibling elements:', siblings);

  // Try using page.click on a label if it exists
  const labels = page.locator('label');
  console.log('Total labels on page:', await labels.count());
});
