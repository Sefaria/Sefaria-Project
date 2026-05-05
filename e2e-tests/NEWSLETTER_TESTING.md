# Newsletter Sign-Up Page — E2E Test Reference

106 tests across 4 spec files covering the logged-out user flow, form validation,
accessibility, and responsive layouts.

## Spec Files

| File | Tests | What it covers |
|------|-------|----------------|
| `tests/newsletter-signup-loggedout.spec.js` | 22 | Full user flow, Hebrew/English switching, validation, success/confirmation states |
| `tests/newsletter-signup-validation.spec.js` | 14 | Per-field errors, email format edge cases, error clearing |
| `tests/newsletter-signup-accessibility.spec.js` | 14 | Label associations, keyboard nav, ARIA, focus management |
| `tests/newsletter-signup-responsive.spec.js` | 56 | iPhone SE / iPad / Desktop / Large Desktop viewports (14 checks each) + orientation |

## Run Command

From the project root:

```bash
SANDBOX_URL=http://127.0.0.1:8000 ./node_modules/.bin/playwright test \
  --project=chromium \
  --workers=1 \
  --reporter=list \
  e2e-tests/tests/newsletter-signup-loggedout.spec.js \
  e2e-tests/tests/newsletter-signup-validation.spec.js \
  e2e-tests/tests/newsletter-signup-accessibility.spec.js \
  e2e-tests/tests/newsletter-signup-responsive.spec.js
```

## Flag Notes

- **`--workers=1`** — serializes tests so the local Django dev server isn't saturated by concurrent requests.
- **No `CI=1`** — `CI=1` enables `retries: 2`, turning each 2-minute timeout into a potential 6-minute block per failing test. Run without it locally.
- **`SANDBOX_URL`** — also set in `e2e-tests/.env` as `http://localhost:8000`; the inline value here uses `127.0.0.1` to match Playwright's default host resolution.
- **`--project=chromium`** — runs Chromium only; omit to run all configured browsers.

## Prerequisites

- Django dev server running on port 8000
- `npm install` completed (Playwright installed under `node_modules/.bin/playwright`)
