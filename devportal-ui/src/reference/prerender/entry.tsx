// Server-side render of an endpoint page's content area (PLAN §2.5, §2.8): the same <Endpoint> component the
// browser mounts, rendered with react-dom/server from the C3 spec file. scripts/prerender-endpoints.ts bundles this
// entry with Vite (SSR) and writes one dist/prerender/endpoint-<operationId>.html per operation.
import { renderToString } from 'react-dom/server';
import type { OperationSpec } from '../../contracts';
import { Endpoint } from '../Endpoint';

/** The prerendered origin; Try It reads the real one from the page payload once the client mounts. */
export const PRERENDER_API_ORIGIN = 'https://www.sefaria.org';

export function renderEndpointHtml(op: OperationSpec): string {
  return renderToString(<Endpoint op={op} apiOrigin={PRERENDER_API_ORIGIN} />);
}
