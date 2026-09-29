// The three-column reader: Gemara in the centre, commentaries in the sidebars, all linked.

import { h, icon, isTouch, isNarrow, toast, copyText, popover } from "./ui.js";
import { richFragment, splitDH, hebNum, amudLabelHe, perekOrdinalHe, ordinalEn, markRegex, markMatches, plainText } from "./text.js";
import { loadSection, loadCommentary, orderedCommentaries, heName } from "./data.js";
import { parseRef, getMasechet, neighborSection, loadChapters, sectionLabel, corpusOf, refToUrl } from "./catalog.js";
import { settings, set, COMMENTATORS, applyPane, lookupMode } from "./settings.js";

const SIDES = ["right", "left"];
const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));

export class Reader {
  constructor(app) {
    this.app = app;
    this.panes = {};
    for (const key of ["center", "right", "left"]) {
      const el = document.querySelector(`.pane[data-pane="${key}"]`);
      this.panes[key] = { key, el, head: el.querySelector(".pane-head"), body: el.querySelector(".pane-body") };
    }
    this.entries = [];
    this.token = 0;
    this.selected = null;
    this.reading = null;
    this.lockUntil = 0;
    this.touched = { right: 0, left: 0 };
    this.loadingMore = false;
    this.kindState = null;
    this.mark = null;
    this.bind();
  }

  // ----------------------------------------------------------------------------------------
  // Events

  bind() {
    const c = this.panes.center.body;
    let raf = 0;
    c.addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; this.onCenterScroll(); });
    }, { passive: true });

    for (const side of SIDES) {
      const b = this.panes[side].body;
      const touch = () => { this.touched[side] = performance.now(); };
      ["wheel", "touchstart", "pointerdown", "keydown"].forEach((ev) => b.addEventListener(ev, touch, { passive: true }));
    }

    for (const key of ["center", "right", "left"]) {
      const body = this.panes[key].body;
      body.addEventListener("click", (e) => this.onClick(e, key));
      body.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target.matches(".seg, .cmt")) {
          e.preventDefault();
          this.onClick({ target: e.target, preventDefault() {} }, key, true);
        }
      });
      if (!isTouch()) {
        body.addEventListener("pointerover", (e) => this.onHover(e, key, true));
        body.addEventListener("pointerout", (e) => this.onHover(e, key, false));
      }
    }

    this.sentinel = h("div", { class: "sentinel", "aria-hidden": "true" });
    this.io = new IntersectionObserver((es) => {
      if (es.some((x) => x.isIntersecting)) this.appendNext();
    }, { root: c, rootMargin: "0px 0px 1200px 0px" });
  }

  onClick(e, key, viaKeyboard = false) {
    const t = e.target;
    const link = t.closest && t.closest("a.ref-link");
    if (link) {
      e.preventDefault();
      this.app.followRef(link.dataset.ref);
      return;
    }
    const fn = t.closest && t.closest(".fn-mark");
    if (fn) {
      const note = fn.nextElementSibling;
      if (note && note.classList.contains("fn")) {
        note.hidden = !note.hidden;
        fn.setAttribute("aria-expanded", String(!note.hidden));
      }
      return;
    }
    const tab = t.closest && t.closest(".cm-tab");
    if (tab) {
      // "Rashi has 2 comments on this line" → select the line and bring those comments into view
      const seg = tab.closest(".seg");
      const side = tab.dataset.side;
      this.select(seg.dataset.ref, { from: "center" });
      this.app.showPane(side);
      const first = this.panes[side].body.querySelector(`.cmt[data-anchor="${cssEsc(seg.dataset.ref)}"]`);
      if (first) {
        first.classList.add("sel-focus");
        setTimeout(() => first.classList.remove("sel-focus"), 1600);
      }
      return;
    }
    if (t.closest && t.closest(".seg-tools, .side-note button, .sec-more, .perek-card button, .hadran button")) return;
    const sel = window.getSelection();
    if (!viaKeyboard && sel && !sel.isCollapsed && sel.toString().trim().length > 0) return; // selecting text
    if (!viaKeyboard && lookupMode() === "tap" && this.app.defineAtPoint(e)) return;
    if (key === "center") {
      const seg = t.closest(".seg");
      if (!seg) return;
      if (e.detail > 1) return; // part of a double-click (dictionary)
      if (this.selected === seg.dataset.ref && !viaKeyboard) {
        // wait a beat: a second click means "define this word", not "deselect"
        clearTimeout(this.deselectTimer);
        this.deselectTimer = setTimeout(() => this.select(null), 280);
      } else this.select(seg.dataset.ref, { from: "center" });
    } else {
      const cmt = t.closest(".cmt");
      if (!cmt) return;
      this.select(cmt.dataset.anchor, { from: key, comment: cmt.dataset.ref });
    }
  }

  onHover(e, key, on) {
    const t = e.target.closest && e.target.closest(key === "center" ? ".seg" : ".cmt");
    if (!t) return;
    if (!on && e.relatedTarget && t.contains(e.relatedTarget)) return;
    const ref = key === "center" ? t.dataset.ref : t.dataset.anchor;
    const peers = key === "center"
      ? document.querySelectorAll(`.cmt[data-anchor="${cssEsc(ref)}"]`)
      : document.querySelectorAll(`.seg[data-ref="${cssEsc(ref)}"], .cmt[data-anchor="${cssEsc(ref)}"]`);
    peers.forEach((p) => p.classList.toggle("peer", on));
  }

  // ----------------------------------------------------------------------------------------
  // Opening & loading

  async open(ref, opts = {}) {
    const p = parseRef(ref);
    if (!p || !p.sectionRef) throw new Error(`Not a Talmud reference: ${ref}`);
    const token = ++this.token;
    this.entries = [];
    this.selected = null;
    this.reading = null;
    this.kindState = null;
    this.endCard = null;
    this.mark = opts.mark ? markRegex(opts.mark) : null;
    this.skeleton();
    this.app.setCurrent(p.sectionRef, p.seg);
    let entry;
    try {
      entry = await this.load(p.sectionRef);
    } catch (e) {
      if (token !== this.token) return;
      this.error(e, () => this.open(ref, opts));
      throw e;
    }
    if (token !== this.token) return;
    for (const key of ["center", "right", "left"]) this.panes[key].body.innerHTML = "";
    this.renderTop();
    this.insert(entry, "end");
    this.panes.center.body.appendChild(this.sentinel);
    this.io.observe(this.sentinel);
    this.updateHeads();
    const target = p.seg ? `${p.sectionRef}:${p.seg}` : null;
    const c = this.panes.center.body;
    c.scrollTop = 0;
    SIDES.forEach((s) => (this.panes[s].body.scrollTop = 0));
    if (target) {
      requestAnimationFrame(() => {
        this.scrollCenterTo(target, "auto", "center");
        this.select(target, { from: "open", comment: opts.comment, quiet: !opts.select && !opts.comment && !opts.mark });
        if (this.mark) this.applyMark(target, opts.comment);
      });
    }
    this.onCenterScroll();
  }

  async load(sectionRef) {
    const p = parseRef(sectionRef);
    const [data, chapters] = await Promise.all([loadSection(sectionRef), loadChapters(p.book)]);
    const entry = { ref: sectionRef, data, chapters, comm: {} };
    await Promise.all(SIDES.map((side) => this.loadSide(entry, side)));
    return entry;
  }

  async loadSide(entry, side) {
    const corpus = entry.data.corpus;
    const chosen = settings.commentators[corpus][side];
    const other = settings.commentators[corpus][side === "right" ? "left" : "right"];
    const prefs = [chosen, ...COMMENTATORS[corpus][side].filter((n) => n !== chosen && n !== other)];
    entry.comm[side] = await loadCommentary(entry.data, prefs, null);
  }

  skeleton() {
    const lines = (n, cls) => h("div", { class: `skel ${cls}` }, ...Array.from({ length: n }, (_, i) => h("span", { style: { width: `${70 + ((i * 37) % 30)}%` } })));
    this.panes.center.body.replaceChildren(h("div", { class: "skel-wrap" }, h("div", { class: "skel-title" }), lines(6, "big"), lines(5, "big"), lines(4, "big")));
    for (const s of SIDES) this.panes[s].body.replaceChildren(h("div", { class: "skel-wrap" }, lines(4, ""), lines(3, ""), lines(5, ""), lines(3, "")));
  }

  error(e, retry) {
    const msg = e && e.status === 404 ? "We couldn’t find that page." : "The text didn’t load. Check your connection and try again.";
    this.panes.center.body.replaceChildren(h("div", { class: "empty big" },
      h("div", { class: "empty-he", lang: "he" }, "אופס"),
      h("p", {}, msg),
      h("button", { class: "btn", type: "button", onclick: retry }, "Try again")));
    for (const s of SIDES) this.panes[s].body.replaceChildren();
  }

  renderTop() {
    const first = this.entries[0];
    this.topBtn = h("button", { class: "sec-more top", type: "button", onclick: () => this.prependPrev() });
    this.panes.center.body.appendChild(this.topBtn);
  }

  refreshTop() {
    if (!this.topBtn) return;
    const first = this.entries[0];
    const prev = first && neighborSection(first.data.book, first.data.key, -1);
    this.topBtn.hidden = !prev;
    if (prev) {
      const l = sectionLabel(prev);
      this.topBtn.replaceChildren(icon("arrowUp"), h("span", { lang: "he" }, l.heSection), h("span", {}, `Previous · ${l.enSection}`));
    }
  }

  async appendNext() {
    if (this.loadingMore || !this.entries.length) return;
    const last = this.entries[this.entries.length - 1];
    const nextRef = neighborSection(last.data.book, last.data.key, 1);
    if (!nextRef) {
      this.renderEnd(last);
      return;
    }
    this.loadingMore = true;
    const token = this.token;
    this.sentinel.classList.add("loading");
    try {
      const entry = await this.load(nextRef);
      if (token !== this.token) return;
      this.insert(entry, "end");
    } catch (e) {
      /* try again on next intersection */
    } finally {
      this.loadingMore = false;
      this.sentinel.classList.remove("loading");
    }
  }

  async prependPrev() {
    const first = this.entries[0];
    if (!first) return;
    const prevRef = neighborSection(first.data.book, first.data.key, -1);
    if (!prevRef || this.loadingPrev) return;
    this.loadingPrev = true;
    this.topBtn.classList.add("loading");
    const token = this.token;
    try {
      const entry = await this.load(prevRef);
      if (token !== this.token) return;
      const before = {};
      for (const k of ["center", "right", "left"]) before[k] = this.panes[k].body.scrollHeight;
      this.insert(entry, "start");
      for (const k of ["center", "right", "left"]) {
        const b = this.panes[k].body;
        b.scrollTop += b.scrollHeight - before[k];
      }
      // then glide up to show the new amud's opening
      this.scrollPaneTo("center", entry.els.center, 8);
    } finally {
      this.loadingPrev = false;
      this.topBtn.classList.remove("loading");
    }
  }

  renderEnd(last) {
    if (this.endCard) return;
    const m = getMasechet(last.data.book);
    const next = this.app.nextMasechet(last.data.book);
    this.endCard = h("div", { class: "hadran masechet-end" },
      h("div", { class: "hadran-he", lang: "he" }, `הדרן עלך מסכת ${m ? m.he : ""}`),
      h("div", { class: "hadran-en" }, `We shall return to you, Tractate ${m ? m.en : last.data.book}`),
      next ? h("button", { class: "btn", type: "button", onclick: () => this.app.go(next.ref) }, h("span", { lang: "he" }, next.he), ` Continue to ${next.en}`) : null);
    this.sentinel.before(this.endCard);
  }

  // ----------------------------------------------------------------------------------------
  // Rendering

  insert(entry, where) {
    entry.els = { center: this.renderCenter(entry) };
    for (const s of SIDES) entry.els[s] = this.renderSide(entry, s);
    if (where === "start") {
      this.entries.unshift(entry);
      this.topBtn.after(entry.els.center);
      for (const s of SIDES) this.panes[s].body.prepend(entry.els[s]);
    } else {
      this.entries.push(entry);
      this.sentinel.parentNode ? this.sentinel.before(entry.els.center) : this.panes.center.body.appendChild(entry.els.center);
      for (const s of SIDES) this.panes[s].body.appendChild(entry.els[s]);
    }
    this.markTicks(entry);
    this.refreshTop();
    if (this.selected) this.paintSelection(entry);
  }

  /** Marks the selected line's comments inside a newly rendered entry. */
  paintSelection(entry) {
    const ref = this.selected;
    for (const s of SIDES) {
      entry.els[s].querySelectorAll(`.cmt[data-anchor="${cssEsc(ref)}"]`).forEach((c) => {
        c.classList.add("sel");
        c.parentElement.classList.add("sel");
      });
    }
  }

  renderCenter(entry) {
    const d = entry.data;
    const p = settings.panes.center;
    const label = sectionLabel(d.ref);
    const sec = h("section", { class: "sec", "data-ref": d.ref, "aria-label": label.en });
    sec.appendChild(this.secHead(d, label));
    const chapters = entry.chapters || [];
    const isJT = d.corpus === "yerushalmi";
    const jtCh = isJT ? +d.key.split(":")[0] : 0;
    const jtHal = isJT ? +d.key.split(":")[1] : 0;
    if (isJT && jtHal === 1 && chapters[jtCh - 1]) sec.appendChild(this.perekCard(chapters[jtCh - 1], d));
    if (isJT) sec.appendChild(h("div", { class: "halakhah-label" }, h("span", { lang: "he" }, `הלכה ${hebNum(jtHal)}`), h("span", {}, `Halakhah ${jtHal}`)));
    const hasEn = d.segments.some((s) => s.en);
    const hasHe = d.segments.some((s) => s.he);
    entry.hasEn = hasEn;
    for (const s of d.segments) {
      if (!isJT) {
        const start = chapters.find((c) => c.start && c.start.section === d.key && c.start.seg === s.n);
        if (start) sec.appendChild(this.perekCard(start, d));
      }
      if (s.marker) this.kindState = s.marker;
      else if (!this.kindState && d.key === "2a") this.kindState = "mishnah";
      const kind = s.marker || this.kindState || "gemara";
      const segEl = h("div", {
        class: `seg ${s.marker ? "marker" : ""}`,
        "data-ref": s.ref, "data-n": s.n, "data-kind": kind, tabindex: "0",
      });
      segEl.appendChild(h("span", { class: "seg-num", "aria-hidden": "true" }, hebNum(s.n)));
      if (s.marker && !isJT) segEl.appendChild(h("span", { class: "kind-label", "aria-hidden": "true", lang: "he" }, s.marker === "mishnah" ? "משנה" : "גמרא"));
      const heEl = h("div", { class: "seg-he", lang: "he", dir: "rtl" });
      heEl.appendChild(richFragment(s.he, { nikud: p.nikud }));
      const enEl = h("div", { class: "seg-en", lang: "en", dir: "ltr" });
      enEl.appendChild(richFragment(s.en, { literal: d.corpus === "bavli" && p.literal !== "full" }));
      if (!s.he) heEl.classList.add("missing");
      if (!s.en) enEl.classList.add("missing");
      segEl.append(heEl, enEl);
      sec.appendChild(segEl);
      if (!isJT) {
        const end = chapters.find((c) => c.end && c.end.section === d.key && c.end.seg === s.n);
        if (end) sec.appendChild(this.hadran(end, d, chapters));
      }
    }
    if (isJT) {
      const m = getMasechet(d.book);
      const lastHalOfCh = m && !m.sections.some((x) => x.ch === jtCh && x.hal > jtHal);
      if (lastHalOfCh && chapters[jtCh - 1]) sec.appendChild(this.hadran(chapters[jtCh - 1], d, chapters));
    }
    if (!hasEn) sec.classList.add("no-en");
    if (!hasHe) sec.classList.add("no-he");
    return sec;
  }

  secHead(d, label) {
    const credit = [d.heVersion, d.enVersion].filter(Boolean).join(" · ");
    return h("header", { class: "sec-head" },
      h("span", { class: "rule", "aria-hidden": "true" }),
      h("span", { class: "sh-he", lang: "he" }, label.heSection),
      h("span", { class: "sh-en" }, label.enSection),
      h("span", { class: "rule", "aria-hidden": "true" }),
      credit ? h("span", { class: "sh-credit", title: credit }, "") : null);
  }

  perekCard(c, d) {
    const m = getMasechet(d.book);
    return h("div", { class: "perek-card" },
      h("div", { class: "pc-kicker", lang: "he" }, `${m ? m.he : ""} · פרק ${perekOrdinalHe(c.n)}`),
      h("div", { class: "pc-title", lang: "he" }, c.he || `פרק ${hebNum(c.n)}`),
      h("div", { class: "pc-en" }, `Chapter ${ordinalEn(c.n)}${c.en && !/^Chapter/.test(c.en) ? " · " + c.en : ""}`));
  }

  hadran(c, d, chapters) {
    const m = getMasechet(d.book);
    const last = chapters.length && c.n === chapters.length;
    return h("div", { class: "hadran" },
      h("span", { class: "hadran-orn", "aria-hidden": "true" }, "❦"),
      h("div", { class: "hadran-he", lang: "he" }, last ? `הדרן עלך מסכת ${m ? m.he : ""}` : `הדרן עלך ${c.he ? "פרק " + c.he : "פרק " + perekOrdinalHe(c.n)}`),
      h("div", { class: "hadran-en" }, last ? `We shall return to you, Tractate ${m ? m.en : ""}` : `We shall return to you, ${c.en ? "Chapter " + c.en : "Chapter " + ordinalEn(c.n)}`));
  }

  renderSide(entry, side) {
    const d = entry.data;
    const comm = entry.comm[side];
    const label = sectionLabel(d.ref);
    const sec = h("section", { class: "sec", "data-ref": d.ref });
    const head = h("header", { class: "sec-head" },
      h("span", { class: "rule", "aria-hidden": "true" }),
      h("span", { class: "sh-he", lang: "he" }, label.heSection),
      h("span", { class: "sh-en" }, label.enSection),
      h("span", { class: "rule", "aria-hidden": "true" }));
    sec.appendChild(head);
    if (comm.substituted || comm.missing) {
      const req = heName(comm.requested);
      const note = comm.missing
        ? h("div", { class: "side-note" },
            h("p", {}, h("span", { lang: "he" }, `אין ${req} כאן`), ` — no ${comm.requested} on this ${d.corpus === "bavli" ? "amud" : "halakhah"}.`),
            h("button", { type: "button", class: "link-btn", onclick: (e) => this.openCommentatorMenu(side, e.currentTarget, entry) }, "Choose another commentary"))
        : h("div", { class: "side-note soft" },
            h("p", {}, h("span", { lang: "he" }, `${comm.he}`), ` · ${comm.name} comments here in place of ${comm.requested}.`));
      sec.appendChild(note);
    }
    const hasEn = comm.comments.some((c) => c.en);
    let group = null, groupN = null;
    for (const c of comm.comments) {
      if (c.anchorN !== groupN) {
        groupN = c.anchorN;
        group = h("div", { class: "cgroup", "data-anchor": c.anchor, "data-n": c.anchorN },
          h("div", { class: "cg-label", "aria-hidden": "true" }, h("span", {}, hebNum(c.anchorN))));
        sec.appendChild(group);
      }
      group.appendChild(this.renderComment(c, comm));
    }
    if (!comm.comments.length && !comm.missing) sec.appendChild(h("div", { class: "side-note soft" }, h("p", {}, "—")));
    if (!hasEn) sec.classList.add("no-en");
    return sec;
  }

  renderComment(c, comm) {
    const el = h("article", { class: "cmt", "data-ref": c.ref, "data-anchor": c.anchor, tabindex: "0" });
    const he = h("div", { class: "cmt-he", lang: "he", dir: "rtl" });
    if (c.he) {
      const { dh, body } = splitDH(c.he);
      if (dh) he.append(h("span", { class: "dh" }, richFragment(dh)), h("span", { class: "dh-sep" }, " "));
      he.appendChild(richFragment(body));
    } else he.classList.add("missing");
    const en = h("div", { class: "cmt-en", lang: "en", dir: "ltr" });
    if (c.en) {
      const { dh, body } = splitDH(c.en);
      if (dh) en.append(h("span", { class: "dh" }, richFragment(dh)), document.createTextNode(" — "));
      en.appendChild(richFragment(body));
    } else en.classList.add("missing");
    el.append(he, en);
    return el;
  }

  markTicks(entry) {
    const counts = { right: new Map(), left: new Map() };
    for (const s of SIDES) for (const c of entry.comm[s].comments) counts[s].set(c.anchor, (counts[s].get(c.anchor) || 0) + 1);
    entry.els.center.querySelectorAll(".seg").forEach((seg) => {
      const r = counts.right.get(seg.dataset.ref) || 0;
      const l = counts.left.get(seg.dataset.ref) || 0;
      if (r) seg.dataset.cr = r; else delete seg.dataset.cr;
      if (l) seg.dataset.cl = l; else delete seg.dataset.cl;
      seg.querySelectorAll(":scope > .cm-tab").forEach((x) => x.remove());
      for (const [side, n] of [["right", r], ["left", l]]) {
        if (!n) continue;
        const name = entry.comm[side].name;
        seg.appendChild(h("button", {
          type: "button", class: `cm-tab cm-${side}`, "data-side": side, tabindex: "-1",
          title: `${n} ${name} comment${n > 1 ? "s" : ""} on this line`,
          "aria-label": `${n} ${name} comment${n > 1 ? "s" : ""} on this line — show`,
        }, h("span", { class: "cm-n" }, String(n)), h("span", { class: "cm-arrow", "aria-hidden": "true" })));
      }
    });
  }

  updateHeads() {
    const entry = this.currentEntry() || this.entries[0];
    if (!entry) return;
    for (const s of SIDES) {
      const comm = entry.comm[s];
      const pane = this.panes[s];
      const name = settings.commentators[entry.data.corpus][s];
      const shown = comm && !comm.missing ? comm.name : name;
      pane.el.querySelector(".pt-he").textContent = heName(shown, comm && comm.he);
      pane.el.querySelector(".pt-en").textContent = shown;
      pane.el.setAttribute("aria-label", shown);
      const titleBtn = pane.el.querySelector(".pane-title");
      titleBtn.title = comm && comm.substituted
        ? `${shown} — ${comm.requested} does not comment here. Choose another commentary…`
        : comm && comm.missing ? `No ${name} here. Choose another commentary…` : "Choose commentary";
      titleBtn.classList.toggle("subst", !!(comm && (comm.substituted || comm.missing)));
      pane.el.classList.toggle("no-en", !!(entry.els && entry.els[s] && entry.els[s].classList.contains("no-en")));
      this.app.setTabLabel(s, heName(shown, comm && comm.he), shown);
    }
    this.panes.center.el.classList.toggle("no-en", !!(entry.els && entry.els.center.classList.contains("no-en")));
  }

  currentEntry() {
    if (!this.reading) return this.entries[0];
    const p = parseRef(this.reading);
    return this.entries.find((e) => e.ref === p.sectionRef) || this.entries[0];
  }

  // ----------------------------------------------------------------------------------------
  // Reading position, sync and selection

  onCenterScroll() {
    const body = this.panes.center.body;
    const r = body.getBoundingClientRect();
    if (!r.width) return;
    const x = r.left + r.width / 2;
    let seg = null;
    for (const f of [0.26, 0.34, 0.18, 0.45, 0.1]) {
      const el = document.elementFromPoint(x, r.top + Math.min(r.height * f, 320));
      seg = el && el.closest && el.closest(".pane-center .seg");
      if (seg) break;
    }
    if (!seg) {
      // near the very top of the pane, prefer the first segment
      if (body.scrollTop < 40) seg = body.querySelector(".seg");
      if (!seg) return;
    }
    const ref = seg.dataset.ref;
    if (ref === this.reading) return;
    const prevSection = this.reading && parseRef(this.reading).sectionRef;
    this.reading = ref;
    const p = parseRef(ref);
    if (p.sectionRef !== prevSection) {
      this.app.setCurrent(p.sectionRef, null, { replace: true });
      this.updateHeads();
    } else {
      this.app.setPosition(p.sectionRef, p.seg);
    }
    if (settings.sync && performance.now() > this.lockUntil) this.syncSides(ref);
  }

  syncSides(ref, force = false) {
    const p = parseRef(ref);
    const secIdx = this.entries.findIndex((e) => e.ref === p.sectionRef);
    if (secIdx < 0) return;
    const offset = this.levelOffset(ref, 0.3);
    for (const side of SIDES) {
      if (!force && performance.now() - this.touched[side] < 2500) continue;
      const g = this.findGroup(side, secIdx, p.seg);
      if (!g) continue;
      this.scrollPaneTo(side, g, offset);
    }
  }

  /** How far below the pane top a Gemara line sits, so its comments can be drawn level with it. */
  levelOffset(ref, maxFrac) {
    if (isNarrow() || window.matchMedia("(max-width: 1179px)").matches) return 10;
    const body = this.panes.center.body;
    const seg = body.querySelector(`.seg[data-ref="${cssEsc(ref)}"]`);
    if (!seg) return 10;
    const br = body.getBoundingClientRect();
    const top = seg.getBoundingClientRect().top - br.top;
    return Math.max(10, Math.min(br.height * maxFrac, top));
  }

  findGroup(side, secIdx, n) {
    for (let i = secIdx; i < this.entries.length; i++) {
      const el = this.entries[i].els[side];
      const groups = el.querySelectorAll(".cgroup");
      for (const g of groups) if (i > secIdx || +g.dataset.n >= n) return g;
    }
    return null;
  }

  scrollPaneTo(key, el, offset = 12, behavior = "smooth") {
    const body = this.panes[key].body;
    const br = body.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const top = body.scrollTop + (er.top - br.top) - offset;
    if (Math.abs(top - body.scrollTop) < 4) return;
    body.scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : behavior });
  }

  scrollCenterTo(ref, behavior = "smooth", block = "start") {
    const seg = this.panes.center.body.querySelector(`.seg[data-ref="${cssEsc(ref)}"]`);
    if (!seg) return false;
    const body = this.panes.center.body;
    const br = body.getBoundingClientRect();
    const sr = seg.getBoundingClientRect();
    const visible = sr.top >= br.top + 40 && sr.bottom <= br.bottom - 40;
    if (visible && behavior !== "auto") return true;
    const off = block === "center" ? Math.max(24, (br.height - sr.height) / 2.6) : 70;
    body.scrollTo({ top: Math.max(0, body.scrollTop + (sr.top - br.top) - off), behavior });
    return true;
  }

  select(ref, opts = {}) {
    document.querySelectorAll(".seg.sel, .cmt.sel, .cmt.sel-focus, .cgroup.sel").forEach((n) => n.classList.remove("sel", "sel-focus"));
    document.querySelectorAll(".seg-tools").forEach((n) => n.remove());
    this.selected = ref;
    this.app.onSelect(ref);
    if (!ref) return;
    const seg = this.panes.center.body.querySelector(`.seg[data-ref="${cssEsc(ref)}"]`);
    if (!seg) return;
    seg.classList.add("sel");
    const comments = {};
    for (const s of SIDES) {
      comments[s] = [...this.panes[s].body.querySelectorAll(`.cmt[data-anchor="${cssEsc(ref)}"]`)];
      comments[s].forEach((c) => c.classList.add("sel"));
      comments[s].forEach((c) => c.parentElement.classList.add("sel"));
    }
    if (!opts.quiet || opts.from === "open") seg.appendChild(this.segTools(seg, comments));
    if (opts.keepScroll) return;
    this.lockUntil = performance.now() + 1100;
    if (opts.comment) {
      const c = document.querySelector(`.cmt[data-ref="${cssEsc(opts.comment)}"]`);
      if (c) {
        c.classList.add("sel-focus");
        const side = c.closest(".pane").dataset.pane;
        this.scrollPaneTo(side, c, 60, opts.from === "open" ? "auto" : "smooth");
      }
    }
    if (opts.from === "center" || opts.from === "open") {
      const p = parseRef(ref);
      const secIdx = this.entries.findIndex((e) => e.ref === p.sectionRef);
      for (const s of SIDES) {
        if (opts.comment && comments[s].some((c) => c.dataset.ref === opts.comment)) continue;
        // no comment on this line: glide to the next one this commentator does have
        const target = comments[s][0] ? comments[s][0].parentElement : this.findGroup(s, secIdx, p.seg);
        if (target) this.scrollPaneTo(s, target, this.levelOffset(ref, 0.4), opts.from === "open" ? "auto" : "smooth");
      }
    }
    if (opts.from === "right" || opts.from === "left") {
      this.scrollCenterTo(ref, "smooth", "center");
      const other = opts.from === "right" ? "left" : "right";
      if (comments[other][0]) this.scrollPaneTo(other, comments[other][0].parentElement, 10);
    }
  }

  segTools(seg, comments) {
    const ref = seg.dataset.ref;
    const p = parseRef(ref);
    const label = sectionLabel(p.sectionRef);
    const entry = this.entries.find((e) => e.ref === p.sectionRef);
    const bar = h("div", { class: "seg-tools", role: "toolbar", "aria-label": "Segment actions" },
      h("span", { class: "st-ref" }, h("span", { lang: "he" }, `${label.heSection} ${hebNum(p.seg)}`), h("span", {}, `${label.enSection}:${p.seg}`)));
    for (const s of SIDES) {
      const n = comments[s].length;
      if (!n || !entry) continue;
      const nm = entry.comm[s];
      bar.appendChild(h("button", {
        type: "button", class: "st-btn st-cmt", title: `Show ${nm.name}`,
        onclick: () => { this.app.showPane(s); this.scrollPaneTo(s, comments[s][0].parentElement, 10); },
      }, h("span", { lang: "he" }, nm.he), h("b", {}, String(n))));
    }
    bar.appendChild(h("button", {
      type: "button", class: "st-btn", title: "Copy with citation", "aria-label": "Copy with citation",
      onclick: () => this.copySegment(seg),
    }, icon("copy")));
    bar.appendChild(h("button", {
      type: "button", class: "st-btn", title: "Copy link", "aria-label": "Copy link to this line",
      onclick: () => this.app.share(ref),
    }, icon("link")));
    bar.appendChild(h("button", {
      type: "button", class: "st-btn", title: "Deselect (Esc)", "aria-label": "Deselect",
      onclick: () => this.select(null),
    }, icon("x")));
    return bar;
  }

  copySegment(seg) {
    const ref = seg.dataset.ref;
    const pane = settings.panes.center;
    const he = seg.querySelector(".seg-he").innerText.trim();
    const en = seg.querySelector(".seg-en").innerText.trim();
    const label = sectionLabel(parseRef(ref).sectionRef);
    const parts = pane.lang === "en" ? [en] : pane.lang === "he" ? [he] : [he, en];
    const text = `${parts.filter(Boolean).join("\n\n")}\n\n— ${label.en}:${parseRef(ref).seg} · ${label.he}\n${this.app.linkFor(ref)}`;
    copyText(text).then(() => toast("Copied with citation"));
  }

  applyMark(ref, commentRef) {
    const seg = this.panes.center.body.querySelector(`.seg[data-ref="${cssEsc(ref)}"]`);
    if (seg) markMatches(seg, this.mark);
    if (commentRef) {
      const c = document.querySelector(`.cmt[data-ref="${cssEsc(commentRef)}"]`);
      if (c) markMatches(c, this.mark);
    }
  }

  moveSelection(delta) {
    const segs = [...this.panes.center.body.querySelectorAll(".seg")];
    if (!segs.length) return;
    let i = segs.findIndex((s) => s.dataset.ref === (this.selected || this.reading));
    i = i < 0 ? 0 : Math.max(0, Math.min(segs.length - 1, i + delta));
    const ref = segs[i].dataset.ref;
    this.select(ref, { from: "center" });
    this.scrollCenterTo(ref, "smooth", "center");
    segs[i].focus({ preventScroll: true });
  }

  // Keyboard ←/→: jump to the next/previous amud (scrolls if already loaded).
  async stepSection(delta) {
    const cur = parseRef(this.reading || (this.entries[0] && this.entries[0].ref + ":1"));
    if (!cur) return;
    const target = neighborSection(cur.book, cur.section, delta);
    if (!target) {
      if (delta > 0) {
        const nx = this.app.nextMasechet(cur.book);
        if (nx) this.app.go(nx.ref);
      }
      return;
    }
    const entry = this.entries.find((e) => e.ref === target);
    if (entry) {
      this.scrollPaneTo("center", entry.els.center, 0);
      return;
    }
    this.app.go(target);
  }

  // ----------------------------------------------------------------------------------------
  // Settings changes

  /** Re-applies a pane's display settings while keeping the reading position steady. */
  restyle(key, rerender = false) {
    const pane = this.panes[key];
    const anchorEl = key === "center"
      ? this.panes.center.body.querySelector(`.seg[data-ref="${cssEsc(this.reading || "")}"]`)
      : null;
    const before = anchorEl ? anchorEl.getBoundingClientRect().top : null;
    applyPane(pane.el, key);
    if (rerender && key === "center") {
      this.kindState = null;
      for (const e of this.entries) {
        const fresh = this.renderCenter(e);
        e.els.center.replaceWith(fresh);
        e.els.center = fresh;
        this.markTicks(e);
      }
      if (this.selected) this.select(this.selected, { keepScroll: true });
    }
    if (before != null) {
      requestAnimationFrame(() => {
        const a = this.panes.center.body.querySelector(`.seg[data-ref="${cssEsc(this.reading || "")}"]`);
        if (a) this.panes.center.body.scrollTop += a.getBoundingClientRect().top - before;
      });
    }
  }

  async reloadSide(side) {
    const token = this.token;
    const body = this.panes[side].body;
    body.classList.add("reloading");
    await Promise.all(this.entries.map((e) => this.loadSide(e, side)));
    if (token !== this.token) return;
    for (const e of this.entries) {
      const fresh = this.renderSide(e, side);
      e.els[side].replaceWith(fresh);
      e.els[side] = fresh;
      this.markTicks(e);
    }
    body.classList.remove("reloading");
    this.updateHeads();
    if (this.selected) this.select(this.selected, { from: "center" });
    else if (this.reading) this.syncSides(this.reading, true);
  }

  openCommentatorMenu(side, anchor, entryArg) {
    const entry = entryArg || this.currentEntry();
    if (!entry) return;
    const corpus = entry.data.corpus;
    const current = settings.commentators[corpus][side];
    const list = orderedCommentaries(entry.data);
    const label = sectionLabel(entry.ref);
    const menu = h("div", { class: "cm-menu" },
      h("div", { class: "ps-head" },
        h("span", { class: "ps-title" }, side === "right" ? "Right column" : "Left column"),
        h("span", { class: "ps-sub" }, `Commentaries on ${label.en}`)));
    const ul = h("div", { class: "cm-list", role: "listbox", "aria-label": "Commentaries" });
    let pop;
    for (const c of list) {
      const b = h("button", {
        type: "button", role: "option", "aria-selected": String(c.en === current),
        class: `cm-item ${c.en === current ? "on" : ""}`,
        onclick: () => {
          const otherSide = side === "right" ? "left" : "right";
          if (settings.commentators[corpus][otherSide] === c.en) set(`commentators.${corpus}.${otherSide}`, current);
          set(`commentators.${corpus}.${side}`, c.en);
          pop.close();
          this.reloadSide(side);
          if (settings.commentators[corpus][otherSide] === current) this.reloadSide(otherSide);
        },
      },
      h("span", { class: "cm-he", lang: "he" }, heName(c.en, c.he)),
      h("span", { class: "cm-en" }, c.en),
      h("span", { class: "cm-count", title: `${c.count} comments here` }, String(c.count)));
      ul.appendChild(b);
    }
    if (!list.length) ul.appendChild(h("p", { class: "muted" }, "No commentaries are linked to this page."));
    menu.appendChild(ul);
    pop = popover(menu, { anchor, label: "Choose commentary", className: "pop-menu" });
  }
}
