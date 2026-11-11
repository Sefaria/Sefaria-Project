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
 * Requests the suite may make without a recording, as "<METHOD> <path and query>". Each needs a comment saying why it cannot be
 * recorded or stubbed. Keep it empty.
 */
export const ALLOWED_MISSES: readonly string[] = [];

const apiOrigin = () => `http://localhost:${Number(process.env.E2E_API_PORT) || 3998}`;

async function misses(origin: string): Promise<string[]> {
  const res = await fetch(`${origin}/__cassette/misses`);
  if (!res.ok) throw new Error(`[cassette] ${origin}/__cassette/misses answered ${res.status}`);
  return (await res.json()) as string[];
}

/** The requests in `missed` that the allowlist does not name, and the allowlist's entries this run did not need. */
export function compareMisses(missed: readonly string[], allowed: readonly string[] = ALLOWED_MISSES) {
  return { unexpected: missed.filter((m) => !allowed.includes(m)), unused: allowed.filter((a) => !missed.includes(a)) };
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
