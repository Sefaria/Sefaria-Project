// The language-parity matrix: every kind of text crossed with the permutations that change how its language is shown. Each case has a
// stable id, the address to open (same path on www.sefaria.org and in this client), the interface language, the device, the cookies
// that carry layout settings (both clients read the same cookie names), and how the reader arrives (entry).
//
// The cross product (kinds × en/he/bi × interface × layout × device × entry) is about 2,000 cases; most of them repeat a rule another
// case already proves. The matrix keeps:
//  - core: every kind × content language en/he/bi × interface English/Hebrew, desktop, stacked, direct load (the language rules);
//  - side-by-side: bilingual heLeft/heRight on the kinds where a side can be missing or both sides share a direction;
//  - continuous: one-language running text for Tanakh, Talmud and a "named" book, with the layout cookie both clients read;
//  - phone: the kinds whose numbers or headers move on a phone, in the language modes that differ there;
//  - entry: arriving by scrolling into the next section (later section headers are built differently), and from a link that
//    opens the connections sidebar with the text (search results and shared links arrive this way);
//  - default: no `lang` in the address and no cookie, so each client's default content language applies.
// Desktop is 1280x900; phone is a Pixel 7 (mobile user agent: the old site picks its phone layout by user agent).

/** @typedef {{ id: string, kind: string, path: string, lang?: "en"|"he"|"bi", iface: "english"|"hebrew", device: "desktop"|"phone",
 *   cookies?: Record<string,string>, entry: "direct"|"scroll"|"sidebar", group: string, note?: string }} LangCase */

export const KINDS = [
  { k: "tanakh", path: "/Genesis.1", note: "Tanakh chapter" },
  { k: "tanakh-verse", path: "/Genesis.1.3", note: "Tanakh, one verse (highlighted)" },
  { k: "torah-portion", path: "/Genesis.6.9-11.32", note: "Torah portion (range across chapters), parashah/aliyah headers" },
  { k: "bavli", path: "/Berakhot.2a", note: "Talmud Bavli daf (2a / ב׳ א), default continuous" },
  { k: "bavli-range", path: "/Berakhot.2a.3-5", note: "Talmud Bavli, range of lines" },
  { k: "yerushalmi", path: "/Jerusalem_Talmud_Berakhot.1.1", note: "Talmud Yerushalmi (three-level)" },
  { k: "mishnah", path: "/Mishnah_Berakhot.1", note: "Mishnah chapter" },
  { k: "rashi-seg", path: "/Rashi_on_Genesis.1.1.1", note: "Rashi, one comment" },
  { k: "rashi-range", path: "/Rashi_on_Genesis.1.1-3", note: "Rashi, range across verses" },
  { k: "ibnezra-owner", path: "/Ibn_Ezra_on_Genesis.8.12.2?ven=english|THE_JPS_TANAKH:_Gender-Sensitive_Edition", note: "commentary, requested translation not in this book (owner's case)" },
  { k: "ibnezra-sec", path: "/Ibn_Ezra_on_Genesis.8.12", note: "commentary section (partly translated)" },
  { k: "no-translation", path: "/Ralbag_on_Torah,_Genesis.1.1", note: "commentary with no translation at all" },
  { k: "tosefta", path: "/Tosefta_Berakhot_(Lieberman).1", note: "Tosefta (Hebrew only)" },
  { k: "english-only", path: "/On_the_Account_of_the_World's_Creation_Given_by_Moses.1", note: "modern/translated work with English only (Philo)" },
  { k: "midrash-rabbah", path: "/Bereshit_Rabbah.1", note: "Midrash Rabbah (named sections)" },
  { k: "zohar", path: "/Zohar,_Bereshit.1", note: "complex book, Kabbalah; its translation is Hebrew" },
  { k: "shulchan-arukh", path: "/Shulchan_Arukh,_Orach_Chayim.1", note: "complex book with named nodes (Siman)" },
  { k: "mishneh-torah", path: "/Mishneh_Torah,_Repentance.1", note: "Halakhah (Chapter n)" },
  { k: "siddur", path: "/Siddur_Ashkenaz,_Weekday,_Shacharit,_Preparatory_Prayers,_Modeh_Ani", note: "liturgy (no segment numbers)" },
  { k: "kabbalah", path: "/Sefer_Yetzirah.1", note: "Kabbalah, simple book" },
  { k: "chasidut", path: "/Likutei_Moharan.1", note: "Chasidut" },
  { k: "ven", path: "/Genesis.1?ven=english|The_Koren_Jerusalem_Bible", note: "another English version (ven)" },
  { k: "vhe", path: "/Genesis.1?vhe=hebrew|Tanach_with_Text_Only", note: "another Hebrew version (vhe)" },
  { k: "ven-french", path: "/Genesis.1?ven=french|Bible_du_Rabbinat_1899_[fr]", note: "a non-English translation" },
  { k: "dictionary", path: "/Jastrow,_%D7%90", note: "dictionary (no headers, no numbers)" },
];

const LANGS = /** @type {const} */ (["en", "he", "bi"]);
const IFACES = /** @type {const} */ (["english", "hebrew"]);
const ifaceShort = (i) => (i === "hebrew" ? "H" : "E");

/** @returns {LangCase[]} */
export function buildCases() {
  /** @type {LangCase[]} */
  const out = [];
  const byK = Object.fromEntries(KINDS.map((x) => [x.k, x]));
  const add = (c) => out.push({ device: "desktop", entry: "direct", ...c });

  // core
  for (const { k, path } of KINDS)
    for (const lang of LANGS)
      for (const iface of IFACES) add({ id: `C-${k}-${lang}-${ifaceShort(iface)}`, group: "core", kind: k, path, lang, iface });

  // side-by-side bilingual
  for (const k of ["tanakh", "bavli", "rashi-seg", "ibnezra-owner", "ibnezra-sec", "no-translation", "zohar", "shulchan-arukh"])
    for (const bi of ["heLeft", "heRight"])
      add({ id: `S-${k}-${bi}-E`, group: "side-by-side", kind: k, path: byK[k].path, lang: "bi", iface: "english", cookies: { biLayout: bi } });
  add({ id: "S-ibnezra-owner-heLeft-H", group: "side-by-side", kind: "ibnezra-owner", path: byK["ibnezra-owner"].path, lang: "bi", iface: "hebrew", cookies: { biLayout: "heLeft" } });

  // continuous / segmented one-language layouts
  const cont = [
    ["tanakh", { layoutTanakh: "continuous" }],
    ["bavli", { layoutTalmud: "segmented" }],
    ["mishneh-torah", { layoutDefault: "continuous" }],
    ["rashi-seg", { layoutDefault: "continuous" }],
  ];
  for (const [k, cookies] of cont)
    for (const lang of ["he", "en"])
      add({ id: `L-${k}-${Object.values(cookies)[0]}-${lang}-E`, group: "layout", kind: k, path: byK[k].path, lang, iface: "english", cookies });

  // phone
  for (const k of ["tanakh", "bavli", "rashi-seg", "ibnezra-owner", "siddur", "zohar", "english-only"])
    for (const [lang, iface] of [["bi", "english"], ["he", "english"], ["bi", "hebrew"]])
      add({ id: `P-${k}-${lang}-${ifaceShort(iface)}`, group: "phone", kind: k, path: byK[k].path, lang, iface, device: "phone" });

  // entry: scroll into the next section
  for (const k of ["tanakh", "bavli", "ibnezra-sec", "zohar", "mishneh-torah", "siddur"])
    for (const lang of ["bi", "he"])
      add({ id: `N-${k}-scroll-${lang}-E`, group: "entry", kind: k, path: byK[k].path, lang, iface: "english", entry: "scroll" });
  // entry: a link that opens the connections sidebar with the text
  for (const [k, path] of [["tanakh-verse", "/Genesis.1.3"], ["bavli-line", "/Berakhot.2a.3"], ["ibnezra-owner", byK["ibnezra-owner"].path]])
    for (const lang of ["bi", "he"])
      add({ id: `N-${k}-sidebar-${lang}-E`, group: "entry", kind: k, path, lang, iface: "english", entry: "sidebar" });

  // default content language (no lang in the address, no cookie)
  for (const k of ["tanakh", "ibnezra-owner", "english-only"])
    for (const iface of IFACES) add({ id: `D-${k}-default-${ifaceShort(iface)}`, group: "default", kind: k, path: byK[k].path, iface });

  return out;
}

/** The address a case opens: its path plus `lang` (and `with=all` for the sidebar entry). */
export function caseUrl(c) {
  const params = [];
  if (c.lang) params.push(`lang=${c.lang}`);
  if (c.entry === "sidebar") params.push("with=all", "lang2=en");
  if (!params.length) return c.path;
  return c.path + (c.path.includes("?") ? "&" : "?") + params.join("&");
}
