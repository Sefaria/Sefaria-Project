import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

// Every Strapi-driven surface (banners, modals, sidebar ads) arrives through this one endpoint.
const STRAPI_URL_GLOB = '**/api/strapi/**';

/**
 * Write a replay-only copy whose request URLs use the sandbox under test.
 *
 * Playwright matches HAR entries against the complete request URL. The committed recordings were
 * made at http://localhost:8000, while CI sets SANDBOX_URL to its per-commit nginx host (and may
 * include a path such as /texts). `routeFromHAR`'s `url` option only filters intercepted requests;
 * it does not rewrite HAR entries. Replacing just the origin keeps the recorded path, query and
 * POST body intact while allowing the same fixture to replay against any sandbox.
 */
function replayHarForSandboxOrigin(harPath) {
  if (!process.env.SANDBOX_URL) return { path: harPath, temporary: false };

  const sandboxOrigin = new URL(process.env.SANDBOX_URL).origin;
  const har = JSON.parse(readFileSync(harPath, 'utf8'));
  let changed = false;

  for (const entry of har.log?.entries || []) {
    if (!entry.request?.url) continue;
    const recordedUrl = new URL(entry.request.url);
    if (recordedUrl.origin === sandboxOrigin) continue;
    entry.request.url = new URL(
      `${recordedUrl.pathname}${recordedUrl.search}${recordedUrl.hash}`,
      `${sandboxOrigin}/`,
    ).href;
    changed = true;
  }

  if (!changed) return { path: harPath, temporary: false };

  // A worker runs one test at a time, and separate workers have separate PIDs, so this remains
  // race-free even when several tests replay the same scenario at full parallelism.
  const temporaryPath = path.join(tmpdir(), `sefaria-strapi-${process.pid}-${path.basename(harPath)}`);
  writeFileSync(temporaryPath, JSON.stringify(har), 'utf8');
  return { path: temporaryPath, temporary: true };
}

/**
 * Route the Strapi GraphQL-cache call through a HAR fixture for deterministic CI replay.
 *
 * This mirrors the newsletter suite's `support/har-fixture.js`. It is deliberately a
 * standalone Strapi-specific copy (hardcoded to the Strapi URL glob) rather than a shared,
 * generalized helper: the newsletter PR that introduced the pattern has not merged yet, so
 * we avoid touching a helper that lives on another branch. Once both land, the two can be
 * folded into one helper that takes the URL glob as an argument.
 *
 * The app fetches all banners/modals/sidebar ads from a single same-origin endpoint,
 *   POST /api/strapi/graphql-cache?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * (the Django view proxies + caches Strapi's GraphQL). Intercepting `**\/api/strapi/**`
 * therefore captures every Strapi-driven surface in one fixture.
 *
 * THESE SPECS ARE HERMETIC WITH RESPECT TO STRAPI. There are exactly two modes, and no silent
 * third one:
 *
 *   Replay (default): every `/api/strapi/**` request is answered from the .har. A request that
 *     does NOT match the recording is BLOCKED (aborted), never forwarded — see the guard route in
 *     the implementation below. The recorded payload is the test input; consulting live Strapi
 *     would change what is under test and make the result depend on whatever is published today.
 *   Record (RECORD_HAR=1): passes through to the real backend and (re)writes the HAR.
 *
 * If the .har is missing outside record mode we throw immediately rather than quietly running
 * against live Strapi. Whether the Django cache layer talks to Strapi correctly is a separate
 * concern, covered by VCR.py-style tests on the Python side — not by these browser specs.
 *
 * Note that only Strapi traffic is intercepted: the page HTML and all other Sefaria APIs still
 * come from the local/CI Django server, which must be running.
 *
 * IMPORTANT — the query string drifts:
 *   The client computes start_date/end_date as (today - 14d) / (today + 14d) from
 *   `new Date()`. That means the request URL changes every day, and `routeFromHAR`
 *   matches on the full URL. Pin the clock in the spec with
 *     await page.clock.setFixedTime(new Date(PINNED_NOW));
 *   BEFORE navigating, so the query string is identical to the recorded one on every
 *   run (and the recorded content still falls inside its active date window).
 *
 * IMPORTANT — STRAPI_INSTANCE must be truthy:
 *   templates/base.html only emits the fetch when the server has STRAPI_LOCATION/PORT set
 *   (otherwise `var STRAPI_INSTANCE = null` and StrapiDataProvider does nothing). The
 *   replay environment must therefore have Strapi *configured* (any value) so the fetch
 *   fires; it need not be *reachable*, because the HAR answers before the network.
 *
 * To record a fixture from scratch against a local Strapi instance:
 *   RECORD_HAR=1 SANDBOX_URL=http://localhost:8000 \
 *     ./node_modules/.bin/playwright test --project=chrome-strapi --workers=1 \
 *     e2e-tests/tests/strapi-localization.spec.js
 *
 * Commit the generated .har file in e2e-tests/fixtures/ so CI can replay it.
 */
export async function routeWithStrapiHarFixture(context, fixtureName) {
  const harPath = path.join(FIXTURES_DIR, `${fixtureName}.har`);
  const isRecording = process.env.RECORD_HAR === '1';

  // Collects any Strapi request the HAR did not answer (each is blocked, not forwarded).
  // expectStrapiServedFromHar turns a non-empty list into an explicit failure.
  const unmatched = [];
  // Also catch the opposite vacuity: no request/response at all (for example STRAPI_INSTANCE
  // missing server-side). Synthetic fixtures already enforce this invariant.
  const served = [];
  context.on('response', (response) => {
    if (response.url().includes('/api/strapi/')) served.push(response.url());
  });

  if (!isRecording && !existsSync(harPath)) {
    throw new Error(
      `No Strapi HAR fixture at:\n  ${harPath}\n\n` +
        `These specs never call the live Strapi backend, so there is nothing to run against. ` +
        `Record the fixture first:\n` +
        `  RECORD_HAR=1 ./node_modules/.bin/playwright test --project=chrome-strapi --workers=1 <spec>\n\n` +
        `If you are bootstrapping a new spec and just want to see it drive a real backend, run it ` +
        `in record mode — that is the only supported way to hit live Strapi.`,
    );
  }

  if (!isRecording) {
    // Registered BEFORE routeFromHAR on purpose: Playwright evaluates routes most-recently-added
    // first, so routeFromHAR gets first refusal and this handler only sees requests it declined.
    //
    // Why `notFound: 'fallthrough'` + this guard instead of `notFound: 'abort'`: both block the
    // request, but 'abort' discards it silently, leaving a bare "element not visible" failure.
    // Routing the miss here lets us record the offending URL and fail with a message that names
    // the actual cause.
    await context.route(STRAPI_URL_GLOB, async (route) => {
      unmatched.push(route.request().url());
      await route.abort('failed');
    });
  }

  const replayHar = isRecording ? { path: harPath, temporary: false } : replayHarForSandboxOrigin(harPath);

  await context.routeFromHAR(replayHar.path, {
    url: STRAPI_URL_GLOB,
    notFound: 'fallthrough', // → falls through to the guard above, NOT to the network
    update: isRecording,
    // Inline request/response bodies in the .har instead of writing opaque SHA-named sidecar
    // files next to it. One self-contained file per scenario: easier to commit (no "committed
    // the .har without its sidecars" failure), readable in review, and diffable — which matters
    // because these recordings are the raw material for the payload factory we plan to extract.
    updateContent: 'embed',
    // Record only what replay needs, keeping the fixtures small and reviewable.
    updateMode: 'minimal',
  });

  if (replayHar.temporary) {
    // routeFromHAR has loaded the file by this point, but retain it for the context's lifetime in
    // case Playwright needs it again while serving a later reload.
    context.once('close', () => {
      try {
        unlinkSync(replayHar.path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    });
  }

  return { unmatched, served, replaying: !isRecording };
}

/**
 * Fail with a specific, self-explaining message when a Strapi request missed the HAR.
 *
 * The request itself was already blocked, so the page simply received no Strapi data. Without this
 * check the only symptom would be a generic "element not visible", which is indistinguishable from
 * the feature actually being broken — two very different root causes wearing the same symptom.
 *
 * Call from test.afterEach. No-op while recording.
 */
export function expectStrapiServedFromHar(harHandle) {
  if (!harHandle?.replaying) return;

  if (harHandle.unmatched.length > 0) {
    throw new Error(
      `Strapi request(s) did not match the HAR fixture and were BLOCKED ` +
        `(these specs never call live Strapi), so the page received no Strapi data:\n` +
        harHandle.unmatched.map((url) => `  - ${url}`).join('\n') +
        `\n\nThe HAR matches on the full request URL AND the POST body. The usual causes are:\n` +
        `  * the GraphQL query in static/js/context.js changed (a field added or removed), so the\n` +
        `    recorded POST body no longer matches — the likeliest cause, and it invalidates every\n` +
        `    scenario at once;\n` +
        `  * the scenario's pinnedNow changed, so the derived start_date/end_date params differ;\n` +
        `  * the spec is pointing at a different scenario than the one that was recorded.\n` +
        `Re-record with RECORD_HAR=1 — see e2e-tests/tests/README.md.`,
    );
  }

  if (harHandle.served.length === 0) {
    throw new Error(
      `The page never received a /api/strapi/** response from the HAR, so any "not visible" ` +
        `assertion in this test passed without testing the recorded payload.\n\n` +
        `The usual cause is that STRAPI_LOCATION / STRAPI_PORT are unset server-side, so ` +
        `templates/base.html renders STRAPI_INSTANCE = null and StrapiDataProvider never fetches.`,
    );
  }
}
