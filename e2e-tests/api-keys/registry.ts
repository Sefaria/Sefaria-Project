import { request as playwrightRequest } from '@playwright/test';
import { LOCAL_PORTS, TargetName, assertAllowedUrl } from './env';
import { Gateway, GatewayCall, GatewayResult } from './gateway';

/**
 * Observing the auth service's in-memory key registry. Locally its HTTP port is published; on the
 * cauldron only through a port-forward named by APIKEYS_REGISTRY_URL. Without either, callers fall
 * back to polling the gateway until it gives the expected answer.
 */

export type RegistrySnapshot = { len: number; version: number; loaded_at: string; mode: string };

export function registryUrl(target: TargetName): string | undefined {
  const fromEnv = process.env.APIKEYS_REGISTRY_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return target === 'local' ? `http://127.0.0.1:${LOCAL_PORTS.authHttp}` : undefined;
}

export async function readRegistry(target: TargetName): Promise<RegistrySnapshot | undefined> {
  const base = registryUrl(target);
  if (!base) return undefined;
  const url = `${base}/internal/registry`;
  assertAllowedUrl(url, 'api');
  const ctx = await playwrightRequest.newContext();
  try {
    const response = await ctx.get(url, { failOnStatusCode: false, timeout: 5000 });
    if (!response.ok()) return undefined;
    return (await response.json()) as RegistrySnapshot;
  } catch {
    return undefined;
  } finally {
    await ctx.dispose();
  }
}

/**
 * Waits for the registry version to move past `since` (take it with readRegistry before the
 * change). When the registry is not observable, polls the gateway with `probe` until `accept`
 * holds instead. Returns how the wait was satisfied, for the test's annotations.
 */
export async function waitForVersionBump(
  target: TargetName,
  since: RegistrySnapshot | undefined,
  fallback?: { gw: Gateway; probe: GatewayCall; accept: (r: GatewayResult) => boolean },
  { timeoutMs = 10000, intervalMs = 200 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<{ via: 'registry' | 'gateway'; elapsedMs: number; snapshot?: RegistrySnapshot }> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  const observable = since !== undefined && registryUrl(target) !== undefined;

  if (!observable && !fallback) {
    throw new Error('The registry is not observable on this target and no gateway probe was given.');
  }

  while (Date.now() < deadline) {
    if (observable) {
      const now = await readRegistry(target);
      if (now && now.version > since!.version) {
        return { via: 'registry', elapsedMs: Date.now() - started, snapshot: now };
      }
    } else {
      const result = await fallback!.gw.call(fallback!.probe);
      if (fallback!.accept(result)) return { via: 'gateway', elapsedMs: Date.now() - started };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(
    observable
      ? `Registry version did not move past ${since!.version} within ${timeoutMs} ms.`
      : `The gateway probe did not reach the expected answer within ${timeoutMs} ms.`
  );
}
