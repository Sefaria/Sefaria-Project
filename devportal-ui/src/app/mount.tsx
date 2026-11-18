import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import { ROOT_ELEMENT_ID, readPageData } from './data';

/**
 * Mounts the portal on `#dp-root`. `createRoot`, not `hydrateRoot`: React replaces the server
 * markup in one commit (PLAN §2.5). Returns null when the page has no mount point.
 */
export function mount(doc: Document): Root | null {
  const container = doc.getElementById(ROOT_ELEMENT_ID);
  if (container === null) return null;
  const data = readPageData(doc);
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App data={data} />
    </StrictMode>
  );
  return root;
}
