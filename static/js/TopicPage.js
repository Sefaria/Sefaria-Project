const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
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
  getData() {
    return Sefaria.topic(this.props.topic);
  }
  loadData() {
    if (!this.getData()) {
      Sefaria.topic(this.props.topic, this.incrementNumberToRender);
    }
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
            <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
            <h2>
              <span className="int-en">{this.props.topic}</span>
              <span className="int-he">{this.props.topic}</span>
            </h2>
        </div>}
        <div className={contentClasses} onScroll={this.onScroll} key={this.props.topic}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <h1>
                { this.props.multiPanel ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                <span className="int-en">{this.props.topic}</span>
                <span className="int-he">{this.props.topic}</span>
              </h1>
              : null }
            <div className="relatedTopicsList">
              { topicData ? 
                topicData.relatedTopics.slice(0, 26).map(function(item, i) {
                  if (item[1] < 4) { return null; }
                  return (<a className="relatedTopic" href={"/topics/" + item[0]} key={item[0]} title={item[1] + " co-occurrences"}>{item[0]}</a>);
                }) : null }
                <a className="relatedTopic" href="/topics">All Topics</a>
            </div>
            <div className="sourceList">
              { topicData ?
                  (topicData.sources.length ?
                    topicData.sources.map(function(item, i) {
                      // All notes are rendered initially (so ctrl+f works on page) but text is only loaded
                      // from API as notes scroll into view.
                      if (i < this.state.numberToRender) {
                        return (<div className="topicSource" key={i}>
                                  <TextRange sref={item[0]} onRangeClick={this.props.showBaseText.bind(null, item[0])} />
                                  <div className="score">+{item[1]}</div>
                                </div>);
                      } else {
                        return null;
                      }
                    }.bind(this))
                    : <LoadingMessage message="There are no sources for this topic yet." heMessage="" />)
                  : <LoadingMessage />
              }
            </div>

          </div>
          <footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
            <Footer />
          </footer>
        </div>
      </div>);
  }
}
TopicPage.propTypes = {
  topic:               PropTypes.string.isRequired,
  interfaceLang:       PropTypes.string,
  mutliPanel:          PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  showBaseText:        PropTypes.func,
  navHome:             PropTypes.func,
  toggleLanguage:      PropTypes.func,
  openDisplaySettings: PropTypes.func,
};


module.exports = TopicPage;
