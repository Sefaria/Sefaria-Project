// Loads an amud (Bavli) or halakhah (Yerushalmi) with its commentaries mapped onto segments.

import { api } from "./api.js";
import { parseRef, corpusOf } from "./catalog.js";
import { COMMENTATORS, settings } from "./settings.js";

function pickVersion(t, lang) {
  return (t.versions || []).find((v) => (v.actualLanguage || v.language) === lang) ||
    (t.versions || []).find((v) => v.language === lang) || null;
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function kindOf(he, en) {
  const h = (he || "").slice(0, 80);
  const e = en || "";
  if (/מַתְנִי׳|מתני׳|מַתְנִיתִין/.test(h) || /<strong>\s*MISHNA[H]?\s*:/i.test(e) || /<strong><big>משנה:?<\/big><\/strong>/.test(he || "") || /^<strong>MISHNAH:/.test(e)) return "mishnah";
  if (/גְּמָ׳|גמ׳|גְּמָרָא/.test(h) || /<strong>\s*GEMARA\s*:/i.test(e) || /<strong><big>הלכה:?<\/big><\/strong>/.test(he || "") || /^<strong>HALAKHAH:/.test(e)) return "gemara";
  return null;
}

/** Loads the base text of one section. */
export async function loadSection(sectionRef) {
  const p = parseRef(sectionRef);
  const corpus = corpusOf(p.book);
  // Speculatively start the default commentaries in parallel with the text.
  prefetchCommentary(p, corpus);
  const [t, links] = await Promise.all([
    api.text(sectionRef),
    api.links(sectionRef).catch(() => null),
  ]);
  const he = pickVersion(t, "he");
  const en = pickVersion(t, "en");
  const heT = asArray(he && he.text);
  const enT = asArray(en && en.text);
  const n = Math.max(heT.length, enT.length);
  const segments = [];
  for (let i = 0; i < n; i++) {
    const h = typeof heT[i] === "string" ? heT[i] : "";
    const e = typeof enT[i] === "string" ? enT[i] : "";
    if (!h && !e) continue;
    segments.push({ n: i + 1, ref: `${sectionRef}:${i + 1}`, he: h, en: e, marker: kindOf(h, e) });
  }
  return {
    ref: sectionRef,
    book: p.book,
    key: p.section,
    corpus,
    heRef: t.heRef,
    next: t.next,
    prev: t.prev,
    segments,
    links,
    heVersion: he ? he.versionTitle : null,
    enVersion: en ? en.versionTitle : null,
    heLicense: he ? he.license : null,
    enLicense: en ? en.license : null,
  };
}

function prefetchCommentary(p, corpus) {
  for (const side of ["right", "left"]) {
    const name = settings.commentators[corpus][side];
    api.text(`${name} on ${p.book} ${p.section}`).catch(() => {});
  }
}

/** Groups a section's commentary links by commentator: {name: {en, he, indexTitle, count, refs:Set, anchors:Map}} */
export function availableCommentaries(sec) {
  const out = new Map();
  for (const l of sec.links || []) {
    if (l.category !== "Commentary" || !l.collectiveTitle) continue;
    const en = l.collectiveTitle.en;
    if (!out.has(en)) out.set(en, { en, he: l.collectiveTitle.he, indexTitle: l.index_title, count: 0, anchors: new Map(), compDate: l.compDate });
    const c = out.get(en);
    c.count++;
    const anchor = (l.anchorRefExpanded && l.anchorRefExpanded[0]) || l.anchorRef;
    c.anchors.set(l.sourceRef, anchor);
  }
  return out;
}

/** Orders commentators for a menu: the corpus' classic list first, then by count. */
export function orderedCommentaries(sec) {
  const av = availableCommentaries(sec);
  const pri = [...new Set([...COMMENTATORS[sec.corpus].right, ...COMMENTATORS[sec.corpus].left])];
  return [...av.values()].sort((a, b) => {
    const ia = pri.indexOf(a.en), ib = pri.indexOf(b.en);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return b.count - a.count;
  });
}

const HE_NAMES = {
  "Rashi": "רש״י", "Tosafot": "תוספות", "Rashbam": "רשב״ם", "Ran": "ר״ן", "Mefaresh": "מפרש",
  "Rabbeinu Gershom": "רבינו גרשום", "Steinsaltz": "שטיינזלץ", "Penei Moshe": "פני משה",
  "Korban HaEdah": "קרבן העדה", "Sirilio": "ר״ש סיריליו", "Mareh HaPanim": "מראה הפנים",
  "Commentary of the Rosh": "פירוש הרא״ש", "Tosafot HaRosh": "תוספות הרא״ש", "Ritva": "ריטב״א",
  "Rashba": "רשב״א", "Meiri": "מאירי", "Tosafot Rid": "תוספות רי״ד", "Sheyarei Korban": "שיירי קרבן",
};
export function heName(en, fallback) {
  return HE_NAMES[en] || fallback || en;
}

/**
 * Loads commentary for a section. `prefs` is an ordered list of commentator names; the first one
 * present on this section wins (so an amud without Rashi shows its traditional substitute).
 */
export async function loadCommentary(sec, prefs, avoid) {
  const av = availableCommentaries(sec);
  let chosen = null;
  if (sec.links) {
    chosen = prefs.find((n) => av.has(n) && n !== avoid) || null;
    if (!chosen) return { name: prefs[0], he: heName(prefs[0]), comments: [], missing: true, requested: prefs[0] };
  } else {
    chosen = prefs[0];
  }
  const info = av.get(chosen) || { en: chosen, he: heName(chosen), indexTitle: `${chosen} on ${sec.book}`, anchors: new Map() };
  const title = info.indexTitle;
  let comments = [];
  try {
    const t = await api.text(`${title} ${sec.key}`);
    const he = pickVersion(t, "he");
    const en = pickVersion(t, "en");
    comments = flatten(title, sec, asArray(he && he.text), asArray(en && en.text), info.anchors);
  } catch (e) {
    comments = [];
  }
  // Pick up any linked comments that live outside the section-shaped structure.
  const have = new Set(comments.map((c) => c.ref));
  const missingRefs = [...info.anchors.keys()].filter((r) => !have.has(r)).slice(0, 24);
  if (missingRefs.length) {
    const extra = await Promise.all(missingRefs.map((r) => api.text(r).then((t) => ({ r, t })).catch(() => null)));
    for (const x of extra) {
      if (!x) continue;
      const he = pickVersion(x.t, "he");
      const en = pickVersion(x.t, "en");
      const hs = asArray(he && he.text).flat(3).filter((s) => typeof s === "string");
      const es = asArray(en && en.text).flat(3).filter((s) => typeof s === "string");
      const anchor = info.anchors.get(x.r);
      const ap = parseRef(anchor);
      comments.push({ ref: x.r, anchor, anchorN: ap ? ap.seg : null, he: hs.join(" "), en: es.join(" "), order: 1e6 });
    }
  }
  comments = comments.filter((c) => (c.he || c.en) && c.anchorN != null);
  comments.sort((a, b) => a.anchorN - b.anchorN || a.order - b.order);
  const substituted = sec.links ? prefs[0] !== chosen : false;
  return { name: chosen, he: heName(chosen, info.he), indexTitle: title, comments, substituted, requested: prefs[0] };
}

function flatten(title, sec, heArr, enArr, anchors) {
  const out = [];
  const len = Math.max(heArr.length, enArr.length);
  let order = 0;
  for (let i = 0; i < len; i++) {
    const hi = heArr[i], ei = enArr[i];
    if (Array.isArray(hi) || Array.isArray(ei)) {
      const hl = asArray(hi), el = asArray(ei);
      const m = Math.max(hl.length, el.length);
      for (let j = 0; j < m; j++) {
        const ref = `${title} ${sec.key}:${i + 1}:${j + 1}`;
        push(ref, typeof hl[j] === "string" ? hl[j] : "", typeof el[j] === "string" ? el[j] : "", i + 1);
      }
    } else {
      push(`${title} ${sec.key}:${i + 1}`, typeof hi === "string" ? hi : "", typeof ei === "string" ? ei : "", i + 1);
    }
  }
  function push(ref, he, en, line) {
    if (!he && !en) return;
    const anchor = anchors.get(ref) || `${sec.ref}:${line}`;
    const ap = parseRef(anchor);
    out.push({ ref, anchor: ap && ap.sectionRef === sec.ref ? `${sec.ref}:${ap.seg}` : anchor, anchorN: ap && ap.sectionRef === sec.ref ? ap.seg : null, he, en, order: order++ });
  }
  return out;
}
