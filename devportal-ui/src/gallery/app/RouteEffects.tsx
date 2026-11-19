import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { trackPageview } from '../lib/analytics';
import { galleryRelativePath } from '../lib/paths';
import { VisuallyHidden } from '../components/ui/VisuallyHidden';

/** Per-route work that belongs to no single page: page views, and announcing the new title. */
export function RouteEffects() {
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState('');

  // Project pages report their own, once the slug is canonical: /projects/141 would otherwise be
  // counted, and then counted again when it is replaced with /projects/141-torah-mcp.
  useEffect(() => {
    if (!galleryRelativePath(pathname).startsWith('/projects/')) trackPageview(pathname); // routes match any case
  }, [pathname]);

  // Pages set document.title as they load (some lazily), so announce whenever it changes
  // after a client-side navigation rather than guessing a delay.
  useEffect(() => {
    const title = document.querySelector('title');
    if (!title) return;
    const observer = new MutationObserver(() => setAnnouncement(document.title));
    observer.observe(title, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <VisuallyHidden>{announcement}</VisuallyHidden>
    </div>
  );
}
