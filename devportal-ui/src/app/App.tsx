import type { DataRouter } from 'react-router';
import { RouterProvider } from 'react-router';

export interface AppProps {
  router: DataRouter;
}

/** The portal's root: the router (`router.ts`), whose one route renders `PortalPage`. */
export function App({ router }: AppProps) {
  return <RouterProvider router={router} />;
}
