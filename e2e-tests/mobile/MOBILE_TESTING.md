# Mobile Web Testing Documentation

This directory contains mobile-specific end-to-end tests for the Sefaria platform. Mobile tests validate responsive design, touch interactions, and mobile navigation patterns.

## Overview

Mobile testing infrastructure has been created to test the mobile web experience, specifically focusing on:
- Hamburger menu navigation
- Mobile-specific UI elements
- Touch interactions
- Responsive design patterns
- Module switching on mobile devices

---

## Mobile Testing Infrastructure

### New Files Created

#### 1. **mobile-constants.ts** (Root: e2e-tests/)
Mobile-specific constants including:
- `MOBILE_SELECTORS` - All mobile-specific CSS selectors
- `MOBILE_MENU_ITEMS` - Expected menu text for verification (EN/HE)
- `MOBILE_DEVICES` - Device configurations (iPhone 12, Pixel 5, etc.)
- `MOBILE_SEARCH_TYPES` - Expected search result categories
- `MOBILE_ROUTES` - Mobile-specific URL routes

#### 2. **mobileHamburgerMenuPage.ts** (Pages/)
Page object for mobile hamburger menu with methods for:
- Opening/closing the menu
- Navigating through menu items
- Language switching
- Search functionality
- Verification of menu artifacts
- Module switching

#### 3. **mobile-hamburger-sanity.spec.ts** (mobile/)
Comprehensive mobile sanity test covering:
- Hamburger menu interaction
- Language switching
- Search functionality
- Navigation to all menu destinations
- Module switching (Library ↔ Voices)
- Back button navigation

---

## Device Emulation

### Supported Devices

Tests use Playwright's device emulation. Currently configured devices:

| Device | Viewport | Scale Factor | User Agent |
|--------|----------|--------------|------------|
| iPhone 12 | 390x844 | 3x | iOS 14.4 Safari |
| Pixel 5 | 393x851 | 3x | Android 11 Chrome |
| iPhone SE | 375x667 | 2x | iOS 14.4 Safari |
| Galaxy S8 | 360x740 | 3x | Android 7.0 Chrome |

### How to Use Device Emulation

In your test file:

```typescript
import { test, devices } from '@playwright/test';

// Option 1: Use Playwright's built-in devices
test.use({
  ...devices['iPhone 12']
});

// Option 2: Use custom device from mobile-constants
import { MOBILE_DEVICES } from '../mobile-constants';

test.use({
  viewport: MOBILE_DEVICES.IPHONE_12.viewport,
  userAgent: MOBILE_DEVICES.IPHONE_12.userAgent,
  deviceScaleFactor: MOBILE_DEVICES.IPHONE_12.deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
});
```

---

## Mobile Selectors Reference

### Hamburger Menu

| Selector | Purpose |
|----------|---------|
| `.menuButton` | Hamburger button |
| `.fa-bars` | Hamburger icon |
| `.mobileNavMenu` | Navigation drawer |
| `.mobileNavMenu.closed` | Closed state |

### Header Elements

| Selector | Purpose |
|----------|---------|
| `.header.mobile` | Mobile header container |
| `.mobileHeaderCenter` | Logo area |
| `.mobileHeaderLanguageToggle` | A/א toggle button |

### Navigation Links

| Selector | Purpose |
|----------|---------|
| `a[href="/texts"]` | Texts page link |
| `a[href="/topics"]` | Topics page link |
| `a[href="/calendars"]` | Learning Schedules link |
| `.mobileNavMenu a.blue` | Donate link |

### Account Section

| Selector | Purpose |
|----------|---------|
| `.mobileAccountLinks` | Account section container |
| `.mobileInterfaceLanguageToggle` | Language switcher |
| `a[href="/settings/account"]` | Account settings |
| `a[href="/mobile-about-menu"]` | About page |

### Module Switchers

| Selector | Purpose |
|----------|---------|
| `.mobileModuleSwitcher` | Module switcher links |
| `a[data-target-module]` | Module-specific links |

---

## Running Mobile Tests

### Run All Mobile Tests

```bash
npx playwright test mobile
```

### Run Specific Mobile Test

```bash
npx playwright test mobile/mobile-hamburger-sanity.spec.ts
```

### Run with Specific Device

```bash
npx playwright test mobile --project="Mobile Chrome"
```

### Run with Headed Browser (See Mobile UI)

```bash
npx playwright test mobile --headed
```

### Debug Mode

```bash
npx playwright test mobile --debug
```

---

## Using the Mobile Hamburger Menu Page Object

### Basic Usage

```typescript
import { MobileHamburgerMenuPage } from '../pages/mobileHamburgerMenuPage';
import { LANGUAGES } from '../globals';

const mobileMenu = new MobileHamburgerMenuPage(page, LANGUAGES.EN);

// Open hamburger menu
await mobileMenu.openHamburgerMenu();

// Navigate to Texts
await mobileMenu.clickTexts();

// Switch language
await mobileMenu.switchLanguageInMenu('hebrew');

// Search
await mobileMenu.searchInMenu('genesis');

// Verify menu items
await mobileMenu.verifyMenuArtifacts('library', 'english');
```

### Available Methods

#### Navigation Methods
- `openHamburgerMenu()` - Opens the hamburger menu
- `closeHamburgerMenu()` - Closes the menu
- `clickTexts()` - Navigate to Texts page
- `clickTopics()` - Navigate to Topics page
- `clickDonate()` - Open donate page (new tab)
- `clickHelp()` - Open help page (new tab)
- `clickAbout()` - Navigate to About page
- `clickVoicesModuleSwitcher()` - Switch to Voices module
- `clickLibraryModuleSwitcher()` - Switch to Library module
- `clickDevelopers()` - Open developers site (new tab)
- `clickMoreFromSefaria()` - Navigate to products page
- `goBack()` - Use browser back button

#### Language Methods
- `switchToEnglish()` - Switch via header toggle
- `switchLanguageInMenu(language)` - Switch via menu toggle

#### Search Methods
- `searchInMenu(term)` - Enter search term
- `verifySearchResultTypes(types)` - Verify dropdown sections
- `exitSearch()` - Close search dropdown

#### Verification Methods
- `verifyHeaderArtifacts()` - Check hamburger, logo, language toggle
- `verifyMenuArtifacts(module, language)` - Verify all menu items
- `verifyOnTextsPage()` - Confirm on Texts page
- `verifyOnTopicsPage()` - Confirm on Topics page
- `verifyOnAboutPage()` - Confirm on About page
- `verifyOnProductsPage()` - Confirm on Products page
- `verifyOnLibraryModule()` - Confirm in Library module
- `verifyOnVoicesModule()` - Confirm in Voices module
- `verifyVoicesSwitcherReplaced()` - Check module switcher change

---

## Code Reuse from Desktop Tests

### What Can Be Reused

✅ **Constants**:
- `MODULE_URLS` - URLs work on both desktop and mobile
- `LANGUAGES` - Language constants
- `BROWSER_SETTINGS` - User authentication states
- `SEARCH_DROPDOWN` constants (sections and expected types)

✅ **Utilities** (utils.ts):
- `hideAllModalsAndPopups()` - Works on mobile
- `goToPageWithLang()` - Works on mobile
- `goToPageWithUser()` - Works on mobile

✅ **Page Objects** (Conditional):
- Can reuse if viewport check is added
- Some page objects work on both (LoginPage, SearchPage)
- Sheet editor works if viewport is mobile

### What Needs to Be Mobile-Specific

❌ **Cannot Reuse**:
- Desktop header selectors (hamburger replaces header)
- Desktop navigation patterns
- Desktop dropdown interactions
- Mouse hover behaviors

✔️ **Mobile-Specific Created**:
- `MOBILE_SELECTORS` - Mobile navigation selectors
- `MOBILE_MENU_ITEMS` - Menu item text
- `MobileHamburgerMenuPage` - Mobile navigation page object
- Device emulation configurations

---

## Mobile vs Desktop Differences

### Navigation

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Main Navigation | Header with links | Hamburger menu |
| Module Switcher | Dropdown in header | Link in hamburger menu |
| Language Toggle | Header dropdown | Header A/א + menu toggle |
| Search | Header search bar | In hamburger menu |
| Account Links | Header dropdown | In hamburger menu section |

### UI Elements

| Element | Desktop | Mobile |
|---------|---------|--------|
| Logo Position | Left side of header | Center of header |
| Navigation Pattern | Click links | Open menu → select |
| External Links | Same tab or dropdown | New tab from menu |
| Back Navigation | Browser back | Device back button |

---

## Test Patterns

### Opening Hamburger Menu

```typescript
const mobileMenu = new MobileHamburgerMenuPage(page, LANGUAGES.EN);
await mobileMenu.openHamburgerMenu();

// Verify menu is open
expect(await mobileMenu.isMenuOpen()).toBe(true);
```

### Navigation Pattern

```typescript
// Open menu
await mobileMenu.openHamburgerMenu();

// Click menu item
await mobileMenu.clickTopics();

// Verify destination
await mobileMenu.verifyOnTopicsPage();

// Return to menu
await mobileMenu.openHamburgerMenu();
```

### External Link Pattern (New Tab)

```typescript
// Click link that opens new tab
const newPage = await mobileMenu.clickDonate();

// Verify new page
expect(newPage.url()).toContain('donate');

// Close new page
await newPage.close();

// Use back button to return
await mobileMenu.goBack();
```

### Module Switching

```typescript
// Switch to Voices
await mobileMenu.clickVoicesModuleSwitcher();
await mobileMenu.verifyOnVoicesModule();

// Verify menu items changed
await mobileMenu.openHamburgerMenu();
await mobileMenu.verifyVoicesSwitcherReplaced();
```

---

## Best Practices

### 1. Always Use Device Emulation

```typescript
test.use({
  ...devices['iPhone 12']
});
```

### 2. Wait for Menu Animation

```typescript
await mobileMenu.openHamburgerMenu();
await page.waitForTimeout(500); // Allow animation to complete
```

### 3. Close External Tabs

```typescript
const newPage = await mobileMenu.clickHelp();
// ... verify newPage
await newPage.close(); // Always close!
```

### 4. Handle Back Button Navigation

```typescript
// After external link
await newPage.close();
await mobileMenu.goBack(); // Back to previous state
await mobileMenu.openHamburgerMenu(); // Reopen menu
```

### 5. Verify Menu State

```typescript
// Before interacting
await mobileMenu.openHamburgerMenu();
expect(await mobileMenu.isMenuOpen()).toBe(true);
```

---

## Troubleshooting

### Menu Not Opening

**Problem**: `hamburgerButton.click()` doesn't open menu

**Solution**: Ensure mobile viewport is set
```typescript
test.use({
  ...devices['iPhone 12']
});
```

### Selectors Not Found

**Problem**: Desktop selectors used in mobile test

**Solution**: Use `MOBILE_SELECTORS` from mobile-constants
```typescript
import { MOBILE_SELECTORS } from '../mobile-constants';
page.locator(MOBILE_SELECTORS.HAMBURGER_BUTTON)
```

### Touch Events Not Working

**Problem**: Click events not registering

**Solution**: Enable touch in device config
```typescript
test.use({
  hasTouch: true,
  isMobile: true,
});
```

### Back Button Not Working

**Problem**: `page.goBack()` doesn't work as expected

**Solution**: Ensure navigation completed first
```typescript
await page.waitForLoadState('networkidle');
await mobileMenu.goBack();
```

---

## Future Enhancements

### Planned Mobile Tests

- Mobile reading experience tests
- Mobile sheet editor tests
- Mobile touch gestures (swipe, pinch-to-zoom)
- Mobile text selection and sharing
- Mobile performance tests
- Mobile-specific error handling
- Offline mode testing

### Additional Devices

Consider testing on:
- iPad (tablet viewport)
- Android tablets
- Older iOS versions
- Landscape orientation

---

## Summary

Mobile testing infrastructure provides:
- ✅ Comprehensive mobile hamburger menu testing
- ✅ Device emulation for authentic mobile experience
- ✅ Mobile-specific page objects and selectors
- ✅ Reuse of desktop utilities where applicable
- ✅ Clear separation of mobile vs desktop patterns
- ✅ Foundation for expanding mobile test coverage

For questions or issues, refer to this documentation or check the existing mobile test examples.
