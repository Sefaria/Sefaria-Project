/**
 * In replay mode every request must be answered from the recordings. scripts/api-cassette.mjs answers a request it has no recording
 * for with a 504 and lists it at /__cassette/misses; a test can still pass on that 504 (it then tests the error path, not the page).
 * This global setup returns the run's teardown, which fails the run when a request was missed that ALLOWED_MISSES does not list.
 *
 * Only in replay (CI, or E2E_API_MODE=replay locally): auto records what is missing, record always asks the live API, and E2E_LIVE has
 * no cassette. A fix for a miss is a recording (record it, then pack a new bundle: scripts/cassette/bundle.mjs) or, for an answer
 * the live site cannot give reliably (a failure, a slow answer), a `page.route` stub in the spec.
 */
import type { FullConfig } from "@playwright/test";

/**
 * Requests the suite may make without a recording, as "<METHOD> <path and query>" or a pattern for one. Each needs a comment saying
 * why. An entry a run does not make is only reported (a subset of the specs, or a background request that did not happen this time).
 */
export const ALLOWED_MISSES: readonly (string | RegExp)[] = [
  // Background requests the reader makes on its own after the page a test checks has rendered: the next section's links and text
  // (prefetched), and the versions of verses scrolled past. Whether one goes out before the test ends depends on timing, so which
  // of them a run makes varies (seen: Fox's Leviticus Part III links and Klein Dictionary neighbours from ref-corpus.spec.ts, Psalms
  // 7:2 and 7:4 versions from search-page.spec.ts). No assertion depends on their answers. The pinned bundle lacks them; once a
  // re-recorded bundle holds them, these patterns come off the list.
  /^GET \/api\/links\/[^?]+\?with_text=0&with_sheet_links=1$/,
  /^GET \/api\/texts\/versions\/[^?]+$/,
  /^GET \/api\/v3\/texts\/Klein%20Dictionary%2C%20/,
];

const apiOrigin = () => `http://localhost:${Number(process.env.E2E_API_PORT) || 3998}`;

async function misses(origin: string): Promise<string[]> {
  const res = await fetch(`${origin}/__cassette/misses`);
  if (!res.ok) throw new Error(`[cassette] ${origin}/__cassette/misses answered ${res.status}`);
  return (await res.json()) as string[];
}

const allows = (a: string | RegExp, m: string) => (typeof a === "string" ? a === m : a.test(m));

/** The requests in `missed` that the allowlist does not name, and the allowlist's entries this run did not need. */
export function compareMisses(missed: readonly string[], allowed: readonly (string | RegExp)[] = ALLOWED_MISSES) {
  return { unexpected: missed.filter((m) => !allowed.some((a) => allows(a, m))), unused: allowed.filter((a) => !missed.some((m) => allows(a, m))).map(String) };
}

export default async function globalSetup(_config: FullConfig): Promise<(() => Promise<void>) | undefined> {
  if (process.env.E2E_LIVE) return;
  const origin = apiOrigin();
  const health = (await (await fetch(`${origin}/__cassette/health`)).text()).trim();
  if (health !== "ok replay") return;
  // a cassette server left running (reuseExistingServer) keeps an earlier run's misses: only this run's count
  const before = new Set(await misses(origin));
  if (before.size) console.warn(`[cassette] ${before.size} miss(es) from an earlier run on this server are not checked again: ${[...before].join(", ")}`);
  return async () => {
    const missed = (await misses(origin)).filter((m) => !before.has(m));
    const { unexpected, unused } = compareMisses(missed);
    // a subset of the specs may not make an allowed request: say so, do not fail
    if (unused.length) console.warn(`[cassette] allowed misses this run did not make: ${unused.join(", ")}`);
    if (unexpected.length) {
      throw new Error(
        `[cassette] ${unexpected.length} request(s) had no recording and were answered 504 (replay):\n  ${unexpected.join("\n  ")}\n` +
          "Record them (E2E_API_MODE=auto, then scripts/cassette/bundle.mjs pack), stub them in the spec with page.route, or list them " +
          "in e2e/cassette-misses.ts ALLOWED_MISSES with the reason.",
      );
    }
  };
}
