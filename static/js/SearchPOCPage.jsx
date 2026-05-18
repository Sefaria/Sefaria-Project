import React, { useState, useEffect } from "react";
import classNames from 'classnames';
import { InterfaceText, TabView } from './Misc';
import { SearchTopic } from './SearchResultList';
import Sefaria from "./sefaria/sefaria";
import SearchState from "./sefaria/searchState";


// --- Data fetching -----------------------------------------------------------

function fetchSources(query, { onSuccess, onError }) {
  const { field, fieldExact, sortType } = SearchState.metadataByType.text;
  Sefaria.search.execute_query({
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
    success: onSuccess,
    error: onError,
  });
}

async function fetchNameResults(query) {
  const res = await fetch(`/api/name/${encodeURIComponent(query)}?limit=20`);
  const data = await res.json();
  return data.completion_objects || [];
}

function filterAuthors(completionObjects) {
  return completionObjects.filter(o => o.type === "AuthorTopic");
}

function filterBooks(completionObjects) {
  return completionObjects.filter(o => o.type === "ref");
}

function filterTopics(completionObjects) {
  return completionObjects.filter(o => o.type === "Topic" || o.type === "PersonTopic");
}

// --- Renderers ---------------------------------------------------------------

function SourceResults({ results }) {
  // TODO: render source hits (result._source.ref, result.highlight, etc.)
  return <ul>{results.map(r => <li key={r._id}>{r._source?.ref}</li>)}</ul>;
}

function AuthorResults({ results }) {
  // TODO: render author cards
  return <ul>{results.map(r => <li key={r.key}>{r.title}</li>)}</ul>;
}

function BookResults({ results }) {
  // TODO: render book entries
  return <ul>{results.map(r => <li key={r.key}>{r.title}</li>)}</ul>;
}

function TopicResults({ results }) {
  // TODO: render topic chips/cards
  return <ul>{results.map(r => <li key={r.key}>{r.title}</li>)}</ul>;
}

const TABS = [
  { id: "sources", label: "Sources" },
  { id: "authors", label: "Authors" },
  { id: "books",   label: "Books"   },
  { id: "topics",  label: "Topics"  },
];


const searchPOCData = {
  query: "Moses",
  sources: [
    { title: "Moses; A Human Life", heTitle: "Moses; A Human Life", topicCat: "Text", heTopicCat: "Text", analyticCat: "text", url: "/Moses;_A_Human_Life" },
    { title: "Moses; A Human Life, 1 Identities", heTitle: "Moses; A Human Life, 1 Identities", topicCat: "Text", heTopicCat: "Text", analyticCat: "text", url: "/Moses;_A_Human_Life,_1_Identities" },
    { title: "Moses; A Human Life, Introduction", heTitle: "Moses; A Human Life, Introduction", topicCat: "Text", heTopicCat: "Text", analyticCat: "text", url: "/Moses;_A_Human_Life,_Introduction" },
  ],
  topics: [
    { title: "Moses", heTitle: "Moses", topicCat: "Person Topic", heTopicCat: "Person Topic", analyticCat: "topic", url: "/topics/moses", numSources: 12, numSheets: 8 },
    { title: "Moses' Staff", heTitle: "Moses' Staff", topicCat: "Topic", heTopicCat: "Topic", analyticCat: "topic", url: "/topics/moses-staff", numSources: 3, numSheets: 4 },
    { title: "Moses' Birth", heTitle: "Moses' Birth", topicCat: "Topic", heTopicCat: "Topic", analyticCat: "topic", url: "/topics/moses-birth", numSources: 5, numSheets: 2 },
    { title: "Moses' Signs", heTitle: "Moses' Signs", topicCat: "Topic", heTopicCat: "Topic", analyticCat: "topic", url: "/topics/moses-signs", numSources: 4, numSheets: 1 },
  ],
  books: [
    { title: "Moses; A Human Life", heTitle: "Moses; A Human Life", topicCat: "Text", heTopicCat: "Text", analyticCat: "text", url: "/Moses;_A_Human_Life" },
  ],
  authors: [
    { title: "Moses ben Nachman (Ramban)", heTitle: "Moses ben Nachman (Ramban)", topicCat: "Author Topic", heTopicCat: "Author Topic", analyticCat: "author", url: "/topics/ramban" },
    { title: "Moses Chaim Luzzatto (Ramchal)", heTitle: "Moses Chaim Luzzatto (Ramchal)", topicCat: "Author Topic", heTopicCat: "Author Topic", analyticCat: "author", url: "/topics/moses-chaim-luzzatto-(ramchal)" },
    { title: "Moses Sofer (Chatam Sofer)", heTitle: "Moses Sofer (Chatam Sofer)", topicCat: "Author Topic", heTopicCat: "Author Topic", analyticCat: "author", url: "/topics/moses-sofer" },
  ],
};

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

const SearchResultItems = ({items}) => (
  <ul className="searchPOCResults">
    {items.map(item => (
      <li key={`${item.title}-${item.url}`} className="searchPOCResult">
        <SearchTopic topic={item} />
      </li>
    ))}
  </ul>
);

const SearchPOCPage = () => {
  const [tab, setTab] = useState(tabs[0].id);

  return (
    <div className="readerNavMenu">
      <div className="content">
        <div className="contentInner">
          <h1 className="serif">
            <InterfaceText>Search POC</InterfaceText>
          </h1>
          <p className="sans-serif">
            <InterfaceText>{`Dummy results for "${searchPOCData.query}"`}</InterfaceText>
          </p>
          <TabView
            tabs={tabs}
            currTabName={tab}
            setTab={setTab}
            renderTab={renderTab}
            containerClasses={"largeTabs"}>
            <SearchResultItems items={searchPOCData.sources} />
            <SearchResultItems items={searchPOCData.topics} />
            <SearchResultItems items={searchPOCData.books} />
            <SearchResultItems items={searchPOCData.authors} />
          </TabView>
        </div>
      </div>
    </div>
  );
};

export default SearchPOCPage;
