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


function useIncrementalLoad(fetchData, input, pageSize, setter, identityElement) {
  /*
  TODO: make default value a parameter. Deal with issues where you end up with empty array of content
  Loads all items in `input` in `pageSize` chunks.
  Each input chunk is passed to `fetchData`
  fetchData: (data) => Promise(). Takes subarray from `input` and returns promise.
  input: array of input data for `fetchData`
  pageSize: int, chunk size
  setter: (data) => null. Sets paginated data on component.
  */
  const [page, setPage] = useState(0);
  const [isCanceled, setCanceled] = useState({});
  const [valueQueue, setValueQueue] = useState(null);

  useEffect(() => {
      setCanceled(d => { d[identityElement] = false; return Object.assign({}, d);});
      return () => {
        console.log('useIncrementalLoad RESET');
        setCanceled(d => { d[identityElement] = true; return Object.assign({}, d);});
        setter(false);
        setPage(0);
  }}, [identityElement]);

  const [fetchDataByPage, numPages] = useMemo(() => {
    const fetchDataByPage = (page) => {
      console.log('fetchDataByPage', page, input.length);
      if (!input) { return Promise.reject({error: "input not array", input}); }
      const pagedInput = input.slice(page*pageSize, (page+1)*pageSize);
      console.log('fetchDataByPage pagedInput', pagedInput, page);
      return fetchData(pagedInput);
    };
    const numPages = !input ? 0 : 2;  // TODO Math.ceil(input.length/pageSize);
    return [fetchDataByPage, numPages];
  }, [input]);

  const fetchPage = useCallback(() => fetchDataByPage(page), [page, fetchDataByPage]);
  const setResult = useCallback((id_elem, val) => {
            debugger;
            if (isCanceled[id_elem]) { return; }
            setter(val);
            setValueQueue(null);
            if (page === numPages - 1 || numPages === 0) { return; }
            setPage(prevPage => prevPage + 1);
        }, [isCanceled, setter, numPages, page, identityElement]);

  useEffect(() => {
    if(valueQueue) {
      setResult(...valueQueue);
    }
  }, [valueQueue, setResult]);

  useEffect(() => {
      fetchPage()
        .then(async (val, err) => {
            await new Promise(resolve => setTimeout(resolve, 4000));  // TODO
            return val;
        })
        .then((val) => setValueQueue([identityElement, val]));
  }, [fetchPage]);

}

module.exports.usePaginatedScroll               = usePaginatedScroll;
module.exports.useDebounce                      = useDebounce;
module.exports.useIncrementalLoad               = useIncrementalLoad;

/*
Seder

Genesis 15:13-14
Genesis 40:11-14

Passover

Exodus 13:3
Exodus 12:8-19
*/
