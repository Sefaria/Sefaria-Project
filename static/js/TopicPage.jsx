import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
const PropTypes           = require('prop-types');
const classNames          = require('classnames');
const Sefaria             = require('./sefaria/sefaria');
const MobileHeader        = require('./MobileHeader');
const {
    SheetBlock,
    StorySheetList,
    SaveLine,
    StoryTitleBlock,
    ColorBarBox,
    StoryBodyBlock,
    StoryFrame,
    textPropType
}                         = require('./Story');
const {
  TabView,
  LoadingMessage,
  Link,
  TwoOrThreeBox,
  InterfaceTextWithFallback,
  FilterableList,
  ToolTipped,
}                         = require('./Misc');
const Footer              = require('./Footer');
const { useIncrementalLoad }   = require('./Hooks');



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
    Sefaria.getBulkSheets(inSheets.map(x => x.sid)).then(outSheets => {
    for (let tempSheet of inSheets) {
      if (outSheets[tempSheet.sid]) {
        outSheets[tempSheet.sid].order = tempSheet.order;
      }
    }
    return Object.values(outSheets);
  }
);

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


const TopicCategory = ({topic, setTopic, setNavTopic, interfaceLang, width, multiPanel, compare, hideNavHeader, contentLang, openDisplaySettings, openSearch, onClose}) => {
    const [topicData, setTopicData] = useState(false);   // For root topic
    const [subtopics, setSubtopics] = useState([]);

    useEffect(() => {
        Sefaria.getTopic(topic).then(setTopicData);
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
            <div className={contentClasses}>
                <div className="contentInner">
                    <TopicHeader topic={topic} topicData={topicData}
                      multiPanel={multiPanel} interfaceLang={interfaceLang} isCat
                      hideNavHeader={hideNavHeader}
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
  const { en, he } = !!topicData ? topicData.primaryTitle : {en: "Loading...", he: "טוען..."};
  const isTransliteration = !!topicData ? topicData.primaryTitleIsTransliteration : {en: false, he: false};
  const category = Sefaria.topicTocCategory(topicData.slug);
  return (
    <div>
        {hideNavHeader ? null : (<MobileHeader
          compare
          mode="mainTOC"
          onClose={onClose}
          interfaceLang={interfaceLang}
          openSearch={openSearch}
          openDisplaySettings={openDisplaySettings}
        />)}
        <div className="topicTitle pageTitle">
          <h1>
            <InterfaceTextWithFallback en={en} he={he} isItalics={false} />
          </h1>
        </div>
       {!topicData && !isCat ?<LoadingMessage/>:""}
       {!isCat && category?
           <div className="topicCategory sectionTitleText">
             <a href={`/topics/category/${category.slug}`} onClick={e=>{ e.preventDefault(); setNavTopic(category.slug, category); }}>
              <span className="int-en">{category.en}</span>
              <span className="int-he">{category.he}</span>
             </a>
           </div>
       :""}
       {topicData.description?
           <div className="topicDescription systemText">
              <span className="int-en">{topicData.description.en}</span>
              <span className="int-he">{topicData.description.he}</span>
            </div>
       :""}
       {topicData.ref?
         <a href={`/${topicData.ref.url}`} className="resourcesLink blue">
           <img src="/static/img/book-icon-black.svg" alt="Book Icon" />
           <span className="int-en">{ topicData.parasha ? Sefaria._('Read the Portion') : topicData.ref.en }</span>
           <span className="int-he">{ topicData.parasha ? Sefaria._('Read the Portion') : norm_hebrew_ref(topicData.ref.he) }</span>
         </a>
       :""}
    </div>
);}

const TopicPage = ({
  tab, topic, setTopic, setNavTopic, openTopics, interfaceLang, multiPanel,
  hideNavHeader, showBaseText, navHome, toggleSignUpModal, openDisplaySettings,
  updateTopicsTab, onClose, openSearch
}) => {
    const [topicData, setTopicData] = useState(false);
    const [topicRefs, setTopicRefs] = useState(false);
    const [topicSheets, setTopicSheets] = useState(false);
    const [sheetData, setSheetData] = useState(null);
    const [textData, setTextData] = useState(null);
    const [parashaData, setParashaData] = useState(null);
    const [showFilterHeader, setShowFilterHeader] = useState(false);
    const scrollableElement = useRef();
    let textCancel, sheetCancel;
    const clearAndSetTopic = (topic, topicTitle) => {setTopicData(false); setTopic(topic, topicTitle)};
    useEffect(() => {
      const { promise, cancel } = Sefaria.makeCancelable((async () => {
        const d = await Sefaria.getTopic(topic);
        if (d.parasha) { Sefaria.getParashaNextRead(d.parasha).then(setParashaData); }
        setTopicData(d);
        let refMap = {};
        for (let refObj of d.refs.filter(s => !s.is_sheet)) {
          refMap[refObj.ref] = {ref: refObj.ref, order: refObj.order, dataSources: refObj.dataSources};
        }
        const refs = Object.values(refMap);
        let sheetMap = {};
        for (let refObj of d.refs.filter(s => s.is_sheet)) {
          const sid = refObj.ref.replace('Sheet ', '');
          sheetMap[sid] = {sid, order: refObj.order};
        }
        const sheets = Object.values(sheetMap);
        setTopicRefs(refs);
        setTopicSheets(sheets);
      })());
      promise.catch((error) => { if (!error.isCanceled) { console.log('TopicPage Error', error); } });
      return () => {
        cancel();
        setTopicData(false);
        setTopicRefs(false);
        setTopicSheets(false);
      }
    }, [topic]);

    useIncrementalLoad(
      fetchBulkText,
      topicRefs,
      70,
      data => setTextData(prev => (!prev || data === false) ? data : [...prev, ...data]),
      topic
    );

    useIncrementalLoad(
      fetchBulkSheet,
      topicSheets,
      70,
      data => setSheetData(prev => (!prev || data === false) ? data : [...prev, ...data]),
      topic
    );

    const tabs = [];
    if (!!topicRefs.length) { tabs.push({text: Sefaria._("Sources"), id: 'sources'}); }
    if (!!topicSheets.length) { tabs.push({text: Sefaria._("Sheets"), id: 'sheets'}); }
    let onClickFilterIndex = 2;
    if (!!topicRefs.length || !!topicSheets.length) {
      tabs.push({text: Sefaria._("Filter"), icon: `/static/img/arrow-${showFilterHeader ? 'up' : 'down'}-bold.svg`, justifyright: true });
      onClickFilterIndex = tabs.length - 1;
    }
    let tabIndex = tabs.findIndex(t => t.id === tab);
    if (Array.isArray(topicSheets) && Array.isArray(topicSheets) && tabIndex == -1 && tabs.length > 0) {
      // check topicSheets isArray which means setTopicSheets() has run
      tabIndex = 0;
    }
    useEffect(() => {
      if (!!tabs[tabIndex]) {
        updateTopicsTab(tabs[tabIndex].id);
      }
    }, [tabIndex]);
    const classStr = classNames({topicPanel: 1, readerNavMenu: 1, noHeader: hideNavHeader });
    return <div className={classStr}>
        <div className="content hasFooter noOverflowX" ref={scrollableElement}>
            <div className="columnLayout">
               <div className="mainColumn storyFeedInner">
                    <TopicHeader topic={topic} topicData={topicData} multiPanel={multiPanel} interfaceLang={interfaceLang} setNavTopic={setNavTopic} onClose={onClose} openSearch={openSearch} openDisplaySettings={openDisplaySettings} hideNavHeader={hideNavHeader}/>
                   {!!topicData?
                       <TabView
                          currTabIndex={tabIndex}
                          setTab={(tabIndex, tempTabs) => { updateTopicsTab(tempTabs[tabIndex].id); }}
                          tabs={tabs}
                          renderTab={t => (
                            <div className={classNames({tab: 1, noselect: 1, filter: t.justifyright, open: t.justifyright && showFilterHeader})}>
                              {t.text}
                              { t.icon ? <img src={t.icon} alt={`${t.text} icon`} /> : null }
                            </div>
                          )}
                          onClickArray={{[onClickFilterIndex]: ()=>setShowFilterHeader(!showFilterHeader)}}
                        >
                          { !!topicRefs.length ? (
                            <TopicPageTab
                              scrollableElement={scrollableElement}
                              showFilterHeader={showFilterHeader}
                              data={textData}
                              sortOptions={['Relevance', 'Chronological']}
                              filterFunc={(currFilter, ref) => {
                                const n = text => !!text ? text.toLowerCase() : '';
                                currFilter = n(currFilter);
                                ref[1].categories = Sefaria.refCategories(ref[1].ref).join(" ");
                                for (let field of ['en', 'he', 'ref', 'categories']) {
                                  if (n(ref[1][field]).indexOf(currFilter) > -1) { return true; }
                                }
                              }}
                              sortFunc={refSort}
                              extraData={{ interfaceLang }}
                              renderItem={item=>(
                                <TextPassage
                                  key={item[0]}
                                  text={item[1]}
                                  toggleSignUpModal={toggleSignUpModal}
                                  topicTitle={topicData && topicData.primaryTitle}
                                  interfaceLang={interfaceLang}
                                />
                              )}
                              />
                            ) : null
                          }
                          { !!topicSheets.length ? (
                            <TopicPageTab
                              scrollableElement={scrollableElement}
                              showFilterHeader={showFilterHeader}
                              data={sheetData}
                              classes={"storySheetList"}
                              sortOptions={['Relevance', 'Views', 'Newest']}
                              filterFunc={(currFilter, sheet) => {
                                const n = text => !!text ? text.toLowerCase() : '';
                                currFilter = n(currFilter);
                                for (let field of ['sheet_title', 'publisher_name', 'publisher_position', 'publisher_organization']) {
                                  if (n(sheet[field]).indexOf(currFilter) > -1) { return true; }
                                }
                              }}
                              sortFunc={sheetSort}
                              extraData={{ interfaceLang }}
                              renderItem={item=>(
                                <SheetBlock key={item.sheet_id} sheet={item} compact toggleSignUpModal={toggleSignUpModal}/>
                              )}
                              />
                            ) : null
                          }
                        </TabView>
                   :""}
                </div>
                <div className="sideColumn">
                    <TopicSideColumn key={topic} slug={topic} links={topicData.links}
                      clearAndSetTopic={clearAndSetTopic} setNavTopic={setNavTopic}
                      parashaData={parashaData} tref={topicData.ref} interfaceLang={interfaceLang}
                    />
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
  showFilterHeader, scrollableElement
}) => {
  const getData = useCallback(() => Promise.resolve(data), [data]);
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
            extraData={extraData}
            getData={getData}
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
    <InterfaceTextWithFallback
      en={topicTitle.en}
      he={topicTitle.he}
      isItalics={false}
    />
  </Link>
);
TopicLink.propTypes = {
  topic: PropTypes.string.isRequired,
  clearAndSetTopic: PropTypes.func.isRequired,
  isTransliteration: PropTypes.object,
};


const TopicSideColumn = ({ slug, links, clearAndSetTopic, parashaData, tref, interfaceLang, setNavTopic }) => {
  const [showMoreMap, setShowMoreMap] = useState({});
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
      .map(({ title, pluralTitle, links }) => (
        <div key={title.en} className="link-section">
          <h2>
            <span className="int-en">{(links.length > 1 && pluralTitle) ? pluralTitle.en : title.en}</span>
            <span className="int-he">{(links.length > 1 && pluralTitle) ? pluralTitle.he :title.he}</span>
          </h2>
          <div className="sideList">
            {
              links
              .filter(l => l.shouldDisplay !== false)
              .sort((a, b) => {
                const shortLang = interfaceLang == 'hebrew' ? 'he' : 'en';
                if (!!a.title[shortLang] !== !!b.title[shortLang]) {
                  return (0+!!b.title[shortLang]) - (0+!!a.title[shortLang]);
                }
                if (!a.order && !b.order) { return 0; }
                if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
                return b.order.tfidf - a.order.tfidf;
              })
              .slice(0, showMoreMap[title.en] ? undefined : 10)
              .map(l =>
                TopicLink({
                  topic:l.topic, topicTitle: l.title,
                  onClick: l.isCategory ? setNavTopic : clearAndSetTopic,
                  isTransliteration: l.titleIsTransliteration,
                  isCategory: l.isCategory
                })
              )
            }
          </div>
          {
            links.filter(l=>l.shouldDisplay !== false).length > 10 ?
              (<div className="sideColumnMore" onClick={() => {
                setShowMoreMap({...showMoreMap, [title.en]: !showMoreMap[title.en]});
              }}>
                <span className='int-en'>{ showMoreMap[title.en] ? "Less" : "More" }</span>
                <span className='int-he'>{ showMoreMap[title.en] ? "פחות" : "עוד" }</span>
              </div>)
            : null
          }
        </div>
      ))
    : ""
  );
  return (
    <div>
      { readingsComponent }
      { linksComponent }
    </div>
  )
}
TopicSideColumn.propTypes = {
  topicData: PropTypes.object,
  clearAndSetTopic: PropTypes.func.isRequired,
};


const ReadingsComponent = ({ parashaData, tref }) => (
  <div className="readings link-section">
    <h2>
      <InterfaceTextWithFallback en={"Readings"} he={"פרשיות והפטרות"} />
    </h2>
    <span className="smallText parasha-date">
      <InterfaceTextWithFallback en={Sefaria.util.localeDate(parashaData.date)} he={Sefaria.util.localeDate(parashaData.date)} />
      <span className="separator">·</span>
      <InterfaceTextWithFallback {...parashaData.he_date} />
    </span>

    <div className="sectionTitleText"><InterfaceTextWithFallback en={"Torah"} he={"תורה"} /></div>
    <a href={'/' + tref.url} className="contentText"><InterfaceTextWithFallback en={tref.en} he={norm_hebrew_ref(tref.he)} /></a>
    <div className="sectionTitleText"><InterfaceTextWithFallback en={"Haftarah"} he={"הפטרה"} /></div>
    <div className="haftarot">
    {
      parashaData.haftarah.map(h => (
        <a href={'/' + h.url} className="contentText" key={h.url}>
          <InterfaceTextWithFallback en={h.displayValue.en} he={norm_hebrew_ref(h.displayValue.he)} />
        </a>
      ))
    }
    </div>
  </div>
);


module.exports.TopicPage = TopicPage;
module.exports.TopicCategory = TopicCategory;
