# Guide Overlay Tests

This document describes the comprehensive test suite for the Guide Overlay feature in Sefaria's sheet editor.

## Overview

The guide overlay feature provides onboarding tips to users when they first visit the sheet editor. Tests cover the complete user journey including display, navigation, persistence, and error handling.

## Test Files

- `tests/guide-overlay.spec.ts` - Main test suite with 14 test cases
- `pages/guideOverlayPage.ts` - Page Object Model for guide interactions
- `utils.ts` - Extended with guide-specific utility functions

## Test Coverage

### Basic Display & Persistence
- **TC001**: Guide shows on first visit to sheet editor
- **TC002**: Guide doesn't show on repeat visits (cookie persistence)
- **TC003**: Force show button displays guide

### Navigation & Content
- **TC004**: Navigate between guide cards  
- **TC005**: Circular navigation works
- **TC006**: Close button dismisses guide

### Content Verification
- **TC007**: Video displays correctly
- **TC008**: Footer links are clickable
- **TC009**: Text content renders properly

### Loading & Error Handling
- **TC010**: Loading state appears
- **TC011**: Timeout handling works

### Localization & Context
- **TC012**: Hebrew content displays correctly
- **TC013**: Guide only shows in sheet editor
- **TC014**: Guide button only visible when appropriate

## Running the Tests

### Run all guide tests
```bash
npx playwright test guide-overlay
```

### Run specific test
```bash
npx playwright test guide-overlay -g "TC001"
```

### Run with UI mode for debugging
```bash
npx playwright test guide-overlay --ui
```

## Test Environment Requirements

- Tests require a logged-in user (uses test credentials from environment)
- Guide data must be available via `/api/guides/editor` endpoint
- Sheet editor must be accessible via `/sheets/new`

## Key Testing Utilities

### Cookie Management
- `clearGuideOverlayCookie()` - Reset guide state for fresh testing
- `setGuideOverlayCookie()` - Simulate guide having been seen
- `hasGuideOverlayCookie()` - Check cookie state

### Navigation Helpers
- `goToNewSheetWithUser()` - Navigate to new sheet as logged-in user
- `waitForGuideOverlay()` - Wait for guide to appear and load
- `waitForGuideOverlayToClose()` - Wait for guide to disappear

### Simulation Helpers
- `simulateSlowGuideLoading()` - Test timeout behavior
- `simulateGuideApiError()` - Test error handling

## Page Object Model

The `GuideOverlayPage` class encapsulates all guide interactions:

```typescript
const guideOverlay = new GuideOverlayPage(page);

// Basic operations
await guideOverlay.waitForLoaded();
await guideOverlay.close();
await guideOverlay.clickGuideButton();

// Navigation
await guideOverlay.navigateNext();
await guideOverlay.navigatePrevious();

// Content inspection
const title = await guideOverlay.getCurrentTitle();
const text = await guideOverlay.getCurrentText();
const videoSrc = await guideOverlay.getVideoSrc();
```

## Known Test Limitations

- TC011 (timeout test) requires careful timing setup
- TC008 (footer links) depends on configured guide data having footer links
- TC012 (Hebrew) tests interface language switching
- Some tests may be skipped if guide data has only one card (no navigation)

## Debugging Tips

- Use `--headed` flag to see browser interactions
- Add `await page.pause()` for step-by-step debugging
- Check browser console for guide-related errors
- Verify guide API endpoint returns expected data structure 