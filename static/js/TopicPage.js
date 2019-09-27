const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  TabView,
  LoadingMessage,
  Link,
}                         = require('./Misc');
import React, { useState, useEffect, useCallback, useRef } from 'react';
const PropTypes           = require('prop-types');
const ReactDOM            = require('react-dom');
const classNames          = require('classnames');
const Sefaria             = require('./sefaria/sefaria');
const $                   = require('./sefaria/sefariaJquery');
const TextRange           = require('./TextRange');
const Footer              = require('./Footer');
import Component          from 'react-class';

const TopicPage = ({topic, setTopic, openTopics, interfaceLang, multiPanel, hideNavHeader, showBaseText, navHome, toggleLanguage, openDisplaySettings}) => {
    const [topicData, setTopicData] = useState({});
    Sefaria.getTopic(topic).then(setTopicData);

    const classStr = classNames({topicPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: hideNavHeader });

    return topicData ? (
      <div className={classStr}>
        <div className="content hasFooter noOverflowX">
            <div className="homeFeedColumns">
               <div className="storyFeed">
                    <div className="title pageTitle">
                      <h1>
                        { multiPanel && interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ? <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null }
                        <span className="int-en">{topic}</span>
                        <span className="int-he">{Sefaria.hebrewTerm(topic)}</span>
                      </h1>
                    </div>
                    <div className="title sectionTitleText">
                      <span className="int-en">{topicData.category}</span>
                      <span className="int-he">{Sefaria.hebrewTerm(topicData.category)}</span>
                    </div>
                    <div className="title systemText">
                      <span className="int-en">{topicData.description && topicData.description.en}</span>
                      <span className="int-he">{topicData.description && topicData.description.he}</span>
                    </div>
                        <TabView
                          tabs={[ Sefaria._("Sheets"), Sefaria._("Sources") ]}
                          renderTab={(t,i) => <div key={i} className="tab">{t}</div>} >
                            <div>Sheets</div>
                            <div>Sources</div>
                        </TabView>
               </div>
                <div className="homeFeedSidebar">
                    Foo
                </div>
            </div>
          </div>
      </div>): <LoadingMessage/>;
};

/*
class TopicPage extends Component {

  render() {
    var topicData = Sefaria.topic(this.props.topic);
    var classStr = classNames({topicPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader });
    var navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    var contentClasses = classNames({content: 1, hasFooter: 1});

    return (
      <div className={classStr}>
        {this.props.hideNavHeader ? null :
          <div className={navTopClasses}>
            <CategoryColorLine category={"Other"} />
            <ReaderNavigationMenuMenuButton onClick={this.props.navHome} />
            <h2>
              <span className="int-en">{this.props.topic}</span>
              <span className="int-he">{Sefaria.hebrewTerm(this.props.topic)}</span>
            </h2>
            <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
        </div>}
        <div className={contentClasses} onScroll={this.onScroll} key={this.props.topic}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <div>
                <h2 className="topicLabel">
                  <Link href="/topics" onClick={this.props.openTopics} title="Show all Topics">
                    <span className="int-en">Topic</span>
                    <span className="int-he">נושא</span>
                  </Link>
                </h2>
                <h1>
                  { this.props.multiPanel && Sefaria._siteSettings.TORAH_SPECIFIC ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                  <span className="int-en">{this.props.topic}</span>
                  <span className="int-he">{Sefaria.hebrewTerm(this.props.topic)}</span>
                </h1>
              </div>
              : null }
            <div className="relatedTopicsList">
              { topicData ?
                topicData.related_topics.slice(0, 26).map(function(item, i) {
                  return (<Link
                            className="relatedTopic"
                            href={"/topics/" + item[0]}
                            onClick={this.props.setTopic.bind(null, item[0])}
                            key={item[0]}
                            title={item[1] + " co-occurrences"}>
                              <span className="int-en">{item[0]}</span>
                              <span className="int-he">{Sefaria.hebrewTerm(item[0])}</span>
                          </Link>);
                }.bind(this)) : null }
                {topicData ? <Link className="relatedTopic" href="/topics" onClick={this.props.openTopics} title="Show all Topics">
                                <span className="int-en">All Topics</span>
                                <span className="int-he">כל הנושאים</span>
                              </Link> : null }
            </div>
            <div className="sourceList">
              { topicData ?
                  (topicData.sources.length ?
                    topicData.sources.map(function(item, i) {
                      // All notes are rendered initially (so ctrl+f works on page) but text is only loaded
                      // from API as notes scroll into view.
                      if (i < this.state.numberToRender) {
                        return <TopicSource
                                  sref={item[0]}
                                  count={item[1]}
                                  topic={this.props.topic}
                                  showBaseText={this.props.showBaseText}
                                  key={i} />
                      } else {
                        return null;
                      }
                    }.bind(this))
                    : <LoadingMessage message="There are no sources for this topic yet." heMessage="" />)
                  : <LoadingMessage />
              }
            </div>

          </div>
          <Footer />
        </div>
      </div>);
  }
}
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
};


class TopicSource extends Component {
  render() {
    //var openSource = this.props.showBaseText.bind(null, this.props.sref); THIS WAS CAUSING A BUG
    var openSourceWithSheets = null; //this.props.showBaseText.bind(null, this.props.sref, true, null, null, ["Sheets"])
    var title = this.props.count + " Sheets tagged " + this.props.topic + " include this source."
    var buttons = <a
                    href={"/" + Sefaria.normRef(this.props.sref) + "?with=Sheets"}
                    className="score"
                    onClick={openSourceWithSheets}
                    title={title}>+{this.props.count}<img src="/static/img/sheet.svg" /></a>

    return (<div className="topicSource">
              <TextRange
                sref={this.props.sref}
                titleButtons={buttons}
                onRangeClick={this.props.showBaseText} />
            </div>);  }
}
TopicSource.propTypes = {
  sref:         PropTypes.string.isRequired,
  topic:        PropTypes.string.isRequired,
  count:        PropTypes.number.isRequired,
  showBaseText: PropTypes.func.isRequired,
}

*/
module.exports = TopicPage;
