import { existsSync } from 'fs';
import path from 'path';
import { harPathForBaseURL } from './har-replay.js';
import { guardedContexts } from './newsletter-test.js';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

/**
 * Route newsletter API calls through a HAR fixture for deterministic CI replay.
 *
 * A HAR file is a saved recording of network requests and the responses that came back.
 * When we replay it, the browser gets the saved response instead of calling the real server.
 *
 * Replay mode (default): serves /api/newsletter/** responses from the named .har file.
 * If a newsletter API request isn't in the recording, it falls back to the guard in
 * support/newsletter-test.js, which blocks it and fails the test, naming the request.
 * We never let it go on to the real server, because these endpoints change real
 * newsletter subscriptions in ActiveCampaign. (Before the guard existed, an unrecorded
 * request was just aborted, and a test with a loose assertion still passed.) In a spec
 * that doesn't use the guard, unrecorded requests are still aborted here.
 * Record mode (RECORD_HAR=1): passes through to real network and updates the HAR.
 *
 * Pass the test's `baseURL` fixture. The recordings were made on one host
 * (http://localhost:8000), but Playwright only replays an entry when the request URL
 * matches it exactly, host included. The page calls the API with relative URLs, so on
 * any other host (127.0.0.1, or the merge queue's sandbox) nothing would replay. So in
 * replay mode we point every entry at the host this run is using; see
 * support/har-replay.js.
 *
 * To record a fixture from scratch:
 *   RECORD_HAR=1 SANDBOX_URL=http://localhost:8000 \
 *     ./node_modules/.bin/playwright test --project=chrome-newsletter-logged-out --workers=1 \
 *     e2e-tests/tests/newsletter-signup-loggedout.spec.js
 *
 * Playwright saves most request and response bodies as separate .json files next to the
 * .har file, and the .har file points to them by name. Commit the .har file AND all of
 * those .json files in e2e-tests/fixtures/. If the .json files are missing, the tests
 * fail on everyone else's machine.
 */
export async function routeWithHarFixture(context, fixtureName, baseURL) {
  const harPath = path.join(FIXTURES_DIR, `${fixtureName}.har`);
  const isRecording = process.env.RECORD_HAR === '1';

  if (!isRecording && !existsSync(harPath)) {
    throw new Error(`HAR fixture not found: ${harPath}. Record it with RECORD_HAR=1.`);
  }
  if (!isRecording && !baseURL) {
    // Without it we can't tell which host to replay on, and every request would miss.
    throw new Error('routeWithHarFixture needs the baseURL fixture (set SANDBOX_URL).');
  }

  // Recording writes back to the committed file, so only replay uses the rewritten copy.
  await context.routeFromHAR(isRecording ? harPath : harPathForBaseURL(context, harPath, baseURL), {
    url: '**/api/newsletter/**',
    notFound: guardedContexts.has(context) ? 'fallback' : 'abort',
    update: isRecording,
  });
}
