import { test } from '@playwright/test';

/**
 * Infrastructure noise that must never be reported as a product failure: gateway or upstream
 * outages, the cauldron's scale-from-zero splash page, truncated responses and pages whose
 * bundle never loaded.
 */

export const INFRA_STATUSES = [502, 503, 504];

const SPLASH_MARKER = /Environment is starting up/i;
const INFRA_ERROR_MARKERS = [/ERR_CONTENT_LENGTH_MISMATCH/, /Sefaria is not defined/, /ECONNRESET/, /socket hang up/];

export type InfraVerdict = { infra: boolean; reason?: string };

export function classifyResponse(status: number, body: string): InfraVerdict {
  if (INFRA_STATUSES.includes(status)) return { infra: true, reason: `HTTP ${status}` };
  if (SPLASH_MARKER.test(body.slice(0, 8000))) return { infra: true, reason: 'cauldron splash page' };
  return { infra: false };
}

export function classifyError(error: unknown): InfraVerdict {
  const message = error instanceof Error ? error.message : String(error);
  const marker = INFRA_ERROR_MARKERS.find(re => re.test(message));
  return marker ? { infra: true, reason: String(marker) } : { infra: false };
}

export class InfraError extends Error {
  constructor(reason: string) {
    super(`[infra] ${reason}. Not a product result; rerun once the target is healthy.`);
    this.name = 'InfraError';
  }
}

/** Records an infra event on the running test, so reports can count and filter them. */
export function annotateInfra(reason: string) {
  try {
    test.info().annotations.push({ type: 'infra', description: reason });
  } catch {
    /* outside a test (setup scripts): nothing to annotate */
  }
}

/**
 * Runs an attempt, and repeats it once when the outcome is infra. A second infra outcome raises
 * InfraError, which names itself as infra in the report instead of failing an assertion.
 */
export async function withInfraRetry<T>(
  attempt: () => Promise<T>,
  judge: (result: T) => InfraVerdict,
  { pauseMs = 3000 }: { pauseMs?: number } = {},
): Promise<T> {
  for (let i = 0; i < 2; i++) {
    let verdict: InfraVerdict;
    let result: T | undefined;
    try {
      result = await attempt();
      verdict = judge(result);
    } catch (e) {
      verdict = classifyError(e);
      if (!verdict.infra) throw e;
    }
    if (!verdict.infra) return result as T;
    annotateInfra(`${verdict.reason} (attempt ${i + 1})`);
    if (i === 0) await new Promise(r => setTimeout(r, pauseMs));
    else throw new InfraError(verdict.reason || 'infra');
  }
  throw new InfraError('unreachable');
}
