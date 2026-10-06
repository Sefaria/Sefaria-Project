import { http, HttpResponse } from "msw";
import { lookupFixture, lookupSearchFixture } from "./fixtures";

/**
 * Serves recorded API fixtures (fixtures/api) for any request to the Sefaria API.
 * Unknown requests return 404 so tests fail loudly instead of hitting the network.
 */
export const fixtureHandlers = [
  // Sidebar text search: a POST, so keyed on the query, the path filter and the offset
  http.post("https://www.sefaria.org/api/search-wrapper/es8", async ({ request }) => {
    const b = (await request.json()) as { query: string; filters: string[]; start?: number };
    const body = lookupSearchFixture(b.query, b.filters, b.start ?? 0);
    if (body === undefined) return HttpResponse.json({ error: `No search fixture for ${b.query} ${b.filters}` }, { status: 404 });
    return HttpResponse.json(body);
  }),
  http.get("https://www.sefaria.org/api/*", ({ request }) => {
    const url = new URL(request.url);
    const body = lookupFixture(url.pathname + url.search);
    if (body === undefined) {
      return HttpResponse.json({ error: `No fixture for ${url.pathname}${url.search}` }, { status: 404 });
    }
    return HttpResponse.json(body);
  }),
];
