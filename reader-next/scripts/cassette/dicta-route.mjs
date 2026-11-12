// The browser asks Dicta (https://sefaria.loadbalancer.dicta.org.il, src/lib/search/dicta.ts) directly, not through the API origin, so
// the API cassette (scripts/api-cassette.mjs) only sees it when the test routes it there. Call once per page or context:
//
//   import { routeDictaThroughCassette } from "../scripts/cassette/dicta-route.mjs";
//   await routeDictaThroughCassette(page);            // or a BrowserContext
//
// The request keeps its URL in the page (specs that watch for "dicta.org.il" requests still see them); its answer comes from the
// cassette's /__dicta/ prefix (recorded in auto/record mode, replayed in replay mode). With E2E_LIVE set it does nothing.
const DICTA = /^https:\/\/sefaria\.loadbalancer\.dicta\.org\.il\//;

export async function routeDictaThroughCassette(target, apiPort = Number(process.env.E2E_API_PORT) || 3998) {
  if (process.env.E2E_LIVE) return;
  await target.route(DICTA, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const response = await route.fetch({ url: `http://localhost:${apiPort}/__dicta${url.pathname}${url.search}` });
    await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
  });
}
