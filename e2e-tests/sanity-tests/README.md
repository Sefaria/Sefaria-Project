# Sanity Tests

This folder contains comprehensive sanity tests that validate critical user flows across the Sefaria platform.

## Purpose

Sanity tests are designed to:
- Verify core functionality works before releases
- Test critical user journeys end-to-end
- Catch regressions in essential features
- Run quickly to provide fast feedback

## Test Files

### `user-flow-sanity.spec.ts`

**Description**: 7 independent sanity tests covering critical user flows. Each test runs separately for better failure isolation.

**Tests**:
1. **Sanity 1: Login** - Verifies user can login successfully
2. **Sanity 2: Profile View** - Confirms profile displays with correct artifacts
3. **Sanity 3: Profile Edit** - Tests profile editing functionality
4. **Sanity 4: Account Settings** - Tests settings modification (notifications, reading history, etc.)
5. **Sanity 5: Logout** - Verifies logout works correctly
6. **Sanity 6: Language Switch** - Tests EN ↔ HE interface language toggle
7. **Sanity 7: Module Switcher** - Tests all 4 module destinations (Library, Voices, Developers, More from Sefaria)

**Key Implementation Details**:
- **Profile menu** only available on **Voices module**
- **Account Settings** only available on **Library module**
- Each test uses the appropriate module for its functionality
- All tests are independent (can run in any order)

**Prerequisites**:
- Test user credentials in environment variables:
  - `PLAYWRIGHT_USER_EMAIL`
  - `PLAYWRIGHT_USER_PASSWORD`
- Sandbox environment URLs configured

## Running Tests

### Run all sanity tests:
```bash
npx playwright test sanity-tests/
```

### Run specific test file:
```bash
npx playwright test sanity-tests/user-flow-sanity.spec.ts
```

### Run single sanity check by name:
```bash
npx playwright test sanity-tests/ -g "Sanity 1: Login"
npx playwright test sanity-tests/ -g "Sanity 3: Profile"
npx playwright test sanity-tests/ -g "Sanity 7: Module"
```

### Run with UI mode (for debugging):
```bash
npx playwright test sanity-tests/user-flow-sanity.spec.ts --ui
```

### Run in headed mode (see browser):
```bash
npx playwright test sanity-tests/user-flow-sanity.spec.ts --headed
```

### Run with trace on failure:
```bash
npx playwright test sanity-tests/ --trace on-first-retry
```

## Page Objects Used

These tests leverage the following page objects:
- `ProfilePage` - User profile viewing
- `EditProfilePage` - Profile editing
- `AccountSettingsPage` - Account settings management
- `ModuleHeaderPage` - Header navigation and module switching
- `LoginPage` - Authentication

## Best Practices

1. **Test Isolation**: Each test starts with a fresh browser context
2. **Explicit Waits**: Uses `waitForLoadState('networkidle')` and element visibility waits
3. **Modal Handling**: Calls `hideAllModalsAndPopups()` after navigation
4. **Assertions**: Validates each step before proceeding
5. **Cleanup**: Closes contexts and pages after test completion

## Adding New Sanity Tests

When adding new sanity tests to this folder:

1. **Follow the naming convention**: `{feature}-sanity.spec.ts`
2. **Document the test purpose** in a JSDoc comment at the top
3. **Use existing page objects** when possible
4. **Create new page objects** for new pages/features
5. **Add test description** to this README
6. **Ensure test runs independently** (no dependencies on other tests)

### Template for New Sanity Test:

```typescript
/**
 * SANITY TEST - {Feature Name}
 *
 * PURPOSE: {Brief description of what this validates}
 * PRIORITY: {Critical/High/Medium}
 */

import { test, expect } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

test.describe('{Feature} Sanity Test', () => {
  test('{Test description}', async ({ context }) => {
    // Test implementation
  });
});
```

## Maintenance

- **Review after major releases**: Ensure sanity tests cover new critical features
- **Update when flows change**: Keep tests in sync with UI/UX changes
- **Monitor flakiness**: Investigate and fix any intermittent failures
- **Keep tests fast**: Sanity tests should complete quickly (< 2 minutes per test)

## Related Documentation

- [Testing Patterns Guide](../TESTING_PATTERNS.md)
- [Page Object Model](../pages/)
- [Utility Functions](../utils.ts)
- [Constants and Selectors](../constants.ts)
