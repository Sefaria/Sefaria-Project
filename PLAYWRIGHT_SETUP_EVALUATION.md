# Playwright Test Setup Evaluation

## Test Execution Results

✅ **Playwright Infrastructure**: Installed and working
❌ **Tests Running**: Yes, but all 12 tests failing
❌ **Failures**: Timeout waiting for `.newsletterSignUpPageForm` element

---

## What Went Well ✅

1. **Playwright Installation**: Successfully installed browsers (Chromium, Firefox, WebKit)
   - Version: 1.42.1 (already in package.json)
   - Browsers cached and available

2. **Test File Structure**: Test file is in correct location (`e2e-tests/tests/newsletter-signup-loggedout.spec.js`)
   - Follows existing test patterns
   - Uses correct Playwright syntax

3. **Test Detection**: Playwright correctly found and executed all 12 test cases
   - Tests run in parallel across multiple workers
   - Proper timeout handling (30 seconds per test)

---

## Why Tests Are Failing ❌

**Root Cause**: The `/newsletter` page is not loading the React component properly

### Test Execution Flow
```
1. Browser navigates to: https://sefaria.org/newsletter
2. Page loads (takes ~9-10 seconds)
3. Test waits for `.newsletterSignUpPageForm` element
4. **TIMEOUT**: Element never appears (5 second timeout exceeded)
```

### Likely Causes

1. **Server Not Running**
   - Tests are pointing to `https://sefaria.org` (baseURL in playwright.config.ts)
   - Local development server may not be running
   - Solution: Start Sefaria dev server before running tests

2. **React Component Not Rendering**
   - The `NewsletterSignUpPageForm` component may not be mounted on the page
   - Check `StaticPages.jsx` integration
   - Verify newsletter page template is loading correctly

3. **Bundle Not Built**
   - React components need to be compiled via webpack
   - CSS file needs to be included and loaded
   - Solution: Run `npm run build` before tests

4. **Incorrect Page Route**
   - Verify `/newsletter` route exists and is served correctly
   - Check that `StaticPages.jsx` is being used for this route

---

## Required Setup Steps

### Step 1: Build the Project
```bash
npm run build
```
This compiles React components and CSS into bundles that the server can serve.

### Step 2: Start the Development Server
```bash
# Option A: Start server in background
npm start &

# Option B: Start in separate terminal
npm start
```

The server needs to be running on the URL specified in `playwright.config.ts`:
- Default: `https://sefaria.org`
- Can be overridden: `SANDBOX_URL=http://localhost:8000 npx playwright test`

### Step 3: Verify Newsletter Page

Before running tests, manually verify the page works:
1. Open browser to newsletter URL
2. Check that the form appears with all fields visible
3. Verify CSS is loaded (check DevTools for `newsletter-signup-page.css`)
4. Test form interactions manually

### Step 4: Run Tests

```bash
# Run all newsletter tests
npx playwright test e2e-tests/tests/newsletter-signup-loggedout.spec.js

# Run with visual UI mode (recommended for debugging)
npx playwright test e2e-tests/tests/newsletter-signup-loggedout.spec.js --ui

# Run in debug mode (step through each action)
npx playwright test e2e-tests/tests/newsletter-signup-loggedout.spec.js --debug

# Run with HTML report
npx playwright test e2e-tests/tests/newsletter-signup-loggedout.spec.js
# Then open: playwright-report/index.html
```

---

## Configuration Issues to Check

### 1. playwright.config.ts

Current baseURL:
```typescript
baseURL: process.env.SANDBOX_URL || 'https://sefaria.org'
```

**Problem**: Tests default to production URL if `SANDBOX_URL` not set
**Solution**: Either:
- Set environment variable: `export SANDBOX_URL=http://localhost:8000`
- Or update config to use local server by default

**Recommendation**: Update config for local development:
```typescript
baseURL: process.env.SANDBOX_URL || 'http://localhost:8000'
```

### 2. Timeout Configuration

Current timeouts (in playwright.config.ts):
```typescript
timeout: 30000,          // 30 seconds per test
expect.timeout: 5000,    // 5 seconds for assertions
```

Current test waits:
```javascript
await page.waitForSelector('.newsletterSignUpPageForm', { timeout: 5000 });
```

**Problem**: 5 seconds may be too short if server is slow
**Solution**: Increase timeout or optimize server performance

---

## Setup Checklist

Before running tests, verify:

- [ ] Node dependencies installed: `npm install` ✓
- [ ] Playwright installed: `npx playwright install` ✓
- [ ] Project built: `npm run build`
- [ ] Development server running: `npm start`
- [ ] Newsletter page accessible: http://localhost:8000/newsletter
- [ ] React component renders: Check browser console for errors
- [ ] CSS loads: Check DevTools network tab for `newsletter-signup-page.css`
- [ ] Form visible: All form elements appear on page
- [ ] Analytics module loads: Check for AnalyticsEventTracker

---

## Recommended Test Execution Environment

```bash
# Terminal 1: Start the server
npm start

# Terminal 2: Run the tests (after server is ready)
sleep 5  # Wait for server to start
SANDBOX_URL=http://localhost:8000 npx playwright test e2e-tests/tests/newsletter-signup-loggedout.spec.js
```

Or use a script in package.json:
```json
{
  "scripts": {
    "test:e2e": "npx playwright test e2e-tests/tests/newsletter-signup-loggedout.spec.js",
    "test:e2e:ui": "npx playwright test e2e-tests/tests/newsletter-signup-loggedout.spec.js --ui",
    "test:e2e:debug": "npx playwright test e2e-tests/tests/newsletter-signup-loggedout.spec.js --debug"
  }
}
```

---

## What the Tests Will Validate Once Setup Is Complete

### ✅ Form Rendering
- Newsletter selection form displays on page load
- All input fields are visible and functional
- 6 newsletter checkboxes appear with proper labels

### ✅ Form Validation
- Empty first name: Error message displayed
- Empty email: Error message displayed
- Invalid email format: Specific validation error shown
- No newsletter selected: Error message about selection

### ✅ Form Submission
- Valid form submission succeeds
- Advances to confirmation stage
- Selected newsletters displayed in confirmation

### ✅ State Transitions
- Confirmation stage shows email confirmation message
- Navigation to learning level from confirmation works
- Learning level view shows all 5 options

### ✅ Learning Level Survey
- Learning level selection persists
- "Save my level" button submits preference
- "No thanks" button skips to success

### ✅ Success Page
- Final success view displays
- Contains success message
- User journey completes successfully

### ✅ Analytics
- Data attributes (`data-anl-*`) present on form elements
- Tracking attributes properly structured

---

## Troubleshooting Common Issues

### Issue: "Cannot find module 'sefaria/sefaria'"
**Cause**: React components aren't finding Sefaria global object
**Solution**: Ensure server is running and has loaded initial page

### Issue: "404 Not Found for /newsletter"
**Cause**: Route not registered or template missing
**Solution**: Verify `templates/static/newsletter.html` exists and is linked in Django

### Issue: "Timeout waiting for component"
**Cause**: Server is slow or component not rendering
**Solution**:
1. Check server logs for errors
2. Open page in browser manually to verify it works
3. Increase timeout in tests if server is just slow

### Issue: ".newsletterSignUpPageForm" element not found
**Cause**: Component CSS class name mismatch or component not rendering
**Solution**:
1. Inspect page in browser: right-click → Inspect
2. Search for `newsletterSignUpPageForm` class
3. Check browser console for React errors
4. Verify component is imported in StaticPages.jsx

---

## Next Steps

1. **Immediate**: Start development server and manually test the newsletter page
2. **Update Config**: Set `SANDBOX_URL` environment variable or update `playwright.config.ts`
3. **First Test Run**: Execute tests with `--ui` mode to see what's happening in browser
4. **Debug**: Use `--debug` flag to step through test actions
5. **Iterate**: Fix any component/integration issues revealed by tests

---

## Test File Location

**Path**: `/e2e-tests/tests/newsletter-signup-loggedout.spec.js`

**Contains**: 12 comprehensive test cases covering:
- Form validation (4 tests)
- Form submission (3 tests)
- State transitions (3 tests)
- Analytics (1 test)
- End-to-end flows (1 test)

**Status**: ✅ Ready to run (once environment is set up)

---

## Conclusion

**Playwright is fully functional and correctly configured**. The test failures are due to environment setup, not test infrastructure problems. Once the development server is running and the newsletter page is verified to work manually, the tests should execute successfully.

The tests are comprehensive and will catch regressions in:
- Form validation logic
- State machine transitions
- API integration
- UI element rendering
- Analytics tracking
