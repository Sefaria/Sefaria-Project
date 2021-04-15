import {
  InterfaceText,
  ContentText,
  ResponsiveNBox,
} from './Misc';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import { NavSidebar } from './NavSidebar';
import Footer  from './Footer';
import Component from 'react-class';

// The root topics page listing topic categories to browse
const TopicsPage = ({setNavTopic, onClose, openNav, openSearch, openDisplaySettings,
        hideHeader, hideNavHeader, interfaceLang}) => {

  const initialWidth = hideNavHeader ? 1000 : 500; // Assume we're in a small panel if we're hiding the nav header

  const navHome = () => {
    setNavTopic("", null);
    openNav();
  };

  let categoryListings = Sefaria.topic_toc.map(cat => {
    const openCat = e => {e.preventDefault(); setNavTopic(cat.slug, {en: cat.en, he: cat.he})};
    return <div className="navBlock">
            <a href={`/topics/category/${cat.slug}`} className="navBlockTitle" onClick={openCat}>
              <span className="en">{cat.en}</span>
              <span className="he">{cat.he}</span>
            </a>
            <div className="navBlockDescription">
              <span className="en">{cat.categoryDescription.en}</span>
              <span className="he">{cat.categoryDescription.he}</span>
            </div>
          </div>;
  });
  categoryListings = (
    <div className="readerNavCategories">
      <ResponsiveNBox content={categoryListings} initialWidth={initialWidth} />
    </div>
  );

  const sidebarModules = [
    {type: "AboutTopics"},
    {type: "TrendingTopics"},
    {type: "JoinTheConversation"},
    {type: "GetTheApp"},
    {type: "SupportSefaria"},
  ];

  return (<div className="readerNavMenu noLangToggleInHebrew" key="0">
          {topContent}
          <div className="content">
            <div className="sidebarLayout">
              <div className="contentInner">
                <h1><InterfaceText>Explore by Topic</InterfaceText></h1>
                { categoryListings }
              </div>
              <NavSidebar modules={sidebarModules} />
            </div>
            <Footer />
          </div>
        </div>);
};


export default TopicsPage;