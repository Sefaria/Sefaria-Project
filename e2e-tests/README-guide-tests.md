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
# Admin credentials
npx playwright test guide-overlay --headed

# Environment variables:
# PLAYWRIGHT_USER_EMAIL=admin@admin.com
# PLAYWRIGHT_USER_PASSWORD=admin
```

To run on sandbox environment:

```bash
# Sandbox credentials  
SANDBOX_URL=https://tips-and-tricks.cauldron.sefaria.org npx playwright test guide-overlay --headed

# Environment variables:
# PLAYWRIGHT_USER_EMAIL=danielschreiber@sefaria.org
# PLAYWRIGHT_USER_PASSWORD=admin
``` 