import React, {useState, useEffect, useMemo, useCallback, useRef, useContext} from 'react';
import $  from './sefaria/sefariaJquery';
import {ReaderPanelContext} from "./context";
import Sefaria from "./sefaria/sefaria";


function useContentLang(defaultToInterfaceOnBilingual, overrideLanguage){
    /* useful for determining language for content text while taking into account ContentLanguageContent and interfaceLang
    * `overrideLanguage` a string with the language name (full not 2 letter) to force to render to overriding what the content language context says. Can be useful if calling object determines one langugae is missing in a dynamic way
    * `defaultToInterfaceOnBilingual` use if you want components not to render all languages in bilingual mode, and default them to what the interface language is*/
    const {language, textsData} = useContext(ReaderPanelContext);
    const hasContent = !!textsData;
    const shownLanguage = (language === "bilingual") ? language : (language === "english" && textsData?.text?.length) ? textsData?.translationLang : textsData?.primaryLang; //the 'hebrew' of language means source
    const isContentLangAmbiguous = !['hebrew', 'english'].includes(shownLanguage);
    let languageToFilter;
    if (defaultToInterfaceOnBilingual && hasContent && isContentLangAmbiguous) {
        languageToFilter = Sefaria.interfaceLang;
    } else if (overrideLanguage) {
        languageToFilter = overrideLanguage;
    } else if (isContentLangAmbiguous || !hasContent) {
        languageToFilter = language;
    } else {
        languageToFilter = shownLanguage;
    }
    const langShort = languageToFilter.slice(0,2);
    return [languageToFilter, langShort];
}

//From https://usehooks.com/useDebounce/
function useDebounce(value, delay) {
  // State and setters for debounced value
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(
    () => {
      // Update debounced value after delay
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);

      // Cancel the timeout if value changes (also on delay change or unmount)
      // This is how we prevent debounced value from updating if value is changed ...
      // .. within the delay period. Timeout gets cleared and restarted.
      return () => {
        clearTimeout(handler);
      };
    },
    [value, delay] // Only re-call effect if value or delay changes
  );

  return debouncedValue;
}


/* Shared infinite-scroll trigger. Everything that loads on scroll binds through
 * here, because getting the scroller wrong fails silently -- a listener on a non-scrolling
 * element simply never fires. The container a component renders into is not always the
 * scroller: on singlePanel the document scrolls instead, though not for every
 * container, so it is decided per element rather than per breakpoint. */

// Overflow alone is not enough: `overflow-y: visible` beside `overflow-x: hidden` computes to
// `auto` (.noOverflowX does this to TopicPage), so real overflow has to be checked too.
const isScrollingElement = (el) => {
  if (!el) { return false; }
  const {overflowY} = window.getComputedStyle(el);
  if (!['scroll', 'auto', 'overlay'].includes(overflowY)) { return false; }
  return el.scrollHeight > el.clientHeight;
};

// A null scroller means the document scrolls.
const pixelsToBottom = (scroller) => (
  scroller
    ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    : document.documentElement.scrollHeight - window.scrollY - window.innerHeight
);

// Returns an unsubscribe function.
const observeNearBottom = (candidate, margin, onNearBottom) => {
  const handler = () => {
    // Re-checked per event: a container too short to scroll on page 1 can become the scroller.
    const scroller = isScrollingElement(candidate) ? candidate : null;
    if (pixelsToBottom(scroller) <= margin) { onNearBottom(); }
  };
  // Only one can fire: element scroll events don't bubble, document scroll is window-only.
  const targets = candidate ? [candidate, window] : [window];
  targets.forEach(t => t.addEventListener('scroll', handler, {passive: true}));
  return () => targets.forEach(t => t.removeEventListener('scroll', handler));
};

/**
 * Fires `onNearBottom` within `margin` px of the bottom of `getScrollCandidate()`, or of the
 * document when that element is not the scroller. `onNearBottom` is read fresh on every event,
 * so it need not be stable; callers do their own "already loading" / "nothing left" guarding.
 * `enabled: false` skips binding; `deps` re-bind (normally the resolved element).
 */
function useScrollNearBottom({getScrollCandidate, margin, onNearBottom, enabled = true, deps = []}) {
  const latestOnNearBottom = useRef(onNearBottom);
  latestOnNearBottom.current = onNearBottom;

  useEffect(() => {
    if (!enabled) { return; }
    return observeNearBottom(getScrollCandidate(), margin, () => latestOnNearBottom.current());
  }, [enabled, margin, ...deps]);
}


/**
 * Hook for paginated data loading triggered by scroll position.
 *
 * Fetches data from `url` when the user scrolls near the bottom of `scrollableRef`.
 * Uses `skip` and `limit` query params for pagination.
 *
 * @param {Object} options
 * @param {React.RefObject} options.scrollableRef - Ref to the scrollable container element
 * @param {string} options.url - API endpoint (must support `skip` and `limit` query params)
 * @param {function} options.setter - Callback to handle fetched data (receives array of items)
 * @param {number} [options.itemsPreLoaded=0] - Number of items already in cache; skips initial fetch if > 0
 * @param {number} [options.pageSize=20] - Number of items to fetch per request
 */
function useScrollToLoad({scrollableRef, url, setter, itemsPreLoaded = 0, pageSize = 20}) {
  const loadedToEndRef = useRef(false);
  const loadingRef = useRef(false);
  const fetchedCountRef = useRef(itemsPreLoaded);

  const loadMore = useCallback(() => {
    if (loadedToEndRef.current || loadingRef.current) return;

    loadingRef.current = true;
    const skip = fetchedCountRef.current;

    const urlObj = new URL(url, window.location.origin);
    urlObj.searchParams.set('skip', skip);
    urlObj.searchParams.set('limit', pageSize);
    const nextUrl = urlObj.pathname + urlObj.search;

    $.getJSON(nextUrl, (data) => {
      setter(data);
      fetchedCountRef.current += data.length;
      if (data.length < pageSize) {
        loadedToEndRef.current = true;
      }
      loadingRef.current = false;
    });
  }, [url, setter, pageSize]);

  // Initial fetch if there is no cached data
  useEffect(() => {
    if (itemsPreLoaded === 0) {
      loadMore();
    }
  }, []);

  // `loadMore` guards itself against overlapping and past-the-end calls.
  useScrollNearBottom({
    getScrollCandidate: () => scrollableRef.current,
    margin: 600,
    onNearBottom: loadMore,
    deps: [scrollableRef.current],
  });
}


function usePaginatedDisplay(scrollable_element_ref, input, pageSize, bottomMargin, initialRenderSize) {
  /*
  Listens until user is scrolled within `bottomMargin` of `scrollable_element_ref`
  when this happens, show `pageSize` more elements from `input`.
  On initial run, return `initialRenderSize` items if greater than `pageSize`.
  */
  initialRenderSize = Math.max(initialRenderSize, pageSize);
  bottomMargin = bottomMargin || 800;
  const [page, setPage] = useState(parseInt(initialRenderSize/pageSize)-1);
  const [loadedToEnd, setLoadedToEnd] = useState(false);
  const [inputUpToPage, setInputUpToPage] = useState(input.slice(0, initialRenderSize));
  useEffect(() => () => {
    setInputUpToPage(prev => {
      // use `setInputUpToPage` to get access to previous value
      // input changes because of useIncrementalLoad even though inputUpToPage may not change
      // as long as inputUpToPage is the same element by element, dont reset page to 0
      if (!inputUpToPage && !!prev) { setPage(0); }
      else if (!inputUpToPage.elementsAreEqual(prev)) { setPage(0); }
      return prev;
    });
    setLoadedToEnd(false);
  }, [scrollable_element_ref && scrollable_element_ref.current, input]);
  const numPages = useMemo(() => Math.ceil(input.length/pageSize), [input, pageSize]);
  // No ref at all means the caller opts out of scroll pagination entirely -- not the same as
  // passing a ref to a container that turns out not to be the scroller.
  useScrollNearBottom({
    getScrollCandidate: () => scrollable_element_ref.current,
    margin: bottomMargin,
    onNearBottom: () => { if (!loadedToEnd) { setPage(prevPage => prevPage + 1); } },
    enabled: !!scrollable_element_ref,
    deps: [scrollable_element_ref && scrollable_element_ref.current],
  });
  useEffect(() => {
    setInputUpToPage(prev => {
      // decide whether or not inputUpToPage has changed. if it's the same element-by-element to `prev`, return `prev`
      const next = input.slice(0, pageSize*(page+1));
      if (!next.elementsAreEqual(prev)) { return next; }
      return prev;
    });
  }, [page, input, pageSize]);
  useEffect(() => {
    if (page >= numPages) { setLoadedToEnd(true); }
  }, [page, numPages]);
  return inputUpToPage;
}


function useIncrementalLoad(fetchData, input, pageSize, setter, identityElement, resetValue=false) {
  /*
  Loads all items in `input` in `pageSize` chunks.
  Each input chunk is passed to `fetchData`
  fetchData: (data) => Promise(). Takes subarray from `input` and returns promise.
  input: array of input data for `fetchData`
  pageSize: int, chunk size
  setter: (data) => null. Sets paginated data on component.  setter(false) clears data.
  identityElement: a string identifying a invocation of this effect.  When it changes, pagination and processing will restart.  Old calls in processes will be dropped on landing.
  resetValue: value to pass to `setter` to indicate that it should forget previous values and reset.
  */

  // When input changes, creates function to fetch data by page, computes number of pages
  const [fetchDataByPage, numPages] = useMemo(() => {
    const fetchDataByPage = (page) => {
      if (!input) { return Promise.reject({error: "input not array", input}); }
      const pagedInput = input.slice(page*pageSize, (page+1)*pageSize);
      return fetchData(pagedInput);
    };
    const numPages = Math.ceil(input.length/pageSize);
    return [fetchDataByPage, numPages];
  }, [input]);

  usePaginatedLoad(fetchDataByPage, setter, identityElement, numPages, resetValue);
}


function usePaginatedLoad(fetchDataByPage, setter, identityElement, numPages, resetValue=false) {
  /*
  See `useIncrementalLoad` docs
  */

  const [page, setPage] = useState(0);
  const [isCanceled, setCanceled] = useState({});    // dict {idElem: Bool}
  const [valueQueue, setValueQueue] = useState(null);

  // When identityElement changes:
  // Set current identityElement to not canceled
  // Sets previous identityElement to canceled.
  //    Removes old items by calling setter(false);
  //    Resets page to 0
  useEffect(() => {
      setCanceled(d => { d[identityElement] = false; return Object.assign({}, d);});
      return () => {
        setCanceled(d => { d[identityElement] = true; return Object.assign({}, d);});
        setter(resetValue);
        setPage(0);
  }}, [identityElement]);

  const fetchPage = useCallback(() => fetchDataByPage(page), [page, fetchDataByPage]);

  // make sure value setting callback and page procession get short circuited when id_elem has been canceled
  // clear value queue on success
  const setResult = useCallback((id_elem, val) => {
            if (isCanceled[id_elem]) { setValueQueue(null); return; }
            setter(val);
            setValueQueue(null);
            if (page === numPages - 1 || numPages === 0) { return; }
            setPage(prevPage => prevPage + 1);
        }, [isCanceled, setter, numPages, page, identityElement]);

  // Make sure that current value is processed with latest setResult function
  // if this is called from within the fetchPage effect, it will have stale canceled data
  useEffect(() => {
    if(valueQueue) {
      setResult(...valueQueue);
    }
  }, [valueQueue, setResult]);

  // Put value returned and originating identity element into value queue
  useEffect(() => {
      fetchPage()
        .then((val, err) => setValueQueue([identityElement, val]));
  }, [fetchPage]);
}

export {
  useScrollNearBottom,
  useScrollToLoad,
  usePaginatedDisplay,
  useDebounce,
  useContentLang,
  useIncrementalLoad,
};
