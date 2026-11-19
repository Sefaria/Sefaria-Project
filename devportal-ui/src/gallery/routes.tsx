import type { RouteObject } from 'react-router';
import { NotFound } from './app/NotFound';
import { Root } from './app/Root';
import type { GalleryOptions } from './app/GalleryContext';
import { BrowsePage } from './features/browse/BrowsePage';
import { GALLERY_BASE } from './lib/paths';

/**
 * The gallery's routes, mounted under `/powered-by` in the portal's router (PLAN §2.14 item 1):
 *
 * | Path                           | Page                                                                   |
 * | ------------------------------ | ---------------------------------------------------------------------- |
 * | `/powered-by`                  | Browse projects. Search, filters, sort and view live in the URL.       |
 * | `/powered-by/projects/:slug`   | One project. `${id}-${name}`; only the id is used, a stale name redirects. |
 * | `/powered-by/charts`           | "Powered by Sefaria in numbers". Unlisted: `noindex, nofollow`.        |
 * | `/powered-by/*`                | The gallery's "Page not found".                                        |
 *
 * The project page and the charts page are lazy, so recharts and the project page stay out of the main bundle.
 * Pass the portal header in `options.header` and the gallery's GA4 id in `options.ga4Id` (from the page
 * payload: `site.ga4[site.analyticsSection]`). The route is a whole page: mount it beside the portal's
 * three-column frame, not inside it.
 */
export function createGalleryRoutes(options: GalleryOptions = {}): RouteObject {
  return {
    path: GALLERY_BASE.slice(1),
    element: <Root options={options} />,
    children: [
      { index: true, element: <BrowsePage /> },
      {
        path: 'projects/:slug',
        lazy: async () => ({
          Component: (await import('./features/project-page/ProjectPage')).ProjectPage,
        }),
      },
      {
        path: 'charts',
        lazy: async () => ({
          Component: (await import('./features/charts/ChartsPage')).ChartsPage,
        }),
      },
      { path: '*', element: <NotFound /> },
    ],
  };
}

/** The routes with no header slot and GA4 off, for a router that needs a plain array. */
export const galleryRoutes: RouteObject[] = [createGalleryRoutes()];
