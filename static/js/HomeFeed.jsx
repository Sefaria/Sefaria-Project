import React, { useState, useEffect, useCallback, useRef } from 'react';
const $          = require('./sefaria/sefariaJquery');
const PropTypes  = require('prop-types');
const Story      = require('./Story');
const Footer     = require('./Footer');


function HomeFeed(props) {
  const {interfaceLang, toggleSignUpModal, onlySharedStories} = props;
  const [page, setPage] = useState(0);
  const [nextPage, setNextPage] = useState(1);
  const [stories, setStories] = useState([]);
  const [loadedToEnd, setLoadedToEnd] = useState(false);

  useEffect(() => {
    const $scrl = $(".homeFeedWrapper .content");
    const margin = 600;
    const handleScroll = () => {
      if (loadedToEnd || page === nextPage) { return; }
      if ($scrl.scrollTop() + $scrl.innerHeight() + margin >= $scrl[0].scrollHeight) {
        setPage(nextPage);
      }
    };
    $scrl.on("scroll", handleScroll);
    return (() => {$scrl.off("scroll", handleScroll);})
  }, [loadedToEnd, page, nextPage]);

  useEffect(() => {
    const url = "/api/stories?" + (onlySharedStories ? "shared_only=1" : "") + "&page=" + page;
    $.getJSON(url, (data) => {
      setStories(prev => ([...prev, ...data.stories]));
      if (data.count < data.page_size) {
        setLoadedToEnd(true);
      } else {
        setNextPage(page + 1);
      }
    });
  }, [page]);

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
