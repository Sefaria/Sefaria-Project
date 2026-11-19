// The route table (PLAN §2.5, §4.2). Shared file: created by W2 in Phase 1, owned by the Integrator from
// then on. The server decides what a path is, so there is one catch-all route whose loader fetches the
// C3 payload; workstreams plug their components in through `PAGE_SLOTS` (slots.tsx). The gallery (W12) is
// its own route tree under `/powered-by`. Both sit under the shell route, which mounts search once.
import type { RouteObject } from 'react-router';
import type { SiteConfig } from '../contracts';
import { createGalleryRoutes } from '../gallery';
import { PortalHeader } from '../shell';
import { pageLoader } from './loader';
import { PortalPage, type PageSlots } from './PortalPage';
import { PortalShell } from './PortalShell';
import { RouteError } from './RouteError';
import { createPageSlots } from './slots';

/** The page route's id; `hydrationData.loaderData[PAGE_ROUTE_ID]` holds the data island's payload. */
export const PAGE_ROUTE_ID = 'page';
/** The shell route's id: the parent of the page route and the gallery's routes. */
export const SHELL_ROUTE_ID = 'shell';

/** Components per page kind, from the other workstreams (src/docs, later src/reference, src/home, …). */
export const PAGE_SLOTS: PageSlots = createPageSlots();

export interface RouteOptions {
  /** The first page's site settings (search documents URL, GA4 ids); later pages' payloads update it. */
  site?: SiteConfig | null;
}

export function createRoutes(slots: PageSlots = PAGE_SLOTS, options: RouteOptions = {}): RouteObject[] {
  const site = options.site ?? null;
  const gallery = createGalleryRoutes({
    // The gallery draws the portal header itself, between its skip link and its bar (PLAN §2.14 item 5).
    header: <PortalHeader activeTab="gallery" />,
    ga4Id: site?.ga4.gallery ?? null,
    // The shell renders the portal's one <ScrollRestoration>.
    scrollRestoration: false,
  });
  return [
    {
      id: SHELL_ROUTE_ID,
      element: <PortalShell site={site} />,
      errorElement: <RouteError />,
      children: [
        gallery,
        {
          id: PAGE_ROUTE_ID,
          path: '*',
          loader: pageLoader,
          element: <PortalPage slots={slots} />,
          errorElement: <RouteError />,
        },
      ],
    },
  ];
}
