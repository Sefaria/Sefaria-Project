# Modularization Header Testing Suite

## Overview

This test suite validates the header functionality for Sefaria's modularization feature, which separates Library and Sheets functionality into distinct sites. The tests ensure cross-site consistency, accessibility compliance, and proper navigation between modules.

## Test Environment

- **Library Site**: `modularization.cauldron.sefaria.org`
- **Sheets Site**: `sheets.modularization.cauldron.sefaria.org`
- **Framework**: Playwright with TypeScript
- **Architecture**: Modular Page Object Model (POM) with separated concerns

## Current Status: ✅ 10/11 TESTS PASSING (1 KNOWN FAILURE - LOGO NAVIGATION doesn't work)

---

## **HeaderTestHelpers Class**

Comprehensive helper class with documented methods:

- `navigateAndHideModals()` - Clean navigation with modal handling
- `clickAndVerifyNavigation()` - Standard link testing
- `clickAndVerifyNewTab()` - External link validation
- `testActionButton()` - Authentication flow handling
- `testSearch()` - Search functionality validation
- `testTabOrder()` - Keyboard accessibility testing
- `testModuleSwitcherKeyboard()` - Dropdown keyboard navigation

---

## Test Suite Details

### MOD-H001: Logo Navigation Functionality (EXPECTED TO FAIL)

**Purpose**: Document and track the logo navigation bug that prevents logo clicks from returning to home page

**What it checks**:

- Navigate to Topics page on Library site
- Click Sefaria logo to return to home page
- Verify navigation to home page (FAILS)
- Navigate to Topics page on Sheets site  
- Click Sefaria Sheets logo to return to Sheets home
- Verify navigation to Sheets home page (FAILS)

**Current Issue**: Logo elements are not properly linked or clickable - clicking them does not navigate back to home page

**Expected Behavior**: Logo should function as home page navigation link

**Key Implementation**: Tests real user expectation that logos should navigate to home page

---

### MOD-H002: Library Header Navigation and Logo

**Purpose**: Comprehensive validation of Library site header functionality with complete link testing

**What it checks**:

- Sefaria logo is visible and clickable in banner
- Texts link is visible and navigates correctly to texts page
- Topics link is visible and navigates correctly to topics page
- Donate link is visible and opens donate.sefaria.org in new tab
- Help link is visible and opens help.sefaria.org in new tab
- All navigation links are clickable and functionally verified
- Header structure is properly rendered

**Key Implementation**: Complete functionality testing using modular helper methods for clean, reusable code

---

### MOD-H003: Sheets Header Navigation and Elements

**Purpose**: Comprehensive validation of Sheets-specific header functionality with complete testing

**What it checks**:

- Navigation to Sheets site successful
- Sheets-specific logo is visible
- Topics link navigates correctly to topics page
- Collections link navigates correctly to collections page
- Donate link opens donate.sefaria.org in new tab
- Create button handles authentication flow (login redirect or sheet creation)
- Help link opens help.sefaria.org in new tab
- All functionality is validated, not just element existence

**Key Implementation**: Complete end-to-end testing of all Sheets-specific features with authentication handling

---

### MOD-H004: Search Functionality Across Both Sites

**Purpose**: Test search works consistently on both Library and Sheets  

**What it checks**:

- Search box exists and is functional on Library site
- Search for "Genesis 1:1" navigates to correct text page
- Search box exists and is functional on Sheets site  
- Search for "Passover" displays search results
- Search results URLs match expected patterns

**Key Implementation**: Tests both text navigation and general search functionality

---

### MOD-H005: Language Switcher Functionality

**Purpose**: Test interface language switching  

**What it checks**:

- Interface starts in English (`interface-english` body class)
- Language globe icon is clickable
- Hebrew option is available in dropdown
- Interface switches to Hebrew (`interface-hebrew` body class)
- Hebrew text appears correctly ("מקורות" link)

**Key Implementation**: Uses specific role-based selector for reliable element targeting

---

### MOD-H006: Module Switcher Navigation

**Purpose**: Test navigation between different Sefaria modules  

**What it checks**:

- Module switcher icon is clickable
- Dropdown opens with available modules
- Navigation to Sheets opens in new tab/window
- Correct Sheets URL is loaded
- Navigation to Developers works correctly
- External Developers site loads properly

**Key Implementation**: Uses correct dropdown selectors based on actual DOM structure

---

### MOD-H007: User Authentication Menu

**Purpose**: Test login/authentication flow  

**What it checks**:

- Logged-out user icon is visible and clickable
- User menu dropdown opens correctly
- Login link appears in dropdown menu
- Clicking login navigates to login page
- Login form elements exist (email, password fields)

**Key Implementation**: Uses proper dropdown item selectors for reliable interaction

---

### MOD-H008: Browser Navigation Controls (Back/Forward Buttons)

**Purpose**: Test browser navigation controls work correctly with the application

**What it checks**:

- Topics page navigation works correctly
- Specific topic links are clickable when available
- Browser back button maintains proper navigation state
- Forward button functionality works as expected
- URL patterns match expected navigation flow
- Page state is preserved during back/forward navigation

**Key Implementation**: Real browser navigation testing that users frequently use

---

### MOD-H009: Keyboard Navigation Accessibility

**Purpose**: Validate comprehensive keyboard-only navigation through header elements following actual browser tab order on both Library and Sheets sites

**What it checks**:

**Library Site Tab Navigation (8 focusable elements):**

1. Texts link is properly focusable
2. Topics link is properly focusable  
3. Donate link is properly focusable
4. Search input box is properly focusable
5. Virtual keyboard icon is properly focusable
6. Sign Up button is properly focusable
7. Sign Up link is properly focusable
8. Help link is properly focusable

**Sheets Site Tab Navigation (8 focusable elements):**

1. Topics link (Sheets-specific) is properly focusable
2. Collections link (Sheets-specific) is properly focusable
3. Donate link is properly focusable
4. Search input box is properly focusable
5. Virtual keyboard icon is properly focusable
6. Create button (Sheets-specific) is properly focusable
7. Create link (Sheets-specific) is properly focusable
8. Help link is properly focusable

**Module Switcher Dropdown Testing:**

- Module switcher icon is clickable and opens dropdown
- Library option is keyboard navigable
- Sheets option is keyboard navigable  
- Developers option is keyboard navigable
- ESC key properly closes module switcher dropdown

**Key Implementation**: Uses DOM walkthrough analysis to determine exact browser tab order. Configuration-driven test loops through both sites using `SITE_CONFIGS` constants. Establishes focus by clicking logo, then validates each element receives focus in precise browser order using `testTabOrder()` helper method.

---

### MOD-H010: Search Dropdown Sections and Icons Validation

**Purpose**: Validate search autocomplete dropdown displays correct sections with proper icons and excludes inappropriate sections

**What it checks**:

**Search Dropdown Section Validation:**

- Search autocomplete dropdown appears when typing in search box
- **Authors** section is present in dropdown
- **Topics** section is present in dropdown  
- **Categories** section is present in dropdown
- **Books** section is present in dropdown
- **Users** section is properly excluded from dropdown (negative test)

**Search Dropdown Icon Validation:**

- Authors section displays correct icon (alt="Authors")
- Topics section displays correct icon (alt="Topics")
- Categories section displays correct icon (alt="Categories")
- Books section displays correct icon (alt="Books")
- All section icons are visible and properly rendered

**Key Implementation**: Uses `testSearchDropdown()` method to validate section presence/absence and `testSearchDropdownIcons()` method to verify icon display. Tests with "mid" search term which reliably triggers all 4 expected dropdown sections (Authors, Topics, Categories, Books). Utilizes `SEARCH_DROPDOWN` constants for consistent selectors across dropdown container, sections, and icons.

---

### MOD-H011: Sheets - Search Dropdown Sections and Icons Validation

**Purpose**: Validate search autocomplete dropdown on Sheets site displays different sections than Library, including Users but excluding Categories and Books

**What it checks**:

**Search Dropdown Section Validation:**

- Search autocomplete dropdown appears when typing in search box
- **Topics** section is present in dropdown (pound sign icon)
- **Authors** section is present in dropdown (specially presented Topics with quill icon)
- **Users** section is present in dropdown (profile picture icons with alt="User")
- **Categories** section is properly excluded from dropdown (negative test)
- **Books** section is properly excluded from dropdown (negative test)

**Search Dropdown Icon Validation:**

- Topics section displays correct icon (alt="Topic")
- Authors section displays correct icon (alt="AuthorTopic")
- Users section displays profile picture icons (alt="User")
- All section icons are visible and properly rendered

**Key Implementation**: Uses same `testSearchDropdown()` and `testSearchDropdownIcons()` methods as Library test but with Sheets-specific constants. Tests with "rashi" search term on Sheets site. Utilizes `SEARCH_DROPDOWN.SHEETS_ALL_EXPECTED_SECTIONS` and `SEARCH_DROPDOWN.SHEETS_EXCLUDED_SECTIONS` for configuration-driven validation.

---