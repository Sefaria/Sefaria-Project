/**
 * The mount point for the reader's overlay panels: `associated` (the texts associated with a
 * segment) on the interface's trailing side, and `config` (language, layout, versions) on its
 * leading side. Each is a drawer that leaves a sliver of the text visible.
 *
 * A panel is a component registered in `panels` under its overlay type. It receives
 * {overlay, onClose} and reads everything else from useNgReader().
 *
 * Motion: a horizontal drag on the text pulls a panel in under the finger (gestures.js), and a
 * drag on an open panel pushes it back out; releasing settles it by distance or velocity, on a
 * curve that picks up the finger's speed. The backdrop's opacity tracks the panel's progress.
 * Opening any other way (a badge, the header, a `with=` link) slides it in. Only transform and
 * opacity change, so the compositor does the work. Escape, the backdrop, the panel's close
 * button and the browser's Back button close it.
 *
 * `data-overlay` names the panel on screen (including while it is dragged in or animating out),
 * for styling; `data-state` and the reader root's `data-overlay` are the overlay state.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {OVERLAY, useIsomorphicLayoutEffect, useNgReader} from './context';
import {PANEL, panelOffset, panelSide, settleCurve, usePanelSwipes} from './gestures';
import {HOME} from './overlayState';
import AssociatedPanel from './panels/AssociatedPanel';
import ConfigPanel from './panels/ConfigPanel';

export const DEFAULT_PANELS = {
  [OVERLAY.ASSOCIATED]: AssociatedPanel,
  [OVERLAY.CONFIG]: ConfigPanel,
};

const EASE = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
const OPEN_MS = 300;

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function OverlaySlot({panels = DEFAULT_PANELS}) {
  const reader = useNgReader();
  const {overlay, closeOverlay, strings, interfaceDir, openAssociated, openConfig, currentSegment} = reader;
  // What is on screen: the open overlay, a panel being dragged in, or one animating out.
  const [shown, setShown] = useState(() => (overlay.type !== OVERLAY.NONE ? {overlay, phase: 'open'} : null));
  const sheetRef = useRef(null);
  const backdropRef = useRef(null);
  const progress = useRef(shown ? 1 : 0);
  const timer = useRef(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const type = shown ? shown.overlay.type : OVERLAY.NONE;
  const Panel = shown ? panels[type] : null;

  const dragWidth = useRef(0);
  const width = useCallback(() => {
    if (dragWidth.current) { return dragWidth.current; }
    const el = sheetRef.current;
    return (el && el.getBoundingClientRect().width) || (typeof window !== 'undefined' ? window.innerWidth - 44 : 320);
  }, []);

  /** Put the panel at `p` (0 closed, 1 open, >1 stretched), animating over `ms`, then call `done`. */
  const place = useCallback((panelType, p, ms = 0, done = null, easing = EASE) => {
    clearTimeout(timer.current);
    progress.current = p;
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    const duration = reducedMotion() ? 0 : ms;
    if (sheet) {
      sheet.style.transition = duration ? `transform ${duration}ms ${easing}` : 'none';
      sheet.style.transform = `translate3d(${panelOffset(panelType, interfaceDir, p, width())}px, 0, 0)`;
    }
    if (backdrop) {
      backdrop.style.transition = duration ? `opacity ${duration}ms ${easing}` : 'none';
      backdrop.style.opacity = String(Math.min(1, Math.max(0, p)));
    }
    if (done) { timer.current = setTimeout(done, duration + 30); }
  }, [interfaceDir, width]);

  const settle = useCallback((panelType, to, velocity, done) => {
    const {duration, easing} = settleCurve(progress.current, to, velocity, width());
    place(panelType, to, duration, done, easing);
  }, [place, width]);

  // Follow the overlay state: slide a newly opened panel in, and an closed one out.
  useIsomorphicLayoutEffect(() => {
    const now = shownRef.current;
    if (overlay.type !== OVERLAY.NONE) {
      if (now && now.overlay.type === overlay.type) {
        if (now.overlay !== overlay || now.phase !== 'open') { setShown({overlay, phase: 'open'}); }
        const moving = now.phase === 'dragging' || now.phase === 'pulling';
        if (now.phase === 'closing' || (!moving && progress.current < 1)) { settle(overlay.type, 1, 0); }
        return;
      }
      setShown({overlay, phase: 'entering'});
      return;
    }
    if (now && now.phase !== 'closing' && now.phase !== 'dragging' && now.phase !== 'pulling') {
      setShown({...now, phase: 'closing'});
      settle(now.overlay.type, 0, 0, () => setShown(null));
    }
  }, [overlay]); // eslint-disable-line react-hooks/exhaustive-deps

  // A panel mounted by a non-gesture open starts closed and slides in.
  useIsomorphicLayoutEffect(() => {
    if (!shown || shown.phase !== 'entering') { return; }
    place(type, 0);
    if (sheetRef.current) { sheetRef.current.getBoundingClientRect(); }  // commit the start position
    place(type, 1, OPEN_MS);
    setShown({overlay: shown.overlay, phase: 'open'});
    if (sheetRef.current && sheetRef.current.focus) { sheetRef.current.focus({preventScroll: true}); }
  }, [shown && shown.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (overlay.type === OVERLAY.NONE) { return undefined; }
    const onKey = (e) => { if (e.key === 'Escape') { closeOverlay(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay.type, closeOverlay]);

  const readerRef = useRef(reader);
  readerRef.current = reader;

  usePanelSwipes({
    dir: interfaceDir,
    getOpen: () => {
      const now = shownRef.current;
      return now && now.phase !== 'closing' && readerRef.current.overlay.type !== OVERLAY.NONE ? now.overlay.type : null;
    },
    canStart: (target, open) => {
      if (open) { return !!(target.closest && target.closest('[data-ng="sheet"], [data-ng="overlay-backdrop"]')); }
      return !shownRef.current && !!(target.closest && target.closest('[data-ng="stream"]'));
    },
    panelWidth: () => width(),
    onStart: (panelType, open) => {
      clearTimeout(timer.current);
      dragWidth.current = 0;
      if (open) {
        setShown(now => (now ? {...now, phase: 'dragging'} : now));
        dragWidth.current = width();
        return;
      }
      const segment = readerRef.current.currentSegment;
      const preview = panelType === PANEL.ASSOCIATED
        ? {type: OVERLAY.ASSOCIATED, ref: segment ? segment.ref : null, heRef: segment ? segment.heRef : null, stack: [HOME]}
        : {type: OVERLAY.CONFIG};
      if (panelType === PANEL.ASSOCIATED && !preview.ref) { return; }
      progress.current = 0;
      setShown({overlay: preview, phase: 'pulling'});  // mounts the panel off screen, under the finger
      dragWidth.current = width();
    },
    onMove: (panelType, p) => {
      const now = shownRef.current;
      if (now && (now.phase === 'dragging' || now.phase === 'pulling') && now.overlay.type === panelType) { place(panelType, p); }
    },
    onEnd: ({action, panel: panelType, velocity}) => {
      const now = shownRef.current;
      dragWidth.current = 0;
      if (!now || now.overlay.type !== panelType) { return; }
      if (action === 'open') {
        settle(panelType, 1, velocity);
        const r = readerRef.current;
        if (panelType === PANEL.ASSOCIATED) { r.openAssociated(r.segmentByRef(now.overlay.ref) || {ref: now.overlay.ref, heRef: now.overlay.heRef}); } else { r.openConfig(); }
      } else if (action === 'cancel') {
        settle(panelType, 0, velocity, () => setShown(null));
      } else if (action === 'close') {
        setShown({...now, phase: 'closing'});
        settle(panelType, 0, velocity, () => setShown(null));
        readerRef.current.closeOverlay();
      } else {
        setShown({...now, phase: 'open'});
        settle(panelType, 1, velocity);
      }
    },
  });

  const label = type === OVERLAY.CONFIG ? strings.textSettings : strings.connectionsFor;
  const side = type !== OVERLAY.NONE ? panelSide(type === OVERLAY.CONFIG ? PANEL.CONFIG : PANEL.ASSOCIATED, interfaceDir) : undefined;
  // Positions during motion are inline styles set by place(); React never manages them. A panel
  // that is entering or being pulled in starts off screen through CSS ([data-phase]).
  return (
    <div className="ng-overlay" data-ng="overlay" data-overlay={type} data-state={overlay.type}
         data-phase={shown ? shown.phase : undefined} hidden={!Panel}>
      {Panel ? (
        <>
          <div className="ng-overlay-backdrop" data-ng="overlay-backdrop" ref={backdropRef} onClick={closeOverlay} aria-hidden="true" />
          <div className="ng-sheet" data-ng="sheet" data-side={side} ref={sheetRef} role="dialog" aria-modal="true"
               aria-label={label} tabIndex={-1}>
            <Panel overlay={shown.overlay} onClose={closeOverlay} />
          </div>
        </>
      ) : null}
    </div>
  );
}
