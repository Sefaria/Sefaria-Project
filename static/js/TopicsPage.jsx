import {
    InterfaceText,
    ResponsiveNBox
} from './Misc';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import { NavSidebar, SidebarModules } from './NavSidebar';
import {CategoryHeader} from "./Misc";
import Component from 'react-class';

// The root topics page listing topic categories to browse
const TopicsPage = ({setNavTopic, multiPanel, initialWidth}) => {
  let categoryListings = Sefaria.topic_toc.map(cat => {
  const openCat = e => {e.preventDefault(); setNavTopic(cat.slug, {en: cat.en, he: cat.he})};
  return (
      <div className="navBlock">
        <a
            href={`/topics/category/${cat.slug}`}
            className="navBlockTitle"
            onClick={openCat}
            data-anl-event="navto_topic:click"
            data-anl-link_type="category"
            data-anl-text={cat.en}
        >
          <InterfaceText text={cat} />
        </a>
        <div className="navBlockDescription">
          <InterfaceText text={cat.categoryDescription} />
        </div>
      </div>
    );
  });
  const letter = Sefaria.interfaceLang === "hebrew" ? "א" : "a";
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
    <SidebarModules type={"AboutTopics"} props={{hideTitle: true}} />;

  const sidebarModules = [
    {type: "TrendingTopics"},
    {type: "JoinTheDiscussion"},
  ];


  return (
    <div
        className="readerNavMenu noLangToggleInHebrew"
        key="0"
        data-anl-project="topics"
        data-anl-panel_category="NULL"
    >
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner" data-anl-feature_name="Main">
              <div className="navTitle tight sans-serif">
                  <CategoryHeader type="topics" toggleButtonIDs={["subcategory", "reorder"]}>
                    <h1><InterfaceText>Explore by Topic</InterfaceText></h1>
                  </CategoryHeader>
              </div>
              { about }
              { categoryListings }
          </div>
          <NavSidebar sidebarModules={sidebarModules} />
        </div>
      </div>
    </div>
  );
};


export default TopicsPage;