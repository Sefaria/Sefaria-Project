// The operation spec files of endpoint pages (`payload.operation.specUrl`), held once loaded so an endpoint page
// renders in one commit: the route loader loads the spec on client navigations and `mount` for the first page.
// `EndpointSpecGate` (endpoint.tsx) loads it itself if neither could.
import type { AnalyticsEvent } from '../analytics/events';
import { track } from '../analytics';
import type { EndpointPayload, OperationSpec, PagePayload } from '../contracts';
import { loadOperationSpec } from '../reference';

const specs = new Map<string, OperationSpec>();

/** The spec of an endpoint payload when it has been loaded. */
export function loadedSpec(data: EndpointPayload): OperationSpec | null {
  return specs.get(data.operation.specUrl) ?? null;
}

/** Loads the spec at `url` and keeps it. Rejects when it cannot be loaded. */
export async function loadSpec(url: string): Promise<OperationSpec> {
  const spec = specs.get(url) ?? (await loadOperationSpec(url));
  specs.set(url, spec);
  return spec;
}

/** Loads the spec of an endpoint payload (any other kind: nothing). Never rejects; the gate tries again. */
export async function preloadEndpointSpec(payload: PagePayload | null): Promise<void> {
  if (payload === null || payload.kind !== 'endpoint') return;
  try {
    await loadSpec(payload.operation.specUrl);
  } catch {
    // EndpointSpecGate shows the title-only frame and loads it again.
  }
}

/** Forgets the loaded specs (tests). */
export function resetEndpointSpecs(): void {
  specs.clear();
}

/** Sends the reference UI's analytics events through the C8 bus (src/analytics `track`). */
export function reportEndpointEvent(event: AnalyticsEvent): void {
  if (event.name === 'try_it_run') track('try_it_run', event.params);
}
