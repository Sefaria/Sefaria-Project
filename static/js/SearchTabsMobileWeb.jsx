import React, { useRef, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from './Misc';

const SearchTabsMobileWeb = ({ tabs, currTabName, setTab }) => {
  const scrollRef = useRef(null);
  const tabRefs = useRef({});
  const [showRightGradient, setShowRightGradient] = useState(true);
  const [showLeftGradient, setShowLeftGradient] = useState(false);

  const updateGradients = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftGradient(el.scrollLeft > 0);
    setShowRightGradient(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateGradients();
  }, [tabs, currTabName]);

  useEffect(() => {
    const tabEl = tabRefs.current[currTabName];
    const container = scrollRef.current;
    if (!tabEl || !container) return;
    const tabLeft = tabEl.offsetLeft;
    const tabRight = tabLeft + tabEl.offsetWidth;
    if (tabLeft < container.scrollLeft) {
      container.scrollTo({ left: tabLeft, behavior: 'smooth' });
    } else if (tabRight > container.scrollLeft + container.clientWidth) {
      container.scrollTo({ left: tabRight - container.clientWidth, behavior: 'smooth' });
    }
  }, [currTabName]);

  return (
    <div className="searchTabsMobileWeb">
      <div
        className="searchTabsMobileWeb-scroll"
        ref={scrollRef}
        role="tablist"
        onScroll={updateGradients}
      >
        {tabs.map(tab => {
          const isActive = tab.id === currTabName;
          return (
            <button
              key={tab.id}
              ref={el => { tabRefs.current[tab.id] = el; }}
              className={`searchTabsMobileWeb-tab${isActive ? ' active' : ''}`}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tab.id)}
            >
              <InterfaceText>{tab.title}</InterfaceText>
              {tab.count != null && tab.count !== "" && (
                <span className="searchTabsMobileWeb-count">{tab.count}</span>
              )}
            </button>
          );
        })}
        <span className="searchTabsMobileWeb-spacer" aria-hidden="true" />
      </div>
      {showRightGradient && <div className="searchTabsMobileWeb-gradient right" aria-hidden="true" />}
      {showLeftGradient && <div className="searchTabsMobileWeb-gradient left" aria-hidden="true" />}
    </div>
  );
};

SearchTabsMobileWeb.propTypes = {
  tabs: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    count: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  })).isRequired,
  currTabName: PropTypes.string.isRequired,
  setTab: PropTypes.func.isRequired,
};

export default SearchTabsMobileWeb;
