import { test } from '@playwright/test';

const mockSefaria = {
  uid: 123,
  email: 'user@example.com',
  interfaceLang: 'english',
  _: (key) => key,
  util: {
    isValidEmailAddress: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  },
};

test('Debug logged-in form rendering', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });

  // Inject Sefaria before navigation
  // We need to do this AFTER page load since server loads its own Sefaria
  // So we'll use evaluate to modify it after the page loads

  await page.goto('http://localhost:8000/newsletter');
  await page.waitForSelector('#NewsletterInner', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // Check what Sefaria properties are available before modification
  const sefariaBefore = await page.evaluate(() => ({
    uid: window.Sefaria?.uid,
    email: window.Sefaria?.email,
    interfaceLang: window.Sefaria?.interfaceLang,
  }));
  console.log('\n--- Initial Sefaria (from server) ---');
  console.log('Sefaria object in page:', sefariaBefore);

  // Try to set Sefaria properties to simulate logged-in user
  // Use the correct property names: _uid and _email
  await page.evaluate(() => {
    window.Sefaria._uid = 123;
    window.Sefaria._email = 'user@example.com';
    console.log('Modified Sefaria to:', { _uid: window.Sefaria._uid, _email: window.Sefaria._email });
  });

  // Check what changed
  const sefariaAfter = await page.evaluate(() => ({
    _uid: window.Sefaria?._uid,
    _email: window.Sefaria?._email,
    interfaceLang: window.Sefaria?.interfaceLang,
  }));
  console.log('\n--- After modification (correct properties) ---');
  console.log('Sefaria object in page:', sefariaAfter);

  // Check what's actually rendered
  const innerHTML = await page.locator('#NewsletterInner').innerHTML();
  console.log('Form HTML (first 500 chars):', innerHTML.substring(0, 500));

  // Check for specific text
  const pageText = await page.textContent('body');
  console.log('\n--- Looking for key phrases ---');
  console.log('Has "Manage Your Subscriptions":', pageText.includes('Manage Your Subscriptions'));
  console.log('Has "Subscribe to Our":', pageText.includes('Subscribe to Our'));
  console.log('Has "Update Preferences":', pageText.includes('Update Preferences'));
  console.log('Has "Subscribe":', pageText.includes('Subscribe'));
  console.log('Has "user@example.com":', pageText.includes('user@example.com'));

  // Check buttons
  const buttons = await page.locator('button').allTextContents();
  console.log('Button texts:', buttons);

  // Check for name inputs
  const textInputs = await page.locator('form input[type="text"]').count();
  const emailInputs = await page.locator('form input[type="email"]').count();
  console.log('Text inputs count:', textInputs);
  console.log('Email inputs count:', emailInputs);

  // Check headings
  const h1 = await page.locator('h1, h2, h3').allTextContents();
  console.log('Headings:', h1);
});
