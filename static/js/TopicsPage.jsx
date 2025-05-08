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
import { TopicTOCCard } from "./common/TopicTOCCard";
import {Card} from "./common/Card";

// The root topics page listing topic categories to browse
const TopicsPage = ({setNavTopic, multiPanel}) => {
  let categoryListings = Sefaria.topic_toc.map((topic, i) => <TopicTOCCard topic={topic} setNavTopic={setNavTopic} key={i}/>);
  const letter = Sefaria.interfaceLang === "hebrew" ? "א" : "a";
  const description = {"en": "Browse or search our complete list of topics.", "he": Sefaria._("Browse or search our complete list of topics.")};
  const topicsA_Z = <Card cardTitleHref={`/topics/all/${letter}`}
                                     cardTitle={{"en": "All Topics A-Z", "he": Sefaria._("All Topics A-Z")}}
                                     cardText={description}
                                     analyticsEventName="navto_topic:click"
                                     analyticsLinkType={"topic"}
                                     oncardTitleClick={()=>{}}/>;
  categoryListings.push(topicsA_Z);

  const about = multiPanel ? null :
    <SidebarModules type={"AboutTopics"} props={{hideTitle: true}} />;

  const sidebarModules = [
    {type: "TrendingTopics"},
    {type: "JoinTheConversation"},
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
              { <div class="TOCCardsWrapper table">{categoryListings}</div> }
          </div>
          <NavSidebar sidebarModules={sidebarModules} />
        </div>
      </div>
    </div>
  );
};


export default TopicsPage;