/* Testing done using Jest */
import {
  SUPPORTED_LOCALES,
  LOCALE_TO_INTERFACE_LANG,
  INTERFACE_LANG_TO_LOCALE,
  LOCALIZED_FIELDS,
  groupBy,
  keyBy,
  omit,
  mapLocales,
  groupByDocumentId,
  buildInterfaceTextDoc,
} from "../strapiLocalization";

describe("config", function () {
  it("SUPPORTED_LOCALES has en as the default/base locale first", function () {
    expect(SUPPORTED_LOCALES[0]).toBe("en");
    expect(SUPPORTED_LOCALES).toContain("he");
  });

  it("LOCALE_TO_INTERFACE_LANG and INTERFACE_LANG_TO_LOCALE are inverses", function () {
    expect(LOCALE_TO_INTERFACE_LANG).toEqual({ en: "english", he: "hebrew" });
    expect(INTERFACE_LANG_TO_LOCALE).toEqual({ english: "en", hebrew: "he" });
  });
});

describe("groupBy", function () {
  it("groups items under their key, preserving order within each group", function () {
    const items = [
      { a: 1, id: "x" },
      { a: 2, id: "y" },
      { a: 1, id: "z" },
    ];
    expect(groupBy(items, (item) => item.a)).toEqual({
      1: [
        { a: 1, id: "x" },
        { a: 1, id: "z" },
      ],
      2: [{ a: 2, id: "y" }],
    });
  });

  it("does not mutate the input list or its items", function () {
    const items = [{ a: 1 }];
    const itemsCopy = JSON.parse(JSON.stringify(items));
    groupBy(items, (item) => item.a);
    expect(items).toEqual(itemsCopy);
  });

  it("returns an empty object for an empty list", function () {
    expect(groupBy([], (item) => item.a)).toEqual({});
  });
});

describe("keyBy", function () {
  it("indexes items by key", function () {
    const items = [
      { id: "en", v: 1 },
      { id: "he", v: 2 },
    ];
    expect(keyBy(items, (item) => item.id)).toEqual({ en: { id: "en", v: 1 }, he: { id: "he", v: 2 } });
  });

  it("keeps the last item when keys collide", function () {
    const items = [
      { id: "en", v: 1 },
      { id: "en", v: 2 },
    ];
    expect(keyBy(items, (item) => item.id)).toEqual({ en: { id: "en", v: 2 } });
  });
});

describe("omit", function () {
  it("drops the given keys and keeps the rest", function () {
    expect(omit({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("does not mutate the input object", function () {
    const obj = { a: 1, b: 2 };
    omit(obj, ["b"]);
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  it("is a no-op when none of the keys are present", function () {
    expect(omit({ a: 1 }, ["z"])).toEqual({ a: 1 });
  });
});

describe("mapLocales", function () {
  it("builds an object keyed by every supported locale", function () {
    expect(mapLocales((locale) => locale.toUpperCase())).toEqual({ en: "EN", he: "HE" });
  });
});

const bannerLocalizedFields = ["bannerText", "buttonText", "buttonURL"];

const makeRow = (locale, overrides = {}) => ({
  documentId: "doc-1",
  locale,
  internalBannerName: "spring-sale",
  bannerStartDate: "2026-01-01",
  bannerText: `text-${locale}`,
  buttonText: `button-${locale}`,
  buttonURL: `https://example.com/${locale}`,
  ...overrides,
});

describe("groupByDocumentId", function () {
  it("merges en and he rows of the same document into one entry with both locales present", function () {
    const rowsByLocale = { en: [makeRow("en")], he: [makeRow("he")] };
    const grouped = groupByDocumentId(rowsByLocale, bannerLocalizedFields);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].documentId).toBe("doc-1");
    expect(grouped[0].locales.sort()).toEqual(["en", "he"]);
    expect(grouped[0].internalBannerName).toBe("spring-sale"); // shared, non-localized field
    expect(grouped[0].byLocale.en.bannerText).toBe("text-en");
    expect(grouped[0].byLocale.he.bannerText).toBe("text-he");
  });

  it("produces a he-only entry when no en row exists for the document", function () {
    const rowsByLocale = { en: [], he: [makeRow("he")] };
    const grouped = groupByDocumentId(rowsByLocale, bannerLocalizedFields);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].locales).toEqual(["he"]);
    expect(grouped[0].byLocale.en).toBeUndefined();
    expect(grouped[0].byLocale.he.bannerText).toBe("text-he");
  });

  it("produces an en-only entry when no he row exists for the document", function () {
    const rowsByLocale = { en: [makeRow("en")], he: [] };
    const grouped = groupByDocumentId(rowsByLocale, bannerLocalizedFields);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].locales).toEqual(["en"]);
    expect(grouped[0].byLocale.he).toBeUndefined();
  });

  it("keeps distinct documents separate", function () {
    const rowsByLocale = {
      en: [makeRow("en", { documentId: "doc-1" }), makeRow("en", { documentId: "doc-2" })],
      he: [makeRow("he", { documentId: "doc-1" })],
    };
    const grouped = groupByDocumentId(rowsByLocale, bannerLocalizedFields);

    expect(grouped).toHaveLength(2);
    const byId = keyBy(grouped, (doc) => doc.documentId);
    expect(byId["doc-1"].locales.sort()).toEqual(["en", "he"]);
    expect(byId["doc-2"].locales).toEqual(["en"]);
  });
});

describe("buildInterfaceTextDoc", function () {
  it("builds an {en, he} shape for each localized field when both locales are present", function () {
    const rowsByLocale = { en: [makeRow("en")], he: [makeRow("he")] };
    const [grouped] = groupByDocumentId(rowsByLocale, bannerLocalizedFields);
    const doc = buildInterfaceTextDoc(grouped, bannerLocalizedFields);

    expect(doc.bannerText).toEqual({ en: "text-en", he: "text-he" });
    expect(doc.buttonText).toEqual({ en: "button-en", he: "button-he" });
    expect(doc.locales.sort()).toEqual(["en", "he"]);
    expect(doc.internalBannerName).toBe("spring-sale");
    expect(doc.byLocale).toBeUndefined(); // internal grouping detail shouldn't leak
  });

  it("fills the missing locale with null for a he-only document", function () {
    const rowsByLocale = { en: [], he: [makeRow("he")] };
    const [grouped] = groupByDocumentId(rowsByLocale, bannerLocalizedFields);
    const doc = buildInterfaceTextDoc(grouped, bannerLocalizedFields);

    expect(doc.bannerText).toEqual({ en: null, he: "text-he" });
    expect(doc.locales).toEqual(["he"]);
  });

  it("fills the missing locale with null for an en-only document", function () {
    const rowsByLocale = { en: [makeRow("en")], he: [] };
    const [grouped] = groupByDocumentId(rowsByLocale, bannerLocalizedFields);
    const doc = buildInterfaceTextDoc(grouped, bannerLocalizedFields);

    expect(doc.bannerText).toEqual({ en: "text-en", he: null });
    expect(doc.locales).toEqual(["en"]);
  });
});

describe("countriesToTarget as a localized field", function () {
  const ukOnly = { countryMode: "include", countries: [{ name: "United Kingdom", code: "GB" }] };
  const everywhere = { countryMode: "all", countries: [] };

  it("is listed as localized for banners and modals", function () {
    // Editors can set targeting per locale in Strapi -- e.g. show a Hebrew-interface promotion to
    // readers in the US but not in Israel -- so it must survive the per-document merge.
    expect(LOCALIZED_FIELDS.banner).toContain("countriesToTarget");
    expect(LOCALIZED_FIELDS.modal).toContain("countriesToTarget");
  });

  it("keeps each locale's targeting rather than applying the en row's to both", function () {
    const rowsByLocale = {
      en: [makeRow("en", { countriesToTarget: ukOnly })],
      he: [makeRow("he", { countriesToTarget: everywhere })],
    };
    const [grouped] = groupByDocumentId(rowsByLocale, LOCALIZED_FIELDS.banner);
    const doc = buildInterfaceTextDoc(grouped, LOCALIZED_FIELDS.banner);

    expect(doc.countriesToTarget.en).toEqual(ukOnly);
    expect(doc.countriesToTarget.he).toEqual(everywhere);
  });

  it("fills the absent locale with null so an unpublished locale carries no targeting", function () {
    const rowsByLocale = { en: [], he: [makeRow("he", { countriesToTarget: everywhere })] };
    const [grouped] = groupByDocumentId(rowsByLocale, LOCALIZED_FIELDS.banner);
    const doc = buildInterfaceTextDoc(grouped, LOCALIZED_FIELDS.banner);

    expect(doc.countriesToTarget).toEqual({ en: null, he: everywhere });
  });
});
