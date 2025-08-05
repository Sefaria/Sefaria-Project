import React from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Component from 'react-class';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import { NavSidebar } from './NavSidebar';
import {
  LoadingMessage,
  ResponsiveNBox,
  InterfaceText,
} from './Misc';
import {TopicTOCCard} from "./common/TopicTOCCard";

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
      this.setState({ loading: false, topicList });
    });
  }
  normalizeFilter(filter) { 
    return filter.toLowerCase();
  }
  handleFilterChange(e) {
    this.setState({filter: this.normalizeFilter(e.currentTarget.value)});
  }
  resetFilter() {
    this.setState({filter: ''});
    $(".topicFilterInput").val("");
  }
  render() {
    const sidebarModules = [
      {type: "Promo"},
      {type: "TrendingTopics"},
      {type: "GetTheApp"},
      {type: "SupportSefaria"},
    ];

    const hasFilter = this.state.filter.length > 1;  // dont filter by one letter. not useful
    const isHeInt = Sefaria.interfaceLang == "hebrew";

    const topicBlocks = this.state.topicList && this.state.topicList.filter(item => {
      if (!Sefaria.shouldDisplayInActiveModule(item)) {
        return false; // Exclude topics that are not valid for the current module
      }
      if (!hasFilter) {
        const sortTitle = isHeInt ? item.primaryTitle.he : item.primaryTitle.en;
        return sortTitle.toLowerCase().startsWith(this.props.topicLetter);
      }

      for (let title of item.normTitles) {
        if (title.indexOf(this.state.filter) !== -1) { return true; }
      }
      return false;
    
    }).sort((a, b) => {
      const lang = Sefaria._getShortInterfaceLang();
      if (!hasFilter) {
        return b.primaryTitle[lang].stripNikkud() > a.primaryTitle[lang].stripNikkud() ? -1 : 1; // Alphabetical if no filter
      } else {
        return (0 + (!!b.primaryTitle[lang])) - (0 + (!!a.primaryTitle[lang])); // Keep original order (# source), but sort current interface lang first
      }
    })
    const allTopicsList = <div className="allTopicsList">
                          { topicBlocks ?
                            (topicBlocks.length ?
                                <div className="TOCCardsWrapper table">{topicBlocks.map((topic, i) => <TopicTOCCard topic={topic} setTopic={this.props.setTopic} key={i}/>)}</div>
                              : <LoadingMessage message="There are no topics here." heMessage="" />)
                            : <LoadingMessage />
                          }
                        </div>;
    const inputClasses = classNames({topicFilterInput: 1, en: !isHeInt, he: isHeInt});
    return (
      <div className="readerNavMenu">
        <div className="content" onScroll={this.onScroll}>
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1>
                <InterfaceText>All Topics</InterfaceText>
              </h1>

              <div className="topicFilterBox">
                <img className="searchIcon" src="/static/icons/iconmonstr-magnifier-2.svg" alt="Search topics" />
                <input className={inputClasses} placeholder={Sefaria._("Search Topics")} onChange={this.handleFilterChange} />
                { this.state.filter.length ?
                <div className="topicsFilterReset sans-serif" onClick={this.resetFilter}>
                  <InterfaceText>Reset</InterfaceText>
                  <img className="topicsFilterResetIcon" src="/static/icons/circled-x.svg" alt="Reset filter" />
                </div>
                : null }
              </div>
              <AlphabeticalTopicsNav />
              {allTopicsList}
            </div>
            <NavSidebar sidebarModules={sidebarModules} />
          </div>
        </div>
      </div>
    );
  }
}
TopicPageAll.propTypes = {
  interfaceLang:       PropTypes.string,
  initialWidth:        PropTypes.number,
  mutliPanel:          PropTypes.bool,
  navHome:             PropTypes.func,
  toggleLanguage:      PropTypes.func,
};
TopicPageAll.defaultProps = {
  initialWidth:        1000,
};


const AlphabeticalTopicsNav = () => {

  const letterRange = (start, stop) => {
    const result=[];
    for (let idx = start.charCodeAt(0), end = stop.charCodeAt(0); idx <= end; ++idx) {
      if (["ך", "ן", "ף", "ץ"].indexOf(String.fromCharCode(idx)) === -1) {
        result.push(String.fromCharCode(idx));
      }
    }
    return result;
  };

  const letters = Sefaria.interfaceLang === "hebrew" ? letterRange("א", "ת") : letterRange("A", "Z");
  return (
    <div className="alphabeticalTopicsNav sans-serif">
      {letters.map(letter => (
        <a href={"/topics/all/" + letter.toLowerCase()} key={letter}>
          <InterfaceText>{letter}</InterfaceText>
        </a>
      ))}
    </div>
  );
};

export default TopicPageAll;
