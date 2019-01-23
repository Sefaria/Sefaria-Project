const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  Link,
}                         = require('./Misc');
const React               = require('react');
const PropTypes           = require('prop-types');
const ReactDOM            = require('react-dom');
const classNames          = require('classnames');
const Sefaria             = require('./sefaria/sefaria');
const $                   = require('./sefaria/sefariaJquery');
const TextRange           = require('./TextRange');
const Footer              = require('./Footer');
import Component          from 'react-class';


class TopicPage extends Component {
  constructor(props) {
    super(props);
    this.state = { numberToRender: 3 };
  }
  componentDidMount() {
    this.loadData();
  }
  componentDidUpdate(nextProps) {
    if (nextProps.topic != this.props.topic) {
      this.loadData();
    }
  }
  getData() {
    return Sefaria.topic(this.props.topic);
  }
  loadData() {
    if (!this.getData()) {
      Sefaria.topic(this.props.topic, this.rerender);
    }
  }
  rerender() {
    this.forceUpdate();
  }
  onScroll() {
    // Poor man's scrollview
    var data = this.getData();
    if (!data || this.state.numberToRender > data.sources.length) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 500;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $("#footer").position().top) {
      this.incrementNumberToRender();
    }
  }
  incrementNumberToRender() {
    this.setState({numberToRender: this.state.numberToRender+3});
  }
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
  mutliPanel:          PropTypes.bool,
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


module.exports = TopicPage;
