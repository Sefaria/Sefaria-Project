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
      <div className='hide-on-mobile'>
      <a href={"/topics/all/" + letter} className="navBlockTitle">
        <InterfaceText>topic.a_to_z</InterfaceText>
      </a>
      </div>
      <div className="navBlockDescription hide-on-mobile">
        <InterfaceText>topic.browse_topic</InterfaceText>
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

  const TrendingTopicsBox = () => (
    <div className="trending-topics-box">
      <h2 className="box-title">Trending Topics</h2>
      <div className="topics-list">
        {Sefaria.trendingTopics.map((topic, i) => (
          <div className="topic-item" key={i}>
            <a href={`/topics/${topic.slug}`}>
              <span>{topic.en}</span>
            </a>
          </div>
        ))}
      </div>
    </div>
  );

  


  return (
    <div className="readerNavMenu noLangToggleInHebrew" key="0">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
              <div className='hide-on-desktop'>
                <TrendingTopicsBox />               
              </div>
              <div className="navTitle tight sans-serif">
                  <CategoryHeader type="topics" buttonsToDisplay={["subcategory", "reorder"]}>
                    <h1><InterfaceText>topic.expore</InterfaceText></h1><br></br>
                    <div className="navBlockDescription hide-on-desktop">
                      <InterfaceText>Selection of texts and user created source sheets about thousands of subjects</InterfaceText>
                    </div>
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