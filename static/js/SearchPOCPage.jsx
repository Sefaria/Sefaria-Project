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



const SearchPOCPage = () => {
  return (
    <div className="readerNavMenu">
      <div className="content">
        <div className="contentInner">
          <h1 className="serif">
            <InterfaceText>Search POC</InterfaceText>
          </h1>
        </div>
      </div>
    </div>
  );
};

export default SearchPOCPage;
