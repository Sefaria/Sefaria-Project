# Sefaria E2E Testing Guide

A comprehensive guide for writing Playwright tests for Sefaria.

## 🏗️ Core Architecture

### PageManager Pattern (Standard for New Tests)

**PageManager** is the unified entry point to all page objects with built-in language awareness:

```typescript
const pm = new PageManager(page, language);

// Navigation methods
await pm.navigateFromBannerTo().textsPageFromLogo();
await pm.navigateFromBannerTo().topicsPage();

// Page-specific methods  
await pm.onUserMenu().clickProfile();
await pm.onSourceTextPage().changeTextLanguage(SOURCE_LANGUAGES.HE);
await pm.onSearchPage().searchFor('query');

// Language switching
await pm.toggleLanguage(LANGUAGES.HE);
```

### Universal Entry Point: `goToPage*` Functions

> **📋 Future State**: These functions will be consolidated into a single `goToPage()` function with parameters for language, user authentication, modal hiding, etc.

**Current State**: Every test must start with one of the available `goToPage*` functions:

#### Available Functions:
- **`goToPageWithLang(context, path, language)`** - Sets up language and handles geo-location
- **`goToPageWithUser(context, path)`** - Handles authentication and login flow

#### Current Limitations:
- ⚠️ **Cannot combine functions**: You cannot use both `goToPageWithLang` and `goToPageWithUser` together
- Must choose either language setup OR user authentication, not both simultaneously

#### What They Handle:
- Language cookie setup (when using `goToPageWithLang`)
- Geo-location detection (Israel vs. non-Israel IPs)  
- Automatic language switching when needed
- Modal hiding (for authenticated users)
- User authentication flow (when using `goToPageWithUser`)

```typescript
// Language-aware navigation
const page = await goToPageWithLang(context, '/texts', LANGUAGES.EN);

// Authenticated user navigation
const page = await goToPageWithUser(context, '/profile');
```

### Language-Aware Page Objects

All page objects extend `HelperBase` and handle Hebrew/English interfaces:

```typescript
// Standard pattern used throughout all page objects
async clickProfile(){
    if(this.language == LANGUAGES.HE){
        await this.page.getByRole('link', {name: 'פרופיל'}).click()
    }
    else{
        await this.page.getByRole('link', {name: 'Profile'}).click()
    }
}
```

## 🚀 Quick Start Templates

### New Page Test Template
```typescript
import { test, expect } from '@playwright/test';
import { goToPageWithLang } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';

test('Your new page functionality', async ({ context }) => {
  // Current: Choose appropriate goToPage* function based on needs
  const page = await goToPageWithLang(context, '/your-path', LANGUAGES.EN);
  const pm = new PageManager(page, LANGUAGES.EN);
  
  await pm.onYourPage().doSomething();
});
```

### Multi-Language Test Template
```typescript
const testLanguageConfigs = [
  { testLanguage: "English", interfaceLanguage: LANGUAGES.EN },
  { testLanguage: "Hebrew", interfaceLanguage: LANGUAGES.HE }
];

testLanguageConfigs.forEach(({ testLanguage, interfaceLanguage }) => {
  test(`Your feature - ${testLanguage}`, async ({ context }) => {
    const page = await goToPageWithLang(context, '/path', interfaceLanguage);
    const pm = new PageManager(page, interfaceLanguage);
    
    // Language-aware test logic
  });
});
```

### Adding to Existing Page Template
```typescript
// 1. Add method to existing page object (e.g., pages/userMenu.ts)
async yourNewMethod(){
    if(this.language == LANGUAGES.HE){
        await this.page.getByRole('link', {name: 'Hebrew Text'}).click()
    }
    else{
        await this.page.getByRole('link', {name: 'English Text'}).click()
    }
}

// 2. Use in tests
await pm.onUserMenu().yourNewMethod();
```

## 🔧 Setup & Configuration

### Environment Setup

Note - Currently local development could have problems with language changes.

Create an `.env` file in the project root (gitignored):
```bash
# Set environment variables
export SANDBOX_URL=https://your-cauldron.cauldron.sefaria.org // For local testing set local host
export PLAYWRIGHT_USER_EMAIL=your-email@sefaria.org  
export PLAYWRIGHT_USER_PASSWORD=your-password

# Run tests
npx playwright test
```

### Key Commands

```bash
# All tests
npx playwright test

# Specific test file
npx playwright test tests/banner.spec.ts

# Specific test by line number  
npx playwright test tests/banner.spec.ts:18

# With debugging
npx playwright test --debug

# With UI mode
npx playwright test --ui

# Generate test report
npx playwright show-report
```

### Test Structure Basics

```typescript
import { test, expect } from '@playwright/test';
import { goToPageWithLang } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';

test('Descriptive test name', async ({ context }) => {
  // 1. Setup - Always start with appropriate goToPage* function
  const page = await goToPageWithLang(context, '/path', LANGUAGES.EN);
  // Note: Use goToPageWithUser() for authenticated tests (no language control)
  
  // 2. Create PageManager instance
  const pm = new PageManager(page, LANGUAGES.EN);
  
  // 3. Test actions using PageManager
  await pm.onSourceTextPage().doSomething();
  
  // 4. Assertions
  await expect(page.locator('selector')).toBeVisible();
});
```

## 🌍 Multi-language Testing

### Language Constants
```typescript
import { LANGUAGES, SOURCE_LANGUAGES } from '../globals';

// Interface languages
LANGUAGES.EN  // 'english'
LANGUAGES.HE  // 'hebrew'

// Source text languages (used as regex patterns)
SOURCE_LANGUAGES.EN  // /^(תרגום|Translation)$/
SOURCE_LANGUAGES.HE  // /^(מקור|Source)$/
SOURCE_LANGUAGES.BI  // /^(מקור ותרגום|Source with Translation)$/
```

### Geo-Location Handling

Sefaria automatically detects user location and sets interface language:
- **Israel IPs** → Hebrew interface by default
- **Non-Israel IPs** → English interface by default

```typescript
import { isIsraelIp } from '../utils';

// Check if test is running from Israel IP
const inIsrael = await isIsraelIp(page);
```

### Source Text Language Testing

```typescript
// Change source text language (Hebrew/English/Bilingual)
await pm.onSourceTextPage().changeTextLanguage(SOURCE_LANGUAGES.HE);

// Validate content in expected language
await pm.onSourceTextPage().validateFirstLineOfContent('רֵאשִׁ֖ית בָּרָ֣א');
```

### Multi-Language Test Patterns

**Pattern 1: Interface Language Loop**
```typescript
const testLanguageConfigs = [
  { testLanguage: "English", interfaceLanguage: LANGUAGES.EN },
  { testLanguage: "Hebrew", interfaceLanguage: LANGUAGES.HE }
];

testLanguageConfigs.forEach(({ testLanguage, interfaceLanguage }) => {
  test(`Feature - ${testLanguage}`, async ({ context }) => {
    const page = await goToPageWithLang(context, '/path', interfaceLanguage);
    const pm = new PageManager(page, interfaceLanguage);
    // Test logic
  });
});
```

**Pattern 2: Combined Interface + Source Language**
```typescript
const languageInterfaceAndSourceConfig = [
  {
    interfaceLanguage: 'Hebrew', 
    interfaceLanguageToggle: LANGUAGES.HE,
    sourceLanguage: 'English', 
    sourceLanguageToggle: SOURCE_LANGUAGES.EN,
    expectedSourceText: 'When God began to create',
    expectedInterfaceText: 'מקורות'
  },
  // ... more combinations
];
```

## 🛠️ Adding Methods to Existing Pages

Most development involves adding new methods to existing page objects rather than creating entirely new ones:

```typescript
// Example: Adding a method to pages/userMenu.ts
async clickNewFeature(){
    if(this.language == LANGUAGES.HE){
        await this.page.getByRole('button', {name: 'Hebrew Button'}).click()
    }
    else{
        await this.page.getByRole('button', {name: 'English Button'}).click()
    }
}
```

Then use it in tests:
```typescript
await pm.onUserMenu().clickNewFeature();
```

## 🧪 Common Utilities & Patterns

### Authentication
```typescript
// For authenticated user tests (current limitation: no language control)
import { goToPageWithUser } from '../utils';

const page = await goToPageWithUser(context, '/profile');
// Automatically handles login and modal hiding
```

### Common Utilities
```typescript
import { 
  goToPageWithLang,      // Language-aware entry point
  goToPageWithUser,      // Authenticated user entry
  changeLanguage,        // Manual language switching
  getPathAndParams,      // URL validation helper
  isIsraelIp            // Geo-location detection
} from '../utils';

// Future: Single consolidated function will replace the above two
// goToPage(context, path, { language?, authenticated?, hideModals? })
```

### Best Practices

**Locators**: Role-based preferred
```typescript
// Good
await page.getByRole('button', { name: 'Submit' });
await page.getByRole('link', { name: 'Texts' });

// Acceptable for complex cases
await page.locator('div.segmentNumber').first().locator('..').locator('p');
```

**Assertions**: Web-first (automatically retry)
```typescript
// Good
await expect(page.getByText('welcome')).toBeVisible();
await expect(page.locator('.content')).toContainText('expected');

// Avoid
expect(await page.getByText('welcome').isVisible()).toBe(true);
```

**Avoid Manual Waits**: Playwright has built-in auto-waiting and retries
```typescript
// Avoid - Manual waits are unreliable and slow tests
await page.waitForTimeout(2000);

// Good - Use Playwright's built-in waiting
await page.getByText('Loading...').waitFor({ state: 'detached' });
await expect(page.locator('.content')).toBeVisible();

// Good - Wait for specific conditions
await page.waitForResponse(resp => resp.url().includes('/api/data'));
```

**URL Validation**:
```typescript
import { getPathAndParams } from '../utils';
expect(getPathAndParams(page.url())).toEqual("/texts");
```

### Network Waiting
```typescript
// Wait for loading states
await page.getByText('Loading...').waitFor({ state: 'detached' });

// Wait for specific API responses
await page.waitForResponse(resp => 
  resp.url().includes('/api/profile/sync') && resp.status() === 200
);
```

### Standard Naming Conventions

**Test Files**: `feature-name.spec.ts`
- `banner.spec.ts`
- `interface-language-is-sticky.spec.ts` 
- `translation-version-name-appears-in-title.spec.ts`

**Test Names**: Descriptive with scenario
```typescript
test('Navigate to bereshit', async ({ context }) => {});
test('Hebrew Interface Language with English Source', async ({ context }) => {});
```

**Page Objects**: PascalCase + "Page" suffix
- `SourceTextPage.ts`
- `PageManager.ts`
- `LoginPage.ts`

## ⚠️ Current Non-Standards

The following patterns exist in the codebase but should be migrated to PageManager for consistency:

### Tests Not Using PageManager
These tests use direct page interactions instead of PageManager:

- **`reader.spec.ts`** - Uses direct `page.getByRole()` calls
- **`search.spec.ts`** - Uses direct navigation and element interaction  
- **`topics.spec.ts`** - Mixes direct interaction with some PageManager usage
- **`sheets.spec.ts`** - Uses direct page interactions

**Migration Example**:
```typescript
// Current (non-standard)
const page = await goToPageWithLang(context, '/texts');
await page.getByRole('link', { name: 'Tanakh' }).click();

// Preferred (PageManager)
const page = await goToPageWithLang(context, '/texts');
const pm = new PageManager(page, LANGUAGES.EN);
await pm.onTextsPage().clickTanakh(); // This method already exists
```

### Inconsistent Language Switching
- Some tests use `pm.toggleLanguage()`
- Others use direct `changeLanguage()` from utils
- **Standard**: Use `pm.toggleLanguage()` for PageManager tests

## 📋 Configuration Reference

### Playwright Config Highlights
- **Base URL**: Configurable via `SANDBOX_URL` environment variable
- **Timeout**: 30 seconds per test, 5 seconds per expect
- **Retries**: 2 on CI, 0 locally
- **Trace**: Enabled on first retry for debugging

---

**Need help?** Follow the PageManager patterns for new tests and gradually migrate existing tests for consistency.
