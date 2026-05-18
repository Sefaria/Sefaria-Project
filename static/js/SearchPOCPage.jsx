import React, {useState} from 'react';
import classNames from 'classnames';
import {InterfaceText, TabView} from './Misc';


const searchPOCData = {
  query: "Esther",
  sources: [
    { title: "Esther", subtitle: "Book", url: "Esther" },
    { title: "Esther Rabbah", subtitle: "Text", url: "Esther_Rabbah" },
    { title: "Esther Rabbah, Petichta", subtitle: "Text", url: "Esther_Rabbah,_Petichta" },
  ],
  topics: [
    { title: "Esther", subtitle: "Person Topic", url: "topics/esther" },
  ],
  books: [
    { title: "Esther", subtitle: "Chapter, Verse", url: "Esther" },
  ],
  authors: [
    { title: "Esther Soban-Hendler", subtitle: "User", url: "profile/esther-soban-hendler" },
    { title: "Esther Brass-Chorin", subtitle: "User", url: "profile/esther-brass-chorin" },
    { title: "Esther Silberstein", subtitle: "User", url: "profile/esther-silberstein" },
    { title: "Esther Azar", subtitle: "User", url: "profile/esther-azar" },
    { title: "Esther Amster", subtitle: "User", url: "profile/esther-amster" },
    { title: "Esther Hugenholtz", subtitle: "User", url: "profile/esther-hugenholtz" },
    { title: "Esther Hecht", subtitle: "User", url: "profile/esther-hecht" },
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
