/**
 * The shell shared by the reader's bottom sheets (table of contents, search in the book).
 *
 * It rises from the bottom to near full height and is dismissed by dragging it down (from its
 * grip or head at any time, or from its body once that is scrolled to the top), by its close
 * button, by Escape, by tapping the backdrop, or by the browser's Back button (the sheet has
 * its own history entry, overlayState.js). It is a modal dialog: focus moves into it, Tab stays
 * inside it, and focus returns to the control that opened it.
 *
 * Motion is inline transform/opacity only, set here; CSS gives the resting positions. The slot
 * (SheetSlot) decides when the sheet is shown; `closing` asks it to leave, and `onExited` says
 * it has.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIsomorphicLayoutEffect} from '../context';

const EASE = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
const OPEN_MS = 320;
const CLOSE_MS = 240;
export const DRAG = {
  lock: 8,              // px of vertical travel before a drag is decided
  dismissFraction: 0.25,
  dismissVelocity: 0.55, // px/ms downward at release
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Should a drag that has moved `dy` px (down is positive) from a start in `zone` move the sheet? */
export function dragMovesSheet({dy, dx = 0, zone, bodyAtTop}) {
  if (Math.abs(dy) < DRAG.lock || Math.abs(dx) > Math.abs(dy)) { return false; }
  if (zone === 'head') { return true; }
  return zone === 'body' && bodyAtTop && dy > 0;
}

/** Release: dismiss when pulled far enough or flicked down. */
export function dragDismisses({dy, height, velocity}) {
  return dy > height * DRAG.dismissFraction || velocity > DRAG.dismissVelocity;
}

export default function BottomSheet({
  name, label, closing, onClose, onExited, initialFocusRef = null, bodyRef: givenBodyRef = null, head, children,
  closeLabel,
}) {
  const sheetRef = useRef(null);
  const backdropRef = useRef(null);
  const ownBodyRef = useRef(null);
  const bodyRef = givenBodyRef || ownBodyRef;
  const [phase, setPhase] = useState('entering');
  const offscreen = useRef(true);
  const timer = useRef(null);
  const returnFocus = useRef(null);
  const labelId = `ng-sheet-${name}-label`;

  const place = useCallback((y, ms = 0, done = null) => {
    clearTimeout(timer.current);
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    const duration = reducedMotion() ? 0 : ms;
    const height = sheet ? sheet.getBoundingClientRect().height || 1 : 1;
    const shift = y === 'out' ? height + 24 : y;
    offscreen.current = y === 'out';
    if (sheet) {
      sheet.style.transition = duration ? `transform ${duration}ms ${EASE}` : 'none';
      sheet.style.transform = y === 'out' ? 'translate3d(0, calc(100% + 24px), 0)' : `translate3d(0, ${Math.max(0, shift)}px, 0)`;
    }
    if (backdrop) {
      backdrop.style.transition = duration ? `opacity ${duration}ms ease-out` : 'none';
      backdrop.style.opacity = String(y === 'out' ? 0 : Math.max(0, 1 - shift / height));
    }
    if (done) { timer.current = setTimeout(done, duration + 20); }
  }, []);

  // Enter: from below the screen to rest, then take focus.
  useIsomorphicLayoutEffect(() => {
    returnFocus.current = typeof document !== 'undefined' ? document.activeElement : null;
    place('out');
    if (sheetRef.current) { sheetRef.current.getBoundingClientRect(); }  // commit the start position
    place(0, OPEN_MS, () => setPhase(p => (p === 'entering' ? 'open' : p)));
    const target = (initialFocusRef && initialFocusRef.current) || sheetRef.current;
    if (target && target.focus) { target.focus({preventScroll: true}); }
    return () => {
      clearTimeout(timer.current);
      const back = returnFocus.current;
      if (back && back.focus && document.contains(back)) { back.focus({preventScroll: true}); }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Leave: slide out (unless a drag already took it off screen), then tell the slot.
  useIsomorphicLayoutEffect(() => {
    if (!closing) { return; }
    setPhase('closing');
    if (offscreen.current && phase !== 'entering') { onExited(); return; }
    place('out', CLOSE_MS, onExited);
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    if (closing) { return undefined; }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !sheetRef.current) { return; }
      const items = Array.from(sheetRef.current.querySelectorAll(FOCUSABLE)).filter(el => !el.closest('[hidden]'));
      if (!items.length) { e.preventDefault(); sheetRef.current.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = sheetRef.current.contains(active);
      if (e.shiftKey && (active === first || !inside || active === sheetRef.current)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [closing, onClose]);

  // Drag down to dismiss. Touch listeners are not passive: a drag that moves the sheet must
  // stop the page (and the sheet's body) from scrolling underneath it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) { return undefined; }
    let drag = null;
    const onStart = (e) => {
      if (e.touches.length !== 1) { drag = null; return; }
      const t = e.touches[0];
      const inHead = !!(e.target.closest && e.target.closest('[data-sheet-drag]'));
      const body = bodyRef.current;
      drag = {
        x: t.clientX, y: t.clientY, t: Date.now(), lastY: t.clientY, lastT: Date.now(), velocity: 0,
        zone: inHead ? 'head' : 'body', bodyAtTop: !body || body.scrollTop <= 0, moving: false, decided: false,
      };
    };
    const onMove = (e) => {
      if (!drag) { return; }
      const t = e.touches[0];
      const dy = t.clientY - drag.y;
      const dx = t.clientX - drag.x;
      if (!drag.decided) {
        if (Math.hypot(dx, dy) < DRAG.lock) { return; }
        drag.decided = true;
        drag.moving = dragMovesSheet({dy, dx, zone: drag.zone, bodyAtTop: drag.bodyAtTop});
        if (!drag.moving) { drag = drag.zone === 'head' ? drag : null; return; }
      }
      if (!drag.moving) { return; }
      if (e.cancelable) { e.preventDefault(); }
      const now = Date.now();
      if (now > drag.lastT) { drag.velocity = (t.clientY - drag.lastY) / (now - drag.lastT); }
      drag.lastY = t.clientY;
      drag.lastT = now;
      place(dy > 0 ? dy : dy / 4);  // resist a pull upward past full height
    };
    const onEnd = () => {
      if (!drag || !drag.moving) { drag = null; return; }
      const dy = drag.lastY - drag.y;
      const height = sheet.getBoundingClientRect().height || 1;
      const velocity = Date.now() - drag.lastT > 80 ? 0 : drag.velocity;
      drag = null;
      if (dragDismisses({dy, height, velocity})) {
        place('out', Math.max(120, Math.min(CLOSE_MS, (height - dy) / Math.max(velocity, 1.2))), () => onCloseRef.current());
      } else {
        place(0, 220);
      }
    };
    sheet.addEventListener('touchstart', onStart, {passive: true});
    sheet.addEventListener('touchmove', onMove, {passive: false});
    sheet.addEventListener('touchend', onEnd, {passive: true});
    sheet.addEventListener('touchcancel', onEnd, {passive: true});
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [place]); // eslint-disable-line react-hooks/exhaustive-deps

  // The backdrop holds the page still behind the sheet.
  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) { return undefined; }
    const hold = (e) => { if (e.cancelable) { e.preventDefault(); } };
    backdrop.addEventListener('touchmove', hold, {passive: false});
    return () => backdrop.removeEventListener('touchmove', hold);
  }, []);

  return (
    <div className="ng-bsheet-layer" data-ng="sheet-layer" data-sheet={name} data-phase={phase}>
      <div className="ng-bsheet-backdrop" data-ng="sheet-backdrop" ref={backdropRef} aria-hidden="true"
           onClick={() => { if (!closing) { onClose(); } }} />
      <div className="ng-bsheet" data-ng="bottom-sheet" data-sheet={name} ref={sheetRef} role="dialog" aria-modal="true"
           aria-labelledby={label ? undefined : labelId} aria-label={label || undefined} tabIndex={-1}>
        <div className="ng-bsheet-top" data-sheet-drag="">
          <div className="ng-bsheet-grip" aria-hidden="true"><span /></div>
          <div className="ng-bsheet-head">
            <div className="ng-bsheet-head-main" id={labelId}>{head}</div>
            <button type="button" className="ng-bsheet-close" data-ng="sheet-close" aria-label={closeLabel} onClick={onClose}>
              <svg className="ng-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"
                   fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="ng-bsheet-body" data-ng="sheet-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
