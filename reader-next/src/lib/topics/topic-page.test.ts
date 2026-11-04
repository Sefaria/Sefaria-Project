import { describe, expect, it } from "vitest";
import {
  activeTab,
  aliyaLabel,
  bucketTabs,
  cardDisplay,
  hebrewCalendarDate,
  learnMoreLinks,
  legacyNormRef,
  linksToGenerate,
  linksToPublish,
  localeDate,
  normalizeOrder,
  normalizeTopicSlug,
  pseudoTabs,
  refMatches,
  sideSections,
  sortSources,
  sourceAnalytics,
  topicPageHead,
  topicPageSearch,
  visibleTabs,
  type RefLinkGroup,
  type TopicSource,
} from "./topic-page";
import { bookOfRef, bulkTextPaths, partitionForUrl, refLinkTypeFilters, topicApiPath, topicPageModel } from "./topic-page-source";

const src = (ref: string, o: Partial<TopicSource> = {}): TopicSource => ({ ref, ...o });
const order = (o: Record<string, unknown>) => normalizeOrder(o as never)!;

describe("tabs (processTopicsTabsData on the Library)", () => {
  const groups: RefLinkGroup[] = [
    {
      linkType: "about",
      refs: [
        src("Genesis 1:1", { descriptions: { en: { title: "In the Beginning", prompt: "…" } } }),
        src("Genesis 1:2"),
        src("Genesis 1:3", { descriptions: { en: { title: "Draft", published: false } } }),
        src("Genesis 1:4", { descriptions: { he: { title: "רק בעברית" } } }),
      ],
    },
    { linkType: "popular-writing-of", refs: [src("Rashi on Genesis 1:1:1")] },
  ];

  it("notable = a published title or prompt in the interface language; Sources is the superset, notable first", () => {
    const t = bucketTabs(groups, "en", false);
    expect(t["notable-sources"]!.refs.map((r) => r.ref)).toEqual(["Genesis 1:1"]);
    expect(t.sources!.refs.map((r) => r.ref)).toEqual(["Genesis 1:1", "Genesis 1:2", "Genesis 1:3", "Genesis 1:4"]);
    expect(t.sources!.title.en).toBe("Sources");
    expect(t["popular-writing-of"]!.title).toEqual({ en: "Top Citations", he: "ציטוטים עיקריים" });
    expect(t.admin).toBeUndefined();
    // in Hebrew the Hebrew-only curation is the notable one
    expect(bucketTabs(groups, "he", false)["notable-sources"]!.refs.map((r) => r.ref)).toEqual(["Genesis 1:4"]);
  });

  it("only notable sources: the superset is titled All Sources; moderators get an Admin copy", () => {
    const t = bucketTabs([{ linkType: "about", refs: [src("Genesis 1:1", { descriptions: { en: { prompt: "p" } } })] }], "en", true);
    expect(t.sources!.title).toEqual({ en: "All Sources", he: "כל המקורות" });
    expect(t.admin!.title.en).toBe("Admin");
    expect(t.admin!.refs).toEqual(t.sources!.refs);
  });

  it("visible order: Works on Sefaria first, then Top Citations, Admin, Notable Sources, Sources", () => {
    const t = bucketTabs(groups, "en", true);
    const ids = visibleTabs(t, [{ url: "/Rashi_on_Tanakh", title: { en: "Rashi on Tanakh", he: "" }, description: {} }]).map((e) => e.id);
    expect(ids).toEqual(["author-works-on-sefaria", "popular-writing-of", "admin", "notable-sources", "sources"]);
  });

  it("the URL's tab when the page has it, else the first", () => {
    const entries = visibleTabs(bucketTabs(groups, "en", false), []);
    expect(activeTab(entries, "sources")).toBe("sources");
    expect(activeTab(entries, "sheets")).toBe("popular-writing-of");
    expect(activeTab(entries, undefined)).toBe("popular-writing-of");
    expect(activeTab([], "sources")).toBeUndefined();
  });

  it("the funnel is not on Notable Sources or Works; the A is not on Works", () => {
    const e = [{ id: "notable-sources" as const, title: { en: "", he: "" } }];
    expect(pseudoTabs(e, "notable-sources")).toEqual({ filter: false, lang: true });
    expect(pseudoTabs(e, "sources")).toEqual({ filter: true, lang: true });
    expect(pseudoTabs(e, "author-works-on-sefaria")).toEqual({ filter: false, lang: false });
    expect(pseudoTabs([], undefined)).toEqual({ filter: false, lang: false });
  });
});

describe("refSort", () => {
  const a = src("A", { order: order({ comp_date: 1200, order_id: "b", pr: 1, tfidf: 1, availableLangs: ["he"] }) });
  const b = src("B", { order: order({ comp_date: -1400, order_id: "a", pr: 5, tfidf: 1, availableLangs: ["en", "he"] }) });
  const c = src("C", { order: order({ comp_date: 1200, order_id: "a", curatedPrimacy: { en: 3 }, availableLangs: ["he"] }) });
  const none = src("D");

  it("Chronological: by composition date, then order_id; sources without an order last", () => {
    expect(sortSources([none, a, b, c], "Chronological", "en").map((s) => s.ref)).toEqual(["B", "C", "A", "D"]);
  });

  it("Relevance: curated primacy first, then (English) sources with English, then PageRank", () => {
    expect(sortSources([a, b, c], "Relevance", "en").map((s) => s.ref)).toEqual(["C", "B", "A"]);
    // in Hebrew English availability does not count: PageRank decides
    expect(sortSources([a, b], "Relevance", "he").map((s) => s.ref)).toEqual(["B", "A"]);
    // an unknown sort (from the URL) sorts as Relevance
    expect(sortSources([a, b, c], "Whatever", "en").map((s) => s.ref)).toEqual(["C", "B", "A"]);
  });

  it("normalizeOrder fills the old defaults", () => {
    expect(normalizeOrder({ tfidf: 3 } as never)).toEqual({ availableLangs: [], numDatasource: 1, tfidf: 3, pr: 0, curatedPrimacy: { en: 0, he: 0 } });
    expect(normalizeOrder(undefined)).toBeUndefined();
  });
});

describe("filter and cards", () => {
  it("refFilter: the English and Hebrew text, the ref and the book's categories, any case", () => {
    const s = src("Rashi on Genesis 1:1:1");
    const meta = { categories: ["Tanakh", "Rishonim on Tanakh"] };
    expect(refMatches("RASHI", s, undefined, undefined)).toBe(true);
    expect(refMatches("rishonim", s, undefined, meta)).toBe(true);
    expect(refMatches("light", s, { ref: s.ref, en: "Let there be light" }, meta)).toBe(true);
    expect(refMatches("darkness", s, { ref: s.ref, en: "Let there be light" }, meta)).toBe(false);
  });

  it("a source missing the chosen language is hidden on Notable Sources and Sources, shown in that language elsewhere", () => {
    const s = src("Genesis 1:1", { descriptions: { en: { title: "T" } } });
    const heOnly = { ref: "Genesis 1:1", he: "בראשית" };
    expect(cardDisplay("notable", s, heOnly, "english", "en")).toEqual({ visible: false, introduced: true, language: "hebrew" });
    expect(cardDisplay("all", s, heOnly, "english", "en").visible).toBe(false);
    expect(cardDisplay("citations", s, heOnly, "english", "en")).toEqual({ visible: true, introduced: false, language: "hebrew" });
    expect(cardDisplay("admin", s, heOnly, "english", "en")).toEqual({ visible: true, introduced: true, language: "hebrew" });
    expect(cardDisplay("notable", s, { ref: "x", en: "a", he: "ב" }, "bilingual", "en").language).toBe("bilingual");
    // the curated title must be in the interface language
    expect(cardDisplay("notable", s, { ref: "x", en: "a", he: "ב" }, "hebrew", "he").introduced).toBe(false);
  });

  it("legacy normRef: the book URI-encoded with underscores, a range keeps what differs", () => {
    expect(legacyNormRef("Deuteronomy 34:10-12")).toBe("Deuteronomy.34.10-12");
    expect(legacyNormRef("Zohar, Shemot 51:376")).toBe("Zohar%2C_Shemot.51.376");
    expect(legacyNormRef("Berakhot 3b:27-4a:6")).toBe("Berakhot.3b.27-4a.6");
    expect(legacyNormRef("Leadership in the Wilderness; Authority and Anarchy in the Book of Numbers, Part I, Chapter 5; Leaders and Strangers 38")).toBe(
      "Leadership_in_the_Wilderness%3B_Authority_and_Anarchy_in_the_Book_of_Numbers%2C_Part_I%2C_Chapter_5%3B_Leaders_and_Strangers.38",
    );
  });

  it("each source's analytics batch (VERIFIED on sefaria.org 2026-11-04)", () => {
    expect(sourceAnalytics(5, src("Zohar, Shemot 51:376", { index: "Zohar" }), { categories: ["Kabbalah", "Zohar"] }, "en")).toEqual({
      position: 5,
      ai: "human",
      item_id: "Zohar, Shemot 51:376",
      content_id: "Zohar",
      content_type: "Kabbalah|Zohar",
    });
    expect(sourceAnalytics(0, src("A", { descriptions: { en: { ai_title: "x" } } }), undefined, "en").ai).toBe("ai");
    expect(sourceAnalytics(0, src("A", { descriptions: { en: { ai_title: "x", published: false } } }), undefined, "en").ai).toBe("human");
  });

  it("moderators: Generate for AI context without a prompt; Publish for unpublished links that are not 'not reviewed'", () => {
    const refs = [
      src("A", { descriptions: { en: { hasAiContext: true } } }),
      src("B", { descriptions: { en: { hasAiContext: true, prompt: "p" } } }),
      src("C", { descriptions: { en: { published: false, review_state: "reviewed" } } }),
      src("D", { descriptions: { en: { published: false, review_state: "not reviewed" } } }),
    ];
    expect(linksToGenerate(refs, "en").map((s) => s.ref)).toEqual(["A"]);
    expect(linksToPublish(refs, "en").map((s) => s.ref)).toEqual(["C"]);
  });
});

describe("the side column", () => {
  const link = (topic: string, en: string, tfidf?: number, he = "") => ({ topic, title: { en, he }, hasOrder: tfidf !== undefined, ...(tfidf !== undefined ? { tfidf } : {}), shouldDisplay: true, pools: ["library"] });
  it("groups: displayable types only, plural titles, Related first then alphabetical; links by interface-language title then tf-idf", () => {
    const s = sideSections(
      {
        category: { slug: "biblical-figures", en: "Biblical Figures", he: "" },
        siblings: [],
        links: [
          { title: { en: "Sibling", he: "" }, pluralTitle: { en: "Siblings", he: "" }, shouldDisplay: true, links: [link("miriam", "Miriam", 1, "מרים"), link("aaron", "Aaron", 5, "אהרן")] },
          { title: { en: "Related", he: "" }, shouldDisplay: true, links: [link("leadership", "Leadership", 2)] },
          { title: { en: "", he: "" }, shouldDisplay: false, links: [link("x", "X", 1)] },
          { title: { en: "Opposed", he: "" }, shouldDisplay: true, links: [{ ...link("p", "Pharaoh", 1), pools: [] }] },
        ],
      },
      "en",
    );
    expect(s.map((x) => x.title.en)).toEqual(["Related", "Siblings"]);
    // the singular title is what sorts: Parent before Parent-in-Law although "Parents" shows
    const p = sideSections({ siblings: [], links: [
      { title: { en: "Parent-in-Law", he: "" }, shouldDisplay: true, links: [link("yitro", "Yitro", 1)] },
      { title: { en: "Parent", he: "" }, pluralTitle: { en: "Parents", he: "" }, shouldDisplay: true, links: [link("a", "Amram", 1), link("y", "Yokheved", 2)] },
    ] }, "en");
    expect(p.map((x) => x.title.en)).toEqual(["Parents", "Parent-in-Law"]);
    expect(s[1]!.links.map((l) => l.topic)).toEqual(["aaron", "miriam"]);
  });

  it("no groups: the category's name over an empty list (the old fallback filtered its own links away)", () => {
    const s = sideSections({ category: { slug: "c", en: "Cat", he: "קט" }, siblings: [{ slug: "a", en: "A", he: "א" }], links: [] }, "en");
    expect(s).toEqual([{ title: { en: "Cat", he: "קט" }, sortTitle: { en: "Cat", he: "קט" }, links: [] }]);
    expect(sideSections({ siblings: [], links: [] }, "en")[0]!.title).toEqual({ en: "Explore Topics", he: "נושאים כלליים" });
  });

  it("Learn More: the interface language's link, else the other one marked", () => {
    const links = [
      { title: "Wikipedia", titleHe: "ויקיפדיה", en: "https://en.wikipedia.org/wiki/Moses", he: "https://he.wikipedia.org/wiki/משה" },
      { title: "Jewish Encyclopedia", titleHe: "האנציקלופדיה היהודית" },
      { title: "National Library of Israel", titleHe: "הספרייה הלאומית", he: "https://nli.org.il/x" },
    ];
    expect(learnMoreLinks(links, "en")).toEqual([
      { url: "https://en.wikipedia.org/wiki/Moses", en: "Wikipedia", he: "ויקיפדיה" },
      { url: "https://nli.org.il/x", en: "National Library of Israel (Hebrew)", he: "הספרייה הלאומית (אנגלית)" },
    ]);
    expect(learnMoreLinks(links, "he")[1]).toEqual({ url: "https://nli.org.il/x", en: "National Library of Israel", he: "הספרייה הלאומית" });
  });

  it("readings: aliyot 1–7 then M; dates as hebcal and the browser wrote them", () => {
    expect(aliyaLabel(0)).toEqual({ en: "1", he: "א׳" });
    expect(aliyaLabel(7)).toEqual({ en: "M", he: "מ" });
    expect(localeDate("2027-10-30T00:00:00", "en")).toBe("October 30, 2027");
    expect(hebrewCalendarDate("2027-10-30T00:00:00", "en")).toBe("29th of Tishrei, 5788");
    expect(hebrewCalendarDate("2027-10-30T00:00:00", "he")).toBe("כ״ט תִשְׁרֵי תשפ״ח");
    expect(hebrewCalendarDate("2027-03-13T00:00:00", "en")).toBe("4th of Adar II, 5787");
    expect(hebrewCalendarDate("2026-11-07T00:00:00", "he")).toBe("כ״ז חֶשְׁוָן תשפ״ז");
  });
});

describe("the address and the head", () => {
  it("?sort= then &tab=, as the old ReaderApp wrote them", () => {
    expect(topicPageSearch("Relevance", "notable-sources")).toEqual({ sort: "Relevance", tab: "notable-sources" });
    expect(topicPageSearch("Relevance", undefined)).toEqual({ sort: "Relevance" });
  });
  it("the slug as Django normalises it", () => {
    expect(normalizeTopicSlug("Moses")).toBe("moses");
    expect(normalizeTopicSlug("a/b c")).toBe("a-b-c");
    expect(normalizeTopicSlug("judges-(שופט)")).toBe("judges-(שופט)");
    expect(normalizeTopicSlug("Ḥanukkah!")).toBe("hanukkah");
  });
  it("title and description (the Hebrew page keeps the English sentence: its translation is obsolete)", () => {
    const page = { primaryTitle: { en: "Moses", he: "משה" }, description: { en: "A prophet.", he: "נביא." } };
    expect(topicPageHead(page, "en")).toEqual({ title: "Moses | Texts from the Sefaria Library", description: "Jewish texts about Moses from Torah, Talmud and other sources in Sefaria's library. A prophet." });
    expect(topicPageHead(page, "he").title).toBe("משה | מקורות מתוך ספריית ספריא");
    expect(topicPageHead(page, "he").description).toBe("Jewish texts about משה from Torah, Talmud and other sources in Sefaria's library. נביא.");
  });
});

describe("the adapter", () => {
  it("the topic URL byte for byte; an author under Authors asks only for its citations", () => {
    expect(topicApiPath("moses", refLinkTypeFilters("biblical-figures"))).toBe(
      "/api/v2/topics/moses?annotate_time_period=1&ref_link_type_filters=about|popular-writing-of&with_html=1&with_links=1&annotate_links=1&with_refs=1&group_related=1&with_indexes=1",
    );
    expect(refLinkTypeFilters("authors")).toEqual(["popular-writing-of"]);
  });

  it("a ref's book: the longest known title, ending at a space or a comma", () => {
    const books = new Map([["Zohar", 1], ["Moses; A Human Life", 1], ["Rashi on Genesis", 1], ["Genesis", 1]]);
    expect(bookOfRef("Zohar, Shemot 51:376", books)).toBe("Zohar");
    expect(bookOfRef("Moses; A Human Life, 2 The Murmuring Deep 35-37", books)).toBe("Moses; A Human Life");
    expect(bookOfRef("Rashi on Genesis 1:1:1", books)).toBe("Rashi on Genesis");
    expect(bookOfRef("Unknown 1:1", books)).toBeUndefined();
  });

  it("bulk texts: split where the URL would pass 3800 characters", () => {
    const refs = Array.from({ length: 70 }, (_, i) => `Leadership in the Wilderness; Authority and Anarchy in the Book of Numbers ${i + 1}:${i + 2}`);
    const paths = bulkTextPaths(refs);
    expect(paths.length).toBeGreaterThan(1);
    for (const p of paths) expect(p.length).toBeLessThan(3800);
    expect(paths[0]).toMatch(/^\/api\/bulktext\/Leadership%20in%20the%20Wilderness%3B.*%7C.*\?asSizedString=true&minChar=500&maxChar=600$/);
    expect(paths.flatMap((p) => decodeURIComponent(p.slice(14, p.indexOf("?"))).split("|"))).toEqual(refs);
    expect(bulkTextPaths(["Genesis 1:1"], "es")[0]).toBe("/api/bulktext/Genesis%201%3A1?asSizedString=true&minChar=500&maxChar=600&transLangPref=es");
    expect(partitionForUrl(["aa", "bb", "cc"], 8)).toEqual([["aa", "bb"], ["cc"]]);
  });

  it("the API's topic, trimmed: sheets dropped, books and categories added, the category above it and its subtopics", () => {
    const toc = [{ slug: "people", primaryTitle: { en: "People", he: "אנשים" }, children: [{ slug: "biblical-figures", primaryTitle: { en: "Biblical Figures", he: "דמויות" }, children: [{ slug: "moses", primaryTitle: { en: "Moses", he: "משה" } }] }] }];
    const tocPaths = { moses: [{ slug: "people", en: "People", he: "אנשים" }, { slug: "biblical-figures", en: "Biblical Figures", he: "דמויות" }] };
    const page = topicPageModel(
      {
        slug: "moses",
        primaryTitle: { en: "Moses", he: "משה" },
        refs: { about: { refs: [{ ref: "Exodus 3:1", order: { tfidf: 2 }, descriptions: { en: { title: "T", ai_context: "ctx" } } }, { ref: "Sheet 1", is_sheet: true }] } },
        properties: { enWikiLink: { value: "https://en.wikipedia.org/wiki/Moses" } },
        numSources: 1,
      },
      { slug: "moses", tocPaths, toc, books: new Map([["Exodus", { categories: ["Tanakh", "Torah"], primaryCategory: "Tanakh" }]]), listed: true },
    );
    expect(page.refs[0]!.refs).toEqual([{ ref: "Exodus 3:1", order: normalizeOrder({ tfidf: 2 } as never), descriptions: { en: { title: "T", hasAiContext: true } }, index: "Exodus" }]);
    expect(page.indexes).toEqual({ Exodus: { categories: ["Tanakh", "Torah"], primaryCategory: "Tanakh" } });
    expect(page.category).toEqual({ slug: "biblical-figures", en: "Biblical Figures", he: "דמויות" });
    expect(page.panelCategory).toBe("people|biblical-figures");
    expect(page.siblings).toEqual([{ slug: "moses", en: "Moses", he: "משה" }]);
    expect(page.learnMore[0]).toEqual({ title: "Wikipedia", titleHe: "ויקיפדיה", en: "https://en.wikipedia.org/wiki/Moses" });
    expect(page.noindex).toBe(false);
  });
});
