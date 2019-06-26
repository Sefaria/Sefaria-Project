import React, { useState, useEffect, useCallback, useRef } from 'react';
const $          = require('./sefaria/sefariaJquery');
const PropTypes  = require('prop-types');
const Story      = require('./Story');
const Footer     = require('./Footer');
const { usePaginatedScroll } = require('./Hooks');


function HomeFeed(props) {
  const {interfaceLang, toggleSignUpModal, onlySharedStories} = props;
  const [stories, setStories] = useState([]);

  usePaginatedScroll(
      $(".homeFeedWrapper .content"),
      "/api/stories?" + (onlySharedStories ? "shared_only=1" : ""),
      data => setStories(prev => ([...prev, ...data.stories]))
  );

  return (
    <div className="homeFeedWrapper">
      <div className="content hasFooter">
        <div className="contentInner">
          <div className="storyFeed">
          {stories.map((s,i) => Story(s, i, props))}
          </div>
        </div>
        <footer id="footer" className={`interface-${interfaceLang} static sans`}>
          <Footer />
        </footer>
      </div>
    </div>);
}
HomeFeed.propTypes = {
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func.isRequired,
  onlySharedStories:  PropTypes.bool
};

module.exports = HomeFeed;
