// src/search (PLAN §2.1, §2.9). The search modal over the search documents (C3 search-documents). W10, Phase 4.
// Mount <SearchLauncher docsUrl={payload.site.searchDocsUrl} /> once; the modal and MiniSearch load lazily.
export { SearchLauncher, type SearchLauncherProps } from './SearchLauncher';
export { OPEN_SEARCH_EVENT, isSearchShortcut, openSearch } from './events';
