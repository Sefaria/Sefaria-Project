import React, { useState, useEffect, useCallback, useRef } from 'react';
const PropTypes           = require('prop-types');
const classNames          = require('classnames');
const Sefaria             = require('./sefaria/sefaria');
const {
    StorySheetList,
    SaveLine,
    StoryTitleBlock,
    ColorBarBox,
    StoryBodyBlock,
    StoryFrame,
    textPropType
}                         = require('./Story');
const {
  LanguageToggleButton,
  TabView,
  LoadingMessage,
  Link,
  TwoOrThreeBox
}                         = require('./Misc');
const Footer     = require('./Footer');



const TopicCategory = ({topic, setTopic, toggleLanguage, interfaceLang, width, multiPanel, compare, hideNavHeader, contentLang}) => {
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
                    <TopicHeader topic={topic} topicData={topicData} multiPanel={multiPanel} interfaceLang={interfaceLang} toggleLanguage={toggleLanguage}/>
                    <TwoOrThreeBox content={topicBlocks} width={width} />
                </div>
            </div>
        </div>
    );
};

const TopicHeader = ({topic, topicData, multiPanel, interfaceLang, toggleLanguage}) => (
    <div>
        <div className="topicTitle pageTitle">
          <h1>
            { multiPanel && interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ? <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null }
            <span className="int-en">{!!topicData ? topicData.primaryTitle.en : "Loading..."}</span>
            <span className="int-he">{!!topicData ? topicData.titles.he : "טוען..."}</span>
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
);

const TopicPage = ({topic, setTopic, openTopics, interfaceLang, multiPanel, hideNavHeader, showBaseText, navHome, toggleLanguage, toggleSignUpModal, openDisplaySettings}) => {
    const [topicData, setTopicData] = useState(false);
    const [sheetData, setSheetData] = useState(null);
    const [textData, setTextData] = useState(null);
    const clearAndSetTopic = (topic) => {setTopicData(false); setTopic(topic)};
    useEffect(() => {
      const { promise, cancel } = Sefaria.makeCancelable(
        Sefaria.getTopic(topic)
        .then(d => { setTopicData(d); return d; })
        .then(d => {
          const refs = d.refs.filter(s => !s.is_sheet).map(s => s.ref);
          const sheetIds = d.refs.filter(s => s.is_sheet).map(s => s.ref.replace('Sheet ',''));
          return Promise.all([
            Sefaria.getBulkText(refs, true).then(setTextData),
            Sefaria.getBulkSheets(sheetIds).then(setSheetData),
          ]);
        }
      ));
      promise.catch(e => {});
      return () => {
        cancel();
        setTopicData(false);
        setSheetData(null);
        setTextData(null);
      }
    }, [topic]);
    const classStr = classNames({topicPanel: 1, readerNavMenu: 1, noHeader: hideNavHeader });
    return <div className={classStr}>
        <div className="content hasFooter noOverflowX">
            <div className="columnLayout">
               <div className="mainColumn">
                    <TopicHeader topic={topic} topicData={topicData} multiPanel={multiPanel} interfaceLang={interfaceLang} toggleLanguage={toggleLanguage}/>
                   {!!topicData?
                       <TabView
                          tabs={[ {text: Sefaria._("Sheets")}, {text: Sefaria._("Sources")} ]}
                          renderTab={t => <div className="tab">{t.text}</div>} >
                            <div className="story topicTabContents">
                              {
                                !!sheetData ?
                                  <StorySheetList sheets={Object.values(sheetData)} compact={true}/>
                                : <LoadingMessage/>
                              }
                            </div>
                            <div className="story topicTabContents">
                                {
                                  !!textData ?
                                    topicData.refs.filter(s => !s.is_sheet).map((s,i) => (
                                      <TextPassage key={i} text={textData[s.ref]} toggleSignUpModal={toggleSignUpModal}/>
                                    )) : <LoadingMessage/>
                                }
                            </div>
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
  toggleLanguage:      PropTypes.func,
  openDisplaySettings: PropTypes.func,
  toggleSignUpModal:   PropTypes.func,
};

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

const TopicLink = ({topic, topicTitle, clearAndSetTopic}) => (
    <Link className="relatedTopic" href={"/topics/" + topic} onClick={clearAndSetTopic.bind(null, topic)} key={topic} title={topicTitle.en}>
      <span className="int-en">{topicTitle.en}</span>
      <span className="int-he">{topicTitle.he}</span>
    </Link>
);
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
