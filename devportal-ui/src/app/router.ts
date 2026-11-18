import { createBrowserRouter, type DataRouter } from 'react-router';
import type { PagePayload } from '../contracts';
import { rememberNavTree } from './loader';
import { createRoutes, PAGE_ROUTE_ID, PAGE_SLOTS } from './routes';

/**
 * The browser router (React Router 7 `createBrowserRouter`). The data island's payload is the first
 * page's loader data, so the first render needs no request; later navigations run the loader.
 */
export function createPortalRouter(data: PagePayload | null): DataRouter {
  if (data !== null) rememberNavTree(data);
  const rendered = data !== null && data.kind !== 'redirect' ? data : null;
  const hydrationData = rendered !== null ? { loaderData: { [PAGE_ROUTE_ID]: rendered } } : undefined;
  return createBrowserRouter(createRoutes(PAGE_SLOTS, { site: rendered?.site ?? null }), { hydrationData });
}
