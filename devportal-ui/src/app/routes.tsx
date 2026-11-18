// The route table (PLAN §2.5, §4.2). Shared file: created by W2 in Phase 1, owned by the Integrator from
// then on. The server decides what a path is, so there is one catch-all route whose loader fetches the
// C3 payload; workstreams plug their components in through `PAGE_SLOTS`.
import type { RouteObject } from 'react-router';
import { pageLoader } from './loader';
import { PortalPage, type PageSlots } from './PortalPage';
import { RouteError } from './RouteError';

/** The page route's id; `hydrationData.loaderData[PAGE_ROUTE_ID]` holds the data island's payload. */
export const PAGE_ROUTE_ID = 'page';

/** Components per page kind, from the other workstreams (src/reference, src/docs, src/home, …). */
export const PAGE_SLOTS: PageSlots = {};

export function createRoutes(slots: PageSlots = PAGE_SLOTS): RouteObject[] {
  return [
    {
      id: PAGE_ROUTE_ID,
      path: '*',
      loader: pageLoader,
      element: <PortalPage slots={slots} />,
      errorElement: <RouteError />,
    },
  ];
}
