// Fetches an operation's C3 spec file (`payload.operation.specUrl`, same origin, served with the bundle).
import type { OperationSpec } from '../../contracts';

const cache = new Map<string, Promise<OperationSpec>>();

export function loadOperationSpec(specUrl: string): Promise<OperationSpec> {
  let pending = cache.get(specUrl);
  if (pending === undefined) {
    pending = fetch(specUrl, { credentials: 'same-origin' }).then(async (response) => {
      if (!response.ok) throw new Error(`spec ${specUrl}: HTTP ${response.status}`);
      return (await response.json()) as OperationSpec;
    });
    pending.catch(() => cache.delete(specUrl));
    cache.set(specUrl, pending);
  }
  return pending;
}
