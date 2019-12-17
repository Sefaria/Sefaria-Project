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



const TopicCategory = ({topic, setTopic, interfaceLang, width, multiPanel, compare, hideNavHeader, contentLang}) => {
    const [topicData, setTopicData] = useState(false);   // For root topic
    const [subtopics, setSubtopics] = useState([]);

    useEffect(() => {
        Sefaria.getTopic(topic).then(setTopicData);
    }, [topic]);

    useEffect(() => {
        setSubtopics(Sefaria.topicTocPage(topic));
    }, [topic]);


    let topicBlocks = subtopics.map((t,i) => {
      const openTopic = e => { e.preventDefault(); setTopic(t.slug) };
      return <a href={"/topics/" + t.slug}
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

  return (
    <div>
        <div className="topicTitle pageTitle">
          <h1>
            <InterfaceTextWithFallback en={en} he={he} />
            { !! he ? <span className="topicTitleInHe"><span className="int-en but-text-is-he">{` (${he})`}</span></span> : null}

          </h1>
        </div>
       {!topicData?<LoadingMessage/>:""}
       {topicData.category?
           <div className="topicCategory sectionTitleText">
              <span className="int-en">{topicData.category}</span>
              <span className="int-he">{Sefaria.hebrewTerm(topicData.category)}</span>
            </div>
       :""}
       {topicData.description?
           <div className="topicDescription systemText">
              <span className="int-en">{topicData.description.en}</span>
              <span className="int-he">{topicData.description.he}</span>
            </div>
       :""}
    </div>
);}

const TopicPage = ({topic, setTopic, openTopics, interfaceLang, multiPanel, hideNavHeader, showBaseText, navHome, toggleSignUpModal, openDisplaySettings}) => {
    const [topicData, setTopicData] = useState(false);
    const [topicRefs, setTopicRefs] = useState(false);
    const [topicSheets, setTopicSheets] = useState(false);
    const [sheetData, setSheetData] = useState(null);
    const [textData, setTextData] = useState(null);
    let textCancel, sheetCancel;
    const clearAndSetTopic = (topic) => {setTopicData(false); setTopic(topic)};
    useEffect(() => {
      const { promise, cancel } = Sefaria.makeCancelable((async () => {
        const d = await Sefaria.getTopic(topic);
        setTopicData(d);
        let refMap = {};
        for (let refObj of d.refs.filter(s => !s.is_sheet)) {
          refMap[refObj.ref] = {ref: refObj.ref, order: refObj.order};
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
            inRefs => Sefaria.getBulkText(inRefs.map(x => x.ref), true).then(outRefs => {
              for (let tempRef of inRefs) {
                if (outRefs[tempRef.ref]) {
                  outRefs[tempRef.ref].order = tempRef.order;
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
            sheets, 100, setSheetData, newCancel => { sheetCancel = newCancel; }
          ),
        ]);
      })());
      ;
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
    if (!!topicSheets.length) { tabs.push({text: Sefaria._("Sheets")}); }
    if (!!topicRefs.length) { tabs.push({text: Sefaria._("Sources")}); }
    console.log(topicSheets);
    const classStr = classNames({topicPanel: 1, readerNavMenu: 1, noHeader: hideNavHeader });
    return <div className={classStr}>
        <div className="content hasFooter noOverflowX">
            <div className="columnLayout">
               <div className="mainColumn">
                    <TopicHeader topic={topic} topicData={topicData} multiPanel={multiPanel} interfaceLang={interfaceLang}/>
                   {!!topicData?
                       <TabView
                          tabs={tabs}
                          renderTab={t => <div className="tab">{t.text}</div>}
                        >
                          { !!topicSheets.length ? (
                            <TopicPageTab
                              data={sheetData}
                              classes={"storySheetList"}
                              sortOptions={['Views']}
                              filterFunc={(currFilter, sheet) => {
                                const n = text => !!text ? text.toLowerCase() : '';
                                currFilter = n(currFilter);
                                for (let field of ['sheet_title', 'publisher_name', 'publisher_position', 'publisher_organization']) {
                                  if (n(sheet[field]).indexOf(currFilter) > -1) { return true; }
                                }
                              }}
                              sortFunc={(currSortOption, a, b) => {
                                if (!a.order && !b.order) { return 0; }
                                if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
                                return b.order.views - b.order.views;
                              }}
                              renderItem={item=>(
                                <SheetBlock key={item.sheet_id} sheet={item} compact toggleSignUpModal={toggleSignUpModal}/>
                              )}
                              />
                            ) : null
                          }
                          { !!topicRefs.length ? (
                            <TopicPageTab
                              data={textData}
                              sortOptions={['Relevance', 'Chronological']}
                              filterFunc={(currFilter, ref) => {
                                const n = text => !!text ? text.toLowerCase() : '';
                                currFilter = n(currFilter);
                                for (let field of ['en', 'he', 'ref']) {
                                  if (n(ref[1][field]).indexOf(currFilter) > -1) { return true; }
                                }
                              }}
                              sortFunc={(currSortOption, a, b) => {
                                a = a[1]; b = b[1];
                                if (!a.order && !b.order) { return 0; }
                                if ((0+!!a.order) !== (0+!!b.order)) { return (0+!!b.order) - (0+!!a.order); }
                                if (currSortOption === 'Chronological') {
                                  if (a.order.ref < b.order.ref) { return -1; };
                                  if (b.order.ref < a.order.ref) { return 1; };
                                  return 0;
                                }
                                else {
                                  if (interfaceLang === 'english' && a.order.availableLangs.length !== b.order.availableLangs.length) {
                                    if (a.order.availableLangs.indexOf('en') > -1) { return -1; }
                                    if (b.order.availableLangs.indexOf('en') > -1) { return 1; }
                                    return 0;
                                  }
                                  else if (a.order.numDatasource !== b.order.numDatasource) { return b.order.numDatasource - a.order.numDatasource; }
                                  else { return b.order.tfidf - a.order.tfidf; }
                                }
                              }}
                              renderItem={item=>(
                                <TextPassage key={item[0]} text={item[1]} toggleSignUpModal={toggleSignUpModal}/>
                              )}
                              />
                            ) : null
                          }
                        </TabView>
                   :""}
                </div>
                <div className="sideColumn">
                    <TopicSideColumn links={topicData.links} clearAndSetTopic={clearAndSetTopic} />
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

const TopicPageTab = ({ data, renderItem, classes, sortOptions, sortFunc, filterFunc }) => (
  <div className="story topicTabContents">
    {!!data ?
      <div className={classes}>
        <FilterableList
          filterFunc={filterFunc}
          sortFunc={sortFunc}
          renderItem={renderItem}
          renderEmptyList={()=>null}
          renderHeader={()=>null}
          sortOptions={sortOptions}
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
            <StoryTitleBlock en={text.ref} he={text.heRef} url={url}/>
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

const TopicLink = ({topic, topicTitle, clearAndSetTopic}) => {

  return (
    <Link className="relatedTopic" href={"/topics/" + topic} onClick={clearAndSetTopic.bind(null, topic)} key={topic} title={topicTitle.en}>
      <InterfaceTextWithFallback en={topicTitle.en} he={topicTitle.he} />
    </Link>
  );
};
TopicLink.propTypes = {
  topic: PropTypes.string.isRequired,
  clearAndSetTopic: PropTypes.func.isRequired,
};

const TopicSideColumn = ({ links, clearAndSetTopic }) => (
  links ?
    Object.values(links)
    .filter(linkType => !!linkType && linkType.shouldDisplay && linkType.links.length > 0)
    .map(linkType => (
      <div key={linkType.title.en}>
        <h2>
          <span className="int-en">{linkType.title.en}</span>
          <span className="int-he">{linkType.title.he}</span>
        </h2>
        <div className="sideList">
          {linkType.links.map(t => TopicLink({topic:t.fromTopic, topicTitle: t.fromTopicTitle, clearAndSetTopic}))}
        </div>
      </div>
    ))
  : ""
);
TopicSideColumn.propTypes = {
  topicData: PropTypes.object,
  clearAndSetTopic: PropTypes.func.isRequired,
};


module.exports.TopicPage = TopicPage;
module.exports.TopicCategory = TopicCategory;
