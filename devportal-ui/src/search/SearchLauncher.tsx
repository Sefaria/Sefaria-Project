// Mount once per page. Opens the search modal on Cmd/Ctrl-K and on the `dp:open-search` window event
// (dispatched by the header's SearchToggle), loads the modal as a lazy chunk on first open, and returns
// focus to where it was when the modal closes.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { OPEN_SEARCH_EVENT, isSearchShortcut } from './events';
import type { SearchDialogProps } from './SearchDialog';

const SearchDialog = lazy(() => import('./SearchDialog'));

export interface SearchLauncherProps {
  /** `SiteConfig.searchDocsUrl` from the page payload. */
  docsUrl: string;
  onNavigate?: SearchDialogProps['onNavigate'];
  loadIndex?: SearchDialogProps['loadIndex'];
}

export function SearchLauncher({ docsUrl, onNavigate, loadIndex }: SearchLauncherProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    setOpen((already) => {
      if (!already) {
        const current = document.activeElement;
        returnFocus.current = current instanceof HTMLElement && current !== document.body ? current : null;
      }
      return true;
    });
    setLoaded(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    const target = returnFocus.current;
    returnFocus.current = null;
    // After the dialog has closed, so the browser does not move focus again.
    window.setTimeout(() => {
      if (target !== null && target.isConnected) target.focus();
    }, 0);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      show();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, show);
    };
  }, [show]);

  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <SearchDialog docsUrl={docsUrl} open={open} onClose={hide} onNavigate={onNavigate} loadIndex={loadIndex} />
    </Suspense>
  );
}
