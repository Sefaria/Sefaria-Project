// Small DOM toolkit: element builder, icons, popovers / sheets, toasts.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  chevLeft: '<path d="m15 18-6-6 6-6"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  focus: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
  sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
};

export function icon(name, cls = "") {
  const span = document.createElement("span");
  span.className = `ic ${cls}`;
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
  return span;
}

export function gemMark() {
  const span = document.createElement("span");
  span.className = "gem-mark";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 32 32"><defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--gem-a)"/><stop offset="1" stop-color="var(--gem-b)"/></linearGradient></defs><path d="M9 4h14l6 8-13 16L3 12z" fill="url(#gg)"/><path d="M3 12h26M9 4l7 24M23 4l-7 24M9 4l3 8M23 4l-3 8M12 12l4-8 4 8" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".9"/></svg>`;
  return span;
}

export const isTouch = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;
export const isNarrow = () => window.matchMedia("(max-width: 820px)").matches;

// ------------------------------------------------------------------------------------------
// Layered UI: popovers (anchored), sheets (bottom on phones), dialogs (centered).

const layer = () => document.getElementById("layer");
let openStack = [];

export function closeAll(except) {
  for (const o of [...openStack]) if (o !== except) o.close();
}

/**
 * Opens a floating panel anchored to `anchor` (element or DOMRect). On narrow screens it becomes a
 * bottom sheet. Returns {el, close}.
 */
export function popover(content, { anchor, className = "", label = "", placement = "bottom", onClose, modal = false, sheetOnNarrow = true, passthrough = false } = {}) {
  // passthrough: a hover card — no scrim, the page stays live underneath, focus stays put.
  const narrow = sheetOnNarrow && isNarrow() && !passthrough;
  const scrim = h("div", { class: `scrim ${narrow || modal ? "scrim-dim" : ""}` });
  const panel = h("div", {
    class: `pop ${narrow ? "pop-sheet" : ""} ${className}`,
    role: "dialog",
    "aria-label": label,
    tabindex: "-1",
  });
  if (narrow) panel.appendChild(h("div", { class: "sheet-grip", "aria-hidden": "true" }));
  panel.appendChild(content);
  const wrap = h("div", { class: `pop-wrap ${passthrough ? "pop-pass" : ""}` }, scrim, panel);
  layer().appendChild(wrap);
  const prevFocus = document.activeElement;

  const place = () => {
    if (narrow || !anchor) {
      if (!narrow) panel.classList.add("pop-center");
      return;
    }
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(12, Math.min(vw - pw - 12, left));
    let top = placement === "top" ? r.top - ph - 10 : r.bottom + 10;
    if (top + ph > vh - 12) top = Math.max(12, r.top - ph - 10);
    if (top < 12) top = Math.min(vh - ph - 12, r.bottom + 10);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(12, top))}px`;
  };
  requestAnimationFrame(() => {
    place();
    wrap.classList.add("open");
    if (passthrough) return;
    const f = panel.querySelector("[autofocus]") || panel;
    f.focus({ preventScroll: true });
  });

  let closed = false;
  const api = {
    el: panel,
    reposition: place,
    close() {
      if (closed) return;
      closed = true;
      openStack = openStack.filter((o) => o !== api);
      wrap.classList.remove("open");
      wrap.classList.add("closing");
      setTimeout(() => wrap.remove(), 180);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      if (!passthrough && prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      onClose && onClose();
    },
  };
  const onKey = (e) => {
    if (e.key === "Escape" && openStack[openStack.length - 1] === api) {
      e.stopPropagation();
      e.preventDefault();
      api.close();
    }
  };
  const onResize = () => place();
  scrim.addEventListener("click", () => api.close());
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  if (narrow) enableSheetDrag(panel, api);
  openStack.push(api);
  return api;
}

function enableSheetDrag(panel, api) {
  const grip = panel.querySelector(".sheet-grip");
  let y0 = null, dy = 0;
  const start = (e) => { y0 = e.touches ? e.touches[0].clientY : e.clientY; dy = 0; panel.style.transition = "none"; };
  const move = (e) => {
    if (y0 == null) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    dy = Math.max(0, y - y0);
    panel.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 == null) return;
    panel.style.transition = "";
    panel.style.transform = "";
    if (dy > 90) api.close();
    y0 = null;
  };
  grip.addEventListener("touchstart", start, { passive: true });
  grip.addEventListener("touchmove", move, { passive: true });
  grip.addEventListener("touchend", end);
  grip.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") { start(e); window.addEventListener("pointermove", move); window.addEventListener("pointerup", () => { end(); window.removeEventListener("pointermove", move); }, { once: true }); } });
}

let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

export function segmented(options, value, onChange, { label = "", className = "" } = {}) {
  const wrap = h("div", { class: `seg-ctl ${className}`, role: "radiogroup", "aria-label": label });
  const btns = options.map((o) => {
    const b = h("button", {
      type: "button",
      role: "radio",
      "aria-checked": String(o.value === value),
      class: o.value === value ? "on" : "",
      title: o.title || null,
      onclick: () => {
        btns.forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); });
        b.classList.add("on");
        b.setAttribute("aria-checked", "true");
        onChange(o.value);
      },
    });
    if (o.node) b.appendChild(o.node);
    else b.innerHTML = o.html || "";
    return b;
  });
  btns.forEach((b) => wrap.appendChild(b));
  return wrap;
}

export function toggle(labelNode, value, onChange, hint) {
  const id = "t" + Math.random().toString(36).slice(2);
  const input = h("input", { type: "checkbox", id, role: "switch", class: "sw-input" });
  input.checked = !!value;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "sw", for: id },
    h("span", { class: "sw-text" }, labelNode, hint ? h("span", { class: "sw-hint" }, hint) : null),
    input,
    h("span", { class: "sw-track", "aria-hidden": "true" }, h("span", { class: "sw-thumb" })));
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = h("textarea", { style: { position: "fixed", opacity: "0" } });
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } finally { ta.remove(); }
  return Promise.resolve();
}
