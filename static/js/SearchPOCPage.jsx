import React, { useState, useEffect, useRef } from "react";
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { InterfaceText, LoadingMessage, TabView } from './Misc';
import SearchTextResult from './SearchTextResult';
import { SearchTopic } from './SearchResultList';
import Sefaria from "./sefaria/sefaria";
import SearchState from "./sefaria/searchState";

// --- Data fetching -----------------------------------------------------------

function fetchSources(query, { onSuccess, onError }) {
  const { field, fieldExact, sortType } = SearchState.metadataByType.text;
  const result = Sefaria.search.execute_query({
    query,
    type: "text",
    size: 20,
    start: 0,
    field,
    sort_type: sortType,
    exact: fieldExact === field,
    applied_filters: [],
    appliedFilterAggTypes: [],
    aggregationsToUpdate: [],
    success: data => { console.log("fetchSources success", data); onSuccess(data); },
    error: onError,
  });
  console.log("fetchSources return value", result);
  return result;
}

async function fetchNameResults(query) {
  const res = await fetch(`/api/name/${encodeURIComponent(query)}?limit=50&get_author_books=1`);
  if (!res.ok) {
    throw new Error("Name lookup failed");
  }
  const data = await res.json();
  console.log("fetchNameResults raw response", data);
  const completionObjects = data.completion_objects || [];
  const authorIndexes = data.author_indexes || [];
  console.log("fetchNameResults completion_objects", completionObjects);
  console.log("fetchNameResults author_indexes", authorIndexes);
  return { completionObjects, authorIndexes };
}

function filterAuthors(completionObjects) {
  const results = completionObjects.filter(o => o.type === "AuthorTopic");
  console.log("filterAuthors", results);
  return results;
}

function filterBooks({ completionObjects, authorIndexes }) {
  if (authorIndexes.length > 0) {
    const results = authorIndexes.map(item => ({
      type: "ref",
      title: item.title.en,
      heTitle: item.title.he,
      key: item.title.en,
      enDesc: item.description?.en || undefined,
      heDesc: item.description?.he || undefined,
      _directUrl: item.url,
    }));
    console.log("filterBooks (author_indexes)", results);
    return results;
  }
  const results = completionObjects.filter(o => o.type === "ref");
  console.log("filterBooks (refs)", results);
  return results;
}

function filterTopics(completionObjects) {
  const results = completionObjects.filter(o => o.type === "Topic" || o.type === "PersonTopic");
  console.log("filterTopics", results);
  return results;
}

// --- Renderers ---------------------------------------------------------------

const getURLForNameResult = (item) => {
  if (item.type === "ref") {
    if (item._directUrl) return item._directUrl;
    return `/${item.key.replace(/ /g, "_")}`;
  }
  if (item.type === "Topic" || item.type === "PersonTopic" || item.type === "AuthorTopic") {
    return `/topics/${item.key}`;
  }
  return null;
};

const getSearchTopicCategory = (item) => {
  if (item.type === "AuthorTopic") {
    return { en: "Authors", he: Sefaria.hebrewTranslation("Authors") };
  }
  if (item.type === "ref") {
    return { en: "Books", he: Sefaria.hebrewTranslation("Books") };
  }
  const typeObj = Sefaria.displayTopicTocCategory(item.key);
  if (typeObj) {
    return typeObj;
  }
  return { en: "Topics", he: Sefaria.hebrewTranslation("Topics") };
};

const getSearchTopicForNameResult = item => {
  const category = getSearchTopicCategory(item);
  const result = {
    analyticCat: category.en,
    sourceKey: item.key,
    sourceType: item.type,
    title: item.title,
    heTitle: item.heTitle || item.title,
    topicCat: category.en,
    heTopicCat: category.he,
    url: getURLForNameResult(item),
    numSources: 0,
    numSheets: 0,
  };
  if (item._directUrl) result._directUrl = item._directUrl;
  if (item.enDesc) result.enDesc = item.enDesc;
  if (item.heDesc) result.heDesc = item.heDesc;
  return result;
};

const getSearchTopicsForNameResults = results => results.map(getSearchTopicForNameResult);

const getHydratedBookSearchTopic = async searchTopic => {
  const book = await Sefaria.getIndexDetails(searchTopic.sourceKey);
  const primaryCategory = book.categories?.[0];
  const tocCategory = primaryCategory && Sefaria.toc.find(cat => cat.category === primaryCategory);
  const hydratedTopic = {
    ...searchTopic,
    title: book.title || searchTopic.title,
    heTitle: book.heTitle || searchTopic.heTitle,
    topicCat: primaryCategory || searchTopic.topicCat,
    heTopicCat: tocCategory?.heCategory || searchTopic.heTopicCat,
    url: searchTopic._directUrl || `/${(book.title || searchTopic.title).replace(/ /g, "_")}`,
  };
  if (book.enDesc || book.enShortDesc) {
    hydratedTopic.enDesc = book.enDesc || book.enShortDesc;
    hydratedTopic.heDesc = book.heDesc || book.heShortDesc;
  }
  return hydratedTopic;
};

const getHydratedTopicSearchTopic = async searchTopic => {
  const topic = await Sefaria.getTopic(searchTopic.sourceKey, {annotated: false});
  const hydratedTopic = {
    ...searchTopic,
    title: topic.primaryTitle?.en || searchTopic.title,
    heTitle: topic.primaryTitle?.he || searchTopic.heTitle,
  };
  if (topic.description?.en) {
    hydratedTopic.enDesc = topic.description.en;
    hydratedTopic.heDesc = topic.description.he;
  }
  return hydratedTopic;
};

const hydrateSearchTopic = searchTopic => searchTopic.sourceType === "ref" ?
  getHydratedBookSearchTopic(searchTopic) :
  getHydratedTopicSearchTopic(searchTopic);

async function mapWithConcurrency(items, concurrency, callback) {
  let nextIndex = 0;
  const workers = Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await callback(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
}

const dedupeSearchTopics = searchTopics => {
  const seen = new Set();
  return searchTopics.filter(searchTopic => {
    const key = `${searchTopic.sourceType}-${searchTopic.sourceKey || searchTopic.url || searchTopic.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

function SourceResults({ results, query }) {
  const mergedResults = Sefaria.search.mergeTextResultsVersions(results);
  return (
    <div className="searchPOCResults searchContent">
      {mergedResults.filter(result => !!result._source.version).map(result => (
        <SearchTextResult
          data={result}
          query={query}
          key={result._id}
        />
      ))}
    </div>
  );
}

const NameResults = ({ results }) => (
  <ul className="searchPOCResults">
    {results.map(searchTopic => (
      <li key={`${searchTopic.analyticCat}-${searchTopic.url}`} className="searchPOCResult">
        <SearchTopic topic={searchTopic} />
      </li>
    ))}
  </ul>
);

const AuthorResults = ({ results }) => <NameResults results={results} />;

const BookResults = ({ results }) => <NameResults results={results} />;

const TopicResults = ({ results }) => <NameResults results={results} />;

const tabs = [
  { id: "sources", title: { en: "Sources", he: "Sources" } },
  { id: "topics", title: { en: "Topics", he: "Topics" } },
  { id: "books", title: { en: "Books", he: "Books" } },
  { id: "authors", title: { en: "Authors", he: "Authors" } },
];

const renderTab = tab => (
  <div className={classNames({tab: 1, noselect: 1})}>
    <InterfaceText text={tab.title} />
  </div>
);

const emptyResults = {
  sources: [],
  topics: [],
  books: [],
  authors: [],
};

const emptyHydrationStatus = {
  topics: "idle",
  books: "idle",
  authors: "idle",
};

const hydratableTabs = new Set(Object.keys(emptyHydrationStatus));
const hydrationConcurrency = 4;

const SearchPOCPage = ({ searchQuery }) => {
  const [tab, setTab] = useState(tabs[0].id);
  const [results, setResults] = useState(emptyResults);
  const [hydrationStatus, setHydrationStatus] = useState(emptyHydrationStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const query = (searchQuery || "").trim();
  const activeQueryRef = useRef(query);
  const isMountedRef = useRef(true);
  activeQueryRef.current = query;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!query) {
      setResults(emptyResults);
      setHydrationStatus(emptyHydrationStatus);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    let isCurrent = true;
    let pendingRequests = 2;
    const finishLoading = () => {
      pendingRequests -= 1;
      if (isCurrent && pendingRequests === 0) {
        setIsLoading(false);
      }
    };

    setResults(emptyResults);
    setHydrationStatus(emptyHydrationStatus);
    setIsLoading(true);
    setHasError(false);

    const runningSourceQuery = fetchSources(query, {
      onSuccess: data => {
        if (isCurrent) {
          setResults(prevResults => ({
            ...prevResults,
            sources: data.hits?.hits || [],
          }));
        }
        finishLoading();
      },
      onError: () => {
        if (isCurrent) {
          setHasError(true);
        }
        finishLoading();
      },
    });

    fetchNameResults(query)
      .then(({ completionObjects, authorIndexes }) => {
        const authors = getSearchTopicsForNameResults(filterAuthors(completionObjects));
        const books = dedupeSearchTopics(getSearchTopicsForNameResults(filterBooks({ completionObjects, authorIndexes })));
        const topics = getSearchTopicsForNameResults(filterTopics(completionObjects));
        if (isCurrent) {
          setResults(prevResults => ({
            ...prevResults,
            authors,
            books,
            topics,
          }));
        }
      })
      .catch(() => {
        if (isCurrent) {
          setHasError(true);
        }
      })
      .finally(() => {
        finishLoading();
      });

    return () => {
      isCurrent = false;
      runningSourceQuery?.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!query || !hydratableTabs.has(tab) || hydrationStatus[tab] !== "idle" || results[tab].length === 0) {
      return;
    }

    const hydrationQuery = query;
    const isCurrent = () => isMountedRef.current && activeQueryRef.current === hydrationQuery;
    setHydrationStatus(prevStatus => ({
      ...prevStatus,
      [tab]: "loading",
    }));

    mapWithConcurrency(results[tab], hydrationConcurrency, async searchTopic => {
      try {
        const hydratedTopic = await hydrateSearchTopic(searchTopic);
        if (isCurrent()) {
          setResults(prevResults => ({
            ...prevResults,
            [tab]: prevResults[tab].map(currentTopic =>
              currentTopic.sourceKey === searchTopic.sourceKey && currentTopic.sourceType === searchTopic.sourceType ?
                hydratedTopic :
                currentTopic
            ),
          }));
        }
      } catch {
        // Keep the lightweight autocomplete result if detail hydration fails.
      }
    })
      .then(() => {
        if (isCurrent()) {
          setHydrationStatus(prevStatus => ({
            ...prevStatus,
            [tab]: "loaded",
          }));
        }
      })
      .catch(() => {
        if (isCurrent()) {
          setHydrationStatus(prevStatus => ({
            ...prevStatus,
            [tab]: "error",
          }));
        }
      });
  }, [query, tab, hydrationStatus, results]);

  return (
    <div className="readerNavMenu">
      <div className="content">
        <div className="contentInner">
          <h1 className="serif">
            <InterfaceText>Search POC</InterfaceText>
          </h1>
          <p className="sans-serif">
            {query ?
              <InterfaceText>{`Results for "${query}"`}</InterfaceText> :
              <InterfaceText>Enter a search query to see results.</InterfaceText>}
          </p>
          {hasError ? <LoadingMessage message="Search failed." heMessage="החיפוש נכשל." /> : null}
          {isLoading ? <LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." /> : null}
          {query ?
            <TabView
              tabs={tabs}
              currTabName={tab}
              setTab={setTab}
              renderTab={renderTab}
              containerClasses={"largeTabs"}>
              <SourceResults results={results.sources} query={query} />
              <TopicResults results={results.topics} />
              <BookResults results={results.books} />
              <AuthorResults results={results.authors} />
            </TabView> : null}
        </div>
      </div>
    </div>
  );
};

SearchPOCPage.propTypes = {
  searchQuery: PropTypes.string,
};

export default SearchPOCPage;
