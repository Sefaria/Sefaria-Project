import { createBrowserRouter, type DataRouter } from 'react-router';
import type { PagePayload } from '../contracts';
import { rememberNavTree } from './loader';
import { createRoutes, PAGE_ROUTE_ID } from './routes';

/**
 * The browser router (React Router 7 `createBrowserRouter`). The data island's payload is the first
 * page's loader data, so the first render needs no request; later navigations run the loader.
 */
export function createPortalRouter(data: PagePayload | null): DataRouter {
  if (data !== null) rememberNavTree(data);
  const hydrationData =
    data !== null && data.kind !== 'redirect' ? { loaderData: { [PAGE_ROUTE_ID]: data } } : undefined;
  return createBrowserRouter(createRoutes(), { hydrationData });
}
