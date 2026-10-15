// Desktop column layout: Gemara, Rashi, Tosafot and the optional third column, with drag handles.
//
// At ≥1180px the grid columns are set here in px. Widths the reader drags are kept as fractions of
// the available width, one set per column count, so they survive window resizes and visits.
// Below 1180px the CSS takes over (swipeable pages) and the handles are hidden.

import { h } from "./ui.js";
import { settings, set } from "./settings.js";

const DESKTOP = "(min-width: 1180px)";
const MIN = { center: 420, side: 200 };
const STEP = 16;

export class Layout {
  constructor(app) {
    this.app = app;
    this.panes = document.getElementById("panes");
    this.handles = [];
    this.mq = window.matchMedia(DESKTOP);
    this.mq.addEventListener("change", () => this.apply());
    let raf = 0;
    window.addEventListener("resize", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; this.apply(); });
    });
    if (window.ResizeObserver) new ResizeObserver(() => this.placeHandles()).observe(this.panes);
  }

  /** Column order, outermost left to outermost right. */
  order() {
    const cols = ["left", "center", "right"];
    if (!settings.extra.on) return cols;
    return settings.extra.side === "left" ? ["extra", ...cols] : [...cols, "extra"];
  }

  key() { return String(this.order().length); }
  min(col) {
    const both = document.querySelector(".pane-center.both-side");
    return col === "center" ? (both ? 560 : MIN.center) : MIN.side;
  }

  /** Default widths: the Gemara keeps a comfortable measure; the commentaries share the rest. */
  defaults(W) {
    const cols = this.order();
    const c = document.querySelector(".pane-center");
    const both = c.classList.contains("both-side");
    const en = c.classList.contains("lang-en");
    let center;
    if (cols.length === 3) center = both ? Math.min(W * 0.64, 1320) : en ? Math.min(W * 0.5, 820) : Math.min(W * 0.52, 880);
    else center = both ? Math.min(W * 0.56, 1200) : en ? Math.min(W * 0.44, 760) : Math.min(W * 0.46, 820);
    const side = (W - center) / (cols.length - 1);
    return Object.fromEntries(cols.map((k) => [k, k === "center" ? center : side]));
  }

  widths(W) {
    const cols = this.order();
    const saved = settings.widths && settings.widths[this.key()];
    let w = saved && cols.every((k) => saved[k] > 0)
      ? Object.fromEntries(cols.map((k) => [k, saved[k] * W]))
      : this.defaults(W);
    // respect minimums, taking the difference from columns that have room
    for (let pass = 0; pass < 3; pass++) {
      let deficit = 0;
      for (const k of cols) if (w[k] < this.min(k)) { deficit += this.min(k) - w[k]; w[k] = this.min(k); }
      const total = cols.reduce((a, k) => a + w[k], 0);
      let excess = total - W;
      if (excess <= 0.5 && deficit === 0) break;
      const room = cols.map((k) => [k, Math.max(0, w[k] - this.min(k))]);
      const roomSum = room.reduce((a, [, r]) => a + r, 0);
      if (roomSum <= 0) break;
      for (const [k, r] of room) w[k] -= (excess * r) / roomSum;
    }
    const total = cols.reduce((a, k) => a + w[k], 0);
    if (total < W) { const f = W / total; for (const k of cols) w[k] *= f; } // e.g. mins changed
    return w;
  }

  apply() {
    const extra = document.querySelector(".pane-extra");
    extra.hidden = !settings.extra.on;
    this.panes.classList.toggle("x-on", !!settings.extra.on);
    this.panes.classList.toggle("x-left", !!settings.extra.on && settings.extra.side === "left");
    this.panes.classList.toggle("x-right", !!settings.extra.on && settings.extra.side === "right");
    document.body.classList.toggle("x-left", !!settings.extra.on && settings.extra.side === "left");
    document.body.classList.toggle("x-right", !!settings.extra.on && settings.extra.side === "right");
    const tab = document.querySelector('#tabbar button[data-pane="extra"]');
    if (tab) tab.hidden = !settings.extra.on;
    const panes = this.panes.querySelectorAll(":scope > .pane");
    if (!this.mq.matches || settings.focus) {
      this.panes.style.gridTemplateColumns = "";
      panes.forEach((p) => { p.style.gridColumn = ""; p.style.gridRow = ""; });
      this.clearHandles();
      return;
    }
    const cols = this.order();
    const W = this.panes.clientWidth;
    const w = this.widths(W);
    this.w = w;
    this.panes.style.gridTemplateColumns = cols.map((k) => `${w[k].toFixed(1)}px`).join(" ");
    // explicit row too: otherwise an outer-left column that comes last in the DOM wraps to a new row
    panes.forEach((p) => { const i = cols.indexOf(p.dataset.pane); p.style.gridColumn = i < 0 ? "" : String(i + 1); p.style.gridRow = "1"; });
    this.ensureHandles(cols);
    this.placeHandles();
  }

  clearHandles() {
    this.handles.forEach((x) => x.remove());
    this.handles = [];
  }

  ensureHandles(cols) {
    const want = cols.slice(0, -1).map((a, i) => `${a}|${cols[i + 1]}`);
    if (this.handles.map((x) => x.dataset.pair).join() === want.join()) return;
    this.clearHandles();
    for (const pair of want) {
      const [a, b] = pair.split("|");
      const el = h("div", {
        class: "col-handle", role: "separator", tabindex: "0", "aria-orientation": "vertical",
        "aria-label": `Resize ${label(a)} and ${label(b)}`, title: "Drag to resize · double-click to reset",
        "data-pair": pair,
      }, h("span", { class: "ch-grip", "aria-hidden": "true" }));
      this.bindHandle(el, a, b);
      this.panes.appendChild(el);
      this.handles.push(el);
    }
  }

  placeHandles() {
    if (!this.handles.length || !this.w) return;
    const cols = this.order();
    let x = 0;
    for (const el of this.handles) {
      const [a] = el.dataset.pair.split("|");
      x = cols.slice(0, cols.indexOf(a) + 1).reduce((s, k) => s + this.w[k], 0);
      el.style.left = `${x.toFixed(1)}px`;
      const [, b] = el.dataset.pair.split("|");
      el.setAttribute("aria-valuenow", String(Math.round(this.w[a])));
      el.dataset.b = b;
    }
  }

  /** Moves the boundary between columns a and b by dx pixels (positive = to the right). */
  nudge(a, b, dx) {
    const w = { ...this.w };
    dx = Math.max(this.min(a) - w[a], Math.min(w[b] - this.min(b), dx));
    w[a] += dx;
    w[b] -= dx;
    this.w = w;
    const cols = this.order();
    this.panes.style.gridTemplateColumns = cols.map((k) => `${w[k].toFixed(1)}px`).join(" ");
    this.placeHandles();
  }

  save() {
    const W = this.panes.clientWidth;
    const f = Object.fromEntries(this.order().map((k) => [k, +(this.w[k] / W).toFixed(4)]));
    set("widths", { ...settings.widths, [this.key()]: f });
  }

  reset() {
    set("widths", { ...settings.widths, [this.key()]: null });
    this.panes.classList.remove("resizing");
    this.apply();
  }

  bindHandle(el, a, b) {
    let x0 = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      x0 = e.clientX;
      this.panes.classList.add("resizing");
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      if (!dx) return;
      const before = this.w[a];
      this.nudge(a, b, dx);
      x0 += this.w[a] - before; // only advance by what was actually applied (stops at minimums)
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      el.classList.remove("dragging");
      this.panes.classList.remove("resizing");
      this.save();
      this.app.reader.onCenterScroll();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("dblclick", () => this.reset());
    el.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? STEP * 3 : STEP;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        this.nudge(a, b, e.key === "ArrowLeft" ? -step : step);
        this.save();
      } else if (e.key === "Enter" || e.key === "Home") {
        e.preventDefault();
        this.reset();
      }
    });
  }
}

function label(k) {
  const el = document.querySelector(`.pane[data-pane="${k}"] .pt-en`);
  return el ? el.textContent : k;
}
