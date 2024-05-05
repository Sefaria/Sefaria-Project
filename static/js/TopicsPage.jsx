import {
    InterfaceText,
    ResponsiveNBox
} from './Misc';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import { NavSidebar, Modules } from './NavSidebar';
import Footer  from './Footer';
import {CategoryHeader} from "./Misc";
import Component from 'react-class';

// The root topics page listing topic categories to browse
const TopicsPage = ({setNavTopic, multiPanel, initialWidth}) => {
  let categoryListings = Sefaria.topic_toc.map(cat => {
    const openCat = e => {e.preventDefault(); setNavTopic(cat.slug, {en: cat.en, he: cat.he})};
    return (
      <div className="navBlock">
        <a href={`/topics/category/${cat.slug}`} className="navBlockTitle" onClick={openCat}>
          <InterfaceText text={cat} />
        </a>
        <div className="navBlockDescription">
          <InterfaceText text={cat.categoryDescription} />
        </div>
      </div>
    );
  });
  const letter = Sefaria.interfaceLang === "hebrew" ? "ཀ" : "a";
  categoryListings.push(
    <div className="navBlock">
      <a href={"/topics/all/" + letter} className="navBlockTitle">
        <InterfaceText>All Topics A-Z</InterfaceText>
      </a>
      <div className="navBlockDescription">
        <InterfaceText>Browse or search our complete list of topics.</InterfaceText>
      </div>
    </div>
  );
  categoryListings = (
    <div className="readerNavCategories">
      <ResponsiveNBox content={categoryListings} initialWidth={initialWidth} />
    </div>
  );

  const about = multiPanel ? null :
    <Modules type={"AboutTopics"} props={{hideTitle: true}} />;

  const sidebarModules = [
    multiPanel ? {type: "AboutTopics"} : {type: null},
    {type: "TrendingTopics"},
    {type: "JoinTheConversation"},
    {type: "GetTheApp"},
    {type: "SupportSefaria"},
  ];


  return (
    <div className="readerNavMenu noLangToggleInHebrew" key="0">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
              <div className="navTitle tight sans-serif">
                  <CategoryHeader type="topics" buttonsToDisplay={["subcategory", "reorder"]}>
                    <h1><InterfaceText>Explore by Topic</InterfaceText></h1>
                  </CategoryHeader>
              </div>
              { about }
              { categoryListings }
          </div>
          <NavSidebar modules={sidebarModules} />
        </div>
        <Footer />
      </div>
    </div>
  );
};


export default TopicsPage;