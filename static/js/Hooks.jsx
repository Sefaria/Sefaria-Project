import React, { useState, useEffect, useMemo } from 'react';
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

function usePaginatedLoad(fetchData, setter, numPages) {
  /*
  calls `fetchData` for pages 0 to numPages - 1 and passes returns values to `setter`
  fetchData: (page) => Promise().then(data => {}). Given integer `page` returns promise
  setter: (data) => null. Sets paginated data on component
  numPages: int. total number of pages to load
  */

  const [page, setPage] = useState(0);

  useEffect(() => {
    if (numPages == 0) { return; }
    fetchData(page).then(data => {
      setter(data);
      if (page === numPages - 1) { return; }
      setPage(prevPage => prevPage + 1);
    })
  }, [page, numPages]);
}

function useIncrementalLoad(fetchData, input, pageSize, setter) {
  /*
  Loads all items in `input` in `pageSize` chunks.
  Each input chunk is passed to `fetchData`
  fetchData: (data) => Promise(). Takes subarray from `input` and returns promise.
  input: array of input data for `fetchData`
  pageSize: int, chunk size
  setter: (data) => null. Sets paginated data on component.
  */
  const [fetchDataByPage, numPages] = useMemo(() => {
    const fetchDataByPage = page => {
      const pagedInput = input.slice(page*pageSize, (page+1)*pageSize);
      return fetchData(pagedInput);
    };
    const numPages = !input ? 0 : Math.ceil(input.length/pageSize);
    return [fetchDataByPage, numPages];
  }, [input]);
  usePaginatedLoad(fetchDataByPage, setter, numPages);
}

module.exports.usePaginatedScroll               = usePaginatedScroll;
module.exports.useDebounce                      = useDebounce;
module.exports.usePaginatedLoad                 = usePaginatedLoad;
module.exports.useIncrementalLoad               = useIncrementalLoad;
