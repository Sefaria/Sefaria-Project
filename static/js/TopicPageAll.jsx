const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  TwoOrThreeBox,
  Link,
  InterfaceTextWithFallback,
}                         = require('./Misc');
const React               = require('react');
const PropTypes           = require('prop-types');
const classNames          = require('classnames');
const Sefaria             = require('./sefaria/sefaria');
const $                   = require('./sefaria/sefariaJquery');
const MobileHeader        = require('./MobileHeader');
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
  renderButton(item)  {
    return (
      <Link
        className={classNames({navButton: 1, sheetButton: 1 })}
        href={"/topics/" + item.slug}
        onClick={this.props.setTopic.bind(null, item.slug, item.primaryTitle)}
        title={"Explore sources related to '" + item.slug + "'"}
        key={item.slug}
      >
        <InterfaceTextWithFallback {...item.primaryTitle} />
      </Link>
    );
  }

  render() {
    const hasFilter = this.state.filter.length > 1;  // dont filter by one letter. not useful
    const isHeInt = Sefaria.interfaceLang == "hebrew";
    const topicList = this.state.topicList ? this.state.topicList.filter(item => {
      if (item.shouldDisplay === false || item.numSources == 0) { return false; }
      if (!hasFilter) { return true }
      for (let title of item.normTitles) {
        if (title.indexOf(this.state.filter) !== -1) { return true; }
      }
      return false;
    }).slice(0, 500).sort((a, b) => {
      if (isHeInt) { return (0 + (!!b.primaryTitle.he)) - (0 + (!!a.primaryTitle.he)); }
      else         { return (0 + (!!b.primaryTitle.en)) - (0 + (!!a.primaryTitle.en)); }
    }).map(this.renderButton) : null;
    const classStr = classNames({topicsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader });
    const navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    const contentClasses = classNames({content: 1, hasFooter: 1});
    const inputClasses = classNames({topicFilterInput: 1, contentText: 1, en: !isHeInt, he: isHeInt});
    return (
      <div className={classStr}>
        {this.props.hideNavHeader ? null :
          <MobileHeader
            mode="innerTOC"
            hideNavHeader={this.props.hideNavHeader}
            category="Other"
            interfaceLang={Sefaria.interfaceLang}
            navHome={this.props.navHome}
            catTitle="Topics"
            heCatTitle="נושאים"
          />}
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
                        { hasFilter ? null :
                          <h2>
                            <span className="int-en">Most Used</span>
                            <span className="int-he">בשימוש נפוץ</span>
                          </h2>
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
