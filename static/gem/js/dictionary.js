// Dictionary: Jastrow, Klein, BDB … for any word or phrase in the text.

import { h, icon, popover } from "./ui.js";
import { api } from "./api.js";
import { lookupCandidates, normalizeForLookup, richFragment, hasHebrew } from "./text.js";

const LEX_ORDER = ["Jastrow Dictionary", "Klein Dictionary", "BDB Aramaic Dictionary", "BDB Dictionary", "BDB Augmented Strong"];
const LEX_SHORT = {
  "Jastrow Dictionary": { en: "Jastrow", he: "יאסטרוב" },
  "Klein Dictionary": { en: "Klein", he: "קליין" },
  "BDB Aramaic Dictionary": { en: "BDB Aramaic", he: "ארמית" },
  "BDB Dictionary": { en: "BDB", he: "BDB" },
  "BDB Augmented Strong": { en: "Strong", he: "Strong" },
};

/** Looks up the first candidate form that the lexicon knows; tries forms in parallel. */
async function lookup(word, ref) {
  const cands = lookupCandidates(word);
  const results = await Promise.all(cands.map((c) => api.words(c, ref).then((r) => ({ c, r })).catch(() => ({ c, r: [] }))));
  const hit = results.find((x) => x.r && x.r.length);
  return { cands, form: hit ? hit.c : cands[0], entries: hit ? hit.r : [] };
}

function renderSenses(senses, depth = 0) {
  const ol = h("ol", { class: `senses d${depth}` });
  for (const s of senses || []) {
    const li = h("li", {});
    if (s.number) li.appendChild(h("span", { class: "s-num" }, s.number));
    if (s.grammar && s.grammar.verbal_stem) li.appendChild(h("span", { class: "s-stem" }, s.grammar.verbal_stem));
    if (s.form) li.appendChild(h("span", { class: "s-form", lang: "he" }, s.form));
    if (s.definition) li.appendChild(h("span", { class: "s-def" }, richFragment(s.definition)));
    if (s.senses && s.senses.length) li.appendChild(renderSenses(s.senses, depth + 1));
    ol.appendChild(li);
  }
  return ol;
}

function renderEntry(e, app) {
  const c = e.content || {};
  const art = h("article", { class: "lex-entry" },
    h("header", { class: "lex-hw" },
      h("span", { class: "hw", lang: "he", dir: "rtl" }, e.headword),
      (e.alt_headwords || []).length ? h("span", { class: "alt-hw", lang: "he" }, e.alt_headwords.join(", ")) : null,
      c.morphology || e.morphology ? h("span", { class: "morph" }, c.morphology || e.morphology) : null,
      e.pronunciation ? h("span", { class: "morph" }, e.pronunciation) : null));
  if (e.language_code || e.language_reference) art.appendChild(h("div", { class: "lex-lang" }, [e.language_code, e.language_reference].filter(Boolean).join(" · ")));
  if (c.senses) art.appendChild(renderSenses(c.senses));
  if (e.notes) art.appendChild(h("div", { class: "lex-notes" }, richFragment(e.notes)));
  if (e.derivatives) art.appendChild(h("div", { class: "lex-notes" }, richFragment(e.derivatives)));
  art.addEventListener("click", (ev) => {
    const a = ev.target.closest("a.ref-link");
    if (!a) return;
    ev.preventDefault();
    const r = a.dataset.ref;
    const m = /^(Jastrow|Klein Dictionary|BDB[^,]*), (.+?) \d+$/.exec(r);
    if (m) { app.define(m[2], {}); return; }
    app.followRef(r);
  });
  return art;
}

export function openDictionary(app, word, { anchor, ref } = {}) {
  const q = normalizeForLookup(word);
  const input = h("input", { class: "dict-input", lang: "he", dir: "rtl", value: q, "aria-label": "Word or phrase", spellcheck: "false", autocomplete: "off" });
  const tabs = h("div", { class: "dict-tabs", role: "tablist" });
  const body = h("div", { class: "dict-body", "aria-live": "polite" });
  const near = h("div", { class: "dict-near" });
  const root = h("div", { class: "dict" },
    h("div", { class: "dict-head" },
      h("div", { class: "dict-word", lang: "he", dir: "rtl" }, word.trim()),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Close dictionary", onclick: () => pop.close() }, icon("x"))),
    h("form", { class: "dict-form", onsubmit: (e) => { e.preventDefault(); run(input.value); } },
      icon("search"), input),
    tabs, body, near,
    h("div", { class: "dict-foot" },
      h("button", { class: "link-btn", type: "button", onclick: () => { pop.close(); app.openSearch(input.value); } }, icon("search"), " Find in the Talmud"),
      h("span", { class: "muted" }, "Jastrow · Klein · BDB via Sefaria")));

  const pop = popover(root, { anchor, label: `Dictionary: ${q}`, className: "pop-dict" });

  async function run(w) {
    const form = normalizeForLookup(w);
    if (!form) return;
    body.replaceChildren(h("div", { class: "skel" }, h("span"), h("span", { style: { width: "80%" } }), h("span", { style: { width: "60%" } })));
    tabs.replaceChildren();
    near.replaceChildren();
    let res;
    try {
      res = await lookup(form, ref);
    } catch (e) {
      body.replaceChildren(h("p", { class: "muted" }, "The dictionary is unavailable right now."));
      return;
    }
    const byLex = new Map();
    for (const e of res.entries) {
      const lx = e.parent_lexicon;
      if (!byLex.has(lx)) byLex.set(lx, []);
      byLex.get(lx).push(e);
    }
    const lexes = [...byLex.keys()].sort((a, b) => (LEX_ORDER.indexOf(a) + 99) % 99 - (LEX_ORDER.indexOf(b) + 99) % 99);
    if (!lexes.length) {
      body.replaceChildren(h("div", { class: "dict-empty" },
        h("p", {}, "No entry found for ", h("b", { lang: "he" }, form), "."),
        h("p", { class: "muted" }, "Try trimming a prefix or suffix above, or pick a nearby headword:")));
    } else {
      if (res.form !== form) body.appendChild(h("p", { class: "dict-form-note" }, "Showing ", h("b", { lang: "he" }, res.form), " — the dictionary form of ", h("span", { lang: "he" }, form)));
      const show = (lx) => {
        tabs.querySelectorAll("button").forEach((b) => { const on = b.dataset.lx === lx; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
        const list = h("div", { class: "lex-list" });
        byLex.get(lx).forEach((e) => list.appendChild(renderEntry(e, app)));
        const note = body.querySelector(".dict-form-note");
        body.replaceChildren(...(note ? [note] : []), list);
      };
      for (const lx of lexes) {
        const s = LEX_SHORT[lx] || { en: lx };
        tabs.appendChild(h("button", { type: "button", role: "tab", "data-lx": lx, onclick: () => show(lx) }, s.en, h("b", {}, String(byLex.get(lx).length))));
      }
      show(lexes[0]);
    }
    if (hasHebrew(form) && !/\s/.test(form)) {
      api.completion(res.form || form).then((list) => {
        const words = [...new Set((list || []).map((x) => x[0]))].filter((x) => x !== res.form).slice(0, 8);
        if (!words.length) return;
        near.replaceChildren(h("span", { class: "near-label" }, "Nearby"),
          ...words.map((w2) => h("button", { type: "button", class: "chip-t", lang: "he", onclick: () => { input.value = w2; run(w2); } }, w2)));
      }).catch(() => {});
    }
    pop.reposition();
  }
  run(q);
  return pop;
}
