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

✅ **All 14/14 tests are passing** with the updated infrastructure

### Infrastructure Improvements
- Fixed URL handling using `BASE_URL` environment variable
- Updated login flow to use working `loginUser` utility
- Fixed Hebrew interface detection for cross-environment compatibility
- Added guide overlay dismissal in autosave tests to prevent click interception

### Test Environment Requirements
- Tests require login functionality
- Guide overlay must be enabled in the target environment
- Sheet editor must be accessible at `/sheets/new` 