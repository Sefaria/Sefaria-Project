/**
 * The table of contents, as a sheet over the text (not the book's TOC page). It opens on the
 * reader's current position: the current chapter or daf is marked, and scrolled into view.
 *
 *   - Tanakh and other simple books: a grid of chapters, and the book's alternate structures
 *     (parashot for the Torah, perakim for a tractate) as a second tab.
 *   - Talmud: a grid of amudim (2a, 2b, ...).
 *   - Complex books: the schema as a collapsible tree, opened along the current position.
 *
 * The index record (Sefaria.getIndexDetails) loads on first open and is cached by the data
 * layer. Choosing a section navigates inside the reader (reader.goToRef) and closes the sheet.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Sefaria from '../../sefaria/sefaria';
import {useIsomorphicLayoutEffect, useNgReader} from '../context';
import {
  buildToc, currentAltIndex, currentPath, heSectionPlural, nodeIsCurrent, sectionIsCurrent, sectionPlural,
} from '../tocData';
import BottomSheet from './BottomSheet';
import {sheetStrings} from './sheetStrings';

const Chevron = () => (
  <svg className="ng-icon ng-toc-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"
       fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
);

/** Load (or read from the data layer's cache) the index record for `title`. */
function useIndexDetails(title) {
  const cached = title ? Sefaria.getIndexDetailsFromCache(title) : null;
  const [state, setState] = useState(() => (cached ? {status: 'ready', index: cached} : {status: 'loading', index: null}));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!title || state.status === 'ready') { return undefined; }
    let live = true;
    setState({status: 'loading', index: null});
    Sefaria.getIndexDetails(title).then(
      index => { if (live) { setState(index && !index.error ? {status: 'ready', index} : {status: 'error', index: null}); } },
      () => { if (live) { setState({status: 'error', index: null}); } },
    );
    return () => { live = false; };
  }, [title, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, () => setAttempt(a => a + 1)];
}

function SectionGrid({node, hebrew, currentRef, onChoose}) {
  const name = hebrew ? node.heSectionName : node.sectionName;
  return (
    <div className="ng-toc-grid" data-ng="toc-grid" data-talmud={node.talmud ? 'true' : undefined} role="list">
      {node.sections.map(section => {
        const current = sectionIsCurrent(section, currentRef);
        const label = hebrew ? section.heLabel : section.label;
        return (
          <div role="listitem" key={section.ref} className="ng-toc-cell-wrap">
            <button type="button" className="ng-toc-cell" data-ng="toc-section" data-ref={section.ref}
                    aria-current={current ? 'location' : undefined} disabled={section.empty}
                    aria-label={name ? `${name} ${label}` : label}
                    onClick={() => onChoose(section.ref)}>
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TreeNode({node, hebrew, currentRef, expanded, toggle, onChoose, strings}) {
  const title = hebrew ? (node.heTitle || node.title) : (node.title || node.heTitle);
  if (node.isDefault && node.sections) {
    return <SectionGrid node={node} hebrew={hebrew} currentRef={currentRef} onChoose={onChoose} />;
  }
  const current = nodeIsCurrent(node, currentRef);
  if (!node.children && !(node.sections && node.sections.length)) {
    return (
      <button type="button" className="ng-toc-leaf" data-ng="toc-node" data-ref={node.ref}
              aria-current={current ? 'location' : undefined} onClick={() => onChoose(node.ref)}>
        <span className="ng-toc-leaf-title">{title}</span>
      </button>
    );
  }
  const open = expanded.has(node.id);
  const panelId = `ng-toc-${node.id.replace(/\./g, '-')}`;
  return (
    <div className="ng-toc-branch" data-ng="toc-branch" data-open={open ? 'true' : 'false'} data-current={current ? 'true' : undefined}>
      <button type="button" className="ng-toc-branch-head" data-ng="toc-toggle" aria-expanded={open} aria-controls={panelId}
              data-ref={node.ref} onClick={() => toggle(node.id)}>
        <Chevron />
        <span className="ng-toc-branch-title">{title}</span>
      </button>
      <div className="ng-toc-branch-body" id={panelId} hidden={!open}>
        {open ? (node.children
          ? node.children.map(child => (
            <TreeNode key={child.id} node={child} hebrew={hebrew} currentRef={currentRef} expanded={expanded}
                      toggle={toggle} onChoose={onChoose} strings={strings} />
          ))
          : <SectionGrid node={node} hebrew={hebrew} currentRef={currentRef} onChoose={onChoose} />) : null}
      </div>
    </div>
  );
}

function AltList({alt, hebrew, currentIndex, onChoose}) {
  return (
    <ol className="ng-toc-alts" data-ng="toc-alt-list" data-alt={alt.name}>
      {alt.items.map((item, i) => (
        <li key={item.wholeRef}>
          <button type="button" className="ng-toc-alt" data-ng="toc-alt-item" data-ref={item.ref}
                  aria-current={i === currentIndex ? 'location' : undefined} onClick={() => onChoose(item.ref, {flash: true})}>
            {(hebrew ? item.heKicker : item.kicker) ? <span className="ng-toc-alt-kicker">{hebrew ? item.heKicker : item.kicker}</span> : null}
            <span className="ng-toc-alt-title">{hebrew ? item.heTitle : item.title}</span>
            <span className="ng-toc-alt-range" dir={hebrew ? 'rtl' : 'ltr'}>{hebrew ? item.heSubtitle : item.subtitle}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function TocSheet({closing, onClose, onExited}) {
  const reader = useNgReader();
  const {interfaceLang, currentSection, currentSegment, goToRef} = reader;
  const hebrew = interfaceLang === 'hebrew';
  const strings = sheetStrings(interfaceLang);
  const bookTitle = currentSection ? currentSection.indexTitle : null;
  // Where the reader is, as of opening: the sheet doesn't chase the text scrolling behind it.
  const [where] = useState(() => ({
    section: currentSection ? currentSection.ref : null,
    segment: currentSegment ? currentSegment.ref : null,
  }));
  const [details, retry] = useIndexDetails(bookTitle);
  const toc = useMemo(() => (details.status === 'ready' ? buildToc(details.index) : null), [details]);
  const [tab, setTab] = useState('sections');
  const [expanded, setExpanded] = useState(() => new Set());
  const bodyRef = useRef(null);
  const scrolledFor = useRef(null);

  useEffect(() => {
    if (toc) { setExpanded(new Set(currentPath(toc.root, where.section))); }
  }, [toc]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  // Open on the current position: put its cell a third of the way down the sheet.
  useIsomorphicLayoutEffect(() => {
    const body = bodyRef.current;
    // Once per tab; `expanded` is a dependency because a tree's current leaf appears only once its branch opens.
    if (!toc || !body || scrolledFor.current === tab) { return; }
    const target = body.querySelector('[aria-current="location"]');
    if (!target) { return; }
    scrolledFor.current = tab;
    const offset = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    body.scrollTop = Math.max(0, offset - body.clientHeight / 3);
  }, [toc, tab, expanded]);

  const choose = useCallback((ref, options) => goToRef(ref, options), [goToRef]);

  const title = toc ? (hebrew ? toc.heTitle : toc.title) : (currentSection ? (hebrew ? currentSection.heIndexTitle : currentSection.indexTitle) : '');
  const otherTitle = toc ? (hebrew ? toc.title : toc.heTitle) : (currentSection ? (hebrew ? currentSection.indexTitle : currentSection.heIndexTitle) : '');
  const categories = toc ? (hebrew ? toc.heCategories : toc.categories) : [];
  const alts = toc ? toc.alts : [];
  const activeAlt = alts.find(a => a.name === tab) || null;
  const root = toc ? toc.root : null;
  const hasTabs = !!(root && alts.length && !root.children);
  const sectionsLabel = root ? (hebrew ? heSectionPlural(root.heSectionName) : sectionPlural(root.sectionName)) : '';

  const head = (
    <div className="ng-toc-head">
      {categories.length ? <div className="ng-toc-kicker">{categories.join(' · ')}</div> : null}
      <h2 className="ng-toc-title" data-ng="toc-title">
        <span className="ng-toc-title-main" lang={hebrew ? 'he' : 'en'}>{title}</span>
        {otherTitle && otherTitle !== title ? <span className="ng-toc-title-other" lang={hebrew ? 'en' : 'he'} dir={hebrew ? 'ltr' : 'rtl'}>{otherTitle}</span> : null}
      </h2>
    </div>
  );

  return (
    <BottomSheet name="toc" closing={closing} onClose={onClose} onExited={onExited} bodyRef={bodyRef}
                 head={head} closeLabel={strings.close}>
      <div className="ng-toc" data-ng="toc" data-status={details.status} data-book={bookTitle || undefined}>
        {details.status === 'loading' ? (
          <div className="ng-sheet-status" role="status"><span className="ng-spinner" aria-hidden="true" /><span>{strings.loading}</span></div>
        ) : null}
        {details.status === 'error' ? (
          <div className="ng-sheet-status" role="alert">
            <span>{strings.loadFailed}</span>
            <button type="button" className="ng-sheet-pill" data-ng="toc-retry" onClick={retry}>{strings.retry}</button>
          </div>
        ) : null}
        {hasTabs ? (
          <div className="ng-toc-tabs" role="tablist" aria-label={strings.contents}>
            {[{name: 'sections', label: sectionsLabel}, ...alts.map(a => ({name: a.name, label: hebrew ? a.heTitle : a.title}))].map(t => (
              <button key={t.name} type="button" role="tab" className="ng-toc-tab" data-ng={`toc-tab-${t.name}`}
                      id={`ng-toc-tab-${t.name}`} aria-controls="ng-toc-panel" aria-selected={tab === t.name}
                      onClick={() => setTab(t.name)}>{t.label}</button>
            ))}
          </div>
        ) : (root && !root.children && sectionsLabel ? <h3 className="ng-toc-section-label">{sectionsLabel}</h3> : null)}
        <div id="ng-toc-panel" role={hasTabs ? 'tabpanel' : undefined} aria-labelledby={hasTabs ? `ng-toc-tab-${tab}` : undefined}>
        {root && tab === 'sections' ? (
          root.children ? (
            <div className="ng-toc-tree" data-ng="toc-tree">
              {root.children.map(child => (
                <TreeNode key={child.id} node={child} hebrew={hebrew} currentRef={where.section} expanded={expanded}
                          toggle={toggle} onChoose={choose} strings={strings} />
              ))}
            </div>
          ) : root.sections ? (
            <SectionGrid node={root} hebrew={hebrew} currentRef={where.section} onChoose={choose} />
          ) : (
            <TreeNode node={root} hebrew={hebrew} currentRef={where.section} expanded={expanded} toggle={toggle}
                      onChoose={choose} strings={strings} />
          )
        ) : null}
        {activeAlt ? (
          <AltList alt={activeAlt} hebrew={hebrew} onChoose={choose}
                   currentIndex={currentAltIndex(activeAlt, where.segment || where.section, toc.title)} />
        ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}
