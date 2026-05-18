import React, {useState} from 'react';
import classNames from 'classnames';
import {InterfaceText, TabView} from './Misc';


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
