import React, { useState, useEffect } from "react";
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { InterfaceText, LoadingMessage, TabView } from './Misc';
import SearchTextResult from './SearchTextResult';
import { SearchTopic } from './SearchResultList';
import Sefaria from "./sefaria/sefaria";
import SearchState from "./sefaria/searchState";
import classNames from "classnames";


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
  const res = await fetch(`/api/name/${encodeURIComponent(query)}?limit=50`);
  if (!res.ok) {
    throw new Error("Name lookup failed");
  }
  const data = await res.json();
  console.log("fetchNameResults raw response", data);
  const completionObjects = data.completion_objects || [];
  console.log("fetchNameResults completion_objects", completionObjects);
  return completionObjects;
}

function filterAuthors(completionObjects) {
  const results = completionObjects.filter(o => o.type === "AuthorTopic");
  console.log("filterAuthors", results);
  return results;
}

function filterBooks(completionObjects) {
  const results = completionObjects.filter(o => o.type === "ref");
  console.log("filterBooks", results);
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

const getBookSearchTopic = async (item) => {
  const book = await Sefaria.getIndexDetails(item.key);
  const primaryCategory = book.categories?.[0];
  const tocCategory = primaryCategory && Sefaria.toc.find(cat => cat.category === primaryCategory);
  const searchTopic = {
    analyticCat: "Book",
    title: book.title,
    heTitle: book.heTitle,
    topicCat: primaryCategory || "Books",
    heTopicCat: tocCategory?.heCategory || Sefaria.hebrewTranslation("Books"),
    url: `/${book.title.replace(/ /g, "_")}`,
    numSources: 0,
    numSheets: 0,
  };
  if (book.enDesc || book.enShortDesc) {
    searchTopic.enDesc = book.enDesc || book.enShortDesc;
    searchTopic.heDesc = book.heDesc || book.heShortDesc;
  }
  return searchTopic;
};

const getTopicSearchTopic = async (item) => {
  const topic = await Sefaria.getTopic(item.key, {annotated: false});
  const category = getSearchTopicCategory(item);
  const searchTopic = {
    analyticCat: category.en,
    title: topic.primaryTitle?.en || item.title,
    heTitle: topic.primaryTitle?.he || item.heTitle || item.title,
    topicCat: category.en,
    heTopicCat: category.he,
    url: getURLForNameResult(item),
    numSources: topic.tabs?.sources?.refs?.length || 0,
    numSheets: topic.tabs?.sheets?.refs?.length || 0,
  };
  if (topic.description?.en) {
    searchTopic.enDesc = topic.description.en;
    searchTopic.heDesc = topic.description.he;
  }
  return searchTopic;
};

const getSearchTopicForNameResult = async (item) => {
  if (item.type === "ref") {
    return getBookSearchTopic(item);
  }
  return getTopicSearchTopic(item);
};

const getSearchTopicsForNameResults = results => Promise.all(
  results.map(item => getSearchTopicForNameResult(item).catch(() => {
    const category = getSearchTopicCategory(item);
    return {
      analyticCat: category.en,
      title: item.title,
      heTitle: item.heTitle || item.title,
      topicCat: category.en,
      heTopicCat: category.he,
      url: getURLForNameResult(item),
      numSources: 0,
      numSheets: 0,
    };
  }))
);

const dedupeSearchTopics = searchTopics => {
  const seen = new Set();
  return searchTopics.filter(searchTopic => {
    const key = searchTopic.url || searchTopic.title;
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
    <div className="searchPOCResults">
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
      .then(async completionObjects => {
        const [authors, rawBooks, topics] = await Promise.all([
          getSearchTopicsForNameResults(filterAuthors(completionObjects)),
          getSearchTopicsForNameResults(filterBooks(completionObjects)),
          getSearchTopicsForNameResults(filterTopics(completionObjects)),
        ]);
        const books = dedupeSearchTopics(rawBooks);
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
    const query = "mos";
    fetchSources(query, {
      onSuccess: data => {},
      onError: err => console.error("fetchSources error", err),
    });
    fetchNameResults(query).then(completionObjects => {
      filterAuthors(completionObjects);
      filterBooks(completionObjects);
      filterTopics(completionObjects);
    });
  }, []);

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
