import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { startAnalytics } from '../analytics';
import { takeServerBody } from '../docs';
import { collectServerNodes } from '../ui';
import { App } from './App';
import { ROOT_ELEMENT_ID, readPageData } from './data';
import { loadedSpec, preloadEndpointSpec } from './endpointSpecs';
import { interceptPortalLinks } from './links';
import { createPortalRouter } from './router';
import { PAGE_ROUTE_ID } from './routes';
import { registerServerBody } from './slots';

/**
 * Mounts the portal on `#dp-root` (PLAN §2.5). `createRoot`, not `hydrateRoot`: React replaces the server
 * markup in one commit. Right before that, the server regions marked `data-dp-adopt` hand their nodes to
 * the components that keep them, and the docs body's nodes go to `DocPage` (slots.tsx).
 *
 * When the first page's route is lazy (the gallery's project and charts pages), the router is not ready
 * until its chunk has loaded; the server markup stays on screen until then instead of a blank fallback.
 * Returns null when the page has no mount point.
 */
export function mount(doc: Document): Root | null {
  const container = doc.getElementById(ROOT_ELEMENT_ID);
  if (container === null) return null;
  const data = readPageData(doc);
  const router = createPortalRouter(data);
  interceptPortalLinks(doc, router);
  // One page_view per navigation, the C8 key events and Discord clicks; nothing at all without a GA4 id.
  startAnalytics({ data, router, routeId: PAGE_ROUTE_ID, win: doc.defaultView ?? window });
  const root = createRoot(container);
  const render = () => {
    collectServerNodes(container);
    if (data !== null && data.kind === 'doc') registerServerBody(data, takeServerBody(doc));
    root.render(
      <StrictMode>
        <App router={router} />
      </StrictMode>
    );
  };
  const renderWhenReady = () => {
    // An endpoint page waits for its spec, so the prerendered article is replaced by the full one directly.
    if (data !== null && data.kind === 'endpoint' && loadedSpec(data) === null) {
      void preloadEndpointSpec(data).then(render);
    } else {
      render();
    }
  };
  if (router.state.initialized) {
    renderWhenReady();
  } else {
    const unsubscribe = router.subscribe((state) => {
      if (!state.initialized) return;
      unsubscribe();
      renderWhenReady();
    });
  }
  return root;
}
