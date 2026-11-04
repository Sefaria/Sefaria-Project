// Masechta & daf picker.

import { h, icon, popover, segmented, isNarrow } from "./ui.js";
import { loadCatalog, loadChapters, SEDARIM, amudToIndex, parseRef, corpusOf } from "./catalog.js";
import { hebNum, perekOrdinalHe, amudLabelHe } from "./text.js";
import { visitedSet } from "./store.js";

export function openNavigator(app, { corpus, book, section } = {}) {
  let curCorpus = corpus;
  let pop;
  const root = h("div", { class: "nav" });
  const filter = h("input", {
    class: "nav-filter", type: "search", dir: "auto", placeholder: "Find a masechta — Shabbat, שבת, Bava Metzia…",
    "aria-label": "Find a masechta", autofocus: !isNarrow() || null, autocomplete: "off", spellcheck: "false",
  });
  const listEl = h("div", { class: "nav-list", role: "list" });
  const detailEl = h("div", { class: "nav-detail", "aria-live": "polite" });
  const corpusCtl = segmented([
    { value: "bavli", html: `<span lang="he">בבלי</span> Bavli` },
    { value: "yerushalmi", html: `<span lang="he">ירושלמי</span> Yerushalmi` },
  ], curCorpus, (v) => { curCorpus = v; chosen = book && corpusOf(book) === v ? book : null; renderList(); }, { label: "Talmud" });

  root.append(
    h("div", { class: "nav-top" },
      corpusCtl,
      h("div", { class: "nav-search" }, icon("search"), filter),
      h("button", { class: "btn ghost nav-today", type: "button", onclick: () => { pop.close(); app.dafYomi(curCorpus); } }, icon("calendar"), curCorpus === "bavli" ? "Today’s daf" : "Today’s Yerushalmi"),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: () => pop.close() }, icon("x"))),
    h("div", { class: "nav-body" }, listEl, detailEl));

  let list = [];
  let chosen = book;

  async function renderList() {
    listEl.replaceChildren(h("div", { class: "skel" }, h("span"), h("span"), h("span")));
    list = await loadCatalog(curCorpus);
    const q = filter.value.trim().toLowerCase();
    const groups = new Map();
    for (const m of list) {
      if (q && !(m.en.toLowerCase().includes(q) || m.he.includes(filter.value.trim()) || m.en.toLowerCase().replace(/[^a-z]/g, "").includes(q.replace(/[^a-z]/g, "")))) continue;
      if (!groups.has(m.seder)) groups.set(m.seder, []);
      groups.get(m.seder).push(m);
    }
    listEl.replaceChildren();
    if (!groups.size) listEl.appendChild(h("p", { class: "muted pad" }, "No masechta by that name."));
    for (const [seder, ms] of groups) {
      const sd = SEDARIM[seder] || { he: seder, en: seder };
      const grid = h("div", { class: "mas-grid" });
      for (const m of ms) {
        const seen = visitedSet(m.title);
        const total = m.sections.length;
        const done = m.sections.filter((s) => seen.has(s.key)).length;
        const count = m.corpus === "bavli" ? `${m.lastDaf - m.firstDaf + 1} דפים` : `${m.chapterCount} פרקים`;
        const b = h("button", {
          type: "button", role: "listitem",
          class: `mas ${m.title === chosen ? "on" : ""} ${m.title === book ? "current" : ""}`,
          onclick: () => { chosen = m.title; listEl.querySelectorAll(".mas").forEach((x) => x.classList.toggle("on", x === b)); renderDetail(m); if (isNarrow()) detailEl.scrollTop = 0; },
        },
        h("span", { class: "mas-he", lang: "he" }, m.he),
        h("span", { class: "mas-en" }, m.en),
        h("span", { class: "mas-count", lang: "he" }, count),
        done ? h("span", { class: "mas-prog", style: { "--p": `${Math.max(3, Math.round((done / total) * 100))}%` }, title: `${done} of ${total} visited` }) : null);
        grid.appendChild(b);
      }
      listEl.append(h("h3", { class: "seder" }, h("span", { lang: "he" }, `סדר ${sd.he}`), h("span", {}, sd.en)), grid);
    }
    if (!chosen && !q && list.length) chosen = list[0].title;
    const target = list.find((m) => m.title === chosen);
    if (target && detailEl.dataset.book !== target.title) renderDetail(target);
    else if (!target && q) root.classList.remove("has-detail");
  }

  async function renderDetail(m) {
    detailEl.dataset.book = m.title;
    root.classList.add("has-detail");
    const seen = visitedSet(m.title);
    const chapters = await loadChapters(m.title);
    const head = h("div", { class: "nd-head" },
      h("button", { class: "icon-btn nd-back", type: "button", "aria-label": "Back to list", onclick: () => root.classList.remove("has-detail") }, icon("chevLeft")),
      h("div", {},
        h("div", { class: "nd-he", lang: "he" }, m.he),
        h("div", { class: "nd-en" }, `${m.en}${m.corpus === "yerushalmi" ? " · Jerusalem Talmud" : ""}`)));
    const body = h("div", { class: "nd-body" });
    if (m.corpus === "bavli") {
      const grid = h("div", { class: "daf-grid", role: "grid", "aria-label": `${m.en} dapim` });
      const cur = parseRef(section || "");
      for (let daf = m.firstDaf; daf <= m.lastDaf; daf++) {
        const cell = h("div", { class: "daf", role: "gridcell", "data-daf": daf });
        for (const side of ["a", "b"]) {
          const key = `${daf}${side}`;
          const exists = m.sectionIndex.has(key);
          const isCur = cur && cur.book === m.title && cur.section === key;
          const btn = h("button", {
            type: "button",
            class: `amud amud-${side} ${seen.has(key) ? "seen" : ""} ${isCur ? "cur" : ""}`,
            disabled: !exists || null,
            "aria-label": `${m.en} ${key} (${amudLabelHe(key)})`,
            title: `${amudLabelHe(key)} · ${key}`,
            "data-key": key,
            onclick: () => { pop.close(); app.go(`${m.title} ${key}`); },
          }, h("span", { class: "amud-dot", "aria-hidden": "true" }, side === "a" ? "." : ":"));
          cell.appendChild(btn);
        }
        cell.appendChild(h("span", { class: "daf-n", lang: "he", "aria-hidden": "true" }, hebNum(daf)));
        grid.appendChild(cell);
      }
      if (chapters.length) {
        const chips = h("div", { class: "perek-chips" });
        for (const c of chapters) {
          const b = h("button", {
            type: "button", class: "perek-chip",
            title: c.start ? `${c.start.section}–${c.end ? c.end.section : ""}` : "",
            onclick: () => { pop.close(); app.go(`${m.title} ${c.start.section}:${c.start.seg}`, { select: c.start.seg > 1 }); },
            onpointerenter: () => highlightRange(grid, c, true),
            onpointerleave: () => highlightRange(grid, c, false),
            onfocus: () => highlightRange(grid, c, true),
            onblur: () => highlightRange(grid, c, false),
          },
          h("span", { class: "pc-n", lang: "he" }, hebNum(c.n)),
          h("span", { class: "pc-name", lang: "he" }, c.he),
          h("span", { class: "pc-range" }, c.start ? c.start.section : ""));
          chips.appendChild(b);
        }
        body.append(h("div", { class: "nd-label" }, h("span", { lang: "he" }, "פרקים"), " Chapters"), chips);
      }
      body.append(h("div", { class: "nd-label" }, h("span", { lang: "he" }, "דפים"), " Dapim · tap the right half for amud aleph, the left for bet"), grid);
    } else {
      const cur = parseRef(section || "");
      const byCh = new Map();
      for (const s of m.sections) {
        if (!byCh.has(s.ch)) byCh.set(s.ch, []);
        byCh.get(s.ch).push(s);
      }
      const wrap = h("div", { class: "jt-chapters" });
      for (const [ch, hal] of byCh) {
        const c = chapters[ch - 1];
        const row = h("div", { class: "jt-ch" },
          h("div", { class: "jt-ch-name" }, h("span", { lang: "he", class: "pc-n" }, hebNum(ch)), h("span", { lang: "he" }, c && c.he ? c.he : `פרק ${perekOrdinalHe(ch)}`)));
        const chips = h("div", { class: "jt-hal" });
        for (const s of hal) {
          const isCur = cur && cur.book === m.title && cur.section === s.key;
          chips.appendChild(h("button", {
            type: "button", class: `hal ${seen.has(s.key) ? "seen" : ""} ${isCur ? "cur" : ""}`,
            "aria-label": `Chapter ${ch}, halakhah ${s.hal}`,
            onclick: () => { pop.close(); app.go(`${m.title} ${s.key}`); },
          }, h("span", { lang: "he" }, hebNum(s.hal))));
        }
        row.appendChild(chips);
        wrap.appendChild(row);
      }
      body.append(h("div", { class: "nd-label" }, h("span", { lang: "he" }, "פרקים והלכות"), " Chapters & halakhot"), wrap);
    }
    detailEl.replaceChildren(head, body);
    const curEl = detailEl.querySelector(".cur");
    if (curEl) requestAnimationFrame(() => curEl.scrollIntoView({ block: "center" }));
  }

  function highlightRange(grid, c, on) {
    if (!c.start) return;
    const a = amudToIndex(c.start.section), b = amudToIndex(c.end ? c.end.section : c.start.section);
    grid.querySelectorAll(".amud").forEach((el) => {
      const i = amudToIndex(el.dataset.key);
      el.classList.toggle("in-perek", on && i >= a && i <= b);
    });
  }

  filter.addEventListener("input", () => { chosen = null; renderList(); });
  filter.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = listEl.querySelector(".mas");
      if (first) first.click();
    }
  });

  pop = popover(root, { label: "Choose a masechta", className: "pop-nav", modal: true, sheetOnNarrow: false });
  renderList();
  return pop;
}
