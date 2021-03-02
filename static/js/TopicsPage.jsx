import {
  IntText,
  NBox,
} from './Misc';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import MobileHeader from './MobileHeader';
import NavSidebar from './NavSidebar';
import Footer  from './Footer';
import Component from 'react-class';

// The root topics page listing topic categories to browse
const TopicsPage = ({setNavTopic, onClose, openNav, openSearch, openDisplaySettings,
        hideHeader, hideNavHeader, interfaceLang}) => {

  const initialWidth = hideNavHeader ? 1000 : 500; // Assume we're in a small panel if we're hiding the nav header
  const [width, setWidth] = useState(initialWidth);

  const ref = useRef(null);
  useEffect(() => {
    deriveAndSetWidth();
    window.addEventListener("resize", deriveAndSetWidth);
    return () => {
        window.removeEventListener("resize", deriveAndSetWidth);
    }
  }, []);

  const deriveAndSetWidth = () => setWidth(ref.current ? ref.current.offsetWidth : initialWidth);

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
          </div>
  });
  categoryListings = (<div className="readerNavCategories"><NBox content={categoryListings} n={2} /></div>);

  const topContent = hideNavHeader ? null :
    <MobileHeader
      mode={home ? 'home' : 'mainTOC'}
      navHome={navHome}
      interfaceLang={interfaceLang}
      openDisplaySettings={openDisplaySettings}
      onClose={onClose}
      openSearch={openSearch}
    />;

  const sidebarModules = [
    {type: "AboutTopics"},
    {type: "TrendingTopics", 
     props: {
        texts: ["Genesis", "Pirkei Avot", "Shabbat", "Pesach Haggadah", "Sefer HaChinukh"]
      }
    },
    {type: "GetTheApp"},
    {type: "SupportSefaria"},
  ];

  const classes = classNames({readerNavMenu:1, noHeader: !hideHeader, noLangToggleInHebrew: 1 });
  const contentClasses = classNames({content: 1, hasFooter: 1});

  return(<div ref={ref} className={classes} key="0">
          {topContent}
          <div className={contentClasses}>
            <div className="sidebarLayout">
              <div className="contentInner">
                <h1><IntText>Explore by Topic</IntText></h1>
                { categoryListings }
              </div>
              <NavSidebar modules={sidebarModules} />
            </div>
            <Footer />
          </div>
        </div>);
};


export default TopicsPage;