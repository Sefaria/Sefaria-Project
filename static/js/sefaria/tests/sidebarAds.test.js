/* Testing done using Jest */
import {
  buildInAppAdsFromSidebarAds,
  adMatchesKeywords,
  parseKeywords,
  isLightBackground,
  SKIPPED_SIDEBAR_AD_LOG,
  SHOW_TO,
  UNKNOWN_SHOW_TO_LOG,
  normalizeShowTo,
  adMatchesShowTo,
} from "../sidebarAds";
import { groupByDocumentId, LOCALIZED_FIELDS } from "../strapiLocalization";

// The truth table for the keyword gate (strict semantics, 2026-09-01). Each test names the one
// rule it proves; together they pin the semantics documented on adMatchesKeywords itself.
describe("adMatchesKeywords", function () {
  const trigger = (keywords) => parseKeywords(keywords);

  it("passes everywhere when the ad has no keywords at all — including keyword-less pages", function () {
    // The honest replacement for the old '!nowhere' hack: an empty field means no restriction.
    expect(adMatchesKeywords(trigger(""), [])).toBe(true);
    expect(adMatchesKeywords(trigger(""), ["torah"])).toBe(true);
  });

  it("requires an include keyword to appear among the page's keywords", function () {
    expect(adMatchesKeywords(trigger("torah, shabbat"), ["torah"])).toBe(true);
    expect(adMatchesKeywords(trigger("torah, shabbat"), ["kabbalah"])).toBe(false);
  });

  it("never matches an include-keyword ad on a keyword-less page", function () {
    expect(adMatchesKeywords(trigger("torah"), [])).toBe(false);
  });

  it("lets an exclusion-only ad show on keyword-bearing pages that avoid the excluded keyword", function () {
    expect(adMatchesKeywords(trigger("!social-issues"), ["prayer"])).toBe(true);
    expect(adMatchesKeywords(trigger("!social-issues"), ["social-issues"])).toBe(false);
  });

  it("keeps an exclusion-only ad OFF keyword-less pages — exclusions subtract, they don't mean everywhere", function () {
    // The strict half of the 2026-09-01 change: '!x' no longer doubles as an all-pages rule on
    // pages that produce no keywords (homepage, calendars, notifications, the new slots…).
    expect(adMatchesKeywords(trigger("!social-issues"), [])).toBe(false);
  });

  it("requires BOTH rules for a mixed ad — include must match and exclusion must not", function () {
    // The old gate ORed the two branches, so "a, !b" matched a page carrying both a AND b.
    expect(adMatchesKeywords(trigger("torah, !shabbat"), ["torah"])).toBe(true);
    expect(adMatchesKeywords(trigger("torah, !shabbat"), ["torah", "shabbat"])).toBe(false);
    expect(adMatchesKeywords(trigger("torah, !shabbat"), ["kabbalah"])).toBe(false);
  });
});

describe("isLightBackground", function () {
  it("treats whitish colors as light — they keep the ad's default styling", function () {
    ["#FFFFFF", "#F8F8F8", "#fff", "#EEE"].forEach((color) =>
      expect(isLightBackground(color)).toBe(true),
    );
  });

  it("treats dark colors as dark — they trigger the white-text colored treatment", function () {
    // #004E5F is the old hasBlueBackground blue: entering it must reproduce the old look.
    ["#004E5F", "#000000", "#333", "#7B1FA2"].forEach((color) =>
      expect(isLightBackground(color)).toBe(false),
    );
  });

  it("fails toward the readable default for missing or unparseable values", function () {
    [null, undefined, "", "not-a-color", "#12"].forEach((value) =>
      expect(isLightBackground(value)).toBe(true),
    );
  });
});

describe("parseKeywords", function () {
  it("treats null, empty, and whitespace-only fields as no restriction", function () {
    [null, undefined, "", "  ", " , "].forEach((raw) =>
      expect(parseKeywords(raw)).toEqual({ keywordTargets: [], excludeKeywordTargets: [] }),
    );
  });

  it("drops blank entries from stray commas instead of turning them into unmatchable includes", function () {
    expect(parseKeywords("torah,, shabbat,")).toEqual({
      keywordTargets: ["torah", "shabbat"],
      excludeKeywordTargets: [],
    });
  });
});

describe("normalizeShowTo", function () {
  let consoleWarn;
  beforeEach(() => {
    consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => consoleWarn.mockRestore());

  it("defaults a missing value to all, so an ad with no audience set shows to everyone", function () {
    [null, undefined, ""].forEach((raw) => expect(normalizeShowTo(raw)).toBe(SHOW_TO.ALL));
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("passes known values through without warning", function () {
    Object.values(SHOW_TO).forEach((value) => expect(normalizeShowTo(value)).toBe(value));
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("passes an unknown value through unchanged and warns under a stable prefix", function () {
    // Normalizing unknowns to "all" would turn a CMS typo (or the banner/modal vocabulary,
    // "both_logged_in_and_logged_out") into an audience-wide campaign; passing it through makes
    // adMatchesShowTo reject it for everyone, and the warn keeps that failure visible.
    expect(normalizeShowTo("both_logged_in_and_logged_out")).toBe("both_logged_in_and_logged_out");
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0][0]).toContain(UNKNOWN_SHOW_TO_LOG);
  });
});

describe("adMatchesShowTo", function () {
  it("shows an all ad to logged-in and logged-out viewers alike", function () {
    expect(adMatchesShowTo(SHOW_TO.ALL, true)).toBe(true);
    expect(adMatchesShowTo(SHOW_TO.ALL, false)).toBe(true);
  });

  it("shows a loggedIn ad only to logged-in viewers", function () {
    expect(adMatchesShowTo(SHOW_TO.LOGGED_IN, true)).toBe(true);
    expect(adMatchesShowTo(SHOW_TO.LOGGED_IN, false)).toBe(false);
  });

  it("shows a loggedOut ad only to logged-out viewers", function () {
    expect(adMatchesShowTo(SHOW_TO.LOGGED_OUT, true)).toBe(false);
    expect(adMatchesShowTo(SHOW_TO.LOGGED_OUT, false)).toBe(true);
  });

  it("never passes an unknown value, whoever is viewing", function () {
    // The fail-closed half of normalizeShowTo's pass-through.
    expect(adMatchesShowTo("everyone", true)).toBe(false);
    expect(adMatchesShowTo("everyone", false)).toBe(false);
  });
});

describe("buildInAppAdsFromSidebarAds", function () {
  const makeSidebarAd = (overrides = {}) => ({
    internalCampaignId: "camp-1",
    keywords: "Torah, Shabbat, !skip",
    buttonIcon: "icon.png",
    buttonAboveOrBelow: "above",
    sidebarAdBackgroundColor: "#004E5F",
    isNewsletterSubscriptionInputForm: false,
    newsletterMailingLists: [{ newsletterName: "General" }],
    showTo: "all",
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-02-01T00:00:00Z",
    debug: false,
    locales: ["en", "he"],
    byLocale: {
      en: { title: "En Title", bodyText: "En Body", buttonText: "En Button", buttonURL: "https://example.com/en" },
      he: { title: "He Title", bodyText: "He Body", buttonText: "He Button", buttonURL: "https://example.com/he" },
    },
    ...overrides,
  });

  it("produces one ad per locale present on the document", function () {
    const [enAd, heAd] = buildInAppAdsFromSidebarAds([makeSidebarAd()]);

    expect(enAd.trigger.interfaceLang).toBe("english");
    expect(enAd.title).toBe("En Title");
    expect(heAd.trigger.interfaceLang).toBe("hebrew");
    expect(heAd.title).toBe("He Title");
  });

  it("produces a single hebrew ad for a hebrew-only document, with no english counterpart required", function () {
    const heOnlyAd = makeSidebarAd({
      locales: ["he"],
      byLocale: {
        he: { title: "He Only", bodyText: "Body", buttonText: "Click", buttonURL: "https://example.com/he" },
      },
    });

    const ads = buildInAppAdsFromSidebarAds([heOnlyAd]);

    expect(ads).toHaveLength(1);
    expect(ads[0].trigger.interfaceLang).toBe("hebrew");
    expect(ads[0].title).toBe("He Only");
  });

  it("splits keywords into targets and exclude-targets, trimmed and lowercased", function () {
    const [ad] = buildInAppAdsFromSidebarAds([makeSidebarAd({ locales: ["en"] })]);

    expect(ad.trigger.keywordTargets).toEqual(["torah", "shabbat"]);
    expect(ad.trigger.excludeKeywordTargets).toEqual(["skip"]);
  });

  it("maps newsletterMailingLists to plain names and defaults to an empty array when absent", function () {
    const [withLists] = buildInAppAdsFromSidebarAds([makeSidebarAd({ locales: ["en"] })]);
    expect(withLists.newsletterMailingLists).toEqual(["General"]);

    const [withoutLists] = buildInAppAdsFromSidebarAds([
      makeSidebarAd({ locales: ["en"], newsletterMailingLists: undefined }),
    ]);
    expect(withoutLists.newsletterMailingLists).toEqual([]);
  });

  it("preserves inner spaces in multi-word keywords", function () {
    // The lever for targeting a specific collection TOC: category-derived context keywords are
    // lowercased category names WITH spaces ("covenant and conversation"), and a Strapi editor
    // types the same thing into the comma-separated keywords field. Only commas split; spaces
    // inside an entry are content.
    const [ad] = buildInAppAdsFromSidebarAds([
      makeSidebarAd({ locales: ["en"], keywords: "Covenant and Conversation, !skip" }),
    ]);

    expect(ad.trigger.keywordTargets).toEqual(["covenant and conversation"]);
    expect(ad.trigger.excludeKeywordTargets).toEqual(["skip"]);
  });

  it("defaults trigger.pageType to all_pages when the document predates the field", function () {
    // makeSidebarAd carries no pageType, exactly like a Strapi document created before the field
    // existed (or fetched via the legacy-Strapi retry) — such ads must keep behaving as before.
    const [ad] = buildInAppAdsFromSidebarAds([makeSidebarAd({ locales: ["en"] })]);
    expect(ad.trigger.pageType).toBe("all_pages");
  });

  it("defaults trigger.showTo to all when the document has no audience set", function () {
    const [ad] = buildInAppAdsFromSidebarAds([makeSidebarAd({ locales: ["en"], showTo: null })]);
    expect(ad.trigger.showTo).toBe("all");
  });

  it("maps sidebarAdBackgroundColor onto the ad as backgroundColor", function () {
    const [ad] = buildInAppAdsFromSidebarAds([makeSidebarAd({ locales: ["en"] })]);
    expect(ad.backgroundColor).toBe("#004E5F");

    const [plain] = buildInAppAdsFromSidebarAds([
      makeSidebarAd({ locales: ["en"], sidebarAdBackgroundColor: null }),
    ]);
    expect(plain.backgroundColor).toBeNull();
  });

  it("carries the Strapi pageType value onto the trigger when present", function () {
    const [ad] = buildInAppAdsFromSidebarAds([
      makeSidebarAd({ locales: ["en"], pageType: "book_toc" }),
    ]);
    expect(ad.trigger.pageType).toBe("book_toc");
  });

  it("flattens multiple sidebar ads, each contributing their own locale-ads, into a single array", function () {
    const ads = buildInAppAdsFromSidebarAds([
      makeSidebarAd({ internalCampaignId: "camp-1", locales: ["en"] }),
      makeSidebarAd({
        internalCampaignId: "camp-2",
        locales: ["he"],
        byLocale: { he: { title: "T2", bodyText: "B2", buttonText: "C2", buttonURL: "u2" } },
      }),
    ]);

    expect(ads).toHaveLength(2);
    expect(ads.map((ad) => ad.campaignId)).toEqual(["camp-1", "camp-2"]);
  });

  describe("a malformed document costs only itself", function () {
    // Each case is a shape GraphQL's type checks would not stop (or a grouping hiccup) that used
    // to throw inside the one big flatMap — and the catch in Promotions then dropped EVERY ad.
    const malformedDocuments = {
      "non-string keywords": { keywords: 42 },
      "newsletterMailingLists that isn't an array": { newsletterMailingLists: { newsletterName: "x" } },
      "a locale listed without its localized fields": { locales: ["en"], byLocale: {} },
      "no locales at all": { locales: undefined },
    };

    let consoleError;
    beforeEach(() => {
      consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => consoleError.mockRestore());

    Object.entries(malformedDocuments).forEach(([description, overrides]) => {
      it(`skips a document with ${description} and still builds the others`, function () {
        const ads = buildInAppAdsFromSidebarAds([
          makeSidebarAd({ internalCampaignId: "good-before", locales: ["en"] }),
          makeSidebarAd({ internalCampaignId: "broken", ...overrides }),
          makeSidebarAd({ internalCampaignId: "good-after", locales: ["en"] }),
        ]);

        expect(ads.map((ad) => ad.campaignId)).toEqual(["good-before", "good-after"]);
      });
    });

    it("logs the skipped document under a stable prefix, naming its campaign", function () {
      buildInAppAdsFromSidebarAds([makeSidebarAd({ internalCampaignId: "broken", keywords: 42 })]);

      expect(consoleError).toHaveBeenCalledTimes(1);
      const [message] = consoleError.mock.calls[0];
      expect(message).toContain(SKIPPED_SIDEBAR_AD_LOG);
      expect(message).toContain("broken");
    });
  });

  it("composes with groupByDocumentId's output shape end-to-end for a hebrew-only strapi row", function () {
    const rowsByLocale = {
      en: [],
      he: [
        {
          documentId: "doc-1",
          locale: "he",
          internalCampaignId: "camp-3",
          keywords: "kabbalah",
          buttonAboveOrBelow: "below",
          sidebarAdBackgroundColor: null,
          showTo: "all",
          startTime: "2026-01-01T00:00:00Z",
          endTime: "2026-02-01T00:00:00Z",
          debug: false,
          title: "He title",
          bodyText: "He body",
          buttonText: "He button",
          buttonURL: "https://example.com/he",
        },
      ],
    };
    const grouped = groupByDocumentId(rowsByLocale, LOCALIZED_FIELDS.sidebarAd);

    const ads = buildInAppAdsFromSidebarAds(grouped);

    expect(ads).toHaveLength(1);
    expect(ads[0].trigger.interfaceLang).toBe("hebrew");
    expect(ads[0].title).toBe("He title");
  });
});
