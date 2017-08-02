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
  componentDidMount() {
    this.loadData();
    this.state = { numberToRender: 2 };
  }
  loadData() {
    var topicData = Sefaria.topic(this.props.topic);

    if (!topicData) {
      Sefaria.topic(this.props.topic, this.incrementNumberToRender);
    }
  }
  onScroll() {
    // Poor man's scrollview
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 500;
    var $unloaded = $(".textRange.placeholder").eq(0);
    if (!$unloaded.length) { return; }
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $unloaded.position().top) {
      this.incrementNumberToRender();
    }
  }
  incrementNumberToRender() {
    this.setState({numberToRender: this.state.numberToRender+3});
  }
  render() {
    var topicData = Sefaria.topic(this.props.topic);
    var classStr = classNames({myNotesPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader });
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
              <span className="int-en">My Notes</span>
              <span className="int-he">הרשומות שלי</span>
            </h2>
        </div>}
        <div className={contentClasses} onScroll={this.onScroll}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <h1>
                { this.props.multiPanel ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                <span className="int-en">My Notes</span>
                <span className="int-he">הרשומות שלי</span>
              </h1>
              : null }
            <div className="noteList">
              { topicData ?
                  (topicData.sources.length ?
                    topicData.sources.map(function(item, i) {
                      // All notes are rendered initially (so ctrl+f works on page) but text is only loaded
                      // from API as notes scroll into view.
                      return <TextRange srefs={item[0]} key={i} showText={i <= this.state.numberToRender} />
                    }.bind(this))
                    : <LoadingMessage message="There are not source for this topic yet." heMessage="" />)
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
  navHome:             PropTypes.func,
  toggleLanguage:      PropTypes.func,
  openDisplaySettings: PropTypes.func,
};


module.exports = TopicPage;
