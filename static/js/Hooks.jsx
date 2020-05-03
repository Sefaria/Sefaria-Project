import React, { useState, useEffect, useMemo, useCallback } from 'react';
const $          = require('./sefaria/sefariaJquery');


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

function usePaginatedScroll(scrollable_element_ref, url, setter) {
  const [page, setPage] = useState(0);
  const [nextPage, setNextPage] = useState(1);
  const [loadedToEnd, setLoadedToEnd] = useState(false);

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
}

function usePaginatedDisplay(scrollable_element_ref, input, pageSize, bottomMargin) {
  const [page, setPage] = useState(0);
  const [loadedToEnd, setLoadedToEnd] = useState(false);
  const [inputUpToPage, setInputUpToPage] = useState([]);
  useEffect(() => () => {
    setInputUpToPage(prev => {
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

function useIncrementalLoad(fetchData, input, pageSize, setter, identityElement) {
  /*
  TODO: make default value a parameter
  Loads all items in `input` in `pageSize` chunks.
  Each input chunk is passed to `fetchData`
  fetchData: (data) => Promise(). Takes subarray from `input` and returns promise.
  input: array of input data for `fetchData`
  pageSize: int, chunk size
  setter: (data) => null. Sets paginated data on component.  setter(false) clears data.
  identityElement: a string identifying a invocation of this effect.  When it changes, pagination and processing will restart.  Old calls in processes will be dropped on landing.
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
        setter(false);
        setPage(0);
  }}, [identityElement]);

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

module.exports.usePaginatedScroll               = usePaginatedScroll;
module.exports.usePaginatedDisplay              = usePaginatedDisplay;
module.exports.useDebounce                      = useDebounce;
module.exports.useIncrementalLoad               = useIncrementalLoad;
