import { createContext, useContext, type ReactNode } from 'react';

/** What the portal hands the gallery when it mounts its routes (see `createGalleryRoutes`). */
export interface GalleryOptions {
  /**
   * The portal header, rendered first on every gallery page in place of the gallery's own header
   * (PLAN §2.14 item 5). Leave it out when the portal draws its header around the gallery's routes.
   */
  header?: ReactNode;
  /**
   * The gallery's GA4 measurement id: `site.ga4[site.analyticsSection]` of the page payload, which is
   * `DEVPORTAL_GA4["gallery"]` on `/powered-by` (contract C8). Absent or empty means GA4 stays off.
   */
  ga4Id?: string | null;
  /** Render React Router's `<ScrollRestoration>`. Turn it off when the portal's root already renders one. */
  scrollRestoration?: boolean;
}

const GalleryContext = createContext<GalleryOptions>({});

export const GalleryOptionsProvider = GalleryContext.Provider;

export function useGalleryOptions(): GalleryOptions {
  return useContext(GalleryContext);
}
