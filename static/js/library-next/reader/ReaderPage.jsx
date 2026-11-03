/**
 * The text page (`ref` route): header strip, reading controls, the text stream with next/prev
 * loading, segment selection → toolbelt → tool panel, keyboard navigation, and reading position
 * written to the shared `history` / `streak` collections.
 *
 * Query grammar respected: `?lang=he|en|bi` (this view only), `?ven=` / `?vhe=` (versions),
 * `?with=<work>|all` (open Connections on the selection).
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { useT } from '../i18n';
import { useKv } from '../store';
import { usePersona } from '../persona';
import { useContentLang, isContentLang } from '../contentLang';
import { isModalOpen } from '../overlays';
import { useReaderTools } from './tools/registry';
import { buildSegments, highlightRange, selectionRef, bookInfo } from './textData';
import { refToPath } from './refKind';
import { recordReading } from './collections';
import ReaderHeader from './ReaderHeader';
import ReaderSettings from './ReaderSettings';
import TextStream, { segmentDomId } from './TextStream';
import Toolbelt from './Toolbelt';
import ToolPanel from './ToolPanel';
import WhatAmIReading from './WhatAmIReading';
import './styles.css';

const fromQuery = v => (v ? String(v).replace(/_/g, ' ') : null);

export function fetchSection(ref, versions = {}) {
  return new Promise(resolve => resolve(Sefaria.getText(ref, { context: 1, enVersion: versions.en || null, heVersion: versions.he || null })))
    .then(d => {
      if (!d || d.error) { throw new Error((d && d.error) || 'No text'); }
      return d;
    });
}

function scrollTo(ref, block = 'center') {
  if (typeof document === 'undefined') { return; }
  const el = document.getElementById(segmentDomId(ref));
  if (el && el.scrollIntoView) { el.scrollIntoView({ block }); }
}

function Skeleton() {
  return (
    <div className="ln-reader-skeleton" aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => <span key={i} className={`ln-skeleton-line ${i % 3 === 2 ? 'short' : ''}`} />)}
    </div>
  );
}

export default function ReaderPage({ params, pathname, query = {} }) {
  const tref = params.tref;
  const { t, lang } = useT();
  const { persona } = usePersona();
  const [storedLang] = useContentLang();
  const contentLang = isContentLang(query.lang) ? query.lang : storedLang;
  const [biLayout, setBiLayout] = useKv('reader.biLayout', 'stacked');
  const [flow, setFlow] = useKv('reader.flow', 'segmented');
  const [fontScale, setFontScale] = useKv('reader.fontScale', 1);
  const [vowels, setVowels] = useKv('reader.vowels', true);
  const [cantillation, setCantillation] = useKv('reader.cantillation', true);
  const [versions, setVersions] = useState({ he: fromQuery(query.vhe), en: fromQuery(query.ven) });
  const [versionsOpen, setVersionsOpen] = useState(persona === 'scholar');
  const [state, setState] = useState({ status: 'loading', sections: [], error: null });
  const [loadingMore, setLoadingMore] = useState(null);
  const [sel, setSel] = useState(null);
  const [toolId, setToolId] = useState(null);
  const [hint, setHint] = useState(null);
  const [activeRef, setActiveRef] = useState(null);
  const tools = useReaderTools(persona);
  const streamRef = useRef(null);
  const sentinel = useRef(null);
  const prevHeight = useRef(null);

  // Load the requested section; reload when the ref or the chosen versions change.
  useEffect(() => {
    let live = true;
    setState({ status: 'loading', sections: [], error: null });
    setSel(null); setToolId(null); setHint(null); setActiveRef(null);
    fetchSection(tref, versions).then(data => {
      if (!live) { return; }
      const section = { data, segments: buildSegments(data) };
      setState({ status: 'ready', sections: [section], error: null });
      recordReading({ ref: data.sectionRef || data.ref, heRef: data.heSectionRef || data.heRef, title: data.indexTitle, heTitle: data.heIndexTitle, persona });
      const hi = highlightRange(data);
      if (hi && section.segments[hi.from]) { setTimeout(() => scrollTo(section.segments[hi.from].ref), 0); }
      if (query.with && section.segments.length) {
        const from = hi ? hi.from : 0;
        const to = Math.min(hi ? hi.to : 0, section.segments.length - 1);
        setSel({ anchor: section.segments[from].ref, focus: section.segments[to].ref });
        setHint({ with: query.with === 'all' ? null : fromQuery(query.with) });
        setToolId('connections');
      }
    }).catch(err => { if (live) { setState({ status: 'error', sections: [], error: err }); } });
    return () => { live = false; };
  }, [tref, versions.he, versions.en]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ?ven= / ?vhe= in the URL when the reader changes versions.
  useEffect(() => {
    if (typeof window === 'undefined') { return; }
    const sp = new URLSearchParams(window.location.search);
    const before = sp.toString();
    ['he', 'en'].forEach(k => {
      const key = k === 'he' ? 'vhe' : 'ven';
      if (versions[k]) { sp.set(key, versions[k].replace(/ /g, '_')); } else { sp.delete(key); }
    });
    if (sp.toString() !== before) {
      const qs = sp.toString();
      window.history.replaceState({ libraryNext: true }, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [versions.he, versions.en]);

  const flat = useMemo(() => state.sections.flatMap(s => s.segments), [state.sections]);
  const first = state.sections[0] || null;
  const last = state.sections[state.sections.length - 1] || null;
  const headData = (activeRef && (state.sections.find(s => (s.data.sectionRef || s.data.ref) === activeRef) || {}).data) || (first && first.data) || null;

  useEffect(() => {
    if (!headData || typeof document === 'undefined') { return; }
    document.title = `${lang === 'he' ? (headData.heSectionRef || headData.heRef) : (headData.sectionRef || headData.ref)} | ${t('site.name')}`;
  }, [headData, lang, t]);

  // Selection → segments, refs and the tool contract object.
  const selectedSegments = useMemo(() => {
    if (!sel) { return []; }
    const a = flat.findIndex(s => s.ref === sel.anchor);
    const b = flat.findIndex(s => s.ref === sel.focus);
    if (a === -1 || b === -1) { return []; }
    return flat.slice(Math.min(a, b), Math.max(a, b) + 1);
  }, [sel, flat]);
  const selectedRefs = useMemo(() => new Set(selectedSegments.map(s => s.ref)), [selectedSegments]);
  const selection = useMemo(() => {
    if (!selectedSegments.length) { return null; }
    return { ...selectionRef(selectedSegments), he: selectedSegments.map(s => s.he).join('\n'), en: selectedSegments.map(s => s.en).join('\n'), segments: selectedSegments };
  }, [selectedSegments]);

  const onSelect = useCallback((ref, { shift } = {}) => {
    setSel(cur => {
      if (shift && cur) { return { anchor: cur.anchor, focus: ref }; }
      if (cur && cur.anchor === ref && cur.focus === ref) { setToolId(null); return null; }
      return { anchor: ref, focus: ref };
    });
  }, []);
  const clearSelection = useCallback(() => { setSel(null); setToolId(null); }, []);

  // Keyboard: j/k or arrows move the selection (shift extends), Esc closes the panel, then the selection.
  useEffect(() => {
    if (typeof document === 'undefined') { return undefined; }
    const onKey = (e) => {
      if (isModalOpen()) { return; }
      const target = e.target;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) { return; }
      if (e.key === 'Escape') {
        if (toolId) { setToolId(null); } else if (sel) { setSel(null); }
        return;
      }
      if (target && target.closest && target.closest('.ln-reader-panel')) { return; }
      const down = e.key === 'j' || e.key === 'ArrowDown';
      const up = e.key === 'k' || e.key === 'ArrowUp';
      if ((!down && !up) || e.altKey || e.metaKey || e.ctrlKey || !flat.length) { return; }
      e.preventDefault();
      const cur = sel ? flat.findIndex(s => s.ref === sel.focus) : -1;
      const next = cur === -1 ? (down ? 0 : flat.length - 1) : Math.max(0, Math.min(flat.length - 1, cur + (down ? 1 : -1)));
      const ref = flat[next].ref;
      setSel(e.shiftKey && sel ? { anchor: sel.anchor, focus: ref } : { anchor: ref, focus: ref });
      scrollTo(ref, 'nearest');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel, toolId, flat]);

  // Next / previous sections.
  const loadMore = useCallback((dir) => {
    const edge = dir === 'next' ? (last && last.data.next) : (first && first.data.prev);
    if (!edge || loadingMore) { return; }
    setLoadingMore(dir);
    fetchSection(edge, versions).then(data => {
      const section = { data, segments: buildSegments(data) };
      if (dir === 'prev' && typeof document !== 'undefined') { prevHeight.current = document.documentElement.scrollHeight; }
      setState(s => ({ ...s, sections: dir === 'next' ? [...s.sections, section] : [section, ...s.sections] }));
      recordReading({ ref: data.sectionRef || data.ref, heRef: data.heSectionRef || data.heRef, title: data.indexTitle, heTitle: data.heIndexTitle, persona });
    }).catch(() => {}).then(() => setLoadingMore(null));
  }, [first, last, loadingMore, versions, persona]);

  useLayoutEffect(() => {
    if (prevHeight.current === null || typeof document === 'undefined') { return; }
    const diff = document.documentElement.scrollHeight - prevHeight.current;
    prevHeight.current = null;
    if (diff) { window.scrollBy(0, diff); }
  }, [state.sections]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !sentinel.current || state.status !== 'ready' || !(last && last.data.next)) { return undefined; }
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { loadMore('next'); } }, { rootMargin: '600px 0px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [state.status, last, loadMore]);

  // Which loaded section is in view → header and URL follow it.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !streamRef.current || state.sections.length < 2) { return undefined; }
    const els = streamRef.current.querySelectorAll('.ln-section');
    const io = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) { setActiveRef(visible[0].target.getAttribute('data-section-ref')); }
    }, { rootMargin: '-25% 0px -60% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [state.sections]);
  useEffect(() => {
    if (!activeRef || typeof window === 'undefined') { return; }
    const path = refToPath(activeRef);
    if (window.location.pathname !== path) { window.history.replaceState({ libraryNext: true }, '', path + window.location.search); }
  }, [activeRef]);

  // Small screens: the toolbelt / sheet sit at the bottom, so lift the assistant dock button out of the way.
  useEffect(() => {
    if (typeof document === 'undefined') { return undefined; }
    document.body.classList.toggle('ln-reader-bottom-ui', !!selection);
    return () => document.body.classList.remove('ln-reader-bottom-ui');
  }, [selection]);

  const activeTool = toolId ? tools.find(x => x.id === toolId) || null : null;
  const closeTool = useCallback(() => setToolId(null), []);
  const pickTool = useCallback((tool) => setToolId(cur => (cur === tool.id ? null : tool.id)), []);
  const book = headData ? bookInfo(headData) : null;
  const highlight = first ? highlightRange(first.data) : null;
  const classicHref = `${pathname || (typeof window !== 'undefined' ? window.location.pathname : '/')}?library=classic`;

  return (
    <div className={`ln-reader ${activeTool && selection ? 'has-panel' : ''} is-${contentLang}`} style={{ '--ln-read-scale': String(fontScale) }} data-persona={persona} data-font-scale={fontScale}>
      <div className="ln-container">
        <ReaderHeader tref={tref} data={headData} current={versions} versionsOpen={versionsOpen}
                      onToggleVersions={() => setVersionsOpen(o => !o)}
                      onVersion={(k, v) => setVersions(s => ({ ...s, [k]: v }))} />
      </div>
      <div className="ln-container ln-reader-body">
        <div className="ln-reader-main">
          <ReaderSettings contentLang={contentLang} biLayout={biLayout} setBiLayout={setBiLayout} flow={flow} setFlow={setFlow}
                          fontScale={fontScale} setFontScale={setFontScale} vowels={vowels} setVowels={setVowels}
                          cantillation={cantillation} setCantillation={setCantillation} />
          {state.status === 'loading' && <Skeleton />}
          {state.status === 'error' && (
            <div className="ln-card ln-reader-error" role="alert">
              <p>{t('reader.error')}</p>
              <div className="ln-row">
                <button type="button" className="ln-btn" onClick={() => setVersions(v => ({ ...v }))}>{t('reader.retry')}</button>
                <a className="ln-btn ln-btn-quiet" href={classicHref}>{t('reader.classic')}</a>
              </div>
            </div>
          )}
          {state.status === 'ready' && first && (
            <>
              {first.data.prev ? (
                <button type="button" className="ln-btn ln-btn-quiet ln-reader-more" onClick={() => loadMore('prev')} disabled={!!loadingMore}>
                  {loadingMore === 'prev' ? t('reader.loadingMore') : t('reader.loadPrev', { ref: first.data.prev })}
                </button>
              ) : <p className="ln-reader-edge ln-small ln-muted">{t('reader.start')}</p>}
              {persona === 'newcomer' && <WhatAmIReading book={bookInfo(first.data)} data={first.data} />}
              <div ref={streamRef}>
                <TextStream sections={state.sections} contentLang={contentLang} biLayout={biLayout} flow={flow} vowels={vowels}
                            cantillation={vowels && cantillation} selectedRefs={selectedRefs} focusRef={sel ? sel.focus : null}
                            highlight={highlight} onSelect={onSelect} showSectionHeads={state.sections.length > 1}
                            renderAfterSegment={() => (selection
                              ? <Toolbelt selection={selection} tools={tools} activeToolId={toolId} onPick={pickTool} onClear={clearSelection} />
                              : null)} />
              </div>
              {last.data.next ? (
                <button type="button" className="ln-btn ln-reader-more" onClick={() => loadMore('next')} disabled={!!loadingMore}>
                  {loadingMore === 'next' ? t('reader.loadingMore') : t('reader.loadNext', { ref: last.data.next })}
                </button>
              ) : <p className="ln-reader-edge ln-small ln-muted">{t('reader.end')}</p>}
              <div ref={sentinel} className="ln-reader-sentinel" aria-hidden="true" />
              <p className="ln-reader-keys ln-small ln-muted">{t('reader.keys')}</p>
            </>
          )}
        </div>
        {activeTool && selection && book && (
          <ToolPanel tool={activeTool} selection={selection} book={book} close={closeTool} extra={{ hint }} />
        )}
      </div>
    </div>
  );
}
