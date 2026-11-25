import React, { useEffect, useRef } from 'react';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { useScrollNearBottom } from './Hooks';
import { LoadingMessage } from './Misc';

// How close (px) to the bottom of the scroll container before we ask for the next page.
const SCROLL_MARGIN = 300;

// Weblate-managed strings (static/js/sefaria/i18n/interface/{en,he}.json). Resolved per
// language so LoadingMessage's bilingual EnglishText/HebrewText split still works.
const LOADING_MORE_STRING_ID = "search_page.loading_more_results";

/**
 * Wraps a results list and fires `loadMore` when the user scrolls near the bottom of the
 * enclosing scroll container (`.content` by default). This is the single implementation of
 * the search "delay -> message -> append" pattern, shared by the Sources list and the
 * Books / Authors / Topics entity tabs.
 *
 * - `hasMore` / `isLoading` gate the trigger (never load past the end, never overlap a
 *   running query).
 * - `scrollableSelector` is only a *candidate* container -- `useScrollNearBottom` decides
 *   whether it or the document is the actual scroller.
 * - `isLoadingMore` controls the bottom "Loading more results..." message — the caller sets
 *   it only when appending to an existing list, so an *initial* load (skeleton / "Searching...")
 *   is left to the parent.
 */
const InfiniteScroll = ({ className, hasMore, isLoading, isLoadingMore, loadMore,
                          scrollableSelector = '.content', children }) => {
  const ref = useRef(null);
  const pending = useRef(false);

  // Clear the pending guard once the parent acknowledges the request by flipping isLoading on,
  // then back off. Without this, rapid scroll events between the loadMore() call and the next
  // render (when isLoading becomes true) can dispatch duplicate page fetches.
  useEffect(() => {
    if (!isLoading) { pending.current = false; }
  }, [isLoading]);

  useScrollNearBottom({
    getScrollCandidate: () => $(ref.current).closest(scrollableSelector)[0],
    margin: SCROLL_MARGIN,
    onNearBottom: () => {
      if (!hasMore || isLoading || pending.current) { return; }
      pending.current = true;
      loadMore();
    },
    deps: [scrollableSelector],
  });

  return (
    <div className={className} ref={ref}>
      {children}
      {isLoadingMore
        ? <LoadingMessage
            className="searchLoadMore"
            message={Sefaria._keyedString(LOADING_MORE_STRING_ID, "en")}
            heMessage={Sefaria._keyedString(LOADING_MORE_STRING_ID, "he")} />
        : null}
    </div>
  );
};

export default InfiniteScroll;
