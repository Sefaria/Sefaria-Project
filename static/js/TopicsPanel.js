const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  TwoOrThreeBox,
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


class TopicsPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {"filter": ""};
  }
  componentDidMount() {
    this.loadData();
  }
  loadData() {
    var data = Sefaria.topicList();
    if (!data) {
      Sefaria.topicList(this.rerender);
    }

    var trending = Sefaria.sheets.trendingTags();
    if (!trending) {
      Sefaria.sheets.trendingTags(this.rerender);
    }
  }
  handleFilterChange(e) {
    this.setState({filter: e.currentTarget.value.toLowerCase()});
  }
  resetFilter() {
    this.setState({"filter": ""});
    $(".topicFilterInput").val("");
  }
  rerender() {
    this.forceUpdate();
  }
  render() {
    var topics = Sefaria.topicList();
    var trending = Sefaria.sheets.trendingTags();
    var makeTopicButton = function(item, i) {
      var classes = classNames({navButton: 1, sheetButton: 1 });
      return (<Link 
                className={classes}
                href={"/topics/" + item.tag}
                onClick={this.props.setTopic.bind(null, item.tag)}
                title={"Explore sources related to '" + item.tag + "'"}
                key={item.tag}>
                <span className="int-en">{item.tag} ({item.count})</span>
                <span className="int-he">{Sefaria.hebrewTerm(item.tag)} ({item.count})</span>
              </Link>);
    }.bind(this);

    var trendingList = this.state.filter.length ? [] : trending ? trending.map(makeTopicButton) : null;

    var topicList = topics ? topics.filter(function(item, i) {
      if (!this.state.filter.length) { return true }
      var tag = Sefaria.interfaceLang == "hebrew" ? Sefaria.hebrewTerm(item.tag) : item.tag.toLowerCase();
      return tag.indexOf(this.state.filter) !== -1;
    }.bind(this)).map(makeTopicButton) : null;

    var classStr = classNames({topicsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader });
    var navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    var contentClasses = classNames({content: 1, hasFooter: 1});

    return (
      <div className={classStr}>
        {this.props.hideNavHeader ? null :
          <div className={navTopClasses}>
            <CategoryColorLine category={"Other"} />
            <ReaderNavigationMenuMenuButton onClick={this.props.navHome} />
            <h2>
              <span className="int-en">Topics</span>
              <span className="int-he">נושאים</span>
            </h2>
            <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
        </div>}
        <div className={contentClasses} onScroll={this.onScroll}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <h1>
                <span className="int-en">Topics</span>
                <span className="int-he">נושאים</span>
              </h1>
              : null }

            <div className="topicFilterBox">
              <i className="topicFilterIcon fa fa-search"></i>
              <input className="topicFilterInput" placeholder={Sefaria.interfaceLang == "hebrew" ? "חפש נושאים" : "Search Topics"} onChange={this.handleFilterChange} />
              { this.state.filter.length ? 
              <div className="topicsFilterReset" onClick={this.resetFilter}>
                <span className="int-en">Reset</span>
                <span className="int-he">לאתחל</span>
                <img className="topicsFilterResetIcon" src="/static/img/circled-x.svg" />       
              </div>
              : null }
            </div>
            <div className="topicList">
              {trendingList && trendingList.length ?
                <div className="trendingTopics">
                  <h3>
                    <span className="int-en">Trending</span>
                    <span className="int-he">עדכני</span>
                  </h3>
                  <TwoOrThreeBox content={trendingList} width={this.props.width} />
                </div>
                : null }
              { topics ?
                  (topics.length ?
                      <div>
                        { this.state.filter.length ? null :
                          <h3>
                            <span className="int-en">Most Used</span>
                            <span className="int-he">הכי בשימוש</span>
                          </h3>
                        }                      
                        <TwoOrThreeBox content={topicList} width={this.props.width} /> 
                      </div>
                    : <LoadingMessage message="There are no topics here." heMessage="" />)
                  : <LoadingMessage />
              }
            </div>

          </div>
          <Footer />
        </div>
      </div>);
  }
}
TopicsPanel.propTypes = {
  interfaceLang:       PropTypes.string,
  width:               PropTypes.number,
  mutliPanel:          PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  navHome:             PropTypes.func,
  toggleLanguage:      PropTypes.func,
  openDisplaySettings: PropTypes.func,
};
TopicsPanel.defaultProps = {
  width:               1000,
};


module.exports = TopicsPanel;
