# Modularization Sidebar Testing Suite

## Overview

This test suite validates the left/right sidebar functionality used in the modularized Library UI. The sidebar contains several content modules (intro/about, translations, learning schedules, resources) and a sticky footer with external links. The tests ensure that:

- Each sidebar module renders correctly and contains expected content.
- Footer links exist and point to acceptable targets (internal pages, external sites, mailto links) and behave correctly (same tab vs new tab).
- Accessibility and basic layout heuristics (visibility, grouping, color presence) are verified.

The tests are implemented with Playwright + TypeScript and follow a modular POM-like helper pattern using `SidebarTestHelpers`.

## Test Environment

- Library site under test: `modularization.cauldron.sefaria.org` (local/staging proxied environments are supported)
- Framework: Playwright with TypeScript
- Files of interest:
  - `e2e-tests/modularization-tests/sidebarMDL.ts` — helper class used by the tests
  - `e2e-tests/modularization-tests/sidebar.spec.ts` — the test suite
  - `e2e-tests/modularization-tests/constantsMDL.ts` — URL and selector constants used across tests

## Current Status

- The suite was added and exercised locally. Tests are defensive and accept both direct and proxied targets for links such as Help and Donate when environments behave differently.

---

## SidebarTestHelpers Class (summary)

Key methods implemented in `sidebarMDL.ts`:

- `waitForFooter()` — wait for the sticky footer container to appear.
- `getFooterLinkByText(text)` — convenient locator for footer links by visible text.
- `verifyFooterLink(spec: FooterLinkSpec)` — assert link visibility, href (string or regex), mailto, and target attr (best-effort).
- `clickAndVerifyLink(spec)` — click link and handle navigation in same tab or capture new tab Page when expected; safe-guards for mailto.
- `verifyFooterAppearance()` — heuristic checks for footer position and that link color is present (non-empty) to catch regressions in styling or layout.
- `verifyStandardFooterLinks()` — convenience batch check for the standard footer links (About, Help, Contact Us, Newsletter, Blog, Instagram, Facebook, YouTube, Shop, Ways to Give, Donate).

These helpers are intentionally tolerant of environment differences (e.g., Help sometimes proxied through `modularization.cauldron`) and avoid destructive actions (don't click mailto links).

---

## Test Suite Details (per-test summary)

All tests live in `sidebar.spec.ts`. Each test ID maps to a short description below.

- MOD-S001: Footer appearance and standard links
  - Smoke-check: footer visibility, position heuristics, link color presence.
  - Verifies each standard footer link exists and matches expected href patterns.

- MOD-S002: About link loads in same tab
  - Clicks About and asserts navigation to the modularization about page in the same tab.

- MOD-S003: Help link href and behavior (Zendesk)
  - Verifies the Help link href points to either Zendesk (`help.sefaria.org`) or the modularization help proxy.
  - Clicks and handles both new-tab and same-tab behaviors.

- MOD-S004: Contact Us is a mailto link
  - Verifies `href` starts with `mailto:`. Does not click.

- MOD-S005: Newsletter loads in same tab
  - Clicks Newsletter and asserts `/newsletter` navigation in the same tab.

- MOD-S006: Blog opens in new tab
  - Expects Blog to open a new page; verifies external URL then closes the tab.

- MOD-S007: Social and Shop links open in new tabs
  - Iterates Instagram, Facebook, YouTube, Shop; asserts each opens a new tab and points to its external domain.

- MOD-S008: Ways to Give loads, Donate href verified
  - Clicks Ways to Give and verifies same-tab navigation.
  - For Donate, asserts the footer `href` points to `donate.sefaria.org` but does not force-click (Donate may be proxied/redirected).

- MOD-S009: "A Living Library of Torah" has content
  - Asserts the intro module exists and contains descriptive text (non-empty, length heuristic).

- MOD-S010: Translations has language list
  - Asserts the translations module lists multiple language links (count > 3).

- MOD-S011: Learning Schedules lists readings
  - Asserts at least one reading link (Weekly Torah Portion / Haftarah / Daf Yomi) is present.

- MOD-S012: Resources contains link list
  - Asserts the resources module contains one or more resource links (Mobile Apps, Teach with Sefaria, Visualizations, etc.).

---

## How to run the tests locally

Run the whole sidebar spec:

```powershell
npx playwright test e2e-tests/modularization-tests/sidebar.spec.ts -g "Modularization Sidebar Tests"
```

Run just the section presence tests (fast check):

```powershell
npx playwright test e2e-tests/modularization-tests/sidebar.spec.ts -g "Sidebar sections"
```

Run a single test by its test title (useful for debugging):

```powershell
npx playwright test -g "MOD-S003: Help link href and behavior (Zendesk)"
```

Note: Use the project's `e2e-tests/.env` (or CI environment) to configure host and credentials.

---

## Troubleshooting & Maintenance Notes

- If a test fails because a link's visible text changed, update the `name` used in the spec or switch to a stable selector in `sidebarMDL.ts`.
- If Help/Donate are migrated to different domains or proxied, add the new acceptable patterns to `verifyStandardFooterLinks()`.
- Visual/position heuristics may be flaky on very small viewports — run with the standard test viewport defined in Playwright config or remove the heuristic if CI uses variable sizing.
- The tests avoid clicking `mailto:` links to prevent launching system mail clients; the `isMailto` flag asserts the link value only.

If you want stricter assertions (require `_blank` targets for social links or exact CSS color checks), we can update helpers to assert exact attributes and styles; I kept them intentionally tolerant to reduce false-positives across environments.

---

File quick references

- Helper: `e2e-tests/modularization-tests/sidebarMDL.ts`
- Tests: `e2e-tests/modularization-tests/sidebar.spec.ts`
- Constants: `e2e-tests/modularization-tests/constantsMDL.ts`
