// Reader preferences: persisted per viewer, applied as CSS variables on each pane.

import { h, icon, popover, segmented, toggle } from "./ui.js";

export const HE_FONTS = [
  { id: "taamey", name: "Taamey Frank", note: "Sefaria", stack: "'Taamey Frank', 'Frank Ruhl Libre', serif" },
  { id: "frank", name: "Frank Ruhl", stack: "'Frank Ruhl Libre', 'Taamey Frank', serif" },
  { id: "david", name: "David Libre", stack: "'David Libre', 'Taamey Frank', serif" },
  { id: "notoserif", name: "Noto Serif", stack: "'Noto Serif Hebrew', 'Taamey Frank', serif" },
  { id: "rashi", name: "Rashi script", note: "Noto", stack: "'Noto Rashi Hebrew', 'Taamey Frank', serif", rashi: true },
  { id: "mekorot", name: "Mekorot Rashi", note: "Vilna", stack: "'Mekorot Rashi', 'Noto Rashi Hebrew', serif", rashi: true },
  { id: "heebo", name: "Heebo", note: "Sans", stack: "'Heebo', system-ui, sans-serif" },
];
export const EN_FONTS = [
  { id: "garamond", name: "EB Garamond", stack: "'EB Garamond', Georgia, serif", scale: 1.04 },
  { id: "crimson", name: "Crimson Pro", stack: "'Crimson Pro', Georgia, serif", scale: 1.05 },
  { id: "literata", name: "Literata", stack: "'Literata', Georgia, serif", scale: 0.92 },
  { id: "sourceserif", name: "Source Serif", stack: "'Source Serif 4', Georgia, serif", scale: 0.93 },
  { id: "newsreader", name: "Newsreader", stack: "'Newsreader', Georgia, serif", scale: 0.98 },
  { id: "inter", name: "Inter", note: "Sans", stack: "'Inter', system-ui, sans-serif", scale: 0.9 },
];

export const COMMENTATORS = {
  bavli: {
    right: ["Rashi", "Rashbam", "Ran", "Mefaresh", "Rabbeinu Gershom", "Commentary of the Rosh", "Steinsaltz"],
    left: ["Tosafot", "Commentary of the Rosh", "Tosafot HaRosh", "Tosafot Rid", "Ritva", "Rashba", "Meiri", "Rabbeinu Gershom", "Steinsaltz"],
  },
  yerushalmi: {
    right: ["Penei Moshe", "Korban HaEdah", "Sirilio", "Mareh HaPanim"],
    left: ["Korban HaEdah", "Sirilio", "Mareh HaPanim", "Sheyarei Korban", "Penei Moshe"],
  },
};

const PANE_DEFAULTS = {
  center: { lang: "he", heFont: "taamey", enFont: "garamond", size: 25, lead: 1.85, nikud: true, literal: "full", both: "side", flow: "lines", mishnah: true },
  right: { lang: "he", heFont: "rashi", enFont: "crimson", size: 17, lead: 1.7, nikud: true },
  left: { lang: "he", heFont: "rashi", enFont: "crimson", size: 17, lead: 1.7, nikud: true },
};

const DEFAULTS = {
  theme: "auto",
  corpus: "bavli",
  sync: true,
  tapDefine: false,
  segNums: false,
  citeOnCopy: true,
  focus: false,
  panes: PANE_DEFAULTS,
  commentators: { bavli: { right: "Rashi", left: "Tosafot" }, yerushalmi: { right: "Penei Moshe", left: "Korban HaEdah" } },
};

const KEY = "gem:settings:v1";
const listeners = new Set();

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function merge(base, over) {
  if (!over || typeof over !== "object") return base;
  for (const k of Object.keys(base)) {
    if (over[k] === undefined) continue;
    if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) merge(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}

function load() {
  const s = clone(DEFAULTS);
  try { merge(s, JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { /* ignore */ }
  return s;
}

export const settings = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

export function set(path, value) {
  const keys = path.split(".");
  let o = settings;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
  save();
  listeners.forEach((fn) => fn(path, value));
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function reset() {
  const d = clone(DEFAULTS);
  for (const k of Object.keys(d)) settings[k] = d[k];
  save();
  listeners.forEach((fn) => fn("*", null));
}

export function heFont(id) { return HE_FONTS.find((f) => f.id === id) || HE_FONTS[0]; }
export function enFont(id) { return EN_FONTS.find((f) => f.id === id) || EN_FONTS[0]; }

/** Applies a pane's settings to its element as classes + CSS custom properties. */
export function applyPane(paneEl, key) {
  const p = settings.panes[key];
  const hf = heFont(p.heFont), ef = enFont(p.enFont);
  paneEl.style.setProperty("--he-font", hf.stack);
  paneEl.style.setProperty("--en-font", ef.stack);
  paneEl.style.setProperty("--fs", `${p.size}px`);
  paneEl.style.setProperty("--fs-en", `${(p.size * 0.74 * (ef.scale || 1)).toFixed(1)}px`);
  paneEl.style.setProperty("--lead", p.lead);
  paneEl.classList.toggle("lang-he", p.lang === "he");
  paneEl.classList.toggle("lang-en", p.lang === "en");
  paneEl.classList.toggle("lang-both", p.lang === "both");
  paneEl.classList.toggle("both-side", p.lang === "both" && p.both !== "stack");
  paneEl.classList.toggle("rashi-font", !!hf.rashi);
  if (key === "center") {
    paneEl.classList.toggle("lit-emph", p.literal === "emph");
    paneEl.classList.toggle("lit-only", p.literal === "only");
    paneEl.classList.toggle("flow-prose", p.flow === "prose");
    paneEl.classList.toggle("mishnah-mark", p.mishnah !== false);
  }
}

export function applyGlobal() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  document.body.classList.toggle("seg-nums", !!settings.segNums);
  document.body.classList.toggle("tap-define", !!settings.tapDefine);
  document.body.classList.toggle("focus-mode", !!settings.focus);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    requestAnimationFrame(() => { meta.content = getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#faf8f4"; });
  }
}

// ------------------------------------------------------------------------------------------
// Per-pane display popover ("Aa")

const SAMPLE_HE = { center: "תנא היכא קאי", right: "מאימתי קורין", left: "מאימתי קורין" };

export function openPaneSettings(key, anchor, { title, hasEnglish = true, onChanged } = {}) {
  const p = settings.panes[key];
  const changed = (field, v, rerender = false) => {
    set(`panes.${key}.${field}`, v);
    onChanged && onChanged(field, rerender);
  };
  const body = h("div", { class: "ps" });
  body.appendChild(h("div", { class: "ps-head" },
    h("span", { class: "ps-title" }, title || "Display"),
    h("span", { class: "ps-sub" }, "These settings apply to this column only")));

  body.appendChild(h("div", { class: "ps-row" },
    h("span", { class: "ps-label" }, "Language"),
    segmented([
      { value: "he", html: '<span lang="he">עברית</span>', title: "Hebrew / Aramaic" },
      { value: "en", html: "English", title: hasEnglish ? "English" : "No English translation for this text yet" },
      { value: "both", html: "Both", title: "Hebrew and English" },
    ], p.lang, (v) => { changed("lang", v); sync(); }, { label: "Language" })));

  const bothRow = key === "center" ? h("div", { class: "ps-row ps-dep" },
    h("span", { class: "ps-label" }, "Both as"),
    segmented([
      { value: "side", html: "Side by side" },
      { value: "stack", html: "Stacked" },
    ], p.both, (v) => changed("both", v), { label: "Bilingual layout" })) : null;
  if (bothRow) body.appendChild(bothRow);

  // Size
  const sizeOut = h("output", { class: "ps-size-out" }, String(p.size));
  const range = h("input", { type: "range", min: key === "center" ? 16 : 13, max: key === "center" ? 40 : 28, step: 1, value: p.size, "aria-label": "Text size" });
  const setSize = (v) => {
    v = Math.max(+range.min, Math.min(+range.max, v));
    range.value = v;
    sizeOut.textContent = v;
    changed("size", v);
  };
  range.addEventListener("input", () => setSize(+range.value));
  body.appendChild(h("div", { class: "ps-row" },
    h("span", { class: "ps-label" }, "Size"),
    h("div", { class: "ps-size" },
      h("button", { type: "button", class: "icon-btn sm", "aria-label": "Smaller", onclick: () => setSize(+range.value - 1) }, h("span", { class: "a-sm" }, "א")),
      range,
      h("button", { type: "button", class: "icon-btn sm", "aria-label": "Larger", onclick: () => setSize(+range.value + 1) }, h("span", { class: "a-lg" }, "א")),
      sizeOut)));

  body.appendChild(h("div", { class: "ps-row" },
    h("span", { class: "ps-label" }, "Spacing"),
    segmented([
      { value: 1.5, html: "Snug" },
      { value: key === "center" ? 1.85 : 1.7, html: "Calm" },
      { value: key === "center" ? 2.2 : 2, html: "Airy" },
    ], p.lead, (v) => changed("lead", v), { label: "Line spacing" })));

  // Fonts
  const heGrid = h("div", { class: "font-grid", role: "radiogroup", "aria-label": "Hebrew font" });
  for (const f of HE_FONTS) {
    const b = h("button", {
      type: "button", role: "radio", "aria-checked": String(p.heFont === f.id),
      class: `font-chip ${p.heFont === f.id ? "on" : ""}`,
      onclick: () => { heGrid.querySelectorAll(".font-chip").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); }); b.classList.add("on"); b.setAttribute("aria-checked", "true"); changed("heFont", f.id); },
    },
    h("span", { class: "fc-sample", lang: "he", dir: "rtl", style: { fontFamily: f.stack } }, SAMPLE_HE[key]),
    h("span", { class: "fc-name" }, f.name, f.note ? h("i", {}, f.note) : null));
    heGrid.appendChild(b);
  }
  body.appendChild(h("div", { class: "ps-block" }, h("span", { class: "ps-label" }, "Hebrew font"), heGrid));

  const enGrid = h("div", { class: "font-grid en", role: "radiogroup", "aria-label": "English font" });
  for (const f of EN_FONTS) {
    const b = h("button", {
      type: "button", role: "radio", "aria-checked": String(p.enFont === f.id),
      class: `font-chip ${p.enFont === f.id ? "on" : ""}`,
      onclick: () => { enGrid.querySelectorAll(".font-chip").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); }); b.classList.add("on"); b.setAttribute("aria-checked", "true"); changed("enFont", f.id); },
    },
    h("span", { class: "fc-sample", style: { fontFamily: f.stack } }, "Our Rabbis taught"),
    h("span", { class: "fc-name" }, f.name, f.note ? h("i", {}, f.note) : null));
    enGrid.appendChild(b);
  }
  const enBlock = h("div", { class: "ps-block ps-dep-en" }, h("span", { class: "ps-label" }, "English font"), enGrid);
  body.appendChild(enBlock);

  if (key === "center") {
    const lit = h("div", { class: "ps-row ps-dep-en" },
      h("span", { class: "ps-label", title: "The Steinsaltz English marks the literal translation in bold; the rest is explanation." }, "Translation"),
      segmented([
        { value: "full", html: "Full" },
        { value: "emph", html: "Literal <b>bold</b>" },
        { value: "only", html: "Literal only" },
      ], p.literal, (v) => changed("literal", v, true), { label: "Translation mode" }));
    body.appendChild(lit);
    body.appendChild(h("div", { class: "ps-toggles" },
      toggle(h("span", {}, "Nikud ", h("span", { lang: "he", class: "nikud-demo" }, "נִקּוּד")), p.nikud, (v) => changed("nikud", v, true), "Vowels on the Aramaic"),
      toggle("Mark the Mishnah", p.mishnah !== false, (v) => changed("mishnah", v), "A quiet rule beside mishnah text"),
      toggle("Continuous prose", p.flow === "prose", (v) => changed("flow", v ? "prose" : "lines"), "Hebrew only: run lines together like a printed daf")));
  }

  function sync() {
    const lang = settings.panes[key].lang;
    if (bothRow) bothRow.classList.toggle("hidden", lang !== "both");
    body.querySelectorAll(".ps-dep-en").forEach((n) => n.classList.toggle("dim", lang === "he"));
  }
  sync();

  return popover(body, { anchor, label: `${title || "Display"} settings`, className: "pop-settings" });
}
