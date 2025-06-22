# Sefaria E2E Testing Guide

## ⚠️ Open Questions / Known Issues

Before starting, be aware of these unresolved items:

1. **Login Form Selectors**: The current `loginUser()` function expects placeholder text "Email Address" and "Password", but the actual local dev login form may have different selectors. **TODO**: Verify actual selectors on `http://localhost:8000/login`

2. **Environment Variables**: Tests require `PLAYWRIGHT_USER_EMAIL` and `PLAYWRIGHT_USER_PASSWORD` but there's no documented standard for setting these up (`.env` file vs command line vs CI/CD)

---

## 🚀 Quick Start (Essential Setup)

### 1. Install Browser Dependencies
```bash
# CRITICAL: Install Playwright browsers first
npx playwright install
```

### 2. Run From Correct Directory
```bash
# MUST run from project root, not e2e-tests directory
cd /path/to/Sefaria-Project  # Root where playwright.config.ts is located
```

### 3. Environment Setup
```bash
# For local development testing
SANDBOX_URL=http://localhost:8000 \
PLAYWRIGHT_USER_EMAIL=your-test-user@example.com \
PLAYWRIGHT_USER_PASSWORD=your-password \
npx playwright test
```

### 4. Basic Test Run
```bash
# Test existing working functionality first
npx playwright test reader --max-failures=1

# Then test your new features
npx playwright test guide-overlay --max-failures=1
```

---

## 📁 Directory Structure

```
e2e-tests/
├── tests/           # Test specification files (.spec.ts)
├── pages/           # Page Object Models (.ts)
├── utils.ts         # Shared utilities and helper functions
├── globals.ts       # Constants and global configuration
├── fixtures.ts      # Custom Playwright fixtures (currently empty)
└── README.md        # This file
```

**Key Files:**
- `playwright.config.ts` - **Located in project root** (not in e2e-tests/)
- Configuration sets `baseURL` from `SANDBOX_URL` env var (defaults to production)

---

## 🔧 Technical Configuration

### Environment Variables

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `SANDBOX_URL` | Base URL for tests | `http://localhost:8000` | Local dev only |
| `PLAYWRIGHT_USER_EMAIL` | Test user email | `admin@admin.com` | Auth tests only |
| `PLAYWRIGHT_USER_PASSWORD` | Test user password | `admin` | Auth tests only |

### Browser Configuration
- **Default**: Chromium only (see `playwright.config.ts`)
- **Timeout**: 30 seconds per test, 5 seconds per assertion
- **Retries**: 2 retries on CI, 0 locally
- **Parallel**: Fully parallel by default

### Authentication Pattern
```typescript
// Non-authenticated tests (most common)
const page = await goToPageWithLang(context, '/texts');

// Authenticated tests (sheets, user features)
const page = await goToPageWithUser(context, '/sheets/new');
```

---

## 🏗️ Development Patterns

### 1. Page Object Model (Recommended)

Create a class for each major UI component:

```typescript
// pages/myFeaturePage.ts
export class MyFeaturePage {
    readonly page: Page;
    readonly mainButton: Locator;
    
    constructor(page: Page) {
        this.page = page;
        this.mainButton = page.locator('[data-testid="main-button"]');
    }
    
    async clickMainButton() {
        await this.mainButton.click();
    }
    
    async waitForLoaded() {
        await this.page.waitForSelector('.content-loaded');
    }
}
```

### 2. Utility Functions

Add reusable helpers to `utils.ts`:

```typescript
// Navigation helpers
export const goToMyFeature = async (context: BrowserContext): Promise<Page> => {
    const page = await goToPageWithUser(context, '/my-feature');
    await page.waitForSelector('.feature-loaded');
    return page;
};

// State management helpers  
export const clearMyFeatureCookie = async (page: Page) => {
    await page.context().clearCookies({ name: 'my_feature_state' });
};
```

### 3. Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { MyFeaturePage } from '../pages/myFeaturePage';
import { goToMyFeature } from '../utils';

test.describe('My Feature', () => {
    
    test.beforeEach(async ({ context }) => {
        // Clean state setup
        const tempPage = await context.newPage();
        await clearMyFeatureCookie(tempPage);
        await tempPage.close();
    });

    test('TC001: Basic functionality works', async ({ context }) => {
        const page = await goToMyFeature(context);
        const myFeature = new MyFeaturePage(page);
        
        await myFeature.waitForLoaded();
        await myFeature.clickMainButton();
        
        await expect(page.locator('.success-message')).toBeVisible();
        
        await page.close();
    });
});
```

### 4. Selector Strategy (Priority Order)

1. **Test IDs**: `[data-testid="submit-button"]` (best)
2. **Role + Name**: `page.getByRole('button', { name: 'Submit' })`
3. **Placeholder**: `page.getByPlaceholder('Email Address')`
4. **Text Content**: `page.getByText('Click here')`
5. **CSS Selectors**: `.submit-button` (last resort)

---

## 🎯 Testing Best Practices

### Cookie Management
```typescript
// Clear specific cookie
await clearGuideOverlayCookie(page, 'editor');

// Clear all cookies (clean slate)
await context.clearCookies();

// Set cookie state
await setGuideOverlayCookie(page, 'editor');
```

### Waiting Patterns
```typescript
// Wait for element to appear
await page.waitForSelector('.content');

// Wait for element to disappear (loading states)
await page.waitForSelector('.loading', { state: 'detached' });

// Wait for network response
await page.waitForResponse(resp => resp.url().includes('/api/guides'));

// Wait for page navigation
await page.waitForURL('**/sheets/**');
```

### Error Simulation
```typescript
// Simulate slow API responses
await simulateSlowGuideLoading(page, 8000);

// Simulate API errors
await simulateGuideApiError(page);

// Intercept and modify responses
await page.route('**/api/guides/editor', async route => {
    await route.fulfill({ status: 404 });
});
```

---

## 🐛 Debugging

### Interactive Debugging
```bash
# Visual debugging with browser UI
npx playwright test --headed --debug

# Step-by-step debugging
npx playwright test --ui
```

### Programmatic Debugging
```typescript
// Pause execution for manual inspection
await page.pause();

// Take screenshots
await page.screenshot({ path: 'debug.png' });

// Print page content for inspection
console.log(await page.content());

// Check current URL
console.log('Current URL:', page.url());
```

### Common Issues

1. **"Invalid URL" errors**: Running from wrong directory (must be project root)
2. **Element not found**: Wait for loading states to complete first
3. **Authentication failures**: Check environment variables are set
4. **Timeout errors**: Increase timeout or wait for specific conditions

---

## 📝 Style Guidelines

### Test Naming
- **Test IDs**: `TC001`, `TC002`, etc. for easy tracking
- **Descriptions**: Clear, behavior-focused: "Guide shows on first visit"
- **Groups**: Use `test.describe()` for logical grouping

### Code Organization
- **One feature per file**: `guide-overlay.spec.ts`, `search.spec.ts`
- **Page objects in separate files**: `pages/guideOverlayPage.ts`
- **Shared utilities in utils.ts**: Reusable across features
- **Constants in globals.ts**: URLs, timeouts, test data

### Documentation
- **Comment complex selectors**: Why this specific element
- **Document test purpose**: What behavior is being verified
- **Include setup requirements**: Dependencies, data, auth state

---

## 📚 Examples

### Complete Test Example (Guide Overlay)
See `tests/guide-overlay.spec.ts` and `pages/guideOverlayPage.ts` for a comprehensive example following all patterns above.

### Simple Feature Test Template
```typescript
import { test, expect } from '@playwright/test';
import { goToPageWithLang } from '../utils';

test('Simple feature test', async ({ context }) => {
    const page = await goToPageWithLang(context, '/feature-url');
    
    // Wait for page to load
    await page.waitForSelector('.main-content');
    
    // Interact with feature
    await page.click('[data-testid="action-button"]');
    
    // Verify result
    await expect(page.locator('.result')).toBeVisible();
    
    await page.close();
});
```

---

## 🔍 Current Test Coverage

- **Reader functionality**: Navigation, translations, word lookup ✅
- **Guide overlay**: Complete 14-test suite (authentication pending)
- **Topics, search, banners**: Basic coverage ✅  
- **Sheets**: Tests exist but currently commented out

---

**Need Help?** Review this conversation history or the existing working tests in `tests/reader.spec.ts` for patterns. 