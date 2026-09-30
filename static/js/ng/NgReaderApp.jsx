/**
 * NG mobile reader root. Owns the reader state (ref, versions, settings, overlay) and keeps
 * the URL in the classic grammar. It renders from props alone, so the server HTML contains
 * the text; everything that needs the browser runs in effects.
 *
 * Props (see reader/ng.py ng_reader_props): interfaceLang, initialSettings, initialPanel
 * {ref, currVersions, highlightedRefs, settings, text}, translationLanguagePreference.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {unstable_batchedUpdates as batchedUpdates} from 'react-dom';
import Sefaria from '../sefaria/sefaria';
import {NgReaderContext, OVERLAY, useIsomorphicLayoutEffect} from './context';
import {inSameBook, sectionFromApi, segmentRefsIn} from './text';
import {initialSettingsFromProps, layoutFor, persistSetting, resolveSettingKey} from './settings';
import {buildReaderUrl, normalizeCurrVersions} from './url';
import {strings as stringsFor} from './strings';
import {useSectionStream} from './infiniteLoad';
import {useHeaderVisibility} from './headerScroll';
import {useCurrentSegment} from './currentSegment';
import {pokeScroll} from './scroll';
import ReaderHeader from './ReaderHeader';
import TextStream from './TextStream';
import OverlaySlot, {DEFAULT_PANELS} from './OverlaySlot';
import {HOME, initialOverlay, useOverlayState} from './overlayState';
import {connectionsParam} from './associated';
import {useLinkCounts, usePinnedCommentary, useStreamLinks} from './streamLinks';
import {usePins} from './pins';
import SheetSlot from './sheets/SheetSlot';

const HEADER_OFFSET = 88;  // keep scrolled-to text clear of the header
const SECTION_OFFSET = 68;  // a section's title just under the header (the stream's own top padding)
const DEFAULT_VERSIONS = {en: null, he: null};

function findSectionElement(root, ref) {
  if (!root) { return null; }
  return Array.from(root.children).find(el => el.getAttribute('data-ref') === ref) || null;
}

function findSegmentElement(root, ref) {
  if (!root) { return null; }
  return Array.from(root.querySelectorAll('[data-ng="segment"]')).find(el => el.getAttribute('data-ref') === ref) || null;
}

export const FLASH_MS = 2200;

/**
 * Mark a segment the reader just jumped to (from search, or a parasha in the table of contents)
 * for a moment. The attribute is outside React's props, so a re-render leaves it alone.
 */
function flashSegment(el, timers) {
  if (!el) { return; }
  el.removeAttribute('data-flash');
  void el.offsetWidth;  // restart the animation if it is already running
  el.setAttribute('data-flash', 'true');
  timers.push(setTimeout(() => el.removeAttribute('data-flash'), FLASH_MS));
}

/**
 * Load the section containing `ref` with the reader's versions, through the same data-layer
 * call the classic reader uses. `withContext` makes a segment ref come back with its whole section.
 */
export function makeSectionLoader(currVersions, translationLanguagePreference) {
  return (ref) => Sefaria.getTextFromCurrVersions(ref, normalizeCurrVersions(currVersions), translationLanguagePreference, true)
    .then(data => {
      const section = sectionFromApi(data);
      if (!section) { throw new Error(`No text for ${ref}`); }
      return section;
    });
}

export default function NgReaderApp(props) {
  const {interfaceLang = 'english', translationLanguagePreference = null, overlayPanels = DEFAULT_PANELS} = props;
  const initialPanel = props.initialPanel || {};
  const interfaceDir = interfaceLang === 'hebrew' ? 'rtl' : 'ltr';
  const strings = stringsFor(interfaceLang);

  const initialSection = useMemo(() => sectionFromApi(initialPanel.text), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [settings, setSettings] = useState(() => initialSettingsFromProps(props));
  const [currVersions, setCurrVersionsState] = useState(() => normalizeCurrVersions(initialPanel.currVersions));
  const [highlightedRefs, setHighlightedRefs] = useState(() => initialPanel.highlightedRefs || []);
  // A segment or range URL (Genesis 1:3) keeps that ref in the URL while the reader stays in its section.
  const [landing, setLanding] = useState(() => (initialSection && (initialPanel.highlightedRefs || []).length
    ? {sectionRef: initialSection.ref, ref: initialPanel.ref} : null));
  const [firstOverlay] = useState(() => initialOverlay(initialPanel, initialSection));
  const overlayUrlRef = useRef(null);
  const overlays = useOverlayState(firstOverlay, (o) => overlayUrlRef.current(o));
  const overlay = overlays.overlay;
  const [historyTick, setHistoryTick] = useState(0);  // bumped on popstate, to re-sync the URL
  const popPending = useRef(false);  // a popstate is loading its entry's text
  const [hydrated, setHydrated] = useState(false);  // exposed as data-hydrated, for tests
  const streamRef = useRef(null);
  const anchorRef = useRef(null);
  const scrollTargetRef = useRef(null);  // a segment to bring into view once a reset stream renders
  const flashTargetRef = useRef(null);   // ... and flash, when goToRef asked for it
  const flashTimers = useRef([]);
  const searchMemory = useRef(null);     // the search sheet's last {book, query}
  const [generation, setGeneration] = useState(0);  // bumped whenever openRef() replaces the stream

  const loadSection = useMemo(() => makeSectionLoader(currVersions, translationLanguagePreference),
    [currVersions, translationLanguagePreference]);

  // Keep the reading position still when a section is inserted above it.
  const recordAnchor = useCallback(() => {
    const root = streamRef.current;
    const firstSection = root && root.querySelector('[data-ng="section"]');
    anchorRef.current = firstSection ? {ref: firstSection.getAttribute('data-ref'), top: firstSection.getBoundingClientRect().top} : null;
  }, []);

  const {state: stream, retry, reset} = useSectionStream({initialSection, loadSection, onBeforeInsertPrev: recordAnchor});
  const sections = stream.sections;
  const atEnd = stream.next.status === 'done';
  const header = useHeaderVisibility({pinned: overlay.type !== OVERLAY.NONE, atEnd});
  const sectionsKey = sections.map(s => s.ref).join('|');
  const current = useCurrentSegment(streamRef, [sectionsKey, generation, settings.language, settings.biLayout, settings.fontSize]);
  const streamLinks = useStreamLinks(streamRef, sections, [sectionsKey, generation, settings.language,
    settings.layoutDefault, settings.layoutTalmud, settings.layoutTanakh]);
  const linkCounts = useLinkCounts(sections, streamLinks.bySegment);
  const currentSegRef = useRef(current);
  currentSegRef.current = current;
  const currVersionsRef = useRef(currVersions);
  currVersionsRef.current = currVersions;
  /** The segment the reader is on and where it sits on screen: {ref, top}, or null. */
  const readingPosition = () => {
    const seg = currentSegRef.current;
    const el = seg && findSegmentElement(streamRef.current, seg.ref);
    return el ? {ref: seg.ref, top: Math.round(el.getBoundingClientRect().top)} : null;
  };
  const [pins, togglePin] = usePins();
  const pinned = usePinnedCommentary(sections, streamLinks.bySegment, pins);

  useIsomorphicLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) { return; }
    anchorRef.current = null;
    const el = findSectionElement(streamRef.current, anchor.ref);
    if (el) {
      const delta = el.getBoundingClientRect().top - anchor.top;
      if (delta) {
        window.scrollBy(0, delta);
        header.rebase(window.pageYOffset);
      }
    }
  }, [sections[0] && sections[0].ref]);

  // After openRef()/setCurrVersions() replaced the stream: bring the requested segment into view.
  useIsomorphicLayoutEffect(() => {
    const next = scrollTargetRef.current;
    if (!next) { return; }
    scrollTargetRef.current = null;
    const target = typeof next === 'string' ? next : next.ref;
    const el = findSegmentElement(streamRef.current, target);
    const flash = flashTargetRef.current === target;
    // Back to a text the reader left: the segment they were on, where it was on screen.
    let offset = typeof next === 'object' && typeof next.top === 'number' ? next.top : HEADER_OFFSET;
    if (el && flash) {
      // A jump to one passage centers it (where the header takes its ref from), or tops it if it is tall.
      offset = Math.max(HEADER_OFFSET, (window.innerHeight - el.getBoundingClientRect().height) / 2);
    }
    let y = el ? el.getBoundingClientRect().top + window.pageYOffset - offset : 0;
    const sectionEl = el && !flash && typeof next === 'string' ? el.closest('[data-ng="section"]') : null;
    if (sectionEl && sectionEl.querySelector('[data-ng="segment"]') === el) {
      // The section's first segment: show the section's title (and the book's, at its start) too.
      y = sectionEl === streamRef.current.querySelector('[data-ng="section"]') && !sectionEl.previousElementSibling
        ? 0 : sectionEl.getBoundingClientRect().top + window.pageYOffset - SECTION_OFFSET;
    }
    window.scrollTo(0, Math.max(0, y));
    header.rebase(window.pageYOffset);
    if (flash) { flashSegment(el, flashTimers.current); }
    flashTargetRef.current = null;
  }, [sectionsKey, generation]);

  useEffect(() => () => flashTimers.current.forEach(clearTimeout), []);

  // Re-check the stream's edges whenever content changes (a short section may not fill the screen).
  useEffect(() => { pokeScroll(); }, [sections.length, stream.prev.status]);

  // First mount: take over scroll restoration and bring a highlighted segment into view.
  useEffect(() => {
    if ('scrollRestoration' in window.history) { window.history.scrollRestoration = 'manual'; }
    const target = highlightedRefs.length ? findSegmentElement(streamRef.current, highlightedRefs[0]) : null;
    if (target) {
      window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET));
    }
    header.rebase(window.pageYOffset);
    // The landing entry names its ref, so Back to it from an in-app jump reloads it.
    if (urlRef && !(window.history.state && window.history.state.ngRef)) {
      window.history.replaceState({...(window.history.state || {}), ngRef: urlRef, ngVersions: currVersions},
        '', window.location.pathname + window.location.search);
    }
    if (urlRef) { overlays.seedHistory({ngRef: urlRef, ngVersions: currVersions}, currentUrl); }  // a with= page opens with the panel
    setHydrated(true);
    const timer = setTimeout(pokeScroll, 0);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The section the reader is in, and the ref the URL and title should carry for it.
  // `current` can lag a render behind a replaced stream; fall back to the stream's first section.
  const trackedSection = current && sections.find(s => s.ref === current.sectionRef);
  const currentSection = trackedSection || sections[0] || null;
  const currentSectionRef = currentSection ? currentSection.ref : null;
  const urlRef = landing && currentSectionRef === landing.sectionRef ? landing.ref : currentSectionRef;
  const currentUrl = urlRef ? buildReaderUrl({ref: urlRef, currVersions, language: settings.language}) : null;
  // An overlay entry's URL: the associated panel's segment and `with=` (the classic grammar), or the reading URL.
  overlayUrlRef.current = (o) => (o.type === OVERLAY.ASSOCIATED
    ? buildReaderUrl({ref: o.ref, currVersions, language: settings.language, connections: connectionsParam(o.stack)})
    : currentUrl);
  const urlRefRef = useRef(urlRef);
  urlRefRef.current = urlRef;

  const titleSuffixRef = useRef(null);
  useEffect(() => {
    if (titleSuffixRef.current === null) {
      const parts = document.title.split(' | ');
      titleSuffixRef.current = parts.length > 1 ? parts.slice(1).join(' | ') : '';
    }
    if (!currentUrl || popPending.current) { return; }
    // While history catches up with an overlay that just opened or closed, leave the URL alone.
    const open = overlay.type !== OVERLAY.NONE;
    if (overlays.isOverlayEntry() !== open) { return; }
    const target = open ? overlayUrlRef.current(overlay) : currentUrl;
    const here = window.location.pathname + window.location.search;
    if (here !== target) {
      window.history.replaceState(open ? window.history.state : {ngRef: urlRef, ngVersions: currVersions}, '', target);
    }
    const title = interfaceLang === 'hebrew' && currentSection ? currentSection.heRef : urlRef;
    if (titleSuffixRef.current && currentSection) {
      document.title = `${title} | ${titleSuffixRef.current}`;
    }
  }, [currentUrl, overlay, historyTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSetting = useCallback((option, value) => {
    const key = resolveSettingKey(option, currentSection);
    setSettings(prev => (prev[key] === value ? prev : {...prev, [key]: value}));
    persistSetting(key, value);
  }, [currentSection]);

  /**
   * Show a different ref: reload the stream around it. `push` adds a history entry; `focus` is
   * the segment to scroll to (default: the ref itself when it is a segment, else the top).
   * `highlight` marks a segment ref as a segment URL does; `flash` marks it only for a moment.
   * Either keeps the segment in the URL while the reader stays in its section.
   */
  const openRef = useCallback((ref, {versions = currVersions, push = true, focus = null, focusTop = null, highlight = true, flash = false} = {}) => {
    return makeSectionLoader(versions, translationLanguagePreference)(ref).then(section => {
      const isSegment = ref !== section.ref;
      // A segment, or a range of them ("Rashi on Genesis 1:1:1-3"): the segments it names here.
      const named = isSegment ? segmentRefsIn(ref, section) : [];
      const url = buildReaderUrl({ref, currVersions: versions, language: settings.language});
      const ngVersions = normalizeCurrVersions(versions);
      if (push) {
        // The entry being left remembers where the reader was, so Back returns to that spot.
        const leaving = readingPosition();
        if (leaving && window.history.state && window.history.state.ngRef) {
          window.history.replaceState({...window.history.state, ngFocus: leaving}, '', window.location.pathname + window.location.search);
        }
      }
      // Replacing keeps an open overlay's history entry (a version change from the config panel).
      const state = push ? {ngRef: ref, ngVersions} : {...(window.history.state || {}), ngRef: ref, ngVersions};
      window.history[push ? 'pushState' : 'replaceState'](state, '', url);
      const first = named[0] || (section.segments[0] && section.segments[0].ref);
      scrollTargetRef.current = focus ? {ref: focus, top: focusTop} : first;
      flashTargetRef.current = flash && isSegment ? first : null;
      batchedUpdates(() => {
        setCurrVersionsState(ngVersions);
        setHighlightedRefs(isSegment && highlight && !flash ? named : []);
        setLanding(isSegment && (highlight || flash) ? {sectionRef: section.ref, ref} : null);
        reset(section);
        setGeneration(g => g + 1);
      });
    });
  }, [currVersions, translationLanguagePreference, reset, settings.language]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Switch versions for the whole stream, keeping the reader on the segment they were reading. */
  const setCurrVersions = useCallback((versions) => {
    const focus = current ? current.ref : null;
    return openRef(currentSectionRef, {versions, push: false, focus, highlight: false});
  }, [openRef, currentSectionRef, current]);

  useEffect(() => {
    const onPop = (e) => {
      const state = e.state;
      overlays.onPopState(state);
      setHistoryTick(t => t + 1);
      // Leaving an overlay entry lands on the same text: only a different ref reloads the stream.
      if (state && state.ngRef && state.ngRef !== urlRefRef.current) {
        // Until the entry's text is loaded, the reader still shows the one it left: keep the URL
        // effect from writing that one's URL into this entry.
        const focus = state.ngFocus || null;
        popPending.current = true;
        const done = () => { popPending.current = false; };
        openRef(state.ngRef, {push: false, versions: state.ngVersions || currVersionsRef.current,
          focus: focus && focus.ref, focusTop: focus && focus.top}).then(done, done);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [openRef]);

  const segmentByRef = useCallback((ref) => {
    for (const section of sections) {
      const segment = section.segments.find(s => s.ref === ref);
      if (segment) { return segment; }
    }
    return null;
  }, [sections]);

  /** Open associated texts on a segment (default: the one nearest the center), optionally deeper: [view, ...]. */
  const openAssociated = useCallback((segment = current, views = []) => {
    if (!segment) { return; }
    const heRef = segment.heRef || (segmentByRef(segment.ref) || {}).heRef || null;
    overlays.open({type: OVERLAY.ASSOCIATED, ref: segment.ref, heRef, stack: [HOME, ...views]});
  }, [current, segmentByRef, overlays.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const openConfig = useCallback(() => overlays.open({type: OVERLAY.CONFIG}), [overlays.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const openToc = useCallback(() => overlays.open({type: OVERLAY.TOC}), [overlays.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const openSearch = useCallback(() => overlays.open({type: OVERLAY.SEARCH}), [overlays.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeOverlay = overlays.close;
  /**
   * Open an associated text front and center: close any overlay (its history entries), then make
   * `ref` the primary text of this reader, in a new history entry, so Back returns to the text
   * and spot the reader left. A commentary ("Rashi on Genesis 1:1:1-3"), a code ("Shulchan
   * Arukh, Orach Chayim 1:1") or any other book opens in its default versions; the reader's
   * chosen versions carry over only within the same book.
   */
  const openText = useCallback((ref) => {
    if (!ref) { return Promise.resolve(); }
    const versions = inSameBook(ref, currentSection) ? currVersions : DEFAULT_VERSIONS;
    makeSectionLoader(versions, translationLanguagePreference)(ref).catch(() => {});  // usually cached once the overlay has closed
    const go = () => openRef(ref, {versions});
    return overlay.type !== OVERLAY.NONE ? overlays.close().then(go) : go();
  }, [overlay.type, overlays.close, openRef, currVersions, currentSection, translationLanguagePreference]); // eslint-disable-line react-hooks/exhaustive-deps
  const openRefFromOverlay = openText;
  /**
   * Go to a ref from anywhere in the reader (the table of contents, search results): close
   * whatever overlay is open (its history entries), then show the ref in the stream with a new
   * history entry. `flash` marks a segment for a moment instead of highlighting it. The text is
   * requested at once, so it is usually cached by the time the overlay has closed.
   */
  const goToRef = useCallback((ref, {flash = false} = {}) => {
    makeSectionLoader(currVersions, translationLanguagePreference)(ref).catch(() => {});
    const go = () => openRef(ref, flash ? {flash: true, highlight: false} : {});
    return overlay.type !== OVERLAY.NONE ? overlays.close().then(go) : go();
  }, [overlay.type, overlays.close, openRef, currVersions, translationLanguagePreference]); // eslint-disable-line react-hooks/exhaustive-deps

  const onStreamClick = useCallback((e) => {
    const target = e.target;
    const closest = (sel) => (target.closest ? target.closest(sel) : null);
    const badge = closest('[data-ng="segment-badge"]');
    if (badge) {
      e.preventDefault();
      openAssociated(segmentByRef(badge.getAttribute('data-ref')) || {ref: badge.getAttribute('data-ref')});
      return;
    }
    const pin = closest('[data-ng="pin"]');
    if (pin) {
      // A pinned comment: its Open button makes it the primary text; its name opens the work in
      // the panel, and a ref it cites opens there as a tangent. A tap anywhere else on the
      // comment expands or collapses it (PinnedComment), and never toggles the header.
      const open = closest('[data-ng="pin-open"]');
      if (open) {
        e.preventDefault();
        openText(open.getAttribute('data-open-ref'));
        return;
      }
      const cited = closest('a.refLink');
      if (closest('[data-ng="pin-name"]') || cited) {
        e.preventDefault();
        const segment = segmentByRef(pin.getAttribute('data-ref')) || {ref: pin.getAttribute('data-ref')};
        const views = [{kind: 'book', key: pin.getAttribute('data-pin-key')}];
        if (cited && cited.getAttribute('data-ref')) { views.push({kind: 'ref', ref: cited.getAttribute('data-ref')}); }
        openAssociated(segment, views);
      }
      return;
    }
    const marker = target.closest && target.closest('sup');
    if (marker) {
      // Footnotes: <sup class="footnote-marker">a</sup><i class="footnote">...</i>. Tap to open inline.
      const note = marker.nextElementSibling;
      if (note && note.matches('i.footnote')) {
        e.preventDefault();
        note.classList.toggle('ng-footnote-open');
        marker.setAttribute('aria-expanded', note.classList.contains('ng-footnote-open') ? 'true' : 'false');
        return;
      }
    }
    if (target.closest && target.closest('a.namedEntityLink')) {
      // Named entities open in the associated panel once it exists; don't leave the text meanwhile.
      e.preventDefault();
      return;
    }
    if (target.closest && target.closest('a, button')) { return; }
    const selection = window.getSelection && window.getSelection();
    if (selection && !selection.isCollapsed) { return; }
    header.setVisible(!header.visible);
  }, [header, openAssociated, segmentByRef, openText]);

  const urlFor = useCallback((ref) => buildReaderUrl({ref, currVersions, language: settings.language}),
    [currVersions, settings.language]);
  const currentLayout = layoutFor(settings, currentSection);
  const currentRef = current ? current.ref : (initialPanel.ref || (initialSection && initialSection.ref));
  // Before the first measurement (the server's render): the URL's segment, as the English header shows it.
  const landingSegment = !current && initialSection
    ? initialSection.segments.find(sg => sg.ref === initialPanel.ref || sg.ref === (initialPanel.highlightedRefs || [])[0]) : null;
  const currentHeRef = current ? current.heRef : (landingSegment || initialSection || {}).heRef;

  const api = {
    interfaceLang, interfaceDir, strings, translationLanguagePreference,
    settings, setSetting, currentLayout,
    currVersions, setCurrVersions, openRef,
    overlay, openAssociated, openConfig, openToc, openSearch, closeOverlay, goToRef, searchMemory,
    overlayPushView: overlays.pushView, overlayReplaceView: overlays.replaceView,
    overlayBack: overlays.back, overlayJump: overlays.jump, openRefFromOverlay, openText,
    currentSegment: current, currentSection, currentUrl,
    sections, segmentByRef, uid: props._uid || null,
    pins, togglePin,
  };

  if (!initialSection) {
    return <div className="ng-reader" data-ng="reader" dir={interfaceDir} lang={interfaceLang === 'hebrew' ? 'he' : 'en'} />;
  }

  return (
    <NgReaderContext.Provider value={api}>
      <div className="ng-reader" data-ng="reader" dir={interfaceDir} lang={interfaceLang === 'hebrew' ? 'he' : 'en'}
           data-interface={interfaceLang} data-overlay={overlay.type} data-hydrated={hydrated ? 'true' : 'false'}>
        <ReaderHeader visible={header.visible} currentRef={currentRef} currentHeRef={currentHeRef}
                      section={currentSection} interfaceLang={interfaceLang} strings={strings} onOpenSettings={openConfig}
                      onOpenToc={openToc} onOpenSearch={openSearch} openSheet={overlay.type} />
        <TextStream sections={sections} settings={settings} interfaceLang={interfaceLang} interfaceDir={interfaceDir}
                    highlightedRefs={highlightedRefs} stream={stream} strings={strings} onRetry={retry}
                    onClick={onStreamClick} streamRef={streamRef} urlFor={urlFor} linkCounts={linkCounts} pinned={pinned}
                    anchorRef={overlay.type === OVERLAY.ASSOCIATED ? overlay.ref : null} />
        <OverlaySlot panels={overlayPanels} />
        <SheetSlot sheets={props.sheets} />
      </div>
    </NgReaderContext.Provider>
  );
}
