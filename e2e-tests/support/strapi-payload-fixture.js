/**
 * Serve a synthetic Strapi payload to the page under test.
 *
 * The ONLY Strapi routing in use since 2026-08-31. Its former counterpart,
 * `strapi-har-fixture.js` (HAR record/replay), is RETIRED — kept only as documentation of how the
 * frozen recordings were made. routeWithStrapiPayload fulfils from a payload built in code and
 * matches the URL glob ALONE, so it survives changes to the GraphQL query and needs no Strapi
 * setup, at the cost of being a shape we assert rather than observe.
 *
 * That cost is paid off twice: `strapi-payload-contract.spec.js` holds the factory's field set to
 * what the frozen recordings actually contain, and `strapi-scenario-payload-fidelity.spec.js`
 * proves each scenario replica deep-equals its recording.
 *
 * Only `/api/strapi/**` is intercepted; the page HTML and every other Sefaria API still come from
 * the local/CI Django server, which must be running. `STRAPI_INSTANCE` must also be configured
 * server-side (any value) or `templates/base.html` never emits the fetch — see expectStrapiServed,
 * which turns that misconfiguration into an explicit failure instead of a silent one.
 */

/** Every Strapi-driven surface (banners, modals, sidebar ads) arrives through this one endpoint. */
const STRAPI_URL_GLOB = '**/api/strapi/**';

/**
 * Fulfil every Strapi request with `payload`.
 *
 * @param context  BrowserContext — registered on the context, not the page, so the payload keeps
 *                 being served across reloads and navigations within a test.
 * @param payload  the response body, normally from `strapiPayload(...)`. Ignored when `rawBody` is
 *                 given.
 * @param options.status       HTTP status to return; use 500 to exercise the error path.
 * @param options.rawBody      exact body string, bypassing JSON.stringify — for responses Strapi
 *                             would never send, such as a body that is not valid JSON.
 * @param options.contentType  response content type.
 *
 * Returns a handle for `expectStrapiServed`.
 */
export async function routeWithStrapiPayload(context, payload, options = {}) {
  const { status = 200, rawBody, contentType = 'application/json' } = options;

  const served = [];

  await context.route(STRAPI_URL_GLOB, async (route) => {
    served.push(route.request().url());
    await route.fulfill({
      status,
      contentType,
      body: rawBody !== undefined ? rawBody : JSON.stringify(payload),
    });
  });

  return { served, synthetic: true };
}

/**
 * Fail if the page never requested Strapi at all.
 *
 * The mirror image of the HAR suite's stale-fixture guard, catching the opposite failure. There the
 * risk is a request that misses the recording; here the payload always matches, so the danger is
 * that no request happens — `STRAPI_INSTANCE` unset server-side, an init script suppressing the
 * fetch (see e2e-tests/CLAUDE.md §3 on installOverlaySuppression), or a navigation that never
 * completed. Every one of those makes an absence assertion pass while testing nothing, and this
 * suite leans heavily on absence assertions.
 *
 * Call from test.afterEach.
 */
export function expectStrapiServed(handle) {
  if (handle?.served?.length) return;

  throw new Error(
    `The page never requested /api/strapi/**, so no synthetic payload was delivered and any ` +
      `"not visible" assertion in this test passed without testing anything.\n\n` +
      `Usual causes:\n` +
      `  * STRAPI_LOCATION / STRAPI_PORT are unset in sefaria/local_settings.py, so ` +
      `templates/base.html renders STRAPI_INSTANCE = null and StrapiDataProvider never fetches;\n` +
      `  * the test used goToPageWithLang / goToPageWithUser, whose installOverlaySuppression() ` +
      `short-circuits this endpoint — synthetic Strapi specs must navigate with a bare page.goto ` +
      `(see e2e-tests/CLAUDE.md rule 22);\n` +
      `  * the navigation never happened or the page errored before React mounted.`,
  );
}
