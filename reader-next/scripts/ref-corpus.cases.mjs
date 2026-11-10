// The ref torture corpus (LAUNCH_PLAN T-E02, T-E08): addresses whose resolution is easy to get wrong, from the server's own ref tests
// (sefaria/model/tests/ref_test.py, he_ref_test.py) and the categories in the wiki's consultation-questions.md / ref-resolution.md.
// scripts/ref-corpus.mjs opens each on www.sefaria.org and on this reader and compares where it lands and what it highlights;
// e2e/ref-corpus.spec.ts replays the stable ones through the cassette against what www.sefaria.org did (scripts/ref-corpus.expected.json).
//
// `path` is what a reader types or follows. `why` says what the case exercises.
export const CASES = [
  // plain
  { path: "/Genesis.1", why: "a section" },
  { path: "/Genesis.1.3", why: "a segment" },
  { path: "/Genesis.1.3-5", why: "a range within a section" },
  { path: "/Obadiah.1.21", why: "the last segment of a one-chapter book" },
  // spellings the server rewrites
  { path: "/Gen.1.3", why: "an abbreviation" },
  { path: "/genesis.1.3", why: "lower case" },
  { path: "/Exo.3.19", why: "an abbreviation (ref_test)" },
  { path: "/Prov.3.21", why: "an abbreviation (ref_test)" },
  { path: "/I_Chronicles.1.2", why: "a roman-numeral alternate title" },
  { path: "/Genesis_1:3", why: "a human ref in the URL (colon and space)" },
  // ranges across sections
  { path: "/Genesis.1.30-2.3", why: "a range across chapters" },
  { path: "/Genesis.6-8", why: "a range of chapters" },
  { path: "/Exodus.4.30-6.2", why: "a range across three chapters (ref_test)" },
  { path: "/Genesis.1.1-6.8", why: "a Torah portion (Bereshit)" },
  { path: "/Leviticus.15.3-17.12", why: "a range across chapters (ref_test)" },
  // whole books and nodes
  { path: "/Genesis", why: "a book: its page" },
  { path: "/Rashi_on_Genesis", why: "a commentary: its page" },
  { path: "/Genesis.51", why: "past the last chapter" },
  { path: "/Genesis.1.35", why: "past the last verse" },
  // commentary
  { path: "/Rashi_on_Genesis.1", why: "a commentary's chapter: its first available section" },
  { path: "/Rashi_on_Genesis.2.3", why: "a commentary section" },
  { path: "/Rashi_on_Genesis.2.3.4", why: "a commentary segment" },
  { path: "/Rashi_on_Genesis.1.31.1-2.2.1", why: "a commentary range across chapters" },
  { path: "/Rashi_on_Exodus.3.1-4.10", why: "a commentary range across chapters, by verse (ref_test)" },
  { path: "/Rashi_on_Exodus.5.3-6.7", why: "a commentary range across chapters (ref_test)" },
  { path: "/Ramban_on_Genesis.1", why: "a default node beside an introduction" },
  { path: "/Ramban_on_Genesis.1.1.1", why: "a default node, a segment" },
  // Talmud
  { path: "/Berakhot.2a", why: "a daf side" },
  { path: "/Berakhot.2a.3", why: "a segment on an amud" },
  { path: "/Berakhot.2a-3b", why: "an amud range (ref_test)" },
  { path: "/Bava_Metzia.20b-21b", why: "an amud range across a daf (ref_test)" },
  { path: "/Gittin.15a.8-15b.8", why: "a Talmud range across amudim (ref_test)" },
  { path: "/Berakhot.2b.5-3a.2", why: "a Talmud range across amudim, short" },
  { path: "/Berakhot.64a", why: "the last amud of a tractate" },
  { path: "/Berakhot.2", why: "a daf without an amud" },
  { path: "/Rashi_on_Berakhot.3a.2.1", why: "a commentary on an amud" },
  { path: "/Rashi_on_Berakhot.3a.2.1-4a.3.1", why: "a commentary range across amudim (ref_test)" },
  { path: "/Jerusalem_Talmud_Nazir.9.6", why: "Yerushalmi, three levels (ref_test)" },
  // Mishnah and others
  { path: "/Mishnah_Peah.4.2-4", why: "a mishnah range (ref_test)" },
  { path: "/Kohelet_Rabbah.6.9", why: "a midrash (ref_test)" },
  // complex schemas
  { path: "/Pesach_Haggadah,_Kadesh", why: "a complex text's node" },
  { path: "/Pesach_Haggadah,_Magid,_First_Fruits_Declaration.2", why: "a complex text's nested node, a segment (ref_test)" },
  { path: "/Pesach_Haggadah", why: "a complex text: its page" },
  { path: "/Orot,_Lights_from_Darkness,_Land_of_Israel.4", why: "a complex text's node, a section (ref_test)" },
  { path: "/Me'or_Einayim,_Chayei_Sara.24", why: "a complex text with an apostrophe (ref_test)" },
  { path: "/Meshekh_Chokhmah,_Vaera.2", why: "an alt structure node (ref_test)" },
  // Zohar
  { path: "/Zohar.1.15a.1", why: "Zohar: volume, daf, paragraph" },
  { path: "/Zohar,_Bereshit.1.1", why: "Zohar by its alt structure" },
  // dictionaries
  { path: "/Jastrow,_ג.1", why: "a dictionary entry (ref_test)" },
  { path: "/Klein_Dictionary,_א", why: "a dictionary entry without a number (ref_test)" },
  { path: "/Jastrow", why: "a dictionary: its page" },
  // Hebrew
  { path: "/בראשית.א.ג", why: "a Hebrew ref" },
  { path: "/ברכות.ב.", why: "a Hebrew Talmud ref" },
  { path: "/%D7%A9%D7%9E%D7%95%D7%AA.%D7%90", why: "a Hebrew ref, percent-encoded" },
  // titles with / and \ (master #3790)
  { path: "/The_Five_Books_of_Moses,_by_Everett_Fox,_Leviticus,_Part_II;_Ritual_Pollution_and_Purification,_The_Day_of_Purgation%2FAtonement", why: "a title with /" },
  { path: "/Judaism's_Life_Changing_Ideas;_A_Weekly_Reading_of_the_Jewish_Bible,_Matot;_Subject%5CObject", why: "a title with \\" },
  // legacy URL forms this reader claims because the first segment is a ref (T-E08)
  { path: "/Genesis.1/en/The_Contemporary_Torah,_Jewish_Publication_Society,_2006", why: "old_versions_redirect: /<ref>/<lang>/<version>" },
  { path: "/Genesis.1.3/he/Miqra_according_to_the_Masorah", why: "old_versions_redirect, Hebrew version" },
  { path: "/Berakhot.2a/en/William_Davidson_Edition_-_English", why: "old_versions_redirect, Talmud" },
  { path: "/Tanakh", why: "a category title" },
  { path: "/Talmud", why: "a category title" },
  { path: "/Mishnah", why: "a category title" },
  { path: "/Midrash", why: "a category title" },
];

/** The address as a reader sees it: decoded path, and only the query parameters that change what is shown. */
export function normalize(href) {
  const u = new URL(href);
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {}
  const keep = [...u.searchParams].filter(([k, v]) => !["lang", "aliyot"].includes(k) && !(k === "with" && v === "")).map(([k, v]) => `${k}=${v}`);
  return path + (keep.length ? `?${keep.sort().join("&")}` : "");
}

/**
 * Where this reader lands somewhere else than www.sefaria.org, on purpose or for now (last compared 2026-11-10 against the live site).
 * scripts/ref-corpus.mjs prints these as "known" rather than "DIFF".
 */
export const KNOWN_DIFFERENCES = {
  // Ranges. Owner decision 2026-11-10: legacy parity. A dedicated probe (three loads each, waiting for the text) found sefaria.org
  // keeps a range across sections and highlights it every time; this script's quicker look (3 s after domcontentloaded, on a loaded
  // machine) sometimes catches it before its client has written the address, and reports a collapse or the top of the chapter. These
  // cases are therefore asserted by e2e/ranges.spec.ts against the probe's results; here they are listed as known when the live side
  // raced.
  "/Genesis.1.30-2.3": "kept and highlighted here (e2e/ranges.spec.ts); this run's live look raced",
  "/Exodus.4.30-6.2": "range across sections: kept here; this run's live look raced",
  "/Leviticus.15.3-17.12": "range across sections: kept here; this run's live look raced",
  "/Gittin.15a.8-15b.8": "range across amudim: kept here; this run's live look raced",
  "/Berakhot.2b.5-3a.2": "kept and highlighted here (e2e/ranges.spec.ts); this run's live look raced",
  "/Berakhot.2a-3b": "range of whole amudim: written by its segments here (Berakhot.2a.1-3b.32); this run's live look raced",
  "/Rashi_on_Berakhot.3a.2.1-4a.3.1": "kept here; sefaria.org's quick look lands on Rashi on Berakhot 3b:1 (neither end)",
  "/Genesis.1.1-6.8": "a Torah portion: kept and highlighted; this reader puts only the first loaded sections in the page (the highlight carries on by address as the reader scrolls), sefaria.org all six chapters",
  "/Rashi_on_Exodus.3.1-4.10": "a long range of whole sections: highlighted to its end by address, but only its first sections are loaded, so the address is left as asked; sefaria.org writes Rashi_on_Exodus.3.1.1-4.10.2",
  "/Rashi_on_Exodus.5.3-6.7": "as /Rashi_on_Exodus.3.1-4.10",
  "/Berakhot.2": "a daf without an amud: this reader opens 2a only; sefaria.org varies by load (Berakhot.2a.1 or 2a.1-2b.19)",
  "/Zohar.1.15a.1": "Zohar's paragraph maps to a two-segment range of the alt structure (Zohar, Bereshit 1:1-2), one section: collapses to its first segment, as any range inside one section; sefaria.org keeps it",
  // Addresses that do not exist
  "/Genesis.1.35": "no such verse: not found here (decided 2026-11-02, wiki ref-resolution.md); sefaria.org shows Genesis 2",
  "/Rashi_on_Genesis.2.3.4": "no such comment: not found here (as above); sefaria.org shows the next verse's comments",
  // Book pages
  "/Genesis": "sefaria.org's client adds ?tab=contents to a book page's address; this one leaves the address as asked",
  "/Rashi_on_Genesis": "as /Genesis",
  "/Pesach_Haggadah": "as /Genesis",
  "/Jastrow": "as /Genesis",
  // Not fixed
  "/Judaism's_Life_Changing_Ideas;_A_Weekly_Reading_of_the_Jewish_Bible,_Matot;_Subject%5CObject":
    "BUG, not fixed: the router hands this route the title with its backslash turned into a slash (Subject/Object), so the text is not found. One title in 67,472 has a backslash; the fix belongs where the splat is decoded (router or src/lib/ref/url.ts).",
};
