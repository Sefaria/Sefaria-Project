// Mobile web: drag the Resources panel by its header. Same feel as the Library Assistant's
// phone sheet (ai-chatbot src/lib/sheetDrag.js): a long drag or a quick flick moves it to the
// next stop, anything else slides back.
//
// Stops: full page (expanded) <-> half height <-> closed.
//   At half height: drag up to fill the page, drag down to close.
//   At full page:   drag down to go back to half height, or keep going past half to close.
//
// Only the header is a drag handle. The panel body keeps normal scrolling, and taps on
// refs and links still work: a drag only starts once the finger has moved past DRAG_SLOP,
// and the click that would follow a drag is swallowed.
const MOVE_DISTANCE = 80; // px of drag that moves the panel to the next stop
const CLOSE_DISTANCE = 120; // px below half height that closes it
const FLICK_VELOCITY = 0.5; // px/ms
const DRAG_SLOP = 8; // px before a touch counts as a drag, not a tap
const SETTLE_MS = 200;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Makes `handle` drag the panel that getPanel() returns.
 *   onClose()           once the panel has slid off screen
 *   isExpanded()        whether the panel currently fills the page
 *   setExpanded(bool)   once it has settled at full page or half height
 * Returns a function that removes the listeners.
 */
export function attachPanelDrag(handle, getPanel, { onClose, isExpanded = () => false, setExpanded = null }) {
  let drag = null;
  let swallowClickUntil = 0;
  let settleTimer = null;

  // The panel's height at half and at full page, measured from its CSS
  function stops(panel) {
    const expanded = panel.classList.contains('expanded');
    if (expanded) panel.classList.remove('expanded'); // read half height off the stylesheet, before paint
    const half = panel.offsetHeight;
    if (expanded) panel.classList.add('expanded');
    return { half, full: Math.max(window.innerHeight, half) };
  }

  // visible: how much of the panel shows, in px. Above half it grows; below half it slides down.
  function place(panel, visible, half, animate) {
    panel.style.transition =
      animate && !reducedMotion() ? `height ${SETTLE_MS}ms ease, transform ${SETTLE_MS}ms ease` : 'none';
    if (visible >= half) {
      panel.style.height = `${visible}px`;
      panel.style.transform = '';
    } else {
      panel.style.height = `${half}px`;
      panel.style.transform = `translateY(${half - visible}px)`;
    }
    panel.classList.add('panelLifted');
  }

  // Hand the height back to the stylesheet once the panel has settled
  function release(panel) {
    panel.style.transition = 'none'; // cancel any transition still running, so the stylesheet wins at once
    panel.style.height = '';
    panel.style.transform = '';
    panel.classList.remove('panelLifted');
    void panel.offsetHeight;
    panel.style.transition = '';
  }

  function down(e) {
    if (e.button > 0 || drag || e.target.closest('.connectionsPanelClose')) return;
    drag = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      dy: 0,
      active: false,
    };
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      // Sideways is the category filter row scrolling. Up is ours only when there's room to grow.
      const canGrow = !!setExpanded && !isExpanded();
      if (Math.abs(dx) > DRAG_SLOP || (dy < -DRAG_SLOP && !canGrow)) {
        drag = null;
        return;
      }
      if (Math.abs(dy) < DRAG_SLOP) return;
      drag.active = true;
      clearTimeout(settleTimer);
      const panel = getPanel();
      Object.assign(drag, stops(panel), { expanded: isExpanded() });
      handle.setPointerCapture?.(e.pointerId);
    }
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    drag.dy = dy;
    const start = drag.expanded ? drag.full : drag.half;
    const visible = Math.min(drag.full, Math.max(0, start - dy));
    place(getPanel(), visible, drag.half, false);
  }

  // cancelled: the system took the gesture over, so the user never let go
  function up(e, cancelled = false) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    swallowClickUntil = e.timeStamp + 400;
    const panel = getPanel();
    const fresh = e.timeStamp - d.lastT < 100;
    const flickDown = fresh && d.dy > 20 && d.velocity > FLICK_VELOCITY;
    const flickUp = fresh && d.dy < -20 && d.velocity < -FLICK_VELOCITY;

    let target; // 'full' | 'half' | 'closed'
    if (cancelled) {
      target = d.expanded ? 'full' : 'half';
    } else if (d.expanded) {
      const belowHalf = d.dy - (d.full - d.half);
      if (belowHalf > CLOSE_DISTANCE) target = 'closed';
      else if (d.dy > MOVE_DISTANCE || flickDown) target = 'half';
      else target = 'full';
    } else if (d.dy < -MOVE_DISTANCE || flickUp) {
      target = 'full';
    } else if (d.dy > CLOSE_DISTANCE || flickDown) {
      target = 'closed';
    } else {
      target = 'half';
    }

    const wait = reducedMotion() ? 0 : SETTLE_MS;
    const visible = { full: d.full, half: d.half, closed: 0 }[target];
    place(panel, visible, d.half, true);
    settleTimer = setTimeout(() => {
      if (target === 'closed') {
        onClose();
        return;
      }
      if (setExpanded && (target === 'full') !== d.expanded) setExpanded(target === 'full');
      release(panel);
    }, wait);
  }

  const cancel = (e) => up(e, true);

  // A drag that started on the back link, a filter or the grabber must not also click it
  function click(e) {
    if (e.timeStamp < swallowClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      swallowClickUntil = 0;
    }
  }

  handle.addEventListener('pointerdown', down);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', cancel);
  handle.addEventListener('click', click, true);

  return () => {
    clearTimeout(settleTimer);
    handle.removeEventListener('pointerdown', down);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', cancel);
    handle.removeEventListener('click', click, true);
  };
}
