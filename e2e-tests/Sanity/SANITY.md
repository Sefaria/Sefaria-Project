# Sanity Test Suite

This directory contains critical sanity tests that validate core functionality across the Sefaria platform. These tests should be run before every release to ensure essential user workflows remain functional.

## Overview

The sanity test suite is organized into focused test files, each covering a specific domain of functionality. Tests validate both single-module behavior and cross-module integration, ensuring authentication state, navigation, and data persist correctly across the Library and Voices modules.

## Test Organization

### Core Sanity Tests

Located in the main `Sanity/` directory, these tests cover critical user-facing workflows.

### Go Live Temp Tests

Located in `Sanity/Go Live Temp/`, these tests were migrated from the `Misc/` directory specifically for launch day validation. They focus on redirect behavior and help center integration.

---

## Test Files

### cross-module-login.spec.ts

**Purpose**: Validates authentication state persistence across Library and Voices modules, preventing authentication bugs that could break the user experience.

**Test Scenarios**:

1. **Login on Library, verify logged in state and remain on Library**
   - Verifies basic login functionality works on the Library module
   - Confirms user remains on Library after successful authentication
   - Validates profile picture and logout option appear in user menu

2. **Login on Library, switch to Voices via Module Switcher, verify logged in on Voices**
   - Tests that authentication state transfers when switching from Library to Voices
   - Validates module switcher navigation functionality
   - Ensures logged-in UI elements appear correctly on Voices after switch

3. **Login on Voices, switch to Library via Module Switcher, verify logged in on Library**
   - Tests reverse direction: authentication transfer from Voices to Library
   - Validates bidirectional authentication state persistence
   - Confirms logged-in status displays correctly on Library module

4. **Multiple Library tabs - attempt login on second tab shows error**
   - Validates concurrent session handling within Library module
   - Tests that logging in on one tab prevents duplicate login attempts on another
   - Confirms appropriate error message displays: "You are already logged in as"

5. **Multiple Voices tabs - attempt login on second tab shows error**
   - Validates concurrent session handling within Voices module
   - Ensures consistent behavior with Library module session management
   - Verifies error messaging matches expected UX patterns

6. **Login on Library, try login on previously opened Voices tab**
   - Tests cross-module session detection with multiple tabs
   - Validates that logging in on Library prevents duplicate login on Voices tab
   - Ensures authentication state synchronizes across different module tabs

7. **Login on Voices, try login on previously opened Library tab**
   - Tests reverse cross-module session detection
   - Validates authentication synchronization from Voices to Library tabs
   - Confirms consistent error handling across module boundaries

8. **Logged in Library user navigates to sheet link, opens in Voices while logged in**
   - Simulates external navigation scenario (e.g., Google search result to sheet)
   - Validates authentication persists when navigating from Library to Voices content
   - Tests real-world user journey: starting on Library, clicking sheet link

9. **Logged in Voices user navigates to text link, opens in Library while logged in**
   - Simulates external navigation from Voices to Library content
   - Validates authentication persists in reverse direction
   - Tests cross-module deep linking while maintaining session state

---

### user-flow-sanity.spec.ts

**Purpose**: Validates essential user workflows that represent the most common and critical user interactions with the platform.

**Test Cases**:

1. **Sanity 1: User can login successfully**
   - Validates end-to-end login flow: opening menu, navigating to login, entering credentials
   - Confirms profile picture appears after successful authentication
   - Ensures login redirects user back to original page

2. **Sanity 2: User can view profile with correct artifacts**
   - Tests navigation to user profile via Voices module user menu (Profile option only exists on Voices)
   - Validates profile page loads and displays expected user information
   - Confirms profile artifacts appear: name, position, organization, bio, profile image
   - Verifies edit button is visible on own profile

3. **Sanity 3: User can edit profile successfully**
   - Tests complete profile editing workflow on Voices module
   - Validates form fields can be modified: position, organization, location
   - Confirms save functionality works and updates are reflected on profile page
   - Handles modularization popups and overlays that may block interaction

4. **Sanity 4: User can edit account settings**
   - Tests account settings page access via Library module (Account Settings only exists on Library)
   - Validates settings form displays current user email
   - Confirms ability to modify settings: email notifications, reading history, textual customs
   - Verifies save dialog appears with success confirmation

5. **Sanity 5: User can change site language**
   - Tests language toggle between English and Hebrew
   - Validates body class updates to reflect interface language
   - Confirms UI text changes to selected language
   - Tests bidirectional switch: English to Hebrew and back to English

6. **Sanity 6: Module switcher reaches all destinations**
   - Validates module switcher can navigate to all four destinations:
     - Voices module
     - Developers site (external)
     - More from Sefaria products page
     - Library module (validates return to original module)
   - Confirms each destination opens in new tab with correct URL
   - Ensures original Library page remains accessible

7. **Sanity 7: User can logout successfully**
   - Tests complete logout workflow via user menu
   - Validates user session is terminated
   - Confirms logged-out UI state: profile picture removed, user icon visible
   - Ensures logout redirects appropriately

---

### sheet-workflow-sanity.spec.ts

**Purpose**: Validates the complete sheet lifecycle from creation through deletion, covering all major sheet operations users perform.

**Note**: This test suite uses serial execution with shared state. Test 8a creates a single sheet that tests 8b-8h operate on.

**Test Cases**:

1. **Sanity 8a: Login and create sheet**
   - Validates sheet creation via Create button in Voices module header
   - Confirms new sheet loads in editor with unique ID
   - Verifies sheet editor interface renders correctly
   - Creates foundation sheet for subsequent workflow tests

2. **Sanity 8b: Give sheet a title**
   - Tests sheet title editing functionality
   - Validates title persists after save (auto-save triggered by content addition)
   - Confirms title displays correctly in editor
   - Adds initial content to trigger auto-save mechanism

3. **Sanity 8c: Add source using text lookup in Voices**
   - Tests source addition via text lookup within Voices sheet editor
   - Validates text lookup functionality (e.g., "Genesis 1:1")
   - Confirms source appears in sheet with correct content
   - Tests in-editor source addition workflow

4. **Sanity 8d: Add source from Library reader to sheet**
   - Tests adding source from Library reader's connections panel
   - Validates cross-module source addition: from Library to Voices sheet
   - Confirms source appears in sheet after navigation back
   - Tests real-world workflow: reading text, adding to existing sheet

5. **Sanity 8e: Publish sheet with metadata**
   - Tests complete sheet publishing workflow
   - Validates publish form accepts title, description, and tags
   - Confirms sheet transitions to published state
   - Verifies Unpublish option appears in menu after publishing

6. **Sanity 8f: Unpublish sheet**
   - Tests sheet unpublishing functionality
   - Validates sheet returns to draft/unpublished state
   - Confirms Publish button reappears after unpublishing
   - Tests state transition: published to unpublished

7. **Sanity 8g: Add sheet to a new collection**
   - Tests collection creation and sheet association
   - Validates new collection creation with unique name
   - Confirms sheet appears in collection (checkbox checked in modal)
   - Tests collections feature integration with sheets

8. **Sanity 8h: Delete sheet**
   - Tests complete sheet deletion workflow
   - Validates deletion confirmation and execution
   - Confirms redirect to user profile after deletion
   - Verifies sheet no longer appears in user's profile sheet list

---

## Go Live Temp Tests

### Go Live Temp/cross-module-redirects.spec.ts

**Purpose**: Validates URL redirect behavior between Library and Voices modules, ensuring legacy URLs redirect correctly and query parameters are preserved.

**Note**: This file was migrated from `Misc/` directory for launch day validation.

**Test Suites**:

#### Suite 1: Cross-Module Redirects - Library to Voices

Tests that verify Library URLs redirect to their Voices equivalents:

- **Settings Profile Redirect**: `/settings/profile` on Library redirects to Voices
- **Community Page Redirect**: `/community` on Library redirects to Voices home
- **Collections Redirect**: `/collections` on Library redirects to Voices collections
- **Collections Redirect - Specific collection**: Specific collection URLs preserve path during redirect
- **Profile Redirect**: `/profile` on Library redirects to user's profile on Voices
- **Profile Redirect - With User**: Specific user profiles redirect with username preserved
- **Sheets Redirect - Get Started Page**: `/sheets` on Library redirects to Voices get started page
- **Sheets Redirect - Specific Sheet ID**: Specific sheet IDs redirect with ID preserved

Each test validates:
- No 404 or server error status codes
- Redirect to correct Voices module URL
- Path preservation where applicable

#### Suite 2: Query Parameter Preservation

Tests that verify URL query parameters are maintained during redirects:

- **Query Parameters Preserved**: Settings profile redirect maintains `?tab=notifications&test=123`
- **Collections Query Parameters Preserved**: Collections redirect maintains `?sort=recent`

Ensures user state and context encoded in URLs is not lost during navigation.

#### Suite 3: 301 Status Codes

Tests that verify redirects use proper HTTP 301 (Permanent Redirect) status:

- **Settings Profile Returns 301 Permanent Redirect**: `/settings/profile` returns 301 status
- **Community Returns 301 Permanent Redirect**: `/community` returns 301 status

Validates SEO best practices and proper HTTP semantics.

#### Suite 4: No Redirect Loops on Voices

Tests that verify accessing Voices URLs directly does not cause redirect loops:

- **No Redirect When Already on Voices - Settings Profile**: Direct access to Voices settings profile stays on Voices
- **No Redirect When Already on Voices - Home**: Voices home page does not redirect
- **No Redirect When Already on Voices - Get Started Page**: Get started page accessible without redirect
- **No Redirect When Already on Voices - Specific Sheet**: Sheet URLs work directly on Voices
- **Settings Account Returns 404 on Voices**: Account settings correctly returns 404 on Voices (Library-only feature)

Prevents infinite redirect loops and confirms module-specific content restrictions.

---

### Go Live Temp/help-sheet-redirects.spec.ts

**Purpose**: Validates that legacy help sheet URLs redirect correctly to the new Zendesk Help Center, ensuring users can still access help documentation via old links.

**Note**: This file was migrated from `Misc/` directory for launch day validation.

**Test Suites**:

#### Suite 1: Help Sheet to Zendesk Redirects - English

Dynamically generates tests for each English help sheet redirect mapping defined in `helpDeskLinksConstants.ts`.

Each test validates:
- Old sheet URL (`www.sefaria.org/sheets/*`) redirects successfully
- New destination is Zendesk Help Center (`help.sefaria.org/hc/en-us/*`)
- No error status codes during redirect
- Exact Zendesk article URL matches expected destination

Ensures English-speaking users find correct help articles.

#### Suite 2: Help Sheet to Zendesk Redirects - Hebrew

Dynamically generates tests for each Hebrew help sheet redirect mapping.

Each test validates:
- Old Hebrew sheet URL (`www.sefaria.org.il/sheets/*`) redirects successfully
- New destination is Hebrew Zendesk Help Center (`help.sefaria.org/hc/he/*`)
- No error status codes during redirect
- Exact Hebrew Zendesk article URL matches expected destination

Ensures Hebrew-speaking users find correct localized help articles.

---

## Running the Tests

### Run All Sanity Tests

```bash
npx playwright test Sanity
```

### Run Specific Test File

```bash
npx playwright test Sanity/user-flow-sanity.spec.ts
npx playwright test Sanity/cross-module-login.spec.ts
npx playwright test Sanity/sheet-workflow-sanity.spec.ts
```

### Run Go Live Temp Tests

```bash
npx playwright test "Sanity/Go Live Temp"
```

### Run Specific Test by Name

```bash
npx playwright test -g "User can login successfully"
npx playwright test -g "Scenario 1"
npx playwright test -g "Sanity 8a"
```

---

## Test Architecture

### Module-Specific Navigation

Tests account for module-specific UI elements:
- **Profile menu**: Only available on Voices module
- **Account Settings menu**: Only available on Library module

Tests navigate to the appropriate module before interacting with module-specific features.

### Authentication Strategy

Tests use two authentication approaches:
- `goToPageWithLang()`: Starts unauthenticated, tests login flow
- `goToPageWithUser()`: Uses pre-authenticated state from `BROWSER_SETTINGS.enUser`

### Test Isolation

Most tests use independent execution:
- Each test creates its own browser context
- No shared state between tests
- Clear failure isolation

Exception: `sheet-workflow-sanity.spec.ts` uses serial execution with shared sheet state for efficiency.

---

## Key Dependencies

- **Page Objects**: Tests use Page Object Model pattern via `PageManager`
- **Utilities**: Common functions in `utils.ts` for navigation, modal handling, authentication checks
- **Constants**: Module URLs, selectors, and test data defined in `constants.ts` and `globals.ts`

---

## Maintenance Notes

### Known Test Behaviors

1. **Language Switch Test**: Uses cookie fallback mechanism with page reload due to Strict Mode warnings
2. **Profile Edit Test**: Includes workaround to remove modularization popups that may block save button
3. **Sheet Workflow Tests**: Uses keyboard navigation workaround for plus button positioning issue

### Test Data

- **Test User**: `testUser` defined in `globals.ts` (credentials: QA Automation account)
- **Test Sheet**: Sheet workflow creates unique sheet with timestamp ID
- **Test Collection**: Collection created with unique timestamp name

---

## Success Criteria

All sanity tests passing indicates:
- Core authentication flows work across modules
- Essential user workflows (profile, settings, sheets) function correctly
- Cross-module navigation and redirects work properly
- Legacy help documentation URLs redirect successfully
- No critical regressions in user-facing functionality

Failing sanity tests indicate a blocking issue that should prevent release.
