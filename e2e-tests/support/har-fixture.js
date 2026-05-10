import { existsSync } from 'fs';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

/**
 * Route newsletter API calls through a HAR fixture for deterministic CI replay.
 *
 * Replay mode (default): serves /api/newsletter/** responses from the named .har file.
 * Record mode (RECORD_HAR=1): passes through to real network and updates the HAR.
 * No HAR exists and not recording: falls through to the real network unchanged.
 *
 * To record a fixture from scratch:
 *   RECORD_HAR=1 SANDBOX_URL=http://127.0.0.1:8000 \
 *     ./node_modules/.bin/playwright test --project=chromium --workers=1 \
 *     e2e-tests/tests/newsletter-signup-loggedout.spec.js
 *
 * Commit the generated .har file in e2e-tests/fixtures/ so CI can replay it.
 */
export async function routeWithHarFixture(context, fixtureName) {
  const harPath = path.join(FIXTURES_DIR, `${fixtureName}.har`);
  const isRecording = process.env.RECORD_HAR === '1';

  if (!isRecording && !existsSync(harPath)) {
    return;
  }

  await context.routeFromHAR(harPath, {
    url: '**/api/newsletter/**',
    notFound: 'fallthrough',
    update: isRecording,
  });
}
