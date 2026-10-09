import { existsSync } from 'fs';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

/**
 * Route newsletter API calls through a HAR fixture for deterministic CI replay.
 *
 * A HAR file is a saved recording of network requests and the responses that came back.
 * When we replay it, the browser gets the saved response instead of calling the real server.
 *
 * Replay mode (default): serves /api/newsletter/** responses from the named .har file.
 * If a newsletter API request isn't in the recording, it is blocked and the test fails.
 * We never let it go on to the real server, because these endpoints change real
 * newsletter subscriptions in ActiveCampaign.
 * Record mode (RECORD_HAR=1): passes through to real network and updates the HAR.
 *
 * To record a fixture from scratch:
 *   RECORD_HAR=1 SANDBOX_URL=http://localhost:8000 \
 *     ./node_modules/.bin/playwright test --project=chrome-newsletter --workers=1 \
 *     e2e-tests/tests/newsletter-signup-loggedout.spec.js
 *
 * Playwright saves most request and response bodies as separate .json files next to the
 * .har file, and the .har file points to them by name. Commit the .har file AND all of
 * those .json files in e2e-tests/fixtures/. If the .json files are missing, the tests
 * fail on everyone else's machine.
 */
export async function routeWithHarFixture(context, fixtureName) {
  const harPath = path.join(FIXTURES_DIR, `${fixtureName}.har`);
  const isRecording = process.env.RECORD_HAR === '1';

  if (!isRecording && !existsSync(harPath)) {
    throw new Error(`HAR fixture not found: ${harPath}. Record it with RECORD_HAR=1.`);
  }

  await context.routeFromHAR(harPath, {
    url: '**/api/newsletter/**',
    notFound: 'abort',
    update: isRecording,
  });
}
