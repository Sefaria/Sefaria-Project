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


class TopicPageAll extends Component {
  constructor(props) {
    super(props);
    this.state = {
      filter: '',
      loading: true,
      topicList: null,
    };
  }
  componentDidMount() {
    Sefaria.topicList().then(topicList => {
      for (let topic of topicList) {
        topic.normTitles = topic.titles.map(title => this.normalizeFilter(title.text))
      }
      this.setState({ loading: false, topicList });
    });
  }
  normalizeFilter(filter) { return filter.toLowerCase(); }
  handleFilterChange(e) {
    this.setState({filter: this.normalizeFilter(e.currentTarget.value)});
  }
  resetFilter() {
    this.setState({filter: ''});
    $(".topicFilterInput").val("");
  }
  getPrimaryTitle(topic, lang) {
    for (let title of topic.titles) {
      if (title.lang == lang && title.primary) {
        return title.text;
      }
    }
    return '';
  }

  renderButton(item)  {
    const topicTitle = {
      en: this.getPrimaryTitle(item, 'en'),
      he: this.getPrimaryTitle(item, 'he'),
    };
    return (
      <Link
        className={classNames({navButton: 1, sheetButton: 1 })}
        href={"/topics/" + item.slug}
        onClick={this.props.setTopic.bind(null, item.slug, topicTitle)}
        title={"Explore sources related to '" + item.slug + "'"}
        key={item.slug}
      >
        <span className="int-en">{topicTitle.en}</span>
        <span className="int-he">{topicTitle.he}</span>
      </Link>
    );
  }

  render() {
    const hasFilter = this.state.filter.length > 0;
    const topicList = this.state.topicList ? this.state.topicList.filter(item => {
      if (!hasFilter) { return true }
      for (let title of item.normTitles) {
        if (title.indexOf(this.state.filter) !== -1) { return true; }
      }
      return false;
    }).slice(0, 500).map(this.renderButton) : null;
    const isHeInt = Sefaria.interfaceLang == "hebrew";
    const classStr = classNames({topicsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader });
    const navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    const contentClasses = classNames({content: 1, hasFooter: 1});
    const inputClasses = classNames({topicFilterInput: 1, contentText: 1, en: !isHeInt, he: isHeInt});
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
              <input className={inputClasses} placeholder={isHeInt ? "חפש נושאים" : "Search Topics"} onChange={this.handleFilterChange} />
              { this.state.filter.length ?
              <div className="topicsFilterReset" onClick={this.resetFilter}>
                <span className="int-en">Reset</span>
                <span className="int-he">לאתחל</span>
                <img className="topicsFilterResetIcon" src="/static/img/circled-x.svg" />
              </div>
              : null }
            </div>
            <div className="topicList">
              { topicList ?
                  (topicList.length ?
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
TopicPageAll.propTypes = {
  interfaceLang:       PropTypes.string,
  width:               PropTypes.number,
  mutliPanel:          PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  navHome:             PropTypes.func,
  toggleLanguage:      PropTypes.func,
  openDisplaySettings: PropTypes.func,
};
TopicPageAll.defaultProps = {
  width:               1000,
};


module.exports = TopicPageAll;
