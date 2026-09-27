import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import { InterfaceText, LoadingMessage } from './Misc';
import { ContentText } from './ContentText';
import { NUSACHIM, parseSiddurRef } from './sefaria/siddurNusach';
import { filterSiddurToc, flattenSiddurToc } from './sefaria/siddurToc';

// Full-screen, fully expanded table of contents for a siddur, with a nusach switcher and a filter-as-you-type search.
const SiddurTocOverlay = ({title, currentRef, nusach, onSwitchNusach, onNavigate, onClose}) => {
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    let active = true;
    Sefaria.getIndexDetails(title).then(details => {
      if (active) { setItems(flattenSiddurToc(details.schema, title)); }
    });
    return () => { active = false; };
  }, [title]);

  const currentPath = parseSiddurRef(currentRef).path;
  useEffect(() => {
    // Always open at the top of the TOC, not at the current section.
    if (items && bodyRef.current) { bodyRef.current.scrollTop = 0; }
  }, [items]);

  const visible = items ? filterSiddurToc(items, query) : [];
  const onKeyDown = e => { if (e.key === "Escape") { onClose(); } };

  return (
    <div className="siddurTocOverlay sans-serif" role="dialog" aria-modal="true"
         aria-label={Sefaria._("common.contents")} onKeyDown={onKeyDown}>
      <div className="siddurTocTopRow">
        <div className="siddurTocNusachSwitcher" role="radiogroup" aria-label={Sefaria._("siddur_nusach.choose_your_nusach")}>
          {NUSACHIM.map(n => (
            <button
              key={n}
              role="radio"
              aria-checked={n === nusach}
              className={classNames({siddurTocNusach: 1, selected: n === nusach})}
              onClick={() => { if (n !== nusach) { onSwitchNusach(n); } }}>
              <InterfaceText>{`siddur_nusach.${n}`}</InterfaceText>
            </button>
          ))}
        </div>
        <button className="siddurTocClose" aria-label={Sefaria._("common.close")} onClick={onClose}>×</button>
      </div>
      <div className="siddurTocHeader">
        <input
          type="search"
          className="siddurTocSearch"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={Sefaria._("siddur_nusach.search_sections")}
          aria-label={Sefaria._("siddur_nusach.search_sections")}
        />
      </div>
      <div className="siddurTocBody" ref={bodyRef}>
        {!items ? <LoadingMessage /> :
          visible.length ?
          visible.map(item => (
            <a
              key={item.ref}
              href={"/" + Sefaria.normRef(item.ref)}
              data-ref={item.ref}
              className={classNames({siddurTocItem: 1, group: !item.isLeaf, current: item.ref === currentPath})}
              style={{paddingInlineStart: 16 + item.depth * 20}}
              onClick={e => { e.preventDefault(); onNavigate(item.ref); }}>
              <ContentText text={{en: item.en, he: item.he}} defaultToInterfaceOnBilingual={true} />
            </a>
          )) :
          <div className="siddurTocEmpty"><InterfaceText>siddur_nusach.no_matching_sections</InterfaceText></div>}
      </div>
    </div>
  );
};
SiddurTocOverlay.propTypes = {
  title:      PropTypes.string.isRequired,
  currentRef: PropTypes.string,
  nusach:     PropTypes.string,
  onSwitchNusach: PropTypes.func.isRequired,
  onNavigate: PropTypes.func.isRequired,
  onClose:    PropTypes.func.isRequired,
};

export default SiddurTocOverlay;
