import { useCallback, useEffect } from 'react';
import { Outlet, ScrollRestoration, useNavigate, useRouteLoaderData } from 'react-router';
import type { PagePayload, SiteConfig } from '../contracts';
import { SearchLauncher, openSearch } from '../search';
import { SEARCH_OPEN_EVENT } from '../shell';
import { navigateTarget } from './links';

/**
 * The parent of every route: the page (or the gallery) and, once per document, the search modal and the
 * scroll restoration. Search reads the documents URL of the latest page payload (it changes when content is
 * published) and falls back to the first page's.
 */
export function PortalShell({ site }: { site: SiteConfig | null }) {
  const navigate = useNavigate();
  const page = useRouteLoaderData('page') as PagePayload | undefined;
  const docsUrl = (page && page.kind !== 'redirect' ? page.site.searchDocsUrl : null) ?? site?.searchDocsUrl ?? null;

  // The header's search toggle dispatches `dp:search-open` (src/shell); search listens for `dp:open-search`.
  useEffect(() => {
    const open = () => openSearch();
    window.addEventListener(SEARCH_OPEN_EVENT, open);
    return () => window.removeEventListener(SEARCH_OPEN_EVENT, open);
  }, []);

  const onNavigate = useCallback(
    (path: string) => {
      if (navigateTarget(path) === 'router') void navigate(path);
      else window.location.assign(path);
    },
    [navigate]
  );

  return (
    <>
      <Outlet />
      {docsUrl !== null && <SearchLauncher docsUrl={docsUrl} onNavigate={onNavigate} />}
      <ScrollRestoration />
    </>
  );
}
