# Search POC Architecture

`static/js/SearchPOCPage.jsx` implements a proof-of-concept search results page that combines full-text source search with name autocomplete results for topics, books, and authors.

## Responsibilities

- Accepts a `searchQuery` prop, trims it, and treats the trimmed value as the active query.
- Runs two query paths in parallel:
  - text search through `Sefaria.search.execute_query`
  - name lookup through `/api/name/<query>?limit=50`
- Normalizes name lookup results into the `SearchTopic` shape already used by search result UI components.
- Renders four tabs: Sources, Topics, Books, and Authors.
- Tracks loading and error state across both request paths.

## Data Flow

1. `fetchSources()` reads default text search metadata from `SearchState.metadataByType.text` and calls `Sefaria.search.execute_query`.
2. `fetchNameResults()` calls the name API and returns `completion_objects`.
3. Completion objects are split by type:
   - `AuthorTopic` becomes Author results.
   - `ref` becomes Book results.
   - `Topic` and `PersonTopic` become Topic results.
4. Each name result is expanded into a `SearchTopic` object:
   - books use `Sefaria.getIndexDetails()`
   - topics and authors use `Sefaria.getTopic()`
   - fallback objects are created if expansion fails
5. Book results are deduped by URL or title before rendering.

## Rendering

The page reuses existing result components instead of defining new card UI:

- `SearchTextResult` renders source hits after `Sefaria.search.mergeTextResultsVersions()`.
- `SearchTopic` renders topics, books, and authors after they are converted into the expected topic result shape.
- `TabView` owns the tab layout, with static tab order matching the rendered children.

## Request Lifecycle

The main `useEffect` resets results whenever the query changes, then starts both request paths. A local `isCurrent` flag prevents stale responses from updating state after a query change or unmount. The source search request is aborted in the cleanup path when possible.

Loading state stays active until both request paths finish. If either path fails, the page sets `hasError` and displays a generic search failure message.

## Notes

- The file currently logs intermediate fetch and filtering details to the console, which is useful for POC debugging but should be removed or gated before production use.
- Hebrew tab labels currently mirror the English strings for this POC.
- The page depends on existing Sefaria frontend APIs and result components, so most UI behavior follows the established search result presentation.
