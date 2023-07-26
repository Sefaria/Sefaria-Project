import React, {useState, useEffect, useMemo, useCallback, useRef, useContext} from 'react';
import $  from './sefaria/sefariaJquery';
import {ContentLanguageContext} from "./context";
import Sefaria from "./sefaria/sefaria";


function useContentLang(defaultToInterfaceOnBilingual, overrideLanguage){
    /* useful for determining language for content text while taking into account ContentLanguageContent and interfaceLang
    * `overrideLanguage` a string with the language name (full not 2 letter) to force to render to overriding what the content language context says. Can be useful if calling object determines one langugae is missing in a dynamic way
    * `defaultToInterfaceOnBilingual` use if you want components not to render all languages in bilingual mode, and default them to what the interface language is*/
    const contentLanguage = useContext(ContentLanguageContext);
    const languageToFilter = (defaultToInterfaceOnBilingual && contentLanguage.language === "bilingual") ? Sefaria.interfaceLang : (overrideLanguage ? overrideLanguage : contentLanguage.language);
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


function useScrollToLoad({scrollableRef, url, setter, itemsPreLoaded=0, pageSize=20}) {
  // Loads data from `url` and calls `setter` on the resulting data when `scrollableRef` scrolls
  // close to its bottom. 
  // API endpoint must return an array of results and support params `skip` and `limit`.
  // `itemsPreLoaded` counts the number of items already loaded, e.g. when some data was already available
  // in the JS cache.  If `itemsPreLoaded` > 0, no initial API is made
  // call will be made until scroll occurs, otherwise the size page is requeste immediately.
  const [skip, setSkip] = useState(itemsPreLoaded);
  const [loading, setLoading] = useState(false);
  const [loadedToEnd, setLoadedToEnd] = useState(false);
  const isFirstRender = useRef(true);

  // Set a scroll handler that will update the value of `skip`.
  useEffect(() => {
    const $scrollable = $(scrollableRef.current);
    const margin = 600;
    const handleScroll = () => {
      if (loadedToEnd || loading) { return; }
      if ($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
        setSkip(skip + pageSize);
      }
    };
    $scrollable.on("scroll", handleScroll);
    return (() => {$scrollable.off("scroll", handleScroll);})
  }, [scrollableRef.current, loadedToEnd, skip, loading]);

  // Load and set data whenever `skip` changes.
  useEffect(() => {
    if (isFirstRender.current && itemsPreLoaded > 10) {
      return;
    }
    setLoading(true);
    const nextUrl = url + (url.indexOf("?") === -1 ? "?" : "&") + "skip=" + skip + "&limit=" + pageSize;
    $.getJSON(nextUrl, (data) => {
      setter(data);
      if (data.length < pageSize) {
        setLoadedToEnd(true);
      }
      setLoading(false);
    });
  }, [skip]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
  }, [])
}


function usePaginatedScroll(scrollable_element_ref, url, setter, pagesPreLoaded = 0) {
  // Fetches and sets data from `url` when user scrolls to the
  // bottom of `scollable_element_ref`

  const [page, setPage] = useState(pagesPreLoaded > 0 ? pagesPreLoaded - 1 : 0);
  const [nextPage, setNextPage] = useState(pagesPreLoaded > 0 ? pagesPreLoaded : 1);
  const [loadedToEnd, setLoadedToEnd] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const scrollable_element = $(scrollable_element_ref.current);
    const margin = 600;
    const handleScroll = () => {
      if (loadedToEnd || (page === nextPage)) { return; }
      if (scrollable_element.scrollTop() + scrollable_element.innerHeight() + margin >= scrollable_element[0].scrollHeight) {
        setPage(nextPage);
      }
    };
    scrollable_element.on("scroll", handleScroll);
    return (() => {scrollable_element.off("scroll", handleScroll);})
  }, [scrollable_element_ref.current, loadedToEnd, page, nextPage]);

  useEffect(() => {
    if (pagesPreLoaded > 0 && isFirstRender.current) { return; }
    const paged_url = url + "&page=" + page;
    $.getJSON(paged_url, (data) => {
      setter(data);
      if (data.count < data.page_size) {
        setLoadedToEnd(true);
      } else {
        setNextPage(page + 1);
      }
    });
  }, [page]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
  }, [])
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
  useScrollToLoad,
  usePaginatedScroll,
  usePaginatedDisplay,
  useDebounce,
  useContentLang,
  useIncrementalLoad,
};
