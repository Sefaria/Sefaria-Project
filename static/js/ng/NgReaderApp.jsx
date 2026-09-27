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
import {sectionFromApi} from './text';
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

const HEADER_OFFSET = 88;  // keep scrolled-to text clear of the header

function findSectionElement(root, ref) {
  if (!root) { return null; }
  return Array.from(root.children).find(el => el.getAttribute('data-ref') === ref) || null;
}

function findSegmentElement(root, ref) {
  if (!root) { return null; }
  return Array.from(root.querySelectorAll('[data-ng="segment"]')).find(el => el.getAttribute('data-ref') === ref) || null;
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
  const [overlay, setOverlay] = useState({type: OVERLAY.NONE});
  const [hydrated, setHydrated] = useState(false);  // exposed as data-hydrated, for tests
  const streamRef = useRef(null);
  const anchorRef = useRef(null);
  const scrollTargetRef = useRef(null);  // a segment to bring into view once a reset stream renders
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
    const target = scrollTargetRef.current;
    if (!target) { return; }
    scrollTargetRef.current = null;
    const el = findSegmentElement(streamRef.current, target);
    window.scrollTo(0, el ? Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET) : 0);
    header.rebase(window.pageYOffset);
  }, [sectionsKey, generation]);

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

  const titleSuffixRef = useRef(null);
  useEffect(() => {
    if (titleSuffixRef.current === null) {
      const parts = document.title.split(' | ');
      titleSuffixRef.current = parts.length > 1 ? parts.slice(1).join(' | ') : '';
    }
    if (!currentUrl) { return; }
    const here = window.location.pathname + window.location.search;
    if (here !== currentUrl) {
      window.history.replaceState({ngRef: urlRef}, '', currentUrl);
    }
    const title = interfaceLang === 'hebrew' && currentSection ? currentSection.heRef : urlRef;
    if (titleSuffixRef.current && currentSection) {
      document.title = `${title} | ${titleSuffixRef.current}`;
    }
  }, [currentUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSetting = useCallback((option, value) => {
    const key = resolveSettingKey(option, currentSection);
    setSettings(prev => (prev[key] === value ? prev : {...prev, [key]: value}));
    persistSetting(key, value);
  }, [currentSection]);

  /**
   * Show a different ref: reload the stream around it. `push` adds a history entry; `focus` is
   * the segment to scroll to (default: the ref itself when it is a segment, else the top).
   */
  const openRef = useCallback((ref, {versions = currVersions, push = true, focus = null, highlight = true} = {}) => {
    return makeSectionLoader(versions, translationLanguagePreference)(ref).then(section => {
      const isSegment = ref !== section.ref;
      const url = buildReaderUrl({ref, currVersions: versions, language: settings.language});
      window.history[push ? 'pushState' : 'replaceState']({ngRef: ref}, '', url);
      scrollTargetRef.current = focus || (isSegment ? ref : (section.segments[0] && section.segments[0].ref));
      batchedUpdates(() => {
        setCurrVersionsState(normalizeCurrVersions(versions));
        setHighlightedRefs(isSegment && highlight ? [ref] : []);
        setLanding(isSegment && highlight ? {sectionRef: section.ref, ref} : null);
        reset(section);
        setGeneration(g => g + 1);
      });
    });
  }, [currVersions, translationLanguagePreference, reset, settings.language]);

  /** Switch versions for the whole stream, keeping the reader on the segment they were reading. */
  const setCurrVersions = useCallback((versions) => {
    const focus = current ? current.ref : null;
    return openRef(currentSectionRef, {versions, push: false, focus, highlight: false});
  }, [openRef, currentSectionRef, current]);

  useEffect(() => {
    const onPop = (e) => {
      if (e.state && e.state.ngRef) { openRef(e.state.ngRef, {push: false}); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [openRef]);

  const openAssociated = useCallback((segment = current) => {
    if (!segment) { return; }
    setOverlay({type: OVERLAY.ASSOCIATED, ref: segment.ref, heRef: segment.heRef || null});
  }, [current]);
  const openConfig = useCallback(() => setOverlay({type: OVERLAY.CONFIG}), []);
  const closeOverlay = useCallback(() => setOverlay({type: OVERLAY.NONE}), []);

  const onStreamClick = useCallback((e) => {
    const target = e.target;
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
  }, [header]);

  const urlFor = useCallback((ref) => buildReaderUrl({ref, currVersions, language: settings.language}),
    [currVersions, settings.language]);
  const currentLayout = layoutFor(settings, currentSection);
  const currentRef = current ? current.ref : (initialPanel.ref || (initialSection && initialSection.ref));
  const currentHeRef = current ? current.heRef : (initialSection && initialSection.heRef);

  const api = {
    interfaceLang, interfaceDir, strings,
    settings, setSetting, currentLayout,
    currVersions, setCurrVersions, openRef,
    overlay, openAssociated, openConfig, closeOverlay,
    currentSegment: current, currentSection, currentUrl,
    sections,
  };

  if (!initialSection) {
    return <div className="ng-reader" data-ng="reader" dir={interfaceDir} lang={interfaceLang === 'hebrew' ? 'he' : 'en'} />;
  }

  return (
    <NgReaderContext.Provider value={api}>
      <div className="ng-reader" data-ng="reader" dir={interfaceDir} lang={interfaceLang === 'hebrew' ? 'he' : 'en'}
           data-interface={interfaceLang} data-overlay={overlay.type} data-hydrated={hydrated ? 'true' : 'false'}>
        <ReaderHeader visible={header.visible} currentRef={currentRef} currentHeRef={currentHeRef}
                      section={currentSection} interfaceLang={interfaceLang} strings={strings} onOpenSettings={openConfig} />
        <TextStream sections={sections} settings={settings} interfaceLang={interfaceLang} interfaceDir={interfaceDir}
                    highlightedRefs={highlightedRefs} stream={stream} strings={strings} onRetry={retry}
                    onClick={onStreamClick} streamRef={streamRef} urlFor={urlFor} />
        <OverlaySlot panels={overlayPanels} />
      </div>
    </NgReaderContext.Provider>
  );
}
