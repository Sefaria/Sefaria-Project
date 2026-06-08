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

// Fetch entity results (topics / authors / books) from the new Elasticsearch
// `topic` and `book` indices via the POC endpoint. Unlike the autocompleter, these
// docs already carry titles, descriptions and numSources, so no hydration is needed.
async function fetchEntities(query, type) {
  const res = await fetch(`/api/search-poc?q=${encodeURIComponent(query)}&type=${type}`);
  if (!res.ok) {
    throw new Error("Entity search failed");
  }
  const data = await res.json();
  return (data.hits || []).map(hit => entityHitToSearchTopic(hit, type));
}

// Map a raw ES hit to the shape the SearchTopic renderer expects.
function entityHitToSearchTopic(hit, type) {
  const isBook = type === "book";
  let topicCat, heTopicCat;
  if (type === "author") {
    topicCat = "Authors";
    heTopicCat = Sefaria.hebrewTranslation("Authors");
  } else if (isBook) {
    // Label a single book with its own category and a category aggregation with its
    // parent category (both supplied by the backend); flat search hits carry a raw
    // `categories` path instead. Fall back to "Books" when nothing is available.
    const topCat = hit.categories?.[0];
    topicCat = hit.category_en || topCat || "Books";
    heTopicCat = hit.category_he || hit.category_en || topCat || "Books";
  } else {
    topicCat = "Topics";
    heTopicCat = Sefaria.hebrewTranslation("Topics");
  }

  const title = hit.title_en || hit.title_he || hit.slug || "";
  // Aggregated book entries carry their own url (which may be a category page rather
  // than a single ref); fall back to deriving one from the title for flat results.
  const url = hit.url || (isBook ? `/${title.replace(/ /g, "_")}` : `/topics/${hit.slug}`);

  const searchTopic = {
    analyticCat: topicCat,
    sourceKey: hit.slug || hit.title_en,
    sourceType: isBook ? "ref" : "topic",
    title,
    heTitle: hit.title_he || title,
    topicCat,
    heTopicCat,
    url,
    numSources: hit.numSources || 0,
    numSheets: 0,
  };
  if (hit.description_en || hit.description_he) {
    searchTopic.enDesc = hit.description_en || "";
    searchTopic.heDesc = hit.description_he || "";
  }
  return searchTopic;
}

// --- Renderers ---------------------------------------------------------------

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

const SearchPOCPage = ({ searchQuery }) => {
  const [tab, setTab] = useState(tabs[0].id);
  const [results, setResults] = useState(emptyResults);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const query = (searchQuery || "").trim();

  // Once the user clicks a tab, stop auto-switching for this query. Reset per query.
  const userPickedTab = useRef(false);

  useEffect(() => {
    if (!query) {
      setResults(emptyResults);
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
    setIsLoading(true);
    setHasError(false);
    setTab(tabs[0].id);
    userPickedTab.current = false;

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

    // Entity tabs (topics / authors / books) all come from the new ES indices.
    Promise.all([
      fetchEntities(query, "topic"),
      fetchEntities(query, "author"),
      fetchEntities(query, "book"),
    ])
      .then(([topics, authors, books]) => {
        if (isCurrent) {
          setResults(prevResults => ({
            ...prevResults,
            topics,
            authors,
            books,
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

  // When Sources comes back empty, fall through to the first tab that has
  // results. Only while we're still on the (default) Sources tab and the user
  // hasn't manually picked one — so this never overrides a deliberate click.
  useEffect(() => {
    if (isLoading || userPickedTab.current || tab !== "sources") { return; }
    if (results.sources.length > 0) { return; }
    const fallback = tabs.find(t => t.id !== "sources" && results[t.id]?.length > 0);
    if (fallback) { setTab(fallback.id); }
  }, [isLoading, results, tab]);

  const handleSetTab = nextTab => {
    userPickedTab.current = true;
    setTab(nextTab);
  };

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
              setTab={handleSetTab}
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
