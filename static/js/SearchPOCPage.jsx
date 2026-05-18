<<<<<<< HEAD
import React, { useState, useEffect } from "react";
import { InterfaceText, TabView } from './Misc';
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

=======
import React, {useState} from 'react';
import classNames from 'classnames';
import {InterfaceText, TabView} from './Misc';
>>>>>>> 30fa65417639cee43057b21f4e636803a2a69032


const searchPOCData = {
  query: "Moses",
  sources: [
    { title: "Moses; A Human Life", subtitle: "Text", url: "Moses;_A_Human_Life" },
    { title: "Moses; A Human Life, 1 Identities", subtitle: "Text", url: "Moses;_A_Human_Life,_1_Identities" },
    { title: "Moses; A Human Life, Introduction", subtitle: "Text", url: "Moses;_A_Human_Life,_Introduction" },
  ],
  topics: [
    { title: "Moses", subtitle: "Person Topic", url: "topics/moses" },
    { title: "Moses' Staff", subtitle: "Topic", url: "topics/moses-staff" },
    { title: "Moses' Birth", subtitle: "Topic", url: "topics/moses-birth" },
    { title: "Moses' Signs", subtitle: "Topic", url: "topics/moses-signs" },
  ],
  books: [
    { title: "Moses; A Human Life", subtitle: "Text", url: "Moses;_A_Human_Life" },
  ],
  authors: [
    { title: "Moses ben Nachman (Ramban)", subtitle: "Author Topic", url: "topics/ramban" },
    { title: "Moses Chaim Luzzatto (Ramchal)", subtitle: "Author Topic", url: "topics/moses-chaim-luzzatto-(ramchal)" },
    { title: "Moses Sofer (Chatam Sofer)", subtitle: "Author Topic", url: "topics/moses-sofer" },
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
        <a href={`/${item.url}`}>
          <InterfaceText>{item.title}</InterfaceText>
        </a>
        <div className="resultMeta sans-serif">
          <InterfaceText>{item.subtitle}</InterfaceText>
        </div>
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
