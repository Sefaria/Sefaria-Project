import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { collectServerNodes } from '../ui';
import { App } from './App';
import { ROOT_ELEMENT_ID, readPageData } from './data';
import { interceptPortalLinks } from './links';
import { createPortalRouter } from './router';

/**
 * Mounts the portal on `#dp-root` (PLAN §2.5). `createRoot`, not `hydrateRoot`: React replaces the server
 * markup in one commit. Before that, the server regions marked `data-dp-adopt` hand their nodes to the
 * components that keep them. Returns null when the page has no mount point.
 */
export function mount(doc: Document): Root | null {
  const container = doc.getElementById(ROOT_ELEMENT_ID);
  if (container === null) return null;
  const data = readPageData(doc);
  collectServerNodes(container);
  const router = createPortalRouter(data);
  interceptPortalLinks(doc, router);
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App router={router} />
    </StrictMode>
  );
  return root;
}
