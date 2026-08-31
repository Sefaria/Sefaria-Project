/* Testing done using Jest */
import { buildInAppAdsFromSidebarAds } from "../sidebarAds";
import { groupByDocumentId, LOCALIZED_FIELDS } from "../strapiLocalization";

describe("buildInAppAdsFromSidebarAds", function () {
  const makeSidebarAd = (overrides = {}) => ({
    internalCampaignId: "camp-1",
    keywords: "Torah, Shabbat, !skip",
    buttonIcon: "icon.png",
    buttonAboveOrBelow: "above",
    hasBlueBackground: true,
    isNewsletterSubscriptionInputForm: false,
    newsletterMailingLists: [{ newsletterName: "General" }],
    showTo: "everyone",
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
          hasBlueBackground: false,
          showTo: "everyone",
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
