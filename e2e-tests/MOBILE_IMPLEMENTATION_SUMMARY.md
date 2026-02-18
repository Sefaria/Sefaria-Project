# Mobile Testing Implementation Summary

## Executive Summary

I've completed comprehensive research and implementation of mobile web testing infrastructure for the Sefaria platform. This document summarizes what was created, what can be reused from desktop tests, and how to use the new mobile testing framework.

---

## What Was Created

### 1. Mobile Constants File
**File**: `e2e-tests/mobile-constants.ts`

**Contains**:
- `MOBILE_SELECTORS` - All mobile-specific CSS selectors (hamburger menu, navigation, etc.)
- `MOBILE_MENU_ITEMS` - Expected menu text in English and Hebrew for both Library and Voices modules
- `MOBILE_DEVICES` - Device emulation configurations (iPhone 12, Pixel 5, iPhone SE, Galaxy S8)
- `MOBILE_SEARCH_TYPES` - Expected search result categories by module
- `MOBILE_ROUTES` - Mobile-specific URL routes

**Key Selectors Defined**:
```typescript
- HAMBURGER_BUTTON: '.menuButton'
- NAV_MENU: '.mobileNavMenu'
- TEXTS_LINK: 'a[href="/texts"]'
- TOPICS_LINK: 'a[href="/topics"]'
- MODULE_SWITCHER: '.mobileModuleSwitcher'
// ... and 30+ more mobile-specific selectors
```

---

### 2. Mobile Hamburger Menu Page Object
**File**: `e2e-tests/pages/mobileHamburgerMenuPage.ts`

**Class**: `MobileHamburgerMenuPage extends HelperBase`

**Methods Created** (25+ methods):

**Navigation**:
- `openHamburgerMenu()` / `closeHamburgerMenu()`
- `clickTexts()`, `clickTopics()`, `clickDonate()`, `clickHelp()`
- `clickAbout()`, `clickVoicesModuleSwitcher()`, `clickLibraryModuleSwitcher()`
- `clickDevelopers()`, `clickMoreFromSefaria()`
- `goBack()`

**Language**:
- `switchToEnglish()` - Uses header A/א toggle
- `switchLanguageInMenu(language)` - Uses in-menu language toggle

**Search**:
- `searchInMenu(term)` - Enter search term
- `verifySearchResultTypes(types)` - Verify dropdown sections
- `exitSearch()` - Close search

**Verification**:
- `verifyHeaderArtifacts()` - Hamburger, logo, language toggle
- `verifyMenuArtifacts(module, language)` - All menu items
- `verifyOnTextsPage()`, `verifyOnTopicsPage()`, etc.
- `verifyVoicesSwitcherReplaced()` - Module switcher change

---

### 3. Mobile Hamburger Sanity Test
**File**: `e2e-tests/mobile/mobile-hamburger-sanity.spec.ts`

**Test**: "Sanity 10: Mobile hamburger menu navigation and verification"

**Covers All Requested Functionality**:
1. ✅ Click hamburger
2. ✅ Switch to English and verify page artifacts (header, search, all menu items)
3. ✅ Search for "mid" and verify only Authors, Topics, Categories, Books appear
4. ✅ Exit search bar
5. ✅ Click Texts and verify page
6. ✅ Click Topics and verify page
7. ✅ Click Donate, verify page, use back button
8. ✅ Click Help, verify page, use back button
9. ✅ Click About Sefaria and verify page
10. ✅ Click Voices on Sefaria and verify
11. ✅ Verify "Voices on Sefaria" replaced with "Sefaria Library"
12. ✅ Click Developers and use back button
13. ✅ Click More from Sefaria and verify

**Device Emulation**: Uses iPhone 12 device profile

---

### 4. Updated PageManager
**File**: `e2e-tests/pages/pageManager.ts`

**Changes**:
- Added import for `MobileHamburgerMenuPage`
- Added private readonly field
- Added initialization in constructor
- Added accessor method: `onMobileHamburgerMenu()`

**Usage**:
```typescript
const pm = new PageManager(page, LANGUAGES.EN);
const mobileMenu = pm.onMobileHamburgerMenu();
await mobileMenu.openHamburgerMenu();
```

---

### 5. Mobile Testing Documentation
**File**: `e2e-tests/mobile/MOBILE_TESTING.md`

**Contents**:
- Mobile testing overview
- Device emulation guide
- Mobile selectors reference
- Running mobile tests
- Using the mobile page object
- Code reuse guide
- Mobile vs desktop differences
- Test patterns and best practices
- Troubleshooting guide

---

## Research Findings

### Current State Before Implementation

**Desktop-Only Infrastructure**:
- 100% of existing tests were desktop-focused
- Mobile device configurations were commented out in playwright.config.ts
- No mobile-specific selectors or page objects
- No mobile navigation patterns
- Single viewport check in entire codebase (footer positioning)

**Evidence**:
- 27 test spec files, all desktop-only
- Playwright config has mobile devices commented out (lines 218-226)
- TODO comment in banner.spec.ts: "Tests to visualize mobile vs webpage behaviors"

---

## What Can Be Reused from Desktop Tests

### ✅ Fully Reusable (No Changes Needed)

**Constants** (`constants.ts`):
- `MODULE_URLS` - URLs work identically on mobile
  - `MODULE_URLS.EN.LIBRARY`
  - `MODULE_URLS.EN.VOICES`
  - `MODULE_URLS.HE.LIBRARY`
  - `MODULE_URLS.HE.VOICES`

- `LANGUAGES` - Language constants
  - `LANGUAGES.EN`
  - `LANGUAGES.HE`

- `BROWSER_SETTINGS` - Authentication states
  - `BROWSER_SETTINGS.enUser`
  - `BROWSER_SETTINGS.heUser`
  - `BROWSER_SETTINGS.enAdmin`

- `SEARCH_DROPDOWN` - Search result types
  - `SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS`
  - `SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_SECTIONS`
  - `SEARCH_DROPDOWN.TEST_SEARCH_TERMS`

**Utilities** (`utils.ts`):
- `goToPageWithLang(context, url, language)` - Works on mobile
- `goToPageWithUser(context, url, userSettings)` - Works on mobile
- `hideAllModalsAndPopups(page)` - Works on mobile
- `isUserLoggedIn(page)` - Works on mobile
- `changeLanguage(page, language)` - Works on mobile

**Globals** (`globals.ts`):
- `testUser` - User credentials
- `testAdminUser` - Admin credentials
- `cookieObject` - Language preferences

---

### ⚠️ Conditionally Reusable (With Modifications)

**Page Objects**:
- `LoginPage` - Works on mobile (login form is same)
- `SignUpPage` - Works on mobile (signup form is same)
- `SearchPage` - Works on mobile (search results page is same)
- `SourceTextPage` - Works on mobile (reader view responsive)
- `SheetEditorPage` - Works on mobile (editor responsive)

**Selectors**:
- Text content selectors (`.segmentText`, `.readerContent`) - Work on both
- Form input selectors - Work on both
- Button selectors (if not in header) - Work on both

---

### ❌ Cannot Be Reused (Mobile-Specific Required)

**Desktop Header Navigation**:
- `MODULE_SELECTORS.HEADER` - Desktop header selectors
- `MODULE_SELECTORS.DROPDOWN` - Desktop dropdown menus
- `ModuleHeaderPage` - Desktop header page object
- Desktop navigation link clicks

**Why**: Mobile uses hamburger menu instead of header links

**Desktop Patterns to Replace**:
```typescript
// Desktop (DON'T use on mobile)
await page.locator('.header a[href="/texts"]').click();
await pm.onModuleHeader().openDropdown();

// Mobile (USE instead)
const mobileMenu = new MobileHamburgerMenuPage(page, LANGUAGES.EN);
await mobileMenu.openHamburgerMenu();
await mobileMenu.clickTexts();
```

---

## Implementation Details

### Mobile Hamburger Menu Structure

**HTML Structure** (from Header.jsx research):
```
Header (.header.mobile)
├── Button (.menuButton) - Hamburger icon
├── div (.mobileHeaderCenter) - Logo
└── div (.mobileHeaderLanguageToggle) - A/א toggle

MobileNavMenu (.mobileNavMenu)
├── div (.searchLine) - Search input
├── Navigation Links
│   ├── Texts / Collections
│   ├── Topics
│   └── Learning Schedules (Library only)
├── Donate Link (.blue)
└── Account Section (.mobileAccountLinks)
    ├── Saved, History & Notes
    ├── Profile (Voices only)
    ├── Notifications (Voices only)
    ├── Account Settings
    ├── Language Toggle (.mobileInterfaceLanguageToggle)
    ├── Get Help
    ├── About Sefaria
    ├── Module Switchers (.mobileModuleSwitcher)
    │   ├── Voices on Sefaria (from Library)
    │   ├── Sefaria Library (from Voices)
    │   └── Developers on Sefaria
    ├── More from Sefaria
    └── Login/Logout section
```

### State Management

**React State** (from ReaderApp.jsx):
- `mobileNavMenuOpen: boolean` - Controls menu visibility
- `toggleMobileNavMenu()` - Toggles the state
- Menu hidden with `.closed` class when `mobileNavMenuOpen === false`

### Key Differences: Library vs Voices Module

| Feature | Library Module | Voices Module |
|---------|----------------|---------------|
| Primary Nav | Texts, Topics, Learning Schedules | Topics, Collections |
| Module Switcher | "Voices on Sefaria" | "Sefaria Library" |
| Account Features | Saved, Settings | Profile, Notifications, Saved, Settings |
| Color Indicator | Blue dot | Green dot |

---

## Mobile Selectors Reference

### Critical Selectors

```typescript
// Hamburger button
'.menuButton'
'button:has(i.fa-bars)'

// Navigation menu
'.mobileNavMenu'
'.mobileNavMenu:not(.closed)' // Open state

// Search
'.mobileNavMenu .searchLine input.search'

// Navigation links
'.mobileNavMenu a[href="/texts"]'
'.mobileNavMenu a[href="/topics"]'
'.mobileNavMenu a[href="/calendars"]'

// Account section
'.mobileAccountLinks'
'.mobileInterfaceLanguageToggle'

// Module switchers
'.mobileModuleSwitcher'
'a[data-target-module="voices"]'
'a[data-target-module="library"]'

// Donate
'.mobileNavMenu a.blue'

// External links
'a[href*="help"]'
'a[href*="developers"]'
'a[href="/products"]'
'a[href="/mobile-about-menu"]'
```

---

## How to Use the Mobile Testing Framework

### Basic Test Template

```typescript
import { test, expect, devices } from '@playwright/test';
import { MobileHamburgerMenuPage } from '../pages/mobileHamburgerMenuPage';
import { LANGUAGES } from '../globals';
import { MODULE_URLS } from '../constants';

// Enable mobile device emulation
test.use({
  ...devices['iPhone 12']
});

test('My mobile test', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(MODULE_URLS.EN.LIBRARY);

  const mobileMenu = new MobileHamburgerMenuPage(page, LANGUAGES.EN);

  // Open menu
  await mobileMenu.openHamburgerMenu();

  // Navigate
  await mobileMenu.clickTopics();

  // Verify
  await mobileMenu.verifyOnTopicsPage();
});
```

### With PageManager

```typescript
import { PageManager } from '../pages/pageManager';

const page = await context.newPage();
const pm = new PageManager(page, LANGUAGES.EN);

// Use mobile menu via PageManager
const mobileMenu = pm.onMobileHamburgerMenu();
await mobileMenu.openHamburgerMenu();
```

---

## Running the Tests

### Run Mobile Tests

```bash
# All mobile tests
npx playwright test mobile

# Specific test
npx playwright test mobile/mobile-hamburger-sanity.spec.ts

# With headed browser (see mobile UI)
npx playwright test mobile --headed

# Debug mode
npx playwright test mobile --debug
```

### Enable Mobile Projects in Config

To add mobile testing projects to `playwright.config.ts`, uncomment:

```typescript
{
  name: 'Mobile Chrome',
  use: { ...devices['Pixel 5'] },
},
{
  name: 'Mobile Safari',
  use: { ...devices['iPhone 12'] },
},
```

---

## Test Coverage Summary

### ✅ Implemented

1. **Mobile Hamburger Menu Navigation** - Complete
   - Open/close hamburger
   - All navigation links
   - Language switching (header + menu)
   - Search functionality
   - Module switching
   - Back button navigation
   - External link handling

2. **Mobile Page Objects** - Complete
   - MobileHamburgerMenuPage with 25+ methods
   - Integrated into PageManager
   - Comprehensive verification methods

3. **Mobile Constants** - Complete
   - All mobile selectors
   - Menu items in EN/HE
   - Device configurations
   - Search types

4. **Documentation** - Complete
   - Comprehensive mobile testing guide
   - Code reuse guide
   - Troubleshooting guide
   - Best practices

### 📋 Recommended Future Work

1. **Mobile Reader Tests**
   - Text selection
   - Scroll behavior
   - Font size adjustment
   - Reading mode

2. **Mobile Sheet Editor Tests**
   - Touch interactions
   - Mobile-specific editing features
   - Share functionality

3. **Mobile-Specific Features**
   - Touch gestures (swipe, pinch-zoom)
   - Mobile sharing
   - Add to home screen
   - Offline mode

4. **Additional Devices**
   - iPad (tablet viewport)
   - Landscape orientation
   - Android tablets
   - Various screen sizes

5. **Performance Tests**
   - Mobile page load times
   - Touch response times
   - Mobile-specific metrics

---

## Migration Path for Existing Tests

### To Convert Desktop Test to Mobile

1. **Add Device Emulation**:
```typescript
test.use({
  ...devices['iPhone 12']
});
```

2. **Replace Header Navigation**:
```typescript
// Before (Desktop)
await pm.onModuleHeader().clickAndVerifyNavigation('Topics', /topics/);

// After (Mobile)
const mobileMenu = pm.onMobileHamburgerMenu();
await mobileMenu.openHamburgerMenu();
await mobileMenu.clickTopics();
await mobileMenu.verifyOnTopicsPage();
```

3. **Replace Dropdown Interactions**:
```typescript
// Before (Desktop)
await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.USER_MENU);
await pm.onModuleHeader().selectDropdownOption('Log in');

// After (Mobile)
const mobileMenu = pm.onMobileHamburgerMenu();
await mobileMenu.openHamburgerMenu();
// Find login button in mobile menu
await page.locator('.mobileNavMenu .login button').click();
```

4. **Keep Everything Else**:
- URL navigation: Same
- Form interactions: Same
- Authentication: Same
- Utilities: Same

---

## Key Takeaways

### What Works on Both Desktop and Mobile
- ✅ URLs and routes
- ✅ Language constants
- ✅ User authentication
- ✅ Search result types
- ✅ Core utility functions
- ✅ Form interactions
- ✅ Content verification

### What Is Mobile-Specific
- ❌ Hamburger menu navigation
- ❌ Mobile header structure
- ❌ Touch interactions
- ❌ Device back button
- ❌ Mobile viewport requirements

### Best Practices
1. Always use device emulation for mobile tests
2. Use `MobileHamburgerMenuPage` for navigation
3. Reuse desktop utilities where possible
4. Close external tabs after verification
5. Handle menu animations with small delays
6. Use back button for navigation flow
7. Verify menu state before interacting

---

## Support and Resources

### Files Created
- `mobile-constants.ts` - Mobile selectors and constants
- `pages/mobileHamburgerMenuPage.ts` - Mobile menu page object
- `mobile/mobile-hamburger-sanity.spec.ts` - Comprehensive mobile test
- `mobile/MOBILE_TESTING.md` - Complete documentation
- `pages/pageManager.ts` - Updated with mobile support

### Documentation
- Mobile testing guide in `/mobile/MOBILE_TESTING.md`
- Selector reference in mobile-constants.ts
- Implementation examples in mobile-hamburger-sanity.spec.ts

### Getting Help
- Review existing mobile test for patterns
- Check MOBILE_TESTING.md for troubleshooting
- Refer to mobile-constants.ts for selectors
- Use MobileHamburgerMenuPage methods instead of raw selectors

---

## Conclusion

The mobile testing infrastructure is now complete and ready for use. The implementation:
- ✅ Provides comprehensive mobile hamburger menu testing
- ✅ Reuses desktop code where possible (utilities, constants, URLs)
- ✅ Creates mobile-specific infrastructure where needed (selectors, page objects)
- ✅ Documents differences and migration paths
- ✅ Establishes patterns for future mobile tests
- ✅ Covers all requested functionality in the initial specification

The foundation is set for expanding mobile test coverage across all Sefaria features.
