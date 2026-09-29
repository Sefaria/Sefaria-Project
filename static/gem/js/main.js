// gem — the Talmud learning tool. App shell: header, routing, keyboard, global menus.

import { h, icon, gemMark, popover, closeAll, toast, toggle, segmented, copyText, isNarrow, isTouch } from "./ui.js";
import { settings, set, applyPane, applyGlobal, openPaneSettings, onChange as onSettings, reset as resetSettings, COMMENTATORS, lookupMode, lookupChooser, canHover, LOOKUP_MODES } from "./settings.js";
import { loadCatalog, parseRef, getMasechet, ensureMasechet, sectionLabel, loadChapters, chapterAt, chapterTitleHe, corpusOf, refToUrl, urlToRef, firstSectionRef, CORPORA } from "./catalog.js";
import { api, sefariaUrl } from "./api.js";
import { Reader } from "./reader.js";
import { openNavigator } from "./navigator.js";
import { openSearch } from "./search.js";
import { openDictionary } from "./dictionary.js";
import { markVisited, saveLast, getLast } from "./store.js";
import { hebNum, hasHebrew, perekOrdinalHe } from "./text.js";

const CFG = window.GEM_CONFIG || {};
const DEFAULT_REF = { bavli: "Berakhot 2a", yerushalmi: "Jerusalem Talmud Berakhot 1:1" };

class App {
  constructor() {
    this.cur = null; // {sectionRef, book, section, corpus}
    this.corpus = settings.corpus;
    this.$ = (s) => document.querySelector(s);
    applyGlobal();
    for (const k of ["center", "right", "left"]) applyPane(document.querySelector(`.pane[data-pane="${k}"]`), k);
    this.reader = new Reader(this);
    this.bindHeader();
    this.bindPanes();
    this.bindKeys();
    this.bindSelection();
    this.bindHoverLookup();
    this.bindTabs();
    this.bindTheme();
    window.addEventListener("popstate", () => this.routeFromLocation(false));
    this.routeFromLocation(true);
    loadCatalog("bavli");
    loadCatalog("yerushalmi");
    document.body.classList.add("ready");
  }

  // ---------------------------------------------------------------------------------------
  // Routing

  initialRef() {
    const path = location.pathname.replace(/^\/gem\/?/, "").replace(/^\/+/, "");
    const q = new URLSearchParams(location.search).get("ref");
    if (path) return urlToRef(path);
    if (q) return q.replace(/_/g, " ");
    if (CFG.initialRef) return urlToRef(CFG.initialRef);
    const last = getLast();
    const corpus = last.corpus || settings.corpus;
    return last[corpus] || DEFAULT_REF[corpus];
  }

  routeFromLocation(first) {
    const ref = this.initialRef();
    this.go(ref, { push: false, select: /:\d+$/.test(ref), fromRoute: true });
  }

  async go(ref, opts = {}) {
    closeAll();
    let p = parseRef(ref);
    if (!p || !p.sectionRef) {
      // maybe just a book name
      const m = p && (await ensureMasechet(p.book));
      if (m) p = parseRef(firstSectionRef(m));
      else { toast("That isn’t a Talmud reference"); return; }
    }
    const m = await ensureMasechet(p.book);
    if (!m) {
      toast(`Couldn’t find ${p.book}`);
      if (!this.cur) this.go(DEFAULT_REF[settings.corpus]);
      return;
    }
    // e.g. "Tamid 2a" (Tamid opens on 25b) → the masechta's first amud
    if (!m.sectionIndex.has(p.section)) p = parseRef(firstSectionRef(m));
    this.setCorpus(m.corpus, { silent: true });
    if (opts.commentator) this.ensureCommentatorShown(m.corpus, opts.commentator);
    const full = p.seg ? `${p.sectionRef}:${p.seg}` : p.sectionRef;
    if (opts.push !== false) history.pushState({ ref: full }, "", this.urlFor(full));
    else if (!opts.fromRoute) history.replaceState({ ref: full }, "", this.urlFor(full));
    try {
      await this.reader.open(full, { mark: opts.mark, comment: opts.comment, select: opts.select });
    } catch (e) {
      console.error(e);
    }
  }

  ensureCommentatorShown(corpus, name) {
    const c = settings.commentators[corpus];
    if (c.right === name || c.left === name) return;
    const side = COMMENTATORS[corpus].left.indexOf(name) === 0 ? "left" : "right";
    set(`commentators.${corpus}.${side}`, name);
  }

  urlFor(ref) {
    return `/gem/${refToUrl(ref)}`;
  }
  linkFor(ref) {
    return `${location.origin}${this.urlFor(ref)}`;
  }

  followRef(ref) {
    const p = parseRef(ref);
    if (p && p.sectionRef && getMasechet(p.book)) {
      this.go(ref, { select: !!p.seg });
      return;
    }
    window.open(sefariaUrl(ref), "_blank", "noopener");
  }

  nextMasechet(title) {
    const m = getMasechet(title);
    if (!m) return null;
    return this._neighborMasechet(m, 1);
  }
  _neighborMasechet(m, d) {
    const list = this._lists && this._lists[m.corpus];
    if (!list) {
      loadCatalog(m.corpus).then((l) => { this._lists = this._lists || {}; this._lists[m.corpus] = l; });
      return null;
    }
    const i = list.indexOf(m);
    const n = list[i + d];
    return n ? { ref: firstSectionRef(n), he: n.he, en: n.en } : null;
  }

  // Called by the reader whenever the section in view changes.
  async setCurrent(sectionRef, seg, { replace = false } = {}) {
    const p = parseRef(sectionRef);
    const m = getMasechet(p.book) || (await ensureMasechet(p.book));
    this.cur = { sectionRef, book: p.book, section: p.section, corpus: corpusOf(p.book), seg };
    const label = sectionLabel(sectionRef);
    this.$("#where-he").textContent = label.he;
    this.$("#where-en").textContent = label.en;
    document.title = `${label.en} · ${label.he} — gem`;
    if (replace) history.replaceState({ ref: sectionRef }, "", this.urlFor(sectionRef));
    markVisited(p.book, p.section);
    saveLast(this.cur.corpus, sectionRef);
    this.updateProgress(m, p.section);
    const chapters = await loadChapters(p.book);
    const c = chapterAt(chapters, p.book, p.section, seg || 1);
    this.$("#where-perek").textContent = c ? `${chapterTitleHe(c)}${c.he ? " · " + c.he : ""}` : "";
    this.renderTicks(m, chapters);
    this._lists = this._lists || {};
    if (!this._lists[this.cur.corpus]) loadCatalog(this.cur.corpus).then((l) => { this._lists[this.cur.corpus] = l; this.updateNavButtons(); });
    this.updateNavButtons();
  }

  setPosition(sectionRef, seg) {
    if (!this.cur) return;
    this.cur.seg = seg;
    const chapters = this._chapters;
    if (chapters) {
      const c = chapterAt(chapters, this.cur.book, this.cur.section, seg);
      this.$("#where-perek").textContent = c ? `${chapterTitleHe(c)}${c.he ? " · " + c.he : ""}` : "";
    }
  }

  updateNavButtons() {
    if (!this.cur) return;
    const m = getMasechet(this.cur.book);
    if (!m) return;
    const i = m.sectionIndex.get(this.cur.section);
    this.$("#btn-prev").disabled = i === 0 && !this._neighborMasechet(m, -1);
    const nxt = m.sections[i + 1];
    this.$("#btn-next").disabled = !nxt && !this._neighborMasechet(m, 1);
    const pl = m.sections[i - 1], nl = nxt;
    this.$("#btn-prev").title = pl ? `Previous: ${sectionLabel(`${m.title} ${pl.key}`).he} (→)` : "Previous masechta";
    this.$("#btn-next").title = nl ? `Next: ${sectionLabel(`${m.title} ${nl.key}`).he} (←)` : "Next masechta";
  }

  updateProgress(m, key) {
    if (!m) return;
    const i = m.sectionIndex.get(key) || 0;
    const pct = m.sections.length > 1 ? (i / (m.sections.length - 1)) * 100 : 100;
    const bar = this.$("#progress");
    bar.style.setProperty("--p", `${pct}%`);
    bar.title = `${m.en}: ${Math.round(pct)}% · ${i + 1} of ${m.sections.length} ${m.corpus === "bavli" ? "amudim" : "halakhot"}`;
    bar.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  renderTicks(m, chapters) {
    if (!m || this._ticksFor === m.title) return;
    this._ticksFor = m.title;
    this._chapters = chapters;
    const ticks = this.$("#progress .ticks");
    ticks.replaceChildren();
    for (const c of chapters) {
      if (c.n === 1) continue;
      const key = c.start ? c.start.section : null;
      const i = key ? m.sectionIndex.get(key) : null;
      if (i == null) continue;
      const pct = (i / Math.max(1, m.sections.length - 1)) * 100;
      ticks.appendChild(h("button", {
        type: "button", class: "tick-p", style: { "--x": `${pct}%` },
        title: `${chapterTitleHe(c)} · ${c.he}`, "aria-label": `Go to chapter ${c.n}`,
        onclick: () => this.go(`${m.title} ${c.start.section}:${c.start.seg}`, { select: c.start.seg > 1 }),
      }));
    }
  }

  setCorpus(corpus, { silent = false } = {}) {
    this.corpus = corpus;
    if (settings.corpus !== corpus) set("corpus", corpus);
    document.querySelectorAll(".corpus-switch button").forEach((b) => {
      const on = b.dataset.corpus === corpus;
      b.setAttribute("aria-checked", String(on));
      b.classList.toggle("on", on);
    });
    document.body.dataset.corpus = corpus;
    this.$("#btn-dafyomi .dy-label").textContent = corpus === "bavli" ? "Daf Yomi" : "Yerushalmi Yomi";
    if (!silent) {
      const last = getLast(corpus);
      this.go(last || DEFAULT_REF[corpus]);
    }
  }

  onSelect(ref) {
    this.selectedRef = ref;
    if (ref) {
      history.replaceState({ ref }, "", this.urlFor(ref));
      const p = parseRef(ref);
      this.setPosition(p.sectionRef, p.seg);
    }
    this.updateTabBadges(ref);
  }

  share(ref) {
    const url = this.linkFor(ref);
    const label = sectionLabel(parseRef(ref).sectionRef);
    if (navigator.share && isTouch()) {
      navigator.share({ title: `${label.en} · ${label.he}`, url }).catch(() => {});
    } else {
      copyText(url).then(() => toast("Link copied"));
    }
  }

  // ---------------------------------------------------------------------------------------
  // Header & panes

  bindHeader() {
    this.$("#brand").prepend(gemMark());
    this.$("#btn-where").addEventListener("click", () => this.openNavigator());
    this.$("#btn-prev").addEventListener("click", () => this.reader.stepSection(-1));
    this.$("#btn-next").addEventListener("click", () => this.reader.stepSection(1));
    this.$("#btn-search").addEventListener("click", () => this.openSearch());
    this.$("#btn-dafyomi").addEventListener("click", () => this.dafYomi());
    this.$("#btn-define").addEventListener("click", (e) => this.openLookupMenu(e.currentTarget));
    this.syncDefineBtn();
    this.$("#btn-settings").addEventListener("click", (e) => this.openGlobalMenu(e.currentTarget));
    document.querySelectorAll(".corpus-switch button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.corpus !== this.corpus) this.setCorpus(b.dataset.corpus);
    }));
    this.$("#progress").addEventListener("click", (e) => {
      if (e.target.closest(".tick-p") || !this.cur) return;
      const m = getMasechet(this.cur.book);
      const r = e.currentTarget.getBoundingClientRect();
      const frac = (r.right - e.clientX) / r.width; // progress runs right-to-left
      const i = Math.round(frac * (m.sections.length - 1));
      const s = m.sections[Math.max(0, Math.min(m.sections.length - 1, i))];
      this.go(`${m.title} ${s.key}`);
    });
    this.setCorpus(settings.corpus, { silent: true });
    // Prefetch the calendar so the Daf Yomi chip can show today's daf.
    api.calendars().then((c) => {
      this._cal = c;
      this.updateDafYomiLabel();
    }).catch(() => {});
  }

  syncDefineBtn() {
    const b = this.$("#btn-define");
    const mode = lookupMode();
    const m = LOOKUP_MODES.find((x) => x.value === mode);
    b.classList.toggle("on", mode !== "dbl");
    b.title = `Word lookup: ${canHover() ? m.label : m.touch} ( D )`;
  }

  openLookupMenu(anchor) {
    const body = h("div", { class: "ps" },
      h("div", { class: "ps-head" }, h("span", { class: "ps-title" }, "Word lookup"), h("span", { class: "ps-sub" }, "How a Hebrew or Aramaic word opens the dictionary")),
      lookupChooser(() => this.syncDefineBtn()),
      h("div", { class: "ps-sub" }, "Selecting a phrase always offers “Define”."));
    popover(body, { anchor, label: "Word lookup", className: "pop-settings pop-lookup" });
  }

  cycleLookup() {
    const order = LOOKUP_MODES.map((m) => m.value).filter((v) => v !== "hover" || canHover());
    const next = order[(order.indexOf(lookupMode()) + 1) % order.length];
    set("lookup", next);
    applyGlobal();
    this.syncDefineBtn();
    const m = LOOKUP_MODES.find((x) => x.value === next);
    toast(canHover() ? m.hint : m.hintTouch);
  }

  calendarItem(corpus) {
    if (!this._cal) return null;
    const title = corpus === "bavli" ? "Daf Yomi" : "Yerushalmi Yomi";
    return (this._cal.calendar_items || []).find((i) => i.title && i.title.en === title) || null;
  }

  updateDafYomiLabel() {
    const it = this.calendarItem(this.corpus);
    const sub = this.$("#btn-dafyomi .dy-sub");
    if (it && sub) {
      sub.textContent = it.displayValue.he.replace(/^תלמוד ירושלמי\s*/, "");
      this.$("#btn-dafyomi").title = `Today’s ${it.title.en}: ${it.displayValue.en}`;
    }
  }

  async dafYomi(corpus = this.corpus) {
    if (!this._cal) {
      try { this._cal = await api.calendars(); } catch (e) { toast("Couldn’t load today’s daf"); return; }
    }
    const it = this.calendarItem(corpus);
    if (!it) { toast("No daf listed for today"); return; }
    this.go(it.ref, { select: corpus === "yerushalmi" });
  }

  bindPanes() {
    for (const key of ["center", "right", "left"]) {
      const pane = document.querySelector(`.pane[data-pane="${key}"]`);
      const btn = pane.querySelector(".pane-aa");
      btn.addEventListener("click", () => {
        const title = key === "center" ? "Gemara" : pane.querySelector(".pt-en").textContent;
        openPaneSettings(key, btn, {
          title,
          onChanged: (field, rerender) => {
            this.reader.restyle(key, rerender);
          },
        });
      });
      const t = pane.querySelector(".pane-title[data-action=commentator]");
      if (t) t.addEventListener("click", () => this.reader.openCommentatorMenu(key, t));
    }
    onSettings((path) => {
      if (path === "*") {
        applyGlobal();
        for (const k of ["center", "right", "left"]) this.reader.restyle(k, true);
        this.reader.reloadSide("right");
        this.reader.reloadSide("left");
      }
    });
  }

  // Mobile / tablet: the three panes become swipeable pages with a tab bar.
  bindTabs() {
    const panes = this.$("#panes");
    const tabs = [...document.querySelectorAll("#tabbar button")];
    tabs.forEach((t) => t.addEventListener("click", () => this.showPane(t.dataset.pane)));
    let raf = 0;
    panes.addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = panes.getBoundingClientRect();
        let best = null, bestV = -1;
        for (const p of panes.querySelectorAll(".pane")) {
          const tab = tabs.find((t) => t.dataset.pane === p.dataset.pane);
          if (tab && !tab.offsetParent) continue; // tablet: the Gemara is always in view
          const pr = p.getBoundingClientRect();
          const v = Math.min(pr.right, r.right) - Math.max(pr.left, r.left);
          if (v > bestV) { bestV = v; best = p.dataset.pane; }
        }
        tabs.forEach((t) => t.classList.toggle("on", t.dataset.pane === best));
      });
    }, { passive: true });
    const center = () => {
      if (window.matchMedia("(max-width: 1179px)").matches) {
        const c = document.querySelector(".pane-center");
        panes.scrollLeft = c.offsetLeft - (isNarrow() ? 0 : 0);
      }
    };
    requestAnimationFrame(center);
    window.matchMedia("(max-width: 1179px)").addEventListener("change", center);
  }

  showPane(key) {
    const pane = document.querySelector(`.pane[data-pane="${key}"]`);
    const panes = this.$("#panes");
    if (!window.matchMedia("(max-width: 1179px)").matches) {
      pane.querySelector(".pane-body").focus({ preventScroll: true });
      return;
    }
    const pr = pane.getBoundingClientRect();
    const r = panes.getBoundingClientRect();
    let dx = 0;
    if (pr.left < r.left) dx = pr.left - r.left;
    else if (pr.right > r.right) dx = pr.right - r.right;
    panes.scrollBy({ left: dx, behavior: "smooth" });
  }

  setTabLabel(side, he, en) {
    const t = document.querySelector(`#tabbar button[data-pane="${side}"]`);
    if (!t) return;
    t.querySelector(".tb-he").textContent = he;
    t.querySelector(".tb-en").textContent = en;
  }

  updateTabBadges(ref) {
    for (const side of ["right", "left"]) {
      const t = document.querySelector(`#tabbar button[data-pane="${side}"] .tb-badge`);
      if (!t) continue;
      const n = ref ? document.querySelectorAll(`.pane[data-pane="${side}"] .cmt[data-anchor="${CSS.escape(ref)}"]`).length : 0;
      t.textContent = n ? String(n) : "";
      t.hidden = !n;
    }
  }

  // ---------------------------------------------------------------------------------------
  // Overlays

  openNavigator() {
    const c = this.cur || {};
    openNavigator(this, { corpus: c.corpus || this.corpus, book: c.book, section: c.sectionRef });
  }

  openSearch(query = "") {
    const c = this.cur || { corpus: this.corpus, book: parseRef(DEFAULT_REF[this.corpus]).book };
    openSearch(this, { query, ctx: c });
  }

  define(word, { anchor, ref, hover = false } = {}) {
    if (!hover && this.hoverCard) this.hoverCard.close();
    return openDictionary(this, word, { anchor, ref: ref || this.selectedRef || (this.cur && this.cur.sectionRef), hover });
  }

  /**
   * The Hebrew/Aramaic word under a point: {word, node, a, b, range, rect, ref}, or null.
   * `strict` requires the point to be on the word itself (not the blank end of a line).
   */
  wordAt(x, y, target, strict = false) {
    if (x == null) return null;
    const heEl = target && target.closest && target.closest(".seg-he, .cmt-he");
    if (!heEl) return null;
    let node, offset;
    if (document.caretPositionFromPoint) {
      const cp = document.caretPositionFromPoint(x, y);
      if (!cp) return null;
      node = cp.offsetNode; offset = cp.offset;
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (!r) return null;
      node = r.startContainer; offset = r.startOffset;
    }
    if (!node || node.nodeType !== 3 || !heEl.contains(node)) return null;
    const t = node.nodeValue;
    const isW = (ch) => /[\u0591-\u05F4'"״׳]/.test(ch) && ch !== "\u05BE";
    let a = offset, b = offset;
    while (a > 0 && isW(t[a - 1])) a--;
    while (b < t.length && isW(t[b])) b++;
    const word = t.slice(a, b).trim();
    if (!word || !/[א-ת]/.test(word)) return null;
    const range = document.createRange();
    range.setStart(node, a);
    range.setEnd(node, b);
    const rect = range.getBoundingClientRect();
    if (strict && !(x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2)) return null;
    const holder = heEl.closest(".seg, .cmt");
    const ref = holder ? (holder.dataset.anchor || holder.dataset.ref) : null;
    return { word, node, a, b, range, rect, ref };
  }

  /** Single-tap lookup: finds the word under the pointer and opens the dictionary. */
  defineAtPoint(e) {
    const w = this.wordAt(e.clientX, e.clientY, e.target);
    if (!w) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(w.range);
    this.define(w.word, { anchor: w.rect, ref: w.ref });
    return true;
  }

  /**
   * Hover lookup: resting the mouse on a word for 500ms opens a live dictionary card. Moving to
   * another word re-arms the timer; leaving word and card closes it. Dragging (selecting) or an
   * active selection never triggers it, and it does not touch the DOM or the selection — the
   * word is marked with the CSS Custom Highlight API where available.
   */
  bindHoverLookup() {
    const panes = this.$("#panes");
    const hl = window.CSS && CSS.highlights && window.Highlight ? CSS.highlights : null;
    let timer = 0, closeTimer = 0, cur = null;
    const mark = (range, name) => {
      if (!hl) return;
      if (range) hl.set(name, new Highlight(range)); else hl.delete(name);
    };
    const same = (x, y) => x && y && x.node === y.node && x.a === y.a;
    const cancelClose = () => clearTimeout(closeTimer);
    const scheduleClose = () => {
      cancelClose();
      closeTimer = setTimeout(() => { if (this.hoverCard) this.hoverCard.close(); }, 420);
    };
    const disarm = () => { clearTimeout(timer); cur = null; mark(null, "gem-dwell"); };
    panes.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || lookupMode() !== "hover") return;
      if (e.buttons) { disarm(); return; } // selecting text
      const w = this.wordAt(e.clientX, e.clientY, e.target, true);
      if (same(w, cur)) return;
      disarm();
      if (!w) { if (this.hoverCard) scheduleClose(); return; }
      cur = w;
      if (this.hoverCard && this.hoverCard.key && same(this.hoverCard.key, w)) { cancelClose(); return; }
      if (this.hoverCard) scheduleClose();
      mark(w.range, "gem-dwell");
      timer = setTimeout(() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        if (document.querySelector(".pop-wrap:not(.pop-pass)")) return; // a menu or search is open
        cancelClose();
        if (this.hoverCard) this.hoverCard.close();
        mark(null, "gem-dwell");
        mark(w.range, "gem-hover");
        const card = this.define(w.word, { anchor: w.rect, ref: w.ref, hover: true });
        card.key = { node: w.node, a: w.a };
        this.hoverCard = card;
        card.el.addEventListener("pointerenter", cancelClose);
        card.el.addEventListener("pointerleave", scheduleClose);
        const close = card.close;
        card.close = () => { if (this.hoverCard === card) { this.hoverCard = null; mark(null, "gem-hover"); } close(); };
      }, 500);
    });
    panes.addEventListener("pointerdown", disarm);
    panes.addEventListener("pointerleave", () => { disarm(); if (this.hoverCard) scheduleClose(); });
    panes.addEventListener("scroll", () => { disarm(); if (this.hoverCard) this.hoverCard.close(); }, { capture: true, passive: true });
  }

  // Text selection → floating "Define · Search · Copy" menu; double-click a Hebrew word → define.
  bindSelection() {
    const panesEl = this.$("#panes");
    panesEl.addEventListener("dblclick", (e) => {
      clearTimeout(this.reader.deselectTimer);
      const heEl = e.target.closest(".seg-he, .cmt-he");
      if (!heEl) return;
      const sel = window.getSelection();
      const holder = heEl.closest(".seg, .cmt");
      const ref = holder && (holder.dataset.anchor || holder.dataset.ref);
      let word = sel.toString().trim();
      let rect = word && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
      if (!word || !hasHebrew(word) || /\s/.test(word)) {
        // touch browsers don't always select the word on double-tap
        const w = this.wordAt(e.clientX, e.clientY, e.target);
        if (!w) return;
        word = w.word; rect = w.rect;
      }
      this.hideSelMenu();
      this.define(word, { anchor: rect, ref });
    });
    const show = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { this.hideSelMenu(); return; }
      const text = sel.toString().trim();
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      if (!container || !container.closest(".pane-body") || text.length < 2) { this.hideSelMenu(); return; }
      if (document.querySelector(".pop-dict")) return;
      this.showSelMenu(text, range, container);
    };
    let t = 0;
    document.addEventListener("selectionchange", () => { clearTimeout(t); t = setTimeout(show, isTouch() ? 350 : 220); });
    document.addEventListener("copy", (e) => this.onCopy(e));
  }

  showSelMenu(text, range, container) {
    const menu = this.$("#selmenu");
    const holder = container.closest(".seg, .cmt");
    const ref = holder ? (holder.dataset.anchor || holder.dataset.ref) : null;
    const he = hasHebrew(text);
    menu.replaceChildren(
      he ? h("button", { type: "button", onmousedown: (e) => e.preventDefault(), onclick: () => { this.hideSelMenu(); this.define(text, { anchor: range.getBoundingClientRect(), ref }); } }, icon("book"), "Define") : null,
      h("button", { type: "button", onmousedown: (e) => e.preventDefault(), onclick: () => { this.hideSelMenu(); this.openSearch(text.slice(0, 120)); } }, icon("search"), "Search"),
      h("button", { type: "button", onmousedown: (e) => e.preventDefault(), onclick: () => { document.execCommand("copy"); this.hideSelMenu(); toast("Copied with citation"); } }, icon("copy"), "Copy"));
    const r = range.getBoundingClientRect();
    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = r.left + r.width / 2 - mw / 2;
    left = Math.max(10, Math.min(window.innerWidth - mw - 10, left));
    let top = isTouch() ? r.bottom + 12 : r.top - mh - 10;
    if (top < 64) top = r.bottom + 12;
    if (top + mh > window.innerHeight - 10) top = r.top - mh - 10;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.classList.add("show");
  }

  hideSelMenu() {
    const menu = this.$("#selmenu");
    menu.classList.remove("show");
    menu.hidden = true;
  }

  onCopy(e) {
    if (!settings.citeOnCopy) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const holder = node && node.closest(".seg, .cmt");
    if (!holder || text.trim().length < 3) return;
    const ref = holder.dataset.ref;
    const anchor = holder.dataset.anchor || ref;
    const p = parseRef(anchor);
    const label = sectionLabel(p.sectionRef);
    const who = holder.classList.contains("cmt") ? holder.closest(".pane").querySelector(".pt-en").textContent + " on " : "";
    e.clipboardData.setData("text/plain", `${text.trim()}\n\n— ${who}${label.en}:${p.seg} · ${label.he}\n${this.linkFor(anchor)}`);
    e.preventDefault();
  }

  openGlobalMenu(anchor) {
    const body = h("div", { class: "ps gm" });
    body.appendChild(h("div", { class: "ps-head" }, h("span", { class: "ps-title" }, "Reading room"), h("span", { class: "ps-sub" }, "Theme and behaviour")));
    const themes = [
      { value: "auto", label: "Auto", sw: "auto" },
      { value: "light", label: "Paper", sw: "light" },
      { value: "sepia", label: "Parchment", sw: "sepia" },
      { value: "dark", label: "Night", sw: "dark" },
    ];
    const tw = h("div", { class: "theme-row", role: "radiogroup", "aria-label": "Theme" });
    for (const t of themes) {
      const b = h("button", {
        type: "button", role: "radio", "aria-checked": String(settings.theme === t.value),
        class: `theme-sw ${settings.theme === t.value ? "on" : ""}`,
        onclick: () => {
          tw.querySelectorAll(".theme-sw").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); });
          b.classList.add("on"); b.setAttribute("aria-checked", "true");
          set("theme", t.value); applyGlobal();
        },
      }, h("span", { class: `sw-swatch sw-${t.sw}`, "aria-hidden": "true" }, h("span", { lang: "he" }, "א")), h("span", {}, t.label));
      tw.appendChild(b);
    }
    body.appendChild(tw);
    body.appendChild(h("div", { class: "ps-toggles" },
      toggle("Follow along", settings.sync, (v) => set("sync", v), "Commentaries scroll with the Gemara"),

      toggle("Line numbers", settings.segNums, (v) => { set("segNums", v); applyGlobal(); }, "Small Hebrew numerals beside each line"),
      toggle("Cite when copying", settings.citeOnCopy, (v) => set("citeOnCopy", v), "Adds the reference and a link"),
      toggle("Focus mode", settings.focus, (v) => { set("focus", v); applyGlobal(); }, "Just the Gemara (F)")));
    body.appendChild(h("div", { class: "ps-block" }, h("span", { class: "ps-label" }, "Look up words by"), lookupChooser(() => this.syncDefineBtn())));
    body.appendChild(h("div", { class: "gm-keys" },
      h("div", { class: "ps-label" }, "Keyboard"),
      h("dl", {},
        ...[["←  →", "Next / previous amud"], ["J  K", "Next / previous line"], ["/", "Search"], ["G", "Go to a masechta"], ["D", "Cycle word-lookup mode"], ["F", "Focus mode"], ["T", "Today’s daf"], ["Esc", "Close / deselect"]]
          .flatMap(([k, v]) => [h("dt", {}, ...k.split("  ").map((x) => h("kbd", {}, x))), h("dd", {}, v)]))));
    body.appendChild(h("div", { class: "gm-foot" },
      h("button", { type: "button", class: "link-btn", onclick: () => { resetSettings(); pop.close(); toast("Settings reset"); } }, "Reset all settings"),
      h("span", { class: "muted" }, "Texts from ", h("a", { href: "https://www.sefaria.org", target: "_blank", rel: "noopener" }, "Sefaria"), " · William Davidson Talmud")));
    const pop = popover(body, { anchor, label: "Settings", className: "pop-settings pop-global" });
  }

  bindTheme() {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyGlobal());
  }

  bindKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return;
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); this.openSearch(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector(".pop-wrap:not(.pop-pass)")) return;
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); this.reader.stepSection(1); break;
        case "ArrowRight": e.preventDefault(); this.reader.stepSection(-1); break;
        case "/": e.preventDefault(); this.openSearch(); break;
        case "g": case "G": e.preventDefault(); this.openNavigator(); break;
        case "j": this.reader.moveSelection(1); break;
        case "k": this.reader.moveSelection(-1); break;
        case "d": case "D": this.cycleLookup(); break;
        case "f": case "F": set("focus", !settings.focus); applyGlobal(); break;
        case "t": case "T": this.dafYomi(); break;
        case "Escape": this.reader.select(null); this.hideSelMenu(); break;
        default: break;
      }
    });
  }
}

window.gem = new App();
