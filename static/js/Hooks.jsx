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

  // Scroll listener for infinite loading
  useEffect(() => {
    const scrollable = scrollableRef.current;
    if (!scrollable) return;

    const scrollMargin = 600;  // Pixels from bottom to trigger load

    const handleScroll = () => {
      const scrollPosition = scrollable.scrollTop + scrollable.clientHeight;
      const scrollThreshold = scrollable.scrollHeight - scrollMargin;

      if (scrollPosition >= scrollThreshold) {
        loadMore();
      }
    };

    scrollable.addEventListener('scroll', handleScroll);
    return () => scrollable.removeEventListener('scroll', handleScroll);
  }, [loadMore]);
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
  useEffect(() => {
    if (!scrollable_element_ref) { return; }
    const scrollable_element = $(scrollable_element_ref.current);
    const handleScroll = () => {
      if (loadedToEnd) { return; }
      if (scrollable_element.scrollTop() + scrollable_element.innerHeight() + bottomMargin >= scrollable_element[0].scrollHeight) {
        setPage(prevPage => prevPage + 1);
      }
    };
    scrollable_element.on("scroll", handleScroll);
    return () => {
      scrollable_element.off("scroll", handleScroll);
    }
  }, [scrollable_element_ref && scrollable_element_ref.current, loadedToEnd]);
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

export {
  useScrollToLoad,
  usePaginatedDisplay,
  useDebounce,
  useContentLang,
  useIncrementalLoad,
};
