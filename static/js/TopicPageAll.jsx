import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Component from 'react-class';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Footer  from './Footer';
import { NavSidebar } from './NavSidebar';
import {
  CategoryColorLine,
  MenuButton,
  DisplaySettingsButton,
  LanguageToggleButton,
  LoadingMessage,
  ResponsiveNBox,
  Link,
  InterfaceText,
} from './Misc';

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
      {type: "JoinTheConversation"},
      {type: "GetTheApp"},
      {type: "SupportSefaria"},
    ];

    const hasFilter = this.state.filter.length > 1;  // dont filter by one letter. not useful
    const isHeInt = Sefaria.interfaceLang == "hebrew";

    const topicList = this.state.topicList ? this.state.topicList.filter(item => {
      if (item.shouldDisplay === false || item.numSources == 0) { return false; }
      
      if (!hasFilter) {
        const sortTitle = isHeInt ? item.primaryTitle.he : item.primaryTitle.en;
        return sortTitle.toLowerCase().startsWith(this.props.topicLetter);
      }

      for (let title of item.normTitles) {
        if (title.indexOf(this.state.filter) !== -1) { return true; }
      }
      return false;
    
    }).sort((a, b) => {
      const lang = Sefaria.interfaceLang.slice(0,2);
      if (!hasFilter) {
        return b.primaryTitle[lang].stripNikkud() > a.primaryTitle[lang].stripNikkud() ? -1 : 1; // Alphabetical if no filter
      } else {
        return (0 + (!!b.primaryTitle[lang])) - (0 + (!!a.primaryTitle[lang])); // Keep original order (# source), but sort current interface lang first
      }
    
    }).map(topic => {
      const openTopic = e => {e.preventDefault(); this.props.setTopic(topic.slug, topic.primaryTitle)};
      return (
        <div className="navBlock">
          <a href={`/topics/${topic.slug}`} className="navBlockTitle" onClick={openTopic}>
            <InterfaceText text={topic.primaryTitle} />
          </a>
        </div>
      );
    }) : null;

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
                <img className="searchIcon" src="/static/icons/iconmonstr-magnifier-2.svg" />
                <input className={inputClasses} placeholder={Sefaria._("Search Topics")} onChange={this.handleFilterChange} />
                { this.state.filter.length ?
                <div className="topicsFilterReset sans-serif" onClick={this.resetFilter}>
                  <InterfaceText>Reset</InterfaceText>
                  <img className="topicsFilterResetIcon" src="/static/icons/circled-x.svg" />
                </div>
                : null }
              </div>

              <AlphabeticalTopicsNav />

              <div className="allTopicsList">
                { topicList ?
                  (topicList.length ?
                    <div>
                      <ResponsiveNBox content={topicList} initialWidth={this.props.initialWidth} />
                    </div>
                    : <LoadingMessage message="There are no topics here." heMessage="" />)
                  : <LoadingMessage />
                }
              </div>
            </div>
            <NavSidebar modules={sidebarModules} />
          </div>
          <Footer />
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
  openDisplaySettings: PropTypes.func,
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

  const tibetanLetterRange = ["ཀ","ཁ","ག","ང","ཅ","ཆ","ཇ","ཉ","ཏ","ཐ","ད","ན","པ","ཕ","བ","མ","ཙ","ཚ","ཛ","ཝ","ཞ","ཟ","འ","ཡ","ར","ལ","ཤ","ས","ཧ","ཨ"]
  const letters = Sefaria.interfaceLang === "hebrew" ? tibetanLetterRange : letterRange("A", "Z");
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