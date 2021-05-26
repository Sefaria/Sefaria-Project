import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import MobileHeader from './MobileHeader';
import {
    SheetBlock,
    StorySheetList,
    SaveLine,
    StoryTitleBlock,
    ColorBarBox,
    StoryBodyBlock,
    StoryFrame,
    textPropType
} from './Story';
import {
  TabView,
  LoadingMessage,
  Link,
  TwoOrThreeBox,
  InterfaceText,
  FilterableList,
  ToolTipped,
  SimpleLinkedBlock,
} from './Misc';
import Footer from './Footer';
import { useIncrementalLoad } from './Hooks';

/*
*** Helper functions
*/


const norm_hebrew_ref = tref => tref.replace(/[׳״]/g, '');


const fetchBulkText = inRefs =>
  Sefaria.getBulkText(
    inRefs.map(x => x.ref),
    true, 500, 600
  ).then(outRefs => {
    for (let tempRef of inRefs) {
      // annotate outRefs with `order` and `dataSources` from `topicRefs`
      if (outRefs[tempRef.ref]) {
        outRefs[tempRef.ref].order = tempRef.order;
        outRefs[tempRef.ref].dataSources = tempRef.dataSources;
      }
    }
    return Object.entries(outRefs);
  }
);


const fetchBulkSheet = inSheets =>
    Sefaria.getBulkSheets(inSheets.map(x => x.ref)).then(outSheets => {
    for (let tempSheet of inSheets) {
      if (outSheets[tempSheet.sid]) {
        outSheets[tempSheet.sid].order = tempSheet.order;
      }
    }
    return Object.values(outSheets);
  }
);


const refFilter = (currFilter, ref) => {
  const n = text => !!text ? text.toLowerCase() : '';
  currFilter = n(currFilter);
  ref[1].categories = Sefaria.refCategories(ref[1].ref).join(" ");
  for (let field of ['en', 'he', 'ref', 'categories']) {
    if (n(ref[1][field]).indexOf(currFilter) > -1) { return true; }
  }
};


const sheetFilter = (currFilter, sheet) => {
  const n = text => !!text ? text.toLowerCase() : '';
  currFilter = n(currFilter);
  for (let field of ['sheet_title', 'publisher_name', 'publisher_position', 'publisher_organization']) {
    if (n(sheet[field]).indexOf(currFilter) > -1) { return true; }
  }
};


const refSort = (currSortOption, a, b, { interfaceLang }) => {
  a = a[1]; b = b[1];
  if (!a.order && !b.order) { return 0; }
  if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
  if (currSortOption === 'Chronological') {
    if (a.order.comp_date === b.order.comp_date) {
      if (a.order.order_id < b.order.order_id) { return -1; }
      if (b.order.order_id < a.order.order_id) { return 1; }
      return 0;
    }
    return a.order.comp_date - b.order.comp_date;
  }
  else {
    const aAvailLangs = a.order.availableLangs || [];
    const bAvailLangs = b.order.availableLangs || [];
    if (interfaceLang === 'english' && aAvailLangs.length !== bAvailLangs.length) {
      if (aAvailLangs.indexOf('en') > -1) { return -1; }
      if (bAvailLangs.indexOf('en') > -1) { return 1; }
      return 0;
    }
    else if (a.order.custom_order !== b.order.custom_order) { return b.order.custom_order - a.order.custom_order; }  // custom_order, when present, should trump other data
    else if (a.order.pr !== b.order.pr) { return b.order.pr - a.order.pr; }
    else { return (b.order.numDatasource * b.order.tfidf) - (a.order.numDatasource * a.order.tfidf); }
  }
};


const sheetSort = (currSortOption, a, b, { interfaceLang }) => {
  if (!a.order && !b.order) { return 0; }
  if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
  const aTLangHe = 0 + (a.order.titleLanguage === 'hebrew');
  const bTLangHe = 0 + (b.order.titleLanguage === 'hebrew');
  const aLangHe  = 0 + (a.order.language      === 'hebrew');
  const bLangHe  = 0 + (b.order.language      === 'hebrew');
  if (interfaceLang === 'hebrew' && (aTLangHe ^ bTLangHe || aLangHe ^ bLangHe)) {
    if (aTLangHe ^ bTLangHe && aLangHe ^ bLangHe) { return bTLangHe - aTLangHe; }  // title lang takes precedence over content lang
    return (bTLangHe + bLangHe) - (aTLangHe + aLangHe);
  } else if (interfaceLang === 'english' && (aTLangHe ^ bTLangHe || aLangHe ^ bLangHe)) {
    if (aTLangHe ^ bTLangHe && aLangHe ^ bLangHe) { return aTLangHe - bTLangHe; }  // title lang takes precedence over content lang
    return (aTLangHe + aLangHe) - (bTLangHe + bLangHe);
  }
  if (currSortOption === 'Views') {
    return b.order.views - a.order.views;
  } else if (currSortOption === 'Newest') {
    if (b.order.dateCreated < a.order.dateCreated) { return -1; }
    if (a.order.dateCreated < b.order.dateCreated) { return 1; }
  } else {
    // relevance
    if (b.order.relevance == a.order.relevance) { return b.order.views - a.order.views; }
    return (Math.log(b.order.views) * b.order.relevance) - (Math.log(a.order.views) * a.order.relevance);
  }
};


const refRenderWrapper = (toggleSignUpModal, topicData, interfaceLang) => item => (
  <TextPassage
    key={item[0]}
    text={item[1]}
    toggleSignUpModal={toggleSignUpModal}
    topicTitle={topicData && topicData.primaryTitle}
    interfaceLang={interfaceLang}
  />
);


const sheetRenderWrapper = (toggleSignUpModal) => item => (
  <SheetBlock key={item.sheet_id} sheet={item} compact toggleSignUpModal={toggleSignUpModal}/>
);


/*
*** Components
*/


const TopicCategory = ({topic, topicTitle, setTopic, setNavTopic, interfaceLang, width, multiPanel, compare, hideNavHeader, contentLang, openDisplaySettings, openSearch, onClose}) => {
    
    const [topicData, setTopicData] = useState(Sefaria.getTopicFromCache(topic) || {primaryTitle: topicTitle});
    const [subtopics, setSubtopics] = useState(Sefaria.topicTocPage(topic));

    useEffect(() => {
        Sefaria.getTopic(topic, {annotate_time_period: true}).then(setTopicData);
    }, [topic]);

    useEffect(() => {
        setSubtopics(Sefaria.topicTocPage(topic));
    }, [topic]);


    let topicBlocks = subtopics
      .filter(t => t.shouldDisplay !== false)
      .sort((a, b) => {
        // Don't use display order intended for top level a category level. Bandaid for unclear semantics on displayOrder.
        const [aDisplayOrder, bDisplayOrder] = [a, b].map(x => Sefaria.isTopicTopLevel(x.slug) ? 10000 : x.displayOrder);

        // Sort alphabetically according to interface lang in absense of display order
        if (aDisplayOrder === bDisplayOrder) {
          const stripInitialPunctuation = str => str.replace(/^["#]/, "");
          const [aAlpha, bAlpha] = [a, b].map(x => {
            if (interfaceLang === "hebrew") {
              return (x.he.length) ?
                stripInitialPunctuation(x.he) :
               "תתת" + stripInitialPunctuation(x.en);
            } else {
              return (x.en.length) ?
                stripInitialPunctuation(x.en) :
                stripInitialPunctuation(x.he)
            }
          });

          return aAlpha < bAlpha ? -1 : 1;
        }

        return aDisplayOrder - bDisplayOrder;

      })
      .map((t,i) => {
      const { slug, children, en, he } = t;
      const openTopic = e => {
        e.preventDefault();
        t.children ? setNavTopic(slug, {en, he}) : setTopic(slug, {en, he});
      };
      return <a href={`/topics/${children ? 'category/' : ''}${slug}`}
         onClick={openTopic}
         className="blockLink"
         key={i}>
          <span className='en'>{en || he}</span>
          <span className='he'>{he || en}</span>
      </a>
    });

    const footer         = compare ? null : <Footer />;
    const navMenuClasses = classNames({readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: hideNavHeader, noLangToggleInHebrew: 1});
    const contentClasses = classNames({content: 1, readerTocTopics:1, hasFooter: footer != null});
    return (
        <div className={navMenuClasses}>
            {hideNavHeader ? null : (<MobileHeader
              compare={compare}
              mode="mainTOC"
              onClose={onClose}
              interfaceLang={interfaceLang}
              openSearch={openSearch}
              openDisplaySettings={openDisplaySettings}
            />)}
            <div className={contentClasses}>
                <div className="contentInner">
                    <TopicHeader topic={topic} topicData={topicData}
                      multiPanel={multiPanel} interfaceLang={interfaceLang} isCat
                      openDisplaySettings={openDisplaySettings}
                      openSearch={openSearch}
                      onClose={onClose} />
                    <TwoOrThreeBox content={topicBlocks} width={width} />
                </div>
                {footer}
            </div>
        </div>
    );
};


const TopicHeader = ({
  topic, topicData, multiPanel, interfaceLang, isCat, setNavTopic, hideNavHeader,
  onClose, openDisplaySettings, openSearch
}) => {
  const { en, he } = !!topicData && topicData.primaryTitle ? topicData.primaryTitle : {en: "Loading...", he: "טוען..."};
  const isTransliteration = !!topicData ? topicData.primaryTitleIsTransliteration : {en: false, he: false};
  const category = !!topicData ? Sefaria.topicTocCategory(topicData.slug) : null;
  return (
    <div>
        <div className="topicTitle pageTitle">
          <h1>
            <InterfaceText text={{en:en, he:he}}/>
          </h1>
        </div>
       {!topicData && !isCat ?<LoadingMessage/> : null}
       {!isCat && category ?
           <div className="topicCategory sectionTitleText">
             <a href={`/topics/category/${category.slug}`} onClick={e=>{ e.preventDefault(); setNavTopic(category.slug, category); }}>
              <span className="int-en">{category.en}</span>
              <span className="int-he">{category.he}</span>
             </a>
           </div>
       : null}
       {topicData && topicData.description ?
           <div className="topicDescription systemText">
              <span className="int-en">{topicData.description.en}</span>
              <span className="int-he">{topicData.description.he}</span>
            </div>
       : null}
       {topicData && topicData.ref ?
         <a href={`/${topicData.ref.url}`} className="resourcesLink blue">
           <img src="/static/img/book-icon-black.svg" alt="Book Icon" />
           <span className="int-en">{ topicData.parasha ? Sefaria._('Read the Portion') : topicData.ref.en }</span>
           <span className="int-he">{ topicData.parasha ? Sefaria._('Read the Portion') : norm_hebrew_ref(topicData.ref.he) }</span>
         </a>
       : null}
       {topicData?.indexes?.length ?
        <div>
          <div className="sectionTitleText authorIndexTitle"><InterfaceText>Works on Sefaria</InterfaceText></div>
          <div className="authorIndexList">
            {topicData.indexes.map(({text, url}) => <SimpleLinkedBlock key={url} {...text} url={url} classes="authorIndex" />)}
          </div>
        </div>
       : null}
    </div>
);}


const TAB_DISPLAY_DATA = [
  {
    key: 'popular-writing-of',
    fetcher: fetchBulkText,
    sortOptions: ['Relevance', 'Chronological'],
    filterFunc: refFilter,
    sortFunc: refSort,
    renderWrapper: refRenderWrapper,
  },
  {
    key: 'sources',
    fetcher: fetchBulkText,
    sortOptions: ['Relevance', 'Chronological'],
    filterFunc: refFilter,
    sortFunc: refSort,
    renderWrapper: refRenderWrapper,
  },
  {
    key: 'sheets',
    fetcher: fetchBulkSheet,
    sortOptions: ['Relevance', 'Views', 'Newest'],
    filterFunc: sheetFilter,
    sortFunc: sheetSort,
    renderWrapper: sheetRenderWrapper,
  }
]; 
const TopicPage = ({
  tab, topic, topicTitle, setTopic, setNavTopic, openTopics, interfaceLang, multiPanel,
  hideNavHeader, showBaseText, navHome, toggleSignUpModal, openDisplaySettings,
  updateTopicsTab, onClose, openSearch
}) => {
    const defaultTopicData = {primaryTitle: topicTitle, tabs: {}, isLoading: true};
    const [topicData, setTopicData] = useState(Sefaria.getTopicFromCache(topic) || defaultTopicData);
    const [loadedData, setLoadedData] = useState(topicData ? Object.entries(topicData.tabs).reduce((obj, [key, tabObj]) => { obj[key] = tabObj.loadedData; return obj; }, {}) : {});
    const [refsToFetchByTab, setRefsToFetchByTab] = useState({});
    const [parashaData, setParashaData] = useState(null);
    const [showFilterHeader, setShowFilterHeader] = useState(false);
    const [extraData, setExtraData] = useState({ interfaceLang });
    useEffect(() => {
      setExtraData({ interfaceLang });
    }, [interfaceLang]);
    const scrollableElement = useRef();

    const clearAndSetTopic = (topic, topicTitle) => {setTopic(topic, topicTitle)};
    
    // Initial Topic Data, updates when `topic` changes
    useEffect(() => {
      setTopicData(defaultTopicData); // Ensures topicTitle displays while loading
      const { promise, cancel } = Sefaria.makeCancelable((async () => {
        const d = await Sefaria.getTopic(topic, {annotate_time_period: true});
        if (d.parasha) { Sefaria.getParashaNextRead(d.parasha).then(setParashaData); }
        setTopicData(d);
        // Data remaining to fetch that was not already in the cache
        for (let [tabKey, tabObj] of Object.entries(d.tabs)) {
          const refsWithoutData = tabObj.loadedData ? tabObj.refs.slice(tabObj.loadedData.length) : tabObj.refs;
          if (refsWithoutData.length)  {
            setRefsToFetchByTab(prev => ({...prev, [tabKey]: refsWithoutData}));
          } else {
            setLoadedData(prev => ({...prev, [tabKey]: tabObj.loadedData}));
          }
        }
      })());
      promise.catch((error) => { if (!error.isCanceled) { console.log('TopicPage Error', error); } });
      return () => {
        cancel();
        setTopicData(false);
        setLoadedData({});
        setRefsToFetchByTab({});
      }
    }, [topic]);

    // Set up tabs and register incremental load hooks
    const displayTabs = [];
    let onClickFilterIndex = 2;
    for (let tabObj of TAB_DISPLAY_DATA) {
      const { key } = tabObj;
      useIncrementalLoad(
        tabObj.fetcher,
        refsToFetchByTab[key] || false,
        70,
        data => setLoadedData(prev => {
          const updatedData = (!prev[key] || data === false) ? data : [...prev[key], ...data];
          if (topicData?.tabs?.[key]) { topicData.tabs[key].loadedData = updatedData; } // Persist loadedData in cache
          return {...prev, [key]: updatedData};
        }),
        topic
      );
      if (topicData?.tabs?.[key]) {
        displayTabs.push({
          title: topicData.tabs[key].title,
          id: key,
        });
      }
    }
    if (displayTabs.length) {
      displayTabs.push({
        title: {
          en: "Filter",
          he: Sefaria._("Filter")
        },
        id: 'filter',
        icon: `/static/img/arrow-${showFilterHeader ? 'up' : 'down'}-bold.svg`,
        justifyright: true
      });
      onClickFilterIndex = displayTabs.length - 1;      
    }
    let tabIndex = displayTabs.findIndex(t => t.id === tab);
    if (tabIndex == -1 && displayTabs.length > 0) {
      tabIndex = 0;
    }
    useEffect(() => {
      if (!!displayTabs[tabIndex]) {
        updateTopicsTab(displayTabs[tabIndex].id);
      }
    }, [tabIndex]);

    const classStr = classNames({topicPanel: 1, readerNavMenu: 1, noHeader: hideNavHeader });
    return <div className={classStr}>
        {hideNavHeader ? null : 
        (<MobileHeader
          compare={false}
          mode="mainTOC"
          onClose={onClose}
          interfaceLang={interfaceLang}
          openSearch={openSearch}
          openDisplaySettings={openDisplaySettings}
        />)}
        <div className="content hasFooter noOverflowX" ref={scrollableElement}>
            <div className="columnLayout">
               <div className="mainColumn storyFeedInner">
                    <TopicHeader topic={topic} topicData={topicData} multiPanel={multiPanel} interfaceLang={interfaceLang} setNavTopic={setNavTopic} onClose={onClose} openSearch={openSearch} openDisplaySettings={openDisplaySettings} />
                    {(!topicData.isLoading && displayTabs.length) ?
                       <TabView
                          currTabIndex={tabIndex}
                          setTab={(tabIndex, tempTabs) => { updateTopicsTab(tempTabs[tabIndex].id); }}
                          tabs={displayTabs}
                          renderTab={t => (
                            <div className={classNames({tab: 1, noselect: 1, filter: t.justifyright, open: t.justifyright && showFilterHeader})}>
                              <InterfaceText text={t.title} />
                              { t.icon ? <img src={t.icon} alt={`${t.title.en} icon`} /> : null }
                            </div>
                          )}
                          onClickArray={{[onClickFilterIndex]: ()=>setShowFilterHeader(!showFilterHeader)}}
                        >
                          {
                            TAB_DISPLAY_DATA.map(tabObj => {
                              const { key, sortOptions, filterFunc, sortFunc, renderWrapper } = tabObj;
                              const displayTab = displayTabs.find(x => x.id === key);
                              if (!displayTab) { return null; }
                              return (
                                <TopicPageTab
                                  key={key}
                                  scrollableElement={scrollableElement}
                                  showFilterHeader={showFilterHeader}
                                  data={loadedData[key]}
                                  sortOptions={sortOptions}
                                  filterFunc={filterFunc}
                                  sortFunc={sortFunc}
                                  onDisplayedDataChange={data => {
                                    if (!topicData._refsDisplayedByTab) { topicData._refsDisplayedByTab = {}; }
                                    topicData._refsDisplayedByTab[key] = data.length;
                                  }}
                                  initialRenderSize={(topicData._refsDisplayedByTab && topicData._refsDisplayedByTab[key]) || 0}
                                  extraData={extraData}
                                  renderItem={renderWrapper(toggleSignUpModal, topicData, interfaceLang)}
                                />
                              );
                            })
                          }
                        </TabView>
                    : (topicData.isLoading ? <LoadingMessage /> : null) }
                </div>
                <div className="sideColumn">
                    { topicData ?
                    <TopicSideColumn key={topic} slug={topic} links={topicData.links}
                      clearAndSetTopic={clearAndSetTopic} setNavTopic={setNavTopic}
                      parashaData={parashaData} tref={topicData.ref} interfaceLang={interfaceLang}
                      timePeriod={topicData.timePeriod} properties={topicData.properties}
                    />
                    : null }
                </div>
            </div>
            <Footer />
          </div>
      </div>;
};
TopicPage.propTypes = {
  tab:                 PropTypes.string.isRequired,
  topic:               PropTypes.string.isRequired,
  setTopic:            PropTypes.func.isRequired,
  setNavTopic:         PropTypes.func.isRequired,
  openTopics:          PropTypes.func.isRequired,
  updateTopicsTab:     PropTypes.func.isRequired,
  interfaceLang:       PropTypes.string,
  multiPanel:          PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  showBaseText:        PropTypes.func,
  navHome:             PropTypes.func,
  openDisplaySettings: PropTypes.func,
  toggleSignUpModal:   PropTypes.func,
};


const TopicPageTab = ({
  data, renderItem, classes, sortOptions, sortFunc, filterFunc, extraData,
  showFilterHeader, scrollableElement, onDisplayedDataChange, initialRenderSize
}) => {
  return (
    <div className="story topicTabContents">
      {!!data ?
        <div className={classes}>
          <FilterableList
            pageSize={20}
            bottomMargin={800}
            scrollableElement={scrollableElement}
            showFilterHeader={showFilterHeader}
            filterFunc={filterFunc}
            sortFunc={sortFunc}
            renderItem={renderItem}
            renderEmptyList={()=>null}
            renderHeader={()=>null}
            sortOptions={sortOptions}
            onDisplayedDataChange={onDisplayedDataChange}
            initialRenderSize={initialRenderSize}
            extraData={extraData}
            data={data}
          />
        </div> : <LoadingMessage />
      }
    </div>
  );
}


const TextPassage = ({text, toggleSignUpModal, topicTitle, interfaceLang}) => {
    if (!text.ref) { return null; }
    const url = "/" + Sefaria.normRef(text.ref);
    let dataSourceText = '';
    const langKey = interfaceLang === 'english' ? 'en' : 'he';
    if (!!text.dataSources && Object.values(text.dataSources).length > 0) {
      dataSourceText = `${Sefaria._('This source is connected to ')}"${topicTitle && topicTitle[langKey]}" ${Sefaria._('by')} ${Object.values(text.dataSources).map(d => d[langKey]).join(' & ')}.`;
    }
    return <StoryFrame cls="textPassageStory">
        <SaveLine dref={text.ref} toggleSignUpModal={toggleSignUpModal} classes={"storyTitleWrapper"}
          afterChildren={(
            <ToolTipped altText={dataSourceText} classes={"saveButton tooltip-toggle three-dots-button"}>
              <img src="/static/img/three-dots.svg" alt={dataSourceText}/>
            </ToolTipped>
          )}
        >
            <StoryTitleBlock en={text.ref} he={norm_hebrew_ref(text.heRef)} url={url}/>
        </SaveLine>
        <ColorBarBox tref={text.ref}>
            <StoryBodyBlock en={text.en} he={text.he}/>
        </ColorBarBox>
    </StoryFrame>;
};
TextPassage.propTypes = {
  text: textPropType,
  toggleSignUpModal:  PropTypes.func
};


const TopicLink = ({topic, topicTitle, onClick, isTransliteration, isCategory}) => (
  <Link className="relatedTopic" href={`/topics/${isCategory ? 'category/' : ''}${topic}`}
    onClick={onClick.bind(null, topic, topicTitle)} key={topic}
    title={topicTitle.en}
  >
    <InterfaceText text={{en:topicTitle.en, he:topicTitle.he}}/>
  </Link>
);
TopicLink.propTypes = {
  topic: PropTypes.string.isRequired,
  clearAndSetTopic: PropTypes.func.isRequired,
  isTransliteration: PropTypes.object,
};


const TopicSideColumn = ({ slug, links, clearAndSetTopic, parashaData, tref, interfaceLang, setNavTopic, timePeriod, properties }) => {
  const category = Sefaria.topicTocCategory(slug);
  const linkTypeArray = links ? Object.values(links).filter(linkType => !!linkType && linkType.shouldDisplay && linkType.links.filter(l => l.shouldDisplay !== false).length > 0) : [];
  if (linkTypeArray.length === 0) {
    linkTypeArray.push({
      title: {
        en: !category ? 'Explore Topics' : category.en,
        he: !category ?  'נושאים כלליים' : category.he,
      },
      links: Sefaria.topicTocPage(category && category.slug).slice(0, 20).map(({slug, en, he}) => ({
        topic: slug,
        title: {en, he},
        isCategory: !category,
      })),
    })
  }
  const readingsComponent = (parashaData && tref) ? (
    <ReadingsComponent parashaData={parashaData} tref={tref} />
  ) : null;
  const topicMetaData = <TopicMetaData timePeriod={timePeriod} properties={properties} />;
  const linksComponent = (
    links ?
        linkTypeArray.sort((a, b) => {
        const aInd = a.title.en.indexOf('Related');
        const bInd = b.title.en.indexOf('Related');
        if (aInd > -1 && bInd > -1) { return 0; }
        if (aInd > -1) { return -1; }
        if (bInd > -1) { return 1; }
        //alphabetical by en just to keep order consistent
        return a.title.en.localeCompare(b.title.en);
      })
      .map(({ title, pluralTitle, links }) => {
        const linksToDisplay = links.filter(l => l.shouldDisplay !== false);
        const hasPlural = linksToDisplay.length > 1 && pluralTitle;
        const pluralizedTitle = {
          en: hasPlural ? pluralTitle.en : title.en,
          he: hasPlural ? pluralTitle.he : title.he,
        };
        const hasMore = linksToDisplay.length > 10;
        return (
          <TopicSideSection key={title.en+title.he} title={pluralizedTitle} hasMore={hasMore}>
            {
              linksToDisplay
              .sort((a, b) => {
                const shortLang = interfaceLang == 'hebrew' ? 'he' : 'en';
                if (!!a.title[shortLang] !== !!b.title[shortLang]) {
                  return (0+!!b.title[shortLang]) - (0+!!a.title[shortLang]);
                }
                if (!a.order && !b.order) { return 0; }
                if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
                return b.order.tfidf - a.order.tfidf;
              })
              .map(l =>
                TopicLink({
                  topic:l.topic, topicTitle: l.title,
                  onClick: l.isCategory ? setNavTopic : clearAndSetTopic,
                  isTransliteration: l.titleIsTransliteration,
                  isCategory: l.isCategory
                })
              )
            }
          </TopicSideSection>
        );
      })
    : null
  );
  return (
    <div>
      { readingsComponent }
      { topicMetaData }
      { linksComponent }
    </div>
  )
}
TopicSideColumn.propTypes = {
  topicData: PropTypes.object,
  clearAndSetTopic: PropTypes.func.isRequired,
};


const TopicSideSection = ({ title, children, hasMore }) => {
  const [showMore, setShowMore] = useState(false);
  return (
    <div key={title.en} className="link-section">
      <h2>
        <span className="int-en">{title.en}</span>
        <span className="int-he">{title.he}</span>
      </h2>
      <div className="sideList">
        { React.Children.toArray(children).slice(0, showMore ? undefined : 10) }
      </div>
      {
        hasMore ?
        (
          <div className="sideColumnMore sans-serif" onClick={() => setShowMore(!showMore)}>
            <InterfaceText>{ showMore ? "Less" : "More" }</InterfaceText>
          </div>
        )
        : null
      }
    </div>
  );
}

const ReadingsComponent = ({ parashaData, tref }) => (
  <div className="readings link-section">
    <h2>
      <InterfaceText text={{en:"Readings", he:"פרשיות והפטרות"}}  />
    </h2>
    <span className="smallText parasha-date">
      <InterfaceText text={{en:Sefaria.util.localeDate(parashaData.date), he:Sefaria.util.localeDate(parashaData.date)}} />
      <span className="separator">·</span>
      <InterfaceText text={parashaData.he_date} />
    </span>

    <div className="sectionTitleText"><InterfaceText text={{en:"Torah", he:"תורה"}} /></div>
    <a href={'/' + tref.url} className="contentText"><InterfaceText text={{en:tref.en, he:norm_hebrew_ref(tref.he)}} /></a>
    <div className="sectionTitleText"><InterfaceText text={{en:"Haftarah", he:"הפטרה"}}/></div>
    <div className="haftarot">
    {
      parashaData.haftarah.map(h => (
        <a href={'/' + h.url} className="contentText" key={h.url}>
          <InterfaceText text={{en:h.displayValue.en, he:norm_hebrew_ref(h.displayValue.he)}} />
        </a>
      ))
    }
    </div>
  </div>
);


const TopicMetaData = ({ timePeriod, properties={} }) => {
  const tpSection = !!timePeriod ? (
    <TopicSideSection title={{en: "Lived", he: "תקופת פעילות"}}>
      <div className="systemText topicMetaData"><InterfaceText text={timePeriod.name} /></div>
      <div className="systemText topicMetaData"><InterfaceText text={timePeriod.yearRange} /></div>
    </TopicSideSection>
  ) : null;
  const propValues = [
    {
      url: {
        en: (properties['enWikiLink'] || {})['value'],
        he: (properties['heWikiLink'] || {})['value'],
      },
      title: 'Wikipedia',
    },
    {
      url: {
        en: (properties['jeLink'] || {})['value'],
        he: (properties['jeLink'] || {})['value'],
      },
      title: 'Jewish Encyclopedia',
    }
  ];
  const hasProps = propValues.reduce((accum, curr) => accum || curr.url.en || curr.url.he, false);
  const propsSection = hasProps ? (
    <TopicSideSection title={{en: "Learn More", he: "לקריאה נוספת"}}>
      {
        propValues.map(propObj => {
          const url = Sefaria.interfaceLang === "hebrew" ? (propObj.url.he || propObj.url.en) : (propObj.url.en || propObj.url.he);
          if (!url) { return null; }
          return (
            <SimpleLinkedBlock
              key={url} en={propObj.title} he={Sefaria._(propObj.title)}
              url={url} aclasses={"systemText topicMetaData"} openInNewTab
            />
          );
        })
      }
    </TopicSideSection>
  ) : null;
  return (
    <>
      { tpSection }
      { propsSection }
    </>
  );
};

export {
  TopicPage,
  TopicCategory
}