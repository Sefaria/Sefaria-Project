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

// based off of https://juliangaramendy.dev/use-promise-subscription/
function usePromise(promiseOrFunction, defaultValue, cancelArray) {
  const [state, setState] = useState({ value: defaultValue, error: null });
  const [isCanceled, setIsCanceled] = useState(false);
  useEffect(() => () => setIsCanceled(true), cancelArray);
  useEffect(() => {
    console.log('usePromise rerunning promise', isCanceled);
    if (!isCanceled) {
      const promise = (typeof promiseOrFunction === 'function')
        ? promiseOrFunction()
        : promiseOrFunction

      promise
        .then(async (value) => {
          await new Promise(resolve => setTimeout(resolve, 4000));  // TODO
          setState({ value, error: null });
        })
        .catch(error => setState({ value: defaultValue, error }));
    }
    return () => {
      setIsCanceled(false);
    };
  }, [promiseOrFunction, defaultValue]);
  const { value, error } = state;
  return [value, error, isCanceled];
}

function usePaginatedLoad(fetchData, setter, numPages, cancelArray) {
  /*
  calls `fetchData` for pages 0 to numPages - 1 and passes returns values to `setter`
  fetchData: (page) => Promise().then(data => {}). Given integer `page` returns promise
  setter: (data) => null. Sets paginated data on component
  numPages: int. total number of pages to load
  */
  const [page, setPage] = useState(0);
  useEffect(() => () => {
    console.log('usePaginatedLoad RESET');
    setter(false);
    setPage(0);
  }, cancelArray);
  const fetchPage = useCallback(() => fetchData(page), [page, fetchData]);
  const [value, error, isCanceled] = usePromise(fetchPage, false, cancelArray);
  useEffect(() => {
    if (isCanceled) { console.log('usePaginatedLoad CANCEL', value, page, numPages);}
    if (error || isCanceled) { console.log('usePaginatedLoad ERROR', error); return; }
    setter(value);
    if (page === numPages - 1 || numPages === 0) { return; }
    setPage(prevPage => prevPage + 1);

  }, [value, error]);
}

function useIncrementalLoad(fetchData, input, pageSize, setter, cancelArray) {
  /*
  TODO: make default value a parameter. Deal with issues where you end up with empty array of content
  Loads all items in `input` in `pageSize` chunks.
  Each input chunk is passed to `fetchData`
  fetchData: (data) => Promise(). Takes subarray from `input` and returns promise.
  input: array of input data for `fetchData`
  pageSize: int, chunk size
  setter: (data) => null. Sets paginated data on component.
  */
  const [fetchDataByPage, numPages] = useMemo(() => {
    const fetchDataByPage = (page) => {
      console.log('fetchDataByPage', page, input.length);
      if (!input) { return Promise.reject({error: "input not array", input}); }
      const pagedInput = input.slice(page*pageSize, (page+1)*pageSize);
      console.log('fetchDataByPage pagedInput', pagedInput, page);
      return fetchData(pagedInput);
    };
    const numPages = !input ? 0 : 2 // TODO Math.ceil(input.length/pageSize);
    return [fetchDataByPage, numPages];
  }, [input]);
  usePaginatedLoad(fetchDataByPage, setter, numPages, cancelArray);
}

module.exports.usePaginatedScroll               = usePaginatedScroll;
module.exports.useDebounce                      = useDebounce;
module.exports.usePaginatedLoad                 = usePaginatedLoad;
module.exports.useIncrementalLoad               = useIncrementalLoad;
module.exports.usePromise                       = usePromise;

/*
Seder

Genesis 15:13-14
Genesis 40:11-14

Passover

Exodus 13:3
Exodus 12:8-19
*/
