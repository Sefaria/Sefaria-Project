import React, { useState, useEffect, useCallback, useRef } from 'react';
const PropTypes           = require('prop-types');
const classNames          = require('classnames');
const Sefaria             = require('./sefaria/sefaria');
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
}                         = require('./Misc');
const Footer     = require('./Footer');

const norm_hebrew_ref = tref => tref.replace(/[׳״]/g, '');

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
    if (interfaceLang === 'english' && a.order.availableLangs.length !== b.order.availableLangs.length) {
      if (a.order.availableLangs.indexOf('en') > -1) { return -1; }
      if (b.order.availableLangs.indexOf('en') > -1) { return 1; }
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

const TopicCategory = ({topic, setTopic, setNavTopic, interfaceLang, width, multiPanel, compare, hideNavHeader, contentLang}) => {
    const [topicData, setTopicData] = useState(false);   // For root topic
    const [subtopics, setSubtopics] = useState([]);

    useEffect(() => {
        Sefaria.getTopic(topic).then(setTopicData);
    }, [topic]);

    useEffect(() => {
        setSubtopics(Sefaria.topicTocPage(topic));
    }, [topic]);


    let topicBlocks = subtopics.map((t,i) => {
      const openTopic = e => {
        e.preventDefault();
        t.children ? setNavTopic(t.slug) : setTopic(t.slug);
      };
      return <a href={`/topics/${t.children ? 'category/' : ''}${t.slug}`}
         onClick={openTopic}
         className="blockLink"
         key={i}>
          <span className='en'>{t.en}</span>
          <span className='he'>{t.he}</span>
      </a>
    });

    const footer         = compare ? null : <Footer />;
    const navMenuClasses = classNames({readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: hideNavHeader, noLangToggleInHebrew: 1});
    const contentClasses = classNames({content: 1, readerTocTopics:1, hasFooter: footer != null});
    return (
        <div className={navMenuClasses}>
            <div className={contentClasses}>
                <div className="contentInner">
                    <TopicHeader topic={topic} topicData={topicData} multiPanel={multiPanel} interfaceLang={interfaceLang}/>
                    <TwoOrThreeBox content={topicBlocks} width={width} />
                </div>
            </div>
        </div>
    );
};

const TopicHeader = ({topic, topicData, multiPanel, interfaceLang}) => {
  const { en, he } = !!topicData ? topicData.primaryTitle : {en: "Loading...", he: "טוען..."};
  const isTransliteration = !!topicData ? topicData.primaryTitleIsTransliteration : {en: false, he: false};
  const category = Sefaria.topicTocCategory(topicData.slug);
  return (
    <div>
        <div className="topicTitle pageTitle">
          <h1>
            <InterfaceTextWithFallback en={en} he={he} isItalics={isTransliteration} />
            { !! he ? <span className="topicTitleInHe"><span className="int-en but-text-is-he">{` (${he})`}</span></span> : null}

          </h1>
        </div>
       {!topicData?<LoadingMessage/>:""}
       {category?
           <div className="topicCategory sectionTitleText">
              <span className="int-en">{category.en}</span>
              <span className="int-he">{category.he}</span>
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
           <span className="int-en">{ topicData.ref.en }</span>
           <span className="int-he">{ norm_hebrew_ref(topicData.ref.he) }</span>
         </a>
       :""}
    </div>
);}

const TopicPage = ({topic, setTopic, openTopics, interfaceLang, multiPanel, hideNavHeader, showBaseText, navHome, toggleSignUpModal, openDisplaySettings}) => {
    const [topicData, setTopicData] = useState(false);
    const [topicRefs, setTopicRefs] = useState(false);
    const [topicSheets, setTopicSheets] = useState(false);
    const [sheetData, setSheetData] = useState(null);
    const [textData, setTextData] = useState(null);
    const [showFilterHeader, setShowFilterHeader] = useState(false);
    let textCancel, sheetCancel;
    const clearAndSetTopic = (topic) => {setTopicData(false); setTopic(topic)};
    useEffect(() => {
      const { promise, cancel } = Sefaria.makeCancelable((async () => {
        const d = await Sefaria.getTopic(topic);
        setTopicData(d);
        let refMap = {};
        for (let refObj of d.refs.filter(s => !s.is_sheet)) {
          refMap[refObj.ref] = {ref: refObj.ref, order: refObj.order, dataSource: refObj.dataSource};
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

        return Promise.all([
          Sefaria.incrementalPromise(
            inRefs => Sefaria.getBulkText(inRefs.map(x => x.ref), true, 500, 600).then(outRefs => {
              for (let tempRef of inRefs) {
                if (outRefs[tempRef.ref]) {
                  outRefs[tempRef.ref].order = tempRef.order;
                  outRefs[tempRef.ref].dataSource = tempRef.dataSource;
                }
              }
              return Object.entries(outRefs);
            }),
            refs, 100, setTextData, newCancel => { textCancel = newCancel; }
          ),
          Sefaria.incrementalPromise(
            inSheets => Sefaria.getBulkSheets(inSheets.map(x => x.sid)).then(outSheets => {
              for (let tempSheet of inSheets) {
                if (outSheets[tempSheet.sid]) {
                  outSheets[tempSheet.sid].order = tempSheet.order;
                }
              }
              return Object.values(outSheets)
            }),
            sheets, 100, (allSheets) => {
              const newAllSheets = [];
              const sheetIdMap = {};  // map id -> index in newAllSheets
              const allSheetsSorted = allSheets.sort((a, b) => sheetSort('Relevance', a, b, {}));
              // add all non-copied sheets
              for (let tempSheet of allSheetsSorted) {
                if (!tempSheet.sheet_via) {
                  tempSheet.copies = [];
                  newAllSheets.push(tempSheet);
                  sheetIdMap[tempSheet.sheet_id] = newAllSheets.length - 1;
                }
              }
              // aggregate copies to their parents
              for (let tempSheet of allSheetsSorted) {
                const ind = sheetIdMap[tempSheet.sheet_via];
                if (typeof ind != "undefined") { newAllSheets[ind].copies.push(tempSheet); }
              }
              setSheetData(newAllSheets);
            }, newCancel => { sheetCancel = newCancel; }
          ),
        ]);
      })());
      return () => {
        cancel();
        if (textCancel) { textCancel(); }
        if (sheetCancel) { sheetCancel(); }
        setTopicData(false);
        setTopicRefs(false);
        setTopicSheets(false);
        setSheetData(null);
        setTextData(null);
      }
    }, [topic]);
    const tabs = [];
    if (!!topicRefs.length) { tabs.push({text: Sefaria._("Sources")}); }
    if (!!topicSheets.length) { tabs.push({text: Sefaria._("Sheets")}); }
    let onClickFilterIndex = 2;
    if (!!topicRefs.length || !!topicSheets.length) {
      tabs.push({text: Sefaria._("Filter"), icon: "/static/img/controls.svg", justifyright: true });
      onClickFilterIndex = tabs.length - 1;
    }
    const classStr = classNames({topicPanel: 1, readerNavMenu: 1, noHeader: hideNavHeader });
    return <div className={classStr}>
        <div className="content hasFooter noOverflowX">
            <div className="columnLayout">
               <div className="mainColumn storyFeedInner">
                    <TopicHeader topic={topic} topicData={topicData} multiPanel={multiPanel} interfaceLang={interfaceLang}/>
                   {!!topicData?
                       <TabView
                          tabs={tabs}
                          renderTab={t => (
                            <div className={classNames({tab: 1, noselect: 1, filter: t.justifyright})}>
                              {t.text}
                              { t.icon ? <img src={t.icon} alt={`${t.text} icon`} /> : null }
                            </div>
                          )}
                          onClickArray={{[onClickFilterIndex]: ()=>setShowFilterHeader(!showFilterHeader)}}
                        >
                          { !!topicRefs.length ? (
                            <TopicPageTab
                              showFilterHeader={showFilterHeader}
                              data={textData}
                              sortOptions={['Relevance', 'Chronological']}
                              filterFunc={(currFilter, ref) => {
                                const n = text => !!text ? text.toLowerCase() : '';
                                currFilter = n(currFilter);
                                for (let field of ['en', 'he', 'ref']) {
                                  if (n(ref[1][field]).indexOf(currFilter) > -1) { return true; }
                                }
                              }}
                              sortFunc={refSort}
                              extraData={{ interfaceLang }}
                              renderItem={item=>(
                                <TextPassage key={item[0]} text={item[1]} toggleSignUpModal={toggleSignUpModal}/>
                              )}
                              />
                            ) : null
                          }
                          { !!topicSheets.length ? (
                            <TopicPageTab
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
                    <TopicSideColumn key={topic} links={topicData.links} clearAndSetTopic={clearAndSetTopic} />
                </div>
            </div>
          </div>
      </div>;
};

TopicPage.propTypes = {
  topic:               PropTypes.string.isRequired,
  setTopic:            PropTypes.func.isRequired,
  openTopics:          PropTypes.func.isRequired,
  interfaceLang:       PropTypes.string,
  multiPanel:          PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  showBaseText:        PropTypes.func,
  navHome:             PropTypes.func,
  openDisplaySettings: PropTypes.func,
  toggleSignUpModal:   PropTypes.func,
};

const TopicPageTab = ({ data, renderItem, classes, sortOptions, sortFunc, filterFunc, extraData, showFilterHeader }) => (
  <div className="story topicTabContents">
    {!!data ?
      <div className={classes}>
        <FilterableList
          showFilterHeader={showFilterHeader}
          filterFunc={filterFunc}
          sortFunc={sortFunc}
          renderItem={renderItem}
          renderEmptyList={()=>null}
          renderHeader={()=>null}
          sortOptions={sortOptions}
          extraData={extraData}
          getData={()=> Promise.resolve(data)}
        />
      </div> : <LoadingMessage />
    }
  </div>
);

const TextPassage = ({text, toggleSignUpModal}) => {
    if (!text.ref) { return null; }
    const url = "/" + Sefaria.normRef(text.ref);
    return <StoryFrame cls="textPassageStory">
        <SaveLine dref={text.ref} toggleSignUpModal={toggleSignUpModal} classes={"storyTitleWrapper"}>
            <StoryTitleBlock en={text.ref} he={norm_hebrew_ref(text.heRef)} url={url}/>
        </SaveLine>
        <ColorBarBox tref={text.ref}>
            <StoryBodyBlock en={text.en} he={text.he}/>
        </ColorBarBox>
        <div>{text.dataSource}</div>
    </StoryFrame>;
};
TextPassage.propTypes = {
  text: textPropType,
  toggleSignUpModal:  PropTypes.func
};

const TopicLink = ({topic, topicTitle, clearAndSetTopic, isTransliteration}) => {

  return (
    <Link className="relatedTopic" href={"/topics/" + topic} onClick={clearAndSetTopic.bind(null, topic)} key={topic} title={topicTitle.en}>
      <InterfaceTextWithFallback
        en={topicTitle.en}
        he={topicTitle.he}
        isItalics={isTransliteration}
      />
    </Link>
  );
};
TopicLink.propTypes = {
  topic: PropTypes.string.isRequired,
  clearAndSetTopic: PropTypes.func.isRequired,
  isTransliteration: PropTypes.object,
};

const TopicSideColumn = ({ links, clearAndSetTopic }) => {
  const [showMoreMap, setShowMoreMap] = useState({});
  return (
    links ?
      Object.values(links)
      .filter(linkType => !!linkType && linkType.shouldDisplay && linkType.links.length > 0)
      .sort((a, b) => {
        const aInd = a.title.en.indexOf('Related');
        const bInd = b.title.en.indexOf('Related');
        if (aInd > -1 && bInd > -1) { return 0; }
        if (aInd > -1) { return 1; }
        if (bInd > -1) { return -1; }
        //alphabetical by en just to keep order consistent
        return a.title.en.localeCompare(b.title.en);
      })
      .map(({ title, pluralTitle, links }) => (
        <div key={title.en}>
          <h2>
            <span className="int-en">{(links.length > 1 && pluralTitle) ? pluralTitle.en : title.en}</span>
            <span className="int-he">{(links.length > 1 && pluralTitle) ? pluralTitle.he :title.he}</span>
          </h2>
          <div className="sideList">
            {
              links
              .filter(l => l.shouldDisplay !== false)
              .sort((a, b) => {
                if (!a.order && !b.order) { return 0; }
                if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
                if (a.order.linksInCommon == b.order.linksInCommon) { return b.order.numSources - a.order.numSources; }
                return b.order.linksInCommon - a.order.linksInCommon;
              })
              .slice(0, showMoreMap[title.en] ? undefined : 10)
              .map(l =>
                TopicLink({
                  topic:l.topic, topicTitle: l.title, clearAndSetTopic, isTransliteration: l.titleIsTransliteration
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
}
TopicSideColumn.propTypes = {
  topicData: PropTypes.object,
  clearAndSetTopic: PropTypes.func.isRequired,
};


module.exports.TopicPage = TopicPage;
module.exports.TopicCategory = TopicCategory;
