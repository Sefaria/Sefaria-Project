import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import { InterfaceText, LoadingMessage } from './Misc';
import { ContentText } from './ContentText';
import { parseSiddurRef } from './sefaria/siddurNusach';
import { filterSiddurToc, flattenSiddurToc } from './sefaria/siddurToc';

// Full-screen, fully expanded table of contents for a siddur, with a filter-as-you-type search.
const SiddurTocOverlay = ({title, currentRef, onNavigate, onClose}) => {
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
    const current = items && bodyRef.current && bodyRef.current.querySelector(".siddurTocItem.current");
    if (current) { current.scrollIntoView({block: "center"}); }
  }, [items]);

  const visible = items ? filterSiddurToc(items, query) : [];
  const onKeyDown = e => { if (e.key === "Escape") { onClose(); } };

  return (
    <div className="siddurTocOverlay sans-serif" role="dialog" aria-modal="true"
         aria-label={Sefaria._("common.contents")} onKeyDown={onKeyDown}>
      <div className="siddurTocHeader">
        <input
          type="search"
          className="siddurTocSearch"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={Sefaria._("siddur_nusach.search_sections")}
          aria-label={Sefaria._("siddur_nusach.search_sections")}
          autoFocus
        />
        <button className="siddurTocClose" aria-label={Sefaria._("common.close")} onClick={onClose}>×</button>
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
  onNavigate: PropTypes.func.isRequired,
  onClose:    PropTypes.func.isRequired,
};

export default SiddurTocOverlay;
