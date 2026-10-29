// The Talmud catalog: masechtot, their amudim / halakhot, perakim, and ref arithmetic.

import { api } from "./api.js";
import { hebNum, amudLabelHe, perekOrdinalHe } from "./text.js";

export const SEDARIM = {
  "Seder Zeraim": { he: "זרעים", en: "Zeraim" },
  "Seder Moed": { he: "מועד", en: "Moed" },
  "Seder Nashim": { he: "נשים", en: "Nashim" },
  "Seder Nezikin": { he: "נזיקין", en: "Nezikin" },
  "Seder Kodashim": { he: "קדשים", en: "Kodashim" },
  "Seder Tahorot": { he: "טהרות", en: "Tahorot" },
};

export const CORPORA = {
  bavli: { he: "תלמוד בבלי", short: "בבלי", en: "Bavli", enLong: "Babylonian Talmud" },
  yerushalmi: { he: "תלמוד ירושלמי", short: "ירושלמי", en: "Yerushalmi", enLong: "Jerusalem Talmud" },
};

const JT = "Jerusalem Talmud ";
const catalogs = {};
const byTitle = new Map();

export function corpusOf(title) {
  return title && title.startsWith(JT) ? "yerushalmi" : "bavli";
}

export function indexToAmud(i) {
  return `${Math.floor(i / 2) + 1}${i % 2 ? "b" : "a"}`;
}
export function amudToIndex(amud) {
  const m = /^(\d+)([ab])$/.exec(amud);
  return m ? (+m[1] - 1) * 2 + (m[2] === "b" ? 1 : 0) : -1;
}

/** Loads (and caches) the list of masechtot for a corpus. */
export async function loadCatalog(corpus) {
  if (catalogs[corpus]) return catalogs[corpus];
  catalogs[corpus] = (async () => {
    const shape = await api.shape(corpus);
    const list = shape.map((x) => {
      const isJT = corpus === "yerushalmi";
      const m = {
        title: x.title,
        corpus,
        seder: x.section,
        he: isJT ? x.heTitle.replace(/^תלמוד ירושלמי\s*/, "") : x.heTitle,
        en: isJT ? x.title.replace(JT, "") : x.title,
        sections: [],
      };
      if (isJT) {
        x.chapters.forEach((halakhot, ci) => {
          halakhot.forEach((segCount, hi) => {
            if (segCount) m.sections.push({ key: `${ci + 1}:${hi + 1}`, ch: ci + 1, hal: hi + 1, segs: segCount });
          });
        });
        m.chapterCount = x.chapters.length;
      } else {
        x.chapters.forEach((segCount, i) => {
          if (segCount) m.sections.push({ key: indexToAmud(i), idx: i, segs: segCount });
        });
        const last = m.sections[m.sections.length - 1];
        m.lastDaf = last ? Math.floor(last.idx / 2) + 1 : 0;
        m.firstDaf = m.sections.length ? Math.floor(m.sections[0].idx / 2) + 1 : 2;
      }
      m.sectionIndex = new Map(m.sections.map((s, i) => [s.key, i]));
      byTitle.set(m.title, m);
      return m;
    });
    return list;
  })();
  catalogs[corpus].catch(() => delete catalogs[corpus]);
  return catalogs[corpus];
}

export function getMasechet(title) {
  return byTitle.get(title) || null;
}

export async function ensureMasechet(title) {
  if (byTitle.has(title)) return byTitle.get(title);
  await loadCatalog(corpusOf(title));
  return byTitle.get(title) || null;
}

/**
 * Parses a Talmud ref into {book, section, sectionRef, seg}. Understands
 * "Berakhot 2a:5", "Berakhot.2a.5", "Berakhot 11" (daf → 2a), "Jerusalem Talmud Berakhot 1:1:3",
 * ranges (first point wins) and commentary refs ("Rashi on Berakhot 2a:1:2").
 */
export function parseRef(ref) {
  if (!ref) return null;
  let r = ref.trim().replace(/_/g, " ");
  let commentary = null;
  const on = /^(.+?) on (.+)$/.exec(r);
  if (on && !r.startsWith(JT)) {
    commentary = on[1];
    r = on[2];
  } else if (on && on[2].startsWith(JT)) {
    commentary = on[1];
    r = on[2];
  }
  r = r.split("-")[0];
  if (r.startsWith(JT)) {
    const m = /^(Jerusalem Talmud [^.:\d]+?)[ .](\d+)(?:[.:](\d+))?(?:[.:](\d+))?/.exec(r);
    if (!m) return { book: r.trim(), section: null };
    const ch = +m[2], hal = m[3] ? +m[3] : 1;
    return { book: m[1], section: `${ch}:${hal}`, sectionRef: `${m[1]} ${ch}:${hal}`, seg: m[4] ? +m[4] : null, commentary, commentSeg: null };
  }
  const m = /^([^.:\d]+?)[ .](\d+)([ab])?(?:[.:](\d+))?(?:[.:](\d+))?/.exec(r);
  if (!m) return { book: r.trim(), section: null };
  const amud = `${m[2]}${m[3] || "a"}`;
  return { book: m[1], section: amud, sectionRef: `${m[1]} ${amud}`, seg: m[4] ? +m[4] : null, commentary };
}

export function refToUrl(ref) {
  return ref.replace(/ (?=\d)/, ".").replace(/:/g, ".").replace(/ /g, "_");
}
export function urlToRef(s) {
  s = decodeURIComponent(s || "").replace(/^\/+|\/+$/g, "");
  if (!s) return null;
  const parts = s.replace(/_/g, " ").split(".");
  const book = parts.shift();
  if (!parts.length) return book;
  return `${book} ${parts.join(":")}`;
}

/** Adjacent section key within a masechta, or null. */
export function neighborSection(title, sectionKey, delta) {
  const m = getMasechet(title);
  if (!m) return null;
  const i = m.sectionIndex.get(sectionKey);
  if (i == null) return null;
  const s = m.sections[i + delta];
  return s ? `${title} ${s.key}` : null;
}

export function firstSectionRef(m) {
  return m && m.sections.length ? `${m.title} ${m.sections[0].key}` : null;
}

export function sectionLabel(sectionRef) {
  const p = parseRef(sectionRef);
  if (!p) return { he: "", en: sectionRef };
  const m = getMasechet(p.book);
  const heBook = m ? m.he : p.book;
  const enBook = m ? m.en : p.book.replace(JT, "");
  if (corpusOf(p.book) === "yerushalmi") {
    const [ch, hal] = p.section.split(":").map(Number);
    return {
      he: `${heBook} ${hebNum(ch)}:${hebNum(hal)}`,
      heShort: `פרק ${hebNum(ch)} הלכה ${hebNum(hal)}`,
      heSection: `${hebNum(ch)}:${hebNum(hal)}`,
      en: `${enBook} ${ch}:${hal}`,
      enSection: `${ch}:${hal}`,
      heBook, enBook,
    };
  }
  return {
    he: `${heBook} ${amudLabelHe(p.section)}`,
    heShort: amudLabelHe(p.section),
    heSection: amudLabelHe(p.section),
    en: `${enBook} ${p.section}`,
    enSection: p.section,
    heBook, enBook,
  };
}

// ------------------------------------------------------------------------------------------
// Perakim

const chapterCache = new Map();

/** Returns [{n, he, en, start:{section, seg}, end:{section, seg}}] for a masechta. */
export async function loadChapters(title) {
  if (chapterCache.has(title)) return chapterCache.get(title);
  const p = (async () => {
    try {
      const idx = await api.index(title);
      const alts = idx.alt_structs || {};
      if (corpusOf(title) === "yerushalmi") {
        const nodes = (alts.Vilna || alts.Venice || { nodes: [] }).nodes;
        return nodes.map((n, i) => {
          const he = (n.titles.find((t) => t.lang === "he" && t.primary) || {}).text || "";
          const en = (n.titles.find((t) => t.lang === "en" && t.primary) || {}).text || `Chapter ${i + 1}`;
          return { n: i + 1, he, en, start: { section: `${i + 1}:1`, seg: 1 } };
        });
      }
      const nodes = (alts.Chapters || { nodes: [] }).nodes;
      return nodes.map((n, i) => {
        const he = (n.titles.find((t) => t.lang === "he" && t.primary) || {}).text || "";
        const enRaw = (n.titles.find((t) => t.lang === "en" && t.primary) || {}).text || `Chapter ${i + 1}`;
        const en = enRaw.replace(/^Chapter \d+;?\s*/, "").trim();
        const w = /^(.+?) (\d+[ab]):(\d+)(?:-(?:(\d+[ab]):)?(\d+))?$/.exec(n.wholeRef || "");
        const start = w ? { section: w[2], seg: +w[3] } : null;
        const end = w ? { section: w[4] || w[2], seg: w[5] ? +w[5] : +w[3] } : null;
        return { n: i + 1, he: he.trim(), en, start, end };
      });
    } catch (e) {
      return [];
    }
  })();
  chapterCache.set(title, p);
  return p;
}

/** Chapter containing a position (section key + seg). */
export function chapterAt(chapters, title, sectionKey, seg = 1) {
  if (!chapters || !chapters.length) return null;
  if (corpusOf(title) === "yerushalmi") {
    const ch = +sectionKey.split(":")[0];
    return chapters[ch - 1] || null;
  }
  const pos = amudToIndex(sectionKey) * 1000 + (seg || 1);
  let found = null;
  for (const c of chapters) {
    if (!c.start) continue;
    const s = amudToIndex(c.start.section) * 1000 + c.start.seg;
    if (s <= pos) found = c;
    else break;
  }
  return found;
}

export function chapterTitleHe(c) {
  return c ? `פרק ${perekOrdinalHe(c.n)}` : "";
}

/** Fast local ref recognition: "Shabbat 31a", "שבת לא.", "bm 59b", "ברכות ב:". */
export function quickParse(q, list) {
  const s = q.trim();
  if (!s) return null;
  const heM = /^(.+?)\s+([א-ת"'׳״]+)\s*([.:])?\s*$/.exec(s);
  const enM = /^(.+?)\s*(\d+)\s*([ab.:])?(?:[.: ](\d+))?\s*$/i.exec(s);
  const findBook = (name) => {
    const n = name.toLowerCase().replace(/[^a-zא-ת ]/g, "").replace(/\s+/g, " ").trim();
    if (!n) return null;
    return list.find((m) => m.en.toLowerCase() === n || m.he === n) ||
      list.find((m) => m.en.toLowerCase().replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "")) || null;
  };
  if (enM) {
    const m = findBook(enM[1]);
    if (m) {
      if (m.corpus === "bavli") {
        const side = enM[3] === "b" || enM[3] === "B" || enM[3] === ":" ? "b" : "a";
        return { ref: `${m.title} ${enM[2]}${side}${enM[4] ? ":" + enM[4] : ""}`, m };
      }
      return { ref: `${m.title} ${enM[2]}:${enM[4] || 1}`, m };
    }
  }
  if (heM) {
    const m = findBook(heM[1]);
    if (m && m.corpus === "bavli") {
      const n = hebNumValue(heM[2]);
      if (n) return { ref: `${m.title} ${n}${heM[3] === ":" ? "b" : "a"}`, m };
    }
  }
  return null;
}
function hebNumValue(s) {
  const map = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
  let t = 0;
  for (const ch of s.replace(/["'׳״]/g, "")) {
    if (!map[ch]) return null;
    t += map[ch];
  }
  return t;
}
