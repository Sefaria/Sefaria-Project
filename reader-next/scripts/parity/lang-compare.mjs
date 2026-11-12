// Compares what the old client and this client show for one case (measurements from lang-parity.mjs) and names each difference by its
// root cause. Each cause points at the rule it breaks in the language-rules audit (rule ids R-…).

export const ROOT_CAUSES = {
  LOAD: { rule: "-", what: "a side did not load (timeout, error page, or no text)" },
  "TITLE-LANG": { rule: "R-TITLE-1", what: "panel title in the other language (Hebrew vs English)" },
  "TITLE-TEXT": { rule: "R-TITLE-2", what: "panel title in the same language but different words or numbers" },
  "BOOK-TITLE": { rule: "R-SEC-5", what: "book title at the top of the column differs (language or presence)" },
  SUBTITLE: { rule: "R-TITLE-3", what: "line under the title (attribution / translation name) differs" },
  "SEC-LANG": { rule: "R-SEC-1", what: "section header in the other language" },
  "SEC-TEXT": { rule: "R-SEC-2", what: "section header in the same language but different text" },
  "SEC-SHOWN": { rule: "R-SEC-3", what: "a section header shown on one side only" },
  "SEC-REFS": { rule: "R-SEC-4", what: "the two clients opened different sections (no section in common)" },
  "NUM-LANG": { rule: "R-NUM-1", what: "segment numbers as Hebrew letters on one side and digits on the other" },
  "NUM-TEXT": { rule: "R-NUM-2", what: "segment numbers in the same script but different values" },
  "NUM-SHOWN": { rule: "R-NUM-3", what: "segment numbers shown on one side only" },
  "NUM-POS": { rule: "R-NUM-4", what: "segment number on a different side of the text (left / right / inside the text)" },
  COLUMNS: { rule: "R-COL-1", what: "different language columns shown for the same segment (e.g. translation missing)" },
  "COL-ORDER": { rule: "R-COL-2", what: "columns in a different order or arrangement (stacked vs side by side, which first)" },
  DIR: { rule: "R-DIR-1", what: "direction of the segment box differs (the text inside each side keeps its own direction; visible only through what follows the box's direction, e.g. number side)" },
  "SEG-REFS": { rule: "R-SEC-4", what: "no segment in common on screen" },
  "FONT-PRI": { rule: "R-FONT-1", what: "source text rendered in a different font" },
  "FONT-TRA": { rule: "R-FONT-1", what: "translation rendered in a different font" },
  "FONT-NUM": { rule: "R-FONT-2", what: "segment numbers rendered in a different font" },
  "FONT-SEC": { rule: "R-FONT-3", what: "section headers rendered in a different font" },
  "FONT-TITLE": { rule: "R-FONT-3", what: "panel title rendered in a different font" },
  "SIZE-PRI": { rule: "R-FONT-1", what: "source text size differs by more than 1px" },
  "SIZE-TRA": { rule: "R-FONT-1", what: "translation size differs by more than 1px" },
  "SIZE-NUM": { rule: "R-FONT-2", what: "segment number size differs by more than 1px" },
  "SIZE-SEC": { rule: "R-FONT-3", what: "section header size differs by more than 1px" },
  "COLOR-PRI": { rule: "R-FONT-1", what: "source text colour differs" },
  "COLOR-TRA": { rule: "R-FONT-1", what: "translation colour differs" },
  "COLOR-NUM": { rule: "R-FONT-2", what: "segment number colour differs" },
  "WEIGHT-NUM": { rule: "R-FONT-2", what: "segment number weight differs (400 kept on purpose: atlas TXD-045)", known: true },
  "SIZE-TITLE": { rule: "R-FONT-3", what: "panel title size differs by more than 1px" },
  "WEIGHT-SEC": { rule: "R-FONT-3", what: "section header weight differs" },
};

const numKind = (t) => (t == null ? "none" : /^\d+[a-d]?$/.test(t) ? "digits" : /^[א-ת׳״'"׳״ ]+$/.test(t) ? "letters" : "other");
const scriptOf = (t) => {
  const he = (t.match(/[֐-׿]/g) || []).length, en = (t.match(/[A-Za-z0-9]/g) || []).length;
  return he === 0 && en === 0 ? "none" : he >= en ? "he" : "en";
};
const px = (s) => Number.parseFloat(s ?? "NaN");

/** @returns {{cause: string, detail: string}[]} */
export function compare(L, N, c = {}) {
  const out = [];
  const add = (cause, detail) => out.push({ cause, detail });

  // title
  // after scrolling, each title names the section in view, which depends on how far each client scrolled: not compared
  if (c.entry !== "scroll" && L.title !== N.title) {
    if (L.titleScript !== N.titleScript) add("TITLE-LANG", `legacy "${L.title}" / new "${N.title}"`);
    else add("TITLE-TEXT", `legacy "${L.title}" / new "${N.title}"`);
  }
  // the old client's lines run together in innerText ("Talmud(Koren"); compare without separators and spaces
  const normSub = (s) => (s ?? "").replace(/[()|\s]/g, "");
  if (normSub(L.subtitle) !== normSub(N.subtitle)) add("SUBTITLE", `legacy "${L.subtitle}" / new "${N.subtitle}"`);

  if ("bookTitle" in L && "bookTitle" in N && (L.bookTitle ?? "") !== (N.bookTitle ?? "")) add("BOOK-TITLE", `legacy "${L.bookTitle ?? "none"}" / new "${N.bookTitle ?? "none"}"`);

  // section headers, for the sections both show
  const nSec = new Map(N.sections.map((s) => [s.ref, s.header]));
  const common = L.sections.filter((s) => nSec.has(s.ref));
  if (L.sections.length && N.sections.length && !common.length) add("SEC-REFS", `legacy [${L.sections.map((s) => s.ref).slice(0, 3)}] / new [${N.sections.map((s) => s.ref).slice(0, 3)}]`);
  const secDiff = { lang: [], text: [], shown: [] };
  for (const s of common) {
    const a = s.header, b = nSec.get(s.ref);
    if (a === b) continue;
    if (!a || !b) secDiff.shown.push(`${s.ref}: legacy ${a ? `"${a}"` : "none"} / new ${b ? `"${b}"` : "none"}`);
    else if (scriptOf(a) !== scriptOf(b)) secDiff.lang.push(`${s.ref}: "${a}" / "${b}"`);
    else secDiff.text.push(`${s.ref}: "${a}" / "${b}"`);
  }
  if (secDiff.lang.length) add("SEC-LANG", secDiff.lang.slice(0, 2).join("; "));
  if (secDiff.text.length) add("SEC-TEXT", secDiff.text.slice(0, 2).join("; "));
  if (secDiff.shown.length) add("SEC-SHOWN", secDiff.shown.slice(0, 2).join("; "));

  // segments both show (the first 15)
  const nSeg = new Map(N.segments.map((s) => [s.ref, s]));
  const segs = L.segments.filter((s) => nSeg.has(s.ref)).slice(0, 15);
  if (L.segments.length && N.segments.length && !segs.length) add("SEG-REFS", `legacy [${L.segments.map((s) => s.ref).slice(0, 2)}] / new [${N.segments.map((s) => s.ref).slice(0, 2)}]`);
  const agg = { lang: [], text: [], shown: [], pos: [], cols: [] };
  for (const a of segs) {
    const b = nSeg.get(a.ref);
    const ka = numKind(a.num), kb = numKind(b.num);
    if ((ka === "none") !== (kb === "none")) agg.shown.push(`${a.ref}: legacy ${a.num ?? "none"} / new ${b.num ?? "none"}`);
    else if (ka !== kb) agg.lang.push(`${a.ref}: ${a.num} / ${b.num}`);
    else if (a.num !== b.num) agg.text.push(`${a.ref}: ${a.num} / ${b.num}`);
    if (a.numPos && b.numPos && a.numPos !== b.numPos) agg.pos.push(`${a.ref}: legacy ${a.numPos} / new ${b.numPos}`);
    if (a.sides !== b.sides) agg.cols.push(`${a.ref}: legacy [${a.sides}] / new [${b.sides}]`);
  }
  const summary = (arr) => `${arr.length}/${segs.length} segments, e.g. ${arr.slice(0, 2).join("; ")}`;
  if (agg.lang.length) add("NUM-LANG", summary(agg.lang));
  if (agg.text.length) add("NUM-TEXT", summary(agg.text));
  if (agg.shown.length) add("NUM-SHOWN", summary(agg.shown));
  if (agg.pos.length) add("NUM-POS", summary(agg.pos));
  if (agg.cols.length) add("COLUMNS", summary(agg.cols));
  if (L.order && N.order && L.order !== N.order) add("COL-ORDER", `legacy ${L.order} / new ${N.order}`);
  if (L.pageDir !== N.pageDir) add("DIR", `legacy ${L.pageDir} / new ${N.pageDir}`);

  // rendered fonts, sizes, colours, weights
  const lf = L.fonts ?? {}, nf = N.fonts ?? {};
  for (const [tag, cause] of [["pri", "FONT-PRI"], ["tra", "FONT-TRA"], ["num", "FONT-NUM"], ["sec", "FONT-SEC"], ["title", "FONT-TITLE"]])
    if (lf[tag] && nf[tag] && lf[tag] !== nf[tag]) add(cause, `legacy ${lf[tag]} / new ${nf[tag]}`);
  for (const [key, suffix] of [["primaryStyle", "PRI"], ["translationStyle", "TRA"], ["numStyle", "NUM"], ["headerStyle", "SEC"], ["titleStyle", "TITLE"]]) {
    const a = L[key], b = N[key];
    if (!a || !b) continue;
    if (`SIZE-${suffix}` in ROOT_CAUSES && Math.abs(px(a.size) - px(b.size)) > 1) add(`SIZE-${suffix}`, `legacy ${a.size} / new ${b.size}`);
    if (`COLOR-${suffix}` in ROOT_CAUSES && a.color !== b.color) add(`COLOR-${suffix}`, `legacy ${a.color} / new ${b.color}`);
    if (`WEIGHT-${suffix}` in ROOT_CAUSES && a.weight !== b.weight) add(`WEIGHT-${suffix}`, `legacy ${a.weight} / new ${b.weight}`);
  }
  return out;
}
