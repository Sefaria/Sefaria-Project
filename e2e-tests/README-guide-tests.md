# Guide Overlay Tests

This document describes the guide overlay tests in the Playwright test suite.

## Test Cases

The guide overlay tests (`guide-overlay.spec.ts`) contain 14 test cases that verify the functionality of the guide overlay component in the sheet editor:

### Basic Functionality (TC001-TC003)
- **TC001**: Guide shows on first visit to sheet editor
- **TC002**: Guide doesn't show on repeat visits  
- **TC003**: Force show button displays guide

### Navigation (TC004-TC005)
- **TC004**: Navigate between guide cards
- **TC005**: Circular navigation works

### User Interactions (TC006)
- **TC006**: Close button dismisses guide

### Content Display (TC007-TC009)
- **TC007**: Video displays correctly
- **TC008**: Footer links are clickable
- **TC009**: Text content renders properly

### Error Handling (TC010-TC011)
- **TC010**: Loading state appears
- **TC011**: Timeout handling works

### Localization (TC012)
- **TC012**: Hebrew content displays correctly

### Context Awareness (TC013-TC014)
- **TC013**: Guide only shows in sheet editor
- **TC014**: Guide button only visible when appropriate

## Running the Tests

To run these tests locally:

```bash
# Local development
BASE_URL=http://localhost:8000 \
LOGIN_USERNAME=your-local-user@example.com \
LOGIN_PASSWORD=your-password \
npx playwright test guide-overlay --headed
```

To run on cauldron environments:

```bash
# Cauldron environment (set your specific environment)
BASE_URL=https://your-environment.cauldron.sefaria.org/ \
LOGIN_USERNAME=your-test-user@example.com \
LOGIN_PASSWORD=your-password \
npx playwright test guide-overlay --headed
```

## Current Status

✅ **All 14/14 tests are passing** with the backwards-compatible infrastructure

### Infrastructure Improvements (Latest)
- **Backwards-Compatible Guide Dismissal**: Guide overlays are dismissed by default in all tests via `hideModals()`
- **Cookie-Based Persistence**: Guide dismissal properly sets cookies to prevent reappearance after language changes
- **Opt-out for Guide Tests**: Guide tests use `skipGuideOverlay: true` to preserve guide functionality when testing it
- **Environment Variable Support**: Full support for `BASE_URL`, `LOGIN_USERNAME`, `LOGIN_PASSWORD`
- **Enhanced Login Flow**: Improved `LoginPage` class with fallback detection for better cross-environment compatibility
- **Robust URL Handling**: Consistent URL building with `buildFullUrl()` utility

### Infrastructure Benefits
- **Default Guide Dismissal**: Guide overlays no longer interfere with non-guide tests
- **Extensible**: Works automatically if guides are added to other pages
- **Cross-Environment**: Works with local development and any cauldron environment
- **Backwards Compatible**: All existing test functionality preserved

### Test Environment Requirements
- Tests require login functionality
- Guide overlay must be enabled in the target environment  
- Sheet editor must be accessible at `/sheets/new` 