// Search: jump-to-ref and full-text search across the Talmud and its classic commentaries.

import { h, icon, popover, segmented, debounce, isNarrow } from "./ui.js";
import { api } from "./api.js";
import { loadCatalog, quickParse, getMasechet, parseRef, sectionLabel, SEDARIM, corpusOf } from "./catalog.js";
import { richFragment, hasHebrew, hebNum } from "./text.js";
import { heName } from "./data.js";

const STATE_KEY = "gem:search:v1";
function loadState() {
  try { return Object.assign({ scope: "corpus", exact: false, include: ["gemara"], sort: "relevance" }, JSON.parse(localStorage.getItem(STATE_KEY) || "{}")); } catch (e) { return { scope: "corpus", exact: false, include: ["gemara"], sort: "relevance" }; }
}
function saveState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ scope: s.scope, exact: s.exact, include: s.include, sort: s.sort })); } catch (e) { /* ignore */ }
}

const COMM_PATHS = {
  bavli: {
    rashi: { en: "Rashi", he: "רש״י", base: "Talmud Commentary/Rishonim on Talmud/Rashi", name: (b) => `Rashi on ${b}` },
    tosafot: { en: "Tosafot", he: "תוספות", base: "Talmud Commentary/Rishonim on Talmud/Tosafot", name: (b) => `Tosafot on ${b}` },
  },
  yerushalmi: {
    peneimoshe: { en: "Penei Moshe", he: "פני משה", base: "Talmud Commentary/Commentary/Penei Moshe on Jerusalem Talmud", name: (b) => `Penei Moshe on ${b}` },
    korban: { en: "Korban HaEdah", he: "קרבן העדה", base: "Talmud Commentary/Commentary/Korban HaEdah on Jerusalem Talmud", name: (b) => `Korban HaEdah on ${b}` },
  },
};

function buildFilters(corpus, scope, include, m, extraBook) {
  const cat = corpus === "yerushalmi" ? "Yerushalmi" : "Bavli";
  const seder = m ? m.seder : null;
  const paths = [];
  const bookTitle = extraBook || (m && m.title);
  const bookMeta = extraBook ? getMasechet(extraBook) : m;
  for (const inc of include) {
    if (inc === "gemara") {
      if (scope === "all") paths.push("Talmud/Bavli", "Talmud/Yerushalmi");
      else if (scope === "corpus" && !extraBook) paths.push(`Talmud/${cat}`);
      else if (scope === "seder" && !extraBook) paths.push(`Talmud/${cat}/${seder}`);
      else paths.push(`Talmud/${cat}/${bookMeta ? bookMeta.seder : seder}/${bookTitle}`);
    } else {
      const c = COMM_PATHS[corpus][inc];
      if (!c) continue;
      if (scope === "all" || (scope === "corpus" && !extraBook)) paths.push(c.base);
      else if (scope === "seder" && !extraBook) paths.push(`${c.base}/${seder}`);
      else paths.push(`${c.base}/${bookMeta ? bookMeta.seder : seder}/${c.name(bookTitle)}`);
    }
  }
  return paths;
}

function bookFromPath(path) {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

export function openSearch(app, { query = "", ctx }) {
  const st = loadState();
  const corpus = ctx.corpus;
  const m = getMasechet(ctx.book);
  if (!COMM_PATHS[corpus]) st.include = ["gemara"];
  st.include = st.include.filter((x) => x === "gemara" || (COMM_PATHS[corpus] && COMM_PATHS[corpus][x]));
  if (!st.include.length) st.include = ["gemara"];

  const input = h("input", {
    class: "s-input", type: "search", dir: "auto", autofocus: true, autocomplete: "off", spellcheck: "false", enterkeyhint: "search",
    placeholder: "Search the Talmud — or jump: “Shabbat 31a”, “שבת לא.”",
    "aria-label": "Search the Talmud or go to a page", value: query,
  });
  const jumpEl = h("div", { class: "s-jump", role: "listbox", "aria-label": "Go to" });
  const facetsEl = h("div", { class: "s-facets" });
  const resultsEl = h("div", { class: "s-results", role: "listbox", "aria-label": "Search results" });
  const statusEl = h("div", { class: "s-status", "aria-live": "polite" });
  let bookFilter = null;

  const scopeCtl = segmented([
    { value: "masechet", html: `<span lang="he">${m ? m.he : ""}</span>`, title: `This masechta${m ? " · " + m.en : ""}` },
    { value: "seder", html: `<span lang="he">סדר ${m && SEDARIM[m.seder] ? SEDARIM[m.seder].he : ""}</span>`, title: "This seder" },
    { value: "corpus", html: corpus === "bavli" ? '<span lang="he">כל הבבלי</span>' : '<span lang="he">כל הירושלמי</span>', title: corpus === "bavli" ? "All of the Bavli" : "All of the Yerushalmi" },
    { value: "all", html: '<span lang="he">כל התלמוד</span>', title: "Bavli and Yerushalmi" },
  ], st.scope, (v) => { st.scope = v; bookFilter = null; saveState(st); run(); }, { label: "Scope", className: "s-scope" });

  const exactCtl = segmented([
    { value: false, html: "Variants", title: "Inclusive: matches inflected forms and nearby words" },
    { value: true, html: "Exact", title: "Exact phrase only" },
  ], st.exact, (v) => { st.exact = v; saveState(st); run(); }, { label: "Match" });

  const sortCtl = segmented([
    { value: "relevance", html: "Relevance" },
    { value: "order", html: "Daf order" },
  ], st.sort, (v) => { st.sort = v; saveState(st); run(); }, { label: "Sort" });

  const incWrap = h("div", { class: "s-include", role: "group", "aria-label": "Search in" });
  const incOpts = [{ id: "gemara", he: corpus === "bavli" ? "גמרא" : "ירושלמי", en: "Gemara" }, ...Object.entries(COMM_PATHS[corpus] || {}).map(([id, c]) => ({ id, he: c.he, en: c.en }))];
  for (const o of incOpts) {
    const b = h("button", {
      type: "button", class: `chip-t ${st.include.includes(o.id) ? "on" : ""}`, "aria-pressed": String(st.include.includes(o.id)),
      onclick: () => {
        const on = st.include.includes(o.id);
        if (on && st.include.length === 1) return;
        st.include = on ? st.include.filter((x) => x !== o.id) : [...st.include, o.id];
        b.classList.toggle("on", !on);
        b.setAttribute("aria-pressed", String(!on));
        saveState(st);
        run();
      },
    }, h("span", { lang: "he" }, o.he), h("span", { class: "chip-en" }, o.en));
    incWrap.appendChild(b);
  }

  const root = h("div", { class: "search" },
    h("div", { class: "s-bar" }, icon("search"), input,
      h("kbd", { class: "s-kbd" }, "esc"),
      h("button", { class: "icon-btn s-close", type: "button", "aria-label": "Close search", onclick: () => pop.close() }, icon("x"))),
    h("div", { class: "s-opts" }, scopeCtl, h("div", { class: "s-opts-row" }, incWrap, exactCtl, sortCtl)),
    jumpEl, facetsEl, statusEl, resultsEl);

  const pop = popover(root, { label: "Search", className: "pop-search", modal: true, sheetOnNarrow: false });

  let ctrl = null;
  let page = 0;
  let total = 0;
  let loading = false;
  let catalogList = [];
  loadCatalog("bavli").then((b) => loadCatalog("yerushalmi").then((y) => { catalogList = [...b, ...y]; jump(); })).catch(() => {});

  async function jump() {
    const q = input.value.trim();
    jumpEl.replaceChildren();
    if (!q) return;
    const items = [];
    const qp = quickParse(q, catalogList);
    if (qp) items.push({ ref: qp.ref });
    const lower = q.toLowerCase();
    for (const mm of catalogList) {
      if (items.length >= 4) break;
      if ((mm.en.toLowerCase().startsWith(lower) || mm.he.startsWith(q)) && !(qp && qp.m === mm)) items.push({ ref: `${mm.title} ${mm.sections[0].key}`, book: mm });
    }
    if (!qp && /\d|[א-ת]+\s*[.:]$|\s[א-ת]{1,3}$/.test(q)) {
      try {
        const n = await api.name(q);
        if (input.value.trim() !== q) return;
        if (n.is_ref && n.ref) {
          const pr = parseRef(n.ref);
          if (pr && pr.sectionRef && (getMasechet(pr.book))) items.unshift({ ref: n.ref });
        }
      } catch (e) { /* ignore */ }
    }
    renderJump(items);
  }

  function renderJump(items) {
    jumpEl.replaceChildren();
    const seen = new Set();
    for (const it of items) {
      if (seen.has(it.ref)) continue;
      seen.add(it.ref);
      const p = parseRef(it.ref);
      const mm = getMasechet(p.book);
      if (!mm) continue;
      const lab = sectionLabel(p.sectionRef);
      const b = h("button", {
        type: "button", role: "option", class: "s-jump-item",
        onclick: () => { pop.close(); app.go(it.ref, { select: !!p.seg }); },
      },
      icon("chevRight"),
      h("span", { class: "sj-he", lang: "he" }, it.book ? mm.he : `${lab.he}${p.seg ? " " + hebNum(p.seg) : ""}`),
      h("span", { class: "sj-en" }, it.book ? `${mm.en} · ${mm.corpus === "bavli" ? "Bavli" : "Yerushalmi"}` : `Go to ${lab.en}${p.seg ? ":" + p.seg : ""}`),
      h("kbd", {}, "↵"));
      jumpEl.appendChild(b);
    }
  }

  const run = debounce(() => search(true), 260);

  async function search(reset) {
    const q = input.value.trim();
    if (reset) { page = 0; resultsEl.replaceChildren(); facetsEl.replaceChildren(); }
    if (q.length < 2) { statusEl.textContent = ""; return; }
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    loading = true;
    statusEl.replaceChildren(h("span", { class: "spinner", "aria-hidden": "true" }), " Searching…");
    const filters = buildFilters(corpus, st.scope, st.include, m, bookFilter);
    const body = {
      type: "text", query: q, field: st.exact ? "exact" : "naive_lemmatizer", source_proj: true,
      slop: st.exact ? 0 : 10, start: page * 20, size: 20,
      filters, filter_fields: filters.map(() => "path"),
      aggs: page === 0 && !bookFilter ? ["path"] : [],
      sort_method: st.sort === "order" ? "sort" : "score",
      sort_fields: st.sort === "order" ? ["order"] : ["pagesheetrank"],
      sort_reverse: false, sort_score_missing: 0.04,
    };
    try {
      const res = await api.search(body, ctrl.signal);
      if (input.value.trim() !== q) return;
      total = typeof res.hits.total === "object" ? res.hits.total.value : res.hits.total;
      if (page === 0 && res.aggregations) renderFacets(res.aggregations.path.buckets);
      renderResults(res.hits.hits, q);
      const shown = resultsEl.querySelectorAll(".s-hit").length;
      statusEl.textContent = total ? `${total.toLocaleString()} result${total === 1 ? "" : "s"}${bookFilter ? " in " + (getMasechet(bookFilter) || { en: bookFilter }).en : ""}` : "";
      if (!total) statusEl.replaceChildren(h("span", {}, "Nothing found. "), st.exact ? h("button", { class: "link-btn", type: "button", onclick: () => { exactCtl.querySelectorAll("button")[0].click(); } }, "Try matching variants") : h("button", { class: "link-btn", type: "button", onclick: () => { scopeCtl.querySelectorAll("button")[2].click(); } }, "Search the whole " + (corpus === "bavli" ? "Bavli" : "Yerushalmi")));
      if (shown < total) {
        const more = h("button", { class: "btn ghost s-more", type: "button", onclick: () => { more.remove(); page++; search(false); } }, "More results");
        resultsEl.appendChild(more);
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      statusEl.textContent = "Search is unavailable right now.";
    } finally {
      loading = false;
    }
  }

  function renderFacets(buckets) {
    facetsEl.replaceChildren();
    const books = new Map();
    for (const b of buckets) {
      const t = bookFromPath(b.key);
      const base = t.replace(/^(Rashi|Tosafot|Penei Moshe|Korban HaEdah) on /, "");
      const mm = getMasechet(base);
      if (!mm) continue;
      books.set(mm.title, (books.get(mm.title) || 0) + b.doc_count);
    }
    if (books.size < 2) return;
    const sorted = [...books.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
    for (const [title, n] of sorted) {
      const mm = getMasechet(title);
      facetsEl.appendChild(h("button", {
        type: "button", class: `facet ${bookFilter === title ? "on" : ""}`,
        onclick: () => { bookFilter = bookFilter === title ? null : title; search(true); },
      }, h("span", { lang: "he" }, mm.he), h("span", { class: "facet-en" }, mm.en), h("b", {}, String(n))));
    }
  }

  function renderResults(rawHits, q) {
    const qHe = hasHebrew(q);
    const seen = new Set([...resultsEl.querySelectorAll(".s-hit")].map((x) => x.dataset.ref));
    // One row per ref: prefer the query's language, then the primary (e.g. vocalized) version.
    const best = new Map();
    for (const hit of rawHits) {
      const s = hit._source;
      const rank = (qHe === (s.lang === "he") ? 0 : 100) + (s.version_priority || 0);
      const cur = best.get(s.ref);
      if (!cur || rank < cur.rank) best.set(s.ref, { hit, rank, pos: cur ? cur.pos : best.size });
    }
    const hits = [...best.values()].sort((a, b) => a.pos - b.pos).map((x) => x.hit);
    for (const hit of hits) {
      const s = hit._source;
      if (seen.has(s.ref)) continue;
      seen.add(s.ref);
      const p = parseRef(s.ref);
      if (!p || !p.sectionRef) continue;
      const mm = getMasechet(p.book);
      const hl = hit.highlight ? (hit.highlight.naive_lemmatizer || hit.highlight.exact || [])[0] : "";
      const lab = sectionLabel(p.sectionRef);
      const commentator = p.commentary;
      const b = h("button", {
        type: "button", role: "option", class: "s-hit", "data-ref": s.ref,
        onclick: () => {
          pop.close();
          const target = `${p.sectionRef}${p.seg ? ":" + p.seg : ""}`;
          app.go(target, { mark: q, comment: commentator ? s.ref : null, select: true, commentator });
        },
      },
      h("div", { class: "sh-meta" },
        commentator ? h("span", { class: "badge", lang: "he" }, heName(commentator)) : null,
        h("span", { class: "sh-ref", lang: "he" }, `${lab.he}${p.seg ? " " + hebNum(p.seg) : ""}`),
        h("span", { class: "sh-ref-en" }, `${commentator ? commentator + " on " : ""}${lab.en}${p.seg ? ":" + p.seg : ""}`)),
      h("div", { class: "sh-snip", lang: s.lang === "he" ? "he" : "en", dir: s.lang === "he" ? "rtl" : "ltr" }, richFragment(hl || "")));
      resultsEl.appendChild(b);
    }
  }

  input.addEventListener("input", () => {
    bookFilter = null;
    jump();
    // A place ("Shabbat 31a") is a jump, not a text search.
    if (quickParse(input.value, catalogList)) { resultsEl.replaceChildren(); facetsEl.replaceChildren(); statusEl.replaceChildren(h("button", { class: "link-btn", type: "button", onclick: () => search(true) }, "Search the text for these words instead")); return; }
    run();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const j = jumpEl.querySelector(".s-jump-item");
      if (j && (quickParse(input.value, catalogList) || jumpEl.children.length && /\d|[.:]$/.test(input.value))) { j.click(); return; }
      search(true);
    } else if (e.key === "ArrowDown") {
      const first = root.querySelector(".s-jump-item, .s-hit");
      if (first) { e.preventDefault(); first.focus(); }
    }
  });
  root.addEventListener("keydown", (e) => {
    if (!e.target.matches(".s-jump-item, .s-hit")) return;
    const items = [...root.querySelectorAll(".s-jump-item, .s-hit")];
    const i = items.indexOf(e.target);
    if (e.key === "ArrowDown" && items[i + 1]) { e.preventDefault(); items[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (items[i - 1] || input).focus(); }
  });
  if (query) { jump(); search(true); }
  return pop;
}
