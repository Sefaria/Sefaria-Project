/* Testing done using Jest */
import {
  ContentType,
  ShowTo,
  isEligible,
  selectContent,
  isPathExcluded,
  sortBy,
} from "../strapiSelection";

// A viewer context with harmless defaults; each test overrides only what it is about.
const viewer = (overrides = {}) => ({
  now: new Date("2026-09-15T16:00:00.000Z"),
  locale: "en",
  countryCandidates: new Set(["us"]),
  isLoggedIn: false,
  isSustainer: false,
  isReturningVisitor: false,
  isNewVisitor: true,
  hasDismissed: () => false,
  ...overrides,
});

// A modal in the buildInterfaceTextDoc shape, in-window for the default viewer's `now`,
// unrestricted in every dimension. Tests override single fields to flip single gates.
const modal = (overrides = {}) => ({
  internalModalName: "test-modal",
  modalStartDate: "2026-09-14T00:00:00.000Z",
  modalEndDate: "2026-09-16T23:59:59.000Z",
  locales: ["en"],
  showTo: ShowTo.EVERYONE,
  showToReturningVisitors: false,
  showToNewVisitors: false,
  showToSustainers: false,
  showToNonSustainers: false,
  countriesToTarget: { en: null, he: null },
  buttonURL: { en: null, he: null },
  ...overrides,
});

const banner = (overrides = {}) => ({
  internalBannerName: "test-banner",
  bannerStartDate: "2026-09-14T00:00:00.000Z",
  bannerEndDate: "2026-09-16T23:59:59.000Z",
  locales: ["en"],
  showTo: ShowTo.EVERYONE,
  showToReturningVisitors: false,
  showToNewVisitors: false,
  showToSustainers: false,
  showToNonSustainers: false,
  countriesToTarget: { en: null, he: null },
  buttonURL: { en: null, he: null },
  ...overrides,
});

const include = (...codes) => ({
  countryMode: "include",
  countries: codes.map((code) => ({ name: code, code })),
});

describe("isEligible", function () {
  it("accepts an unrestricted, in-window document", function () {
    expect(isEligible(modal(), viewer(), ContentType.MODAL)).toBe(true);
  });

  it("throws on an unknown content type instead of silently gating nothing", function () {
    expect(() => isEligible(modal(), viewer(), "modal")).toThrow(/Unknown content type/);
  });

  describe("date window", function () {
    it("rejects a document that has not started yet", function () {
      const doc = modal({ modalStartDate: "2026-09-16T00:00:00.000Z" });
      expect(isEligible(doc, viewer(), ContentType.MODAL)).toBe(false);
    });

    it("rejects a document that has already ended", function () {
      const doc = modal({ modalEndDate: "2026-09-15T00:00:00.000Z" });
      expect(isEligible(doc, viewer(), ContentType.MODAL)).toBe(false);
    });

    it("reads the banner date fields for banners", function () {
      const doc = banner({ bannerEndDate: "2026-09-15T00:00:00.000Z" });
      expect(isEligible(doc, viewer(), ContentType.BANNER)).toBe(false);
      expect(isEligible(banner(), viewer(), ContentType.BANNER)).toBe(true);
    });
  });

  describe("locale", function () {
    it("rejects a document not published in the viewer's language", function () {
      expect(isEligible(modal({ locales: ["he"] }), viewer({ locale: "en" }), ContentType.MODAL)).toBe(false);
    });

    it("accepts a bilingual document for either language", function () {
      const doc = modal({ locales: ["en", "he"] });
      expect(isEligible(doc, viewer({ locale: "en" }), ContentType.MODAL)).toBe(true);
      expect(isEligible(doc, viewer({ locale: "he" }), ContentType.MODAL)).toBe(true);
    });
  });

  describe("country targeting", function () {
    it("reads the targeting of the viewer's locale", function () {
      const doc = modal({ countriesToTarget: { en: include("IL"), he: null } });
      expect(isEligible(doc, viewer({ locale: "en" }), ContentType.MODAL)).toBe(false);
    });

    it("accepts when the viewer's country is on the include list", function () {
      const doc = modal({ countriesToTarget: { en: include("US"), he: null } });
      expect(isEligible(doc, viewer(), ContentType.MODAL)).toBe(true);
    });
  });

  describe("audience (showTo)", function () {
    it("shows logged-in-only content to logged-in viewers alone", function () {
      const doc = modal({ showTo: ShowTo.LOGGED_IN_ONLY });
      expect(isEligible(doc, viewer({ isLoggedIn: true }), ContentType.MODAL)).toBe(true);
      expect(isEligible(doc, viewer({ isLoggedIn: false }), ContentType.MODAL)).toBe(false);
    });

    it("shows logged-out-only content to logged-out viewers alone", function () {
      const doc = modal({ showTo: ShowTo.LOGGED_OUT_ONLY });
      expect(isEligible(doc, viewer({ isLoggedIn: false }), ContentType.MODAL)).toBe(true);
      expect(isEligible(doc, viewer({ isLoggedIn: true }), ContentType.MODAL)).toBe(false);
    });

    it("shows to everyone when no user-kind box is ticked", function () {
      expect(isEligible(modal(), viewer(), ContentType.MODAL)).toBe(true);
      expect(isEligible(modal(), viewer({ isLoggedIn: true }), ContentType.MODAL)).toBe(true);
    });

    it("narrows to sustainers when only that box is ticked", function () {
      const doc = modal({ showToSustainers: true });
      expect(isEligible(doc, viewer({ isLoggedIn: true, isSustainer: true }), ContentType.MODAL)).toBe(true);
      expect(isEligible(doc, viewer({ isLoggedIn: true, isSustainer: false }), ContentType.MODAL)).toBe(false);
      // A logged-out viewer has no sustainer status at all.
      expect(isEligible(doc, viewer({ isLoggedIn: false }), ContentType.MODAL)).toBe(false);
    });

    it("narrows to new visitors when only that box is ticked", function () {
      const doc = modal({ showToNewVisitors: true });
      expect(isEligible(doc, viewer({ isNewVisitor: true, isReturningVisitor: false }), ContentType.MODAL)).toBe(true);
      expect(isEligible(doc, viewer({ isNewVisitor: false, isReturningVisitor: true }), ContentType.MODAL)).toBe(false);
    });

    it("matches on either the account kind or the visit kind", function () {
      // Ticked: non-sustainers + returning visitors. A sustainer who is a returning visitor
      // fails the account check but passes the visit check.
      const doc = modal({ showToNonSustainers: true, showToReturningVisitors: true });
      const sustainerWhoReturns = viewer({
        isLoggedIn: true,
        isSustainer: true,
        isReturningVisitor: true,
        isNewVisitor: false,
      });
      expect(isEligible(doc, sustainerWhoReturns, ContentType.MODAL)).toBe(true);
    });

    it("rejects an unrecognized showTo value rather than guessing", function () {
      const doc = modal({ showTo: "some_future_value" });
      expect(isEligible(doc, viewer(), ContentType.MODAL)).toBe(false);
    });
  });

  describe("dismissal", function () {
    it("rejects a document the viewer has already dismissed", function () {
      const ctx = viewer({ hasDismissed: (key) => key === "modal_test-modal" });
      expect(isEligible(modal(), ctx, ContentType.MODAL)).toBe(false);
    });

    it("builds the banner dismissal key with the banner prefix", function () {
      const ctx = viewer({ hasDismissed: (key) => key === "banner_test-banner" });
      expect(isEligible(banner(), ctx, ContentType.BANNER)).toBe(false);
      expect(isEligible(modal({ internalModalName: "test-banner" }), ctx, ContentType.MODAL)).toBe(true);
    });
  });
});

describe("selectContent", function () {
  it("returns null for an empty list", function () {
    expect(selectContent([], viewer(), ContentType.MODAL)).toBe(null);
  });

  it("returns null when nothing is eligible", function () {
    const docs = [modal({ locales: ["he"] })];
    expect(selectContent(docs, viewer({ locale: "en" }), ContentType.MODAL)).toBe(null);
  });

  it("skips an ineligible document and picks the eligible one behind it", function () {
    // The sc-45891 shape: an English-only document ahead of the Hebrew-only one the viewer needs.
    const docs = [modal({ locales: ["en"] }), modal({ internalModalName: "hebrew", locales: ["he"] })];
    expect(selectContent(docs, viewer({ locale: "he" }), ContentType.MODAL).internalModalName).toBe("hebrew");
  });

  it("falls through to the runner-up when the first choice was dismissed", function () {
    const docs = [
      modal({ internalModalName: "dismissed-one" }),
      modal({ internalModalName: "runner-up" }),
    ];
    const ctx = viewer({ hasDismissed: (key) => key === "modal_dismissed-one" });
    expect(selectContent(docs, ctx, ContentType.MODAL).internalModalName).toBe("runner-up");
  });

  describe("ranking, tier by tier", function () {
    it("tier 1: country-targeted beats untargeted", function () {
      const docs = [
        modal({ internalModalName: "for-everyone" }),
        modal({ internalModalName: "for-us-viewers", countriesToTarget: { en: include("US"), he: null } }),
      ];
      expect(selectContent(docs, viewer(), ContentType.MODAL).internalModalName).toBe("for-us-viewers");
    });

    it("tier 2: a restricted audience beats everyone, when country ties", function () {
      const docs = [
        modal({ internalModalName: "for-everyone" }),
        modal({ internalModalName: "for-logged-out", showTo: ShowTo.LOGGED_OUT_ONLY }),
      ];
      expect(selectContent(docs, viewer(), ContentType.MODAL).internalModalName).toBe("for-logged-out");
    });

    it("tier 2: ticking every user-kind box counts as no restriction", function () {
      const allBoxes = {
        showToReturningVisitors: true,
        showToNewVisitors: true,
        showToSustainers: true,
        showToNonSustainers: true,
      };
      const docs = [
        modal({ internalModalName: "all-boxes-ticked", ...allBoxes }),
        modal({ internalModalName: "new-visitors-only", showToNewVisitors: true }),
      ];
      expect(selectContent(docs, viewer(), ContentType.MODAL).internalModalName).toBe("new-visitors-only");
    });

    it("tier 3: a locale-exclusive document beats a bilingual one, when audience ties", function () {
      const docs = [
        modal({ internalModalName: "bilingual", locales: ["en", "he"] }),
        modal({ internalModalName: "english-only", locales: ["en"] }),
      ];
      expect(selectContent(docs, viewer(), ContentType.MODAL).internalModalName).toBe("english-only");
    });

    it("tier 4: a shorter window beats a longer one, when everything else ties", function () {
      const docs = [
        modal({
          internalModalName: "week-long",
          modalStartDate: "2026-09-10T00:00:00.000Z",
          modalEndDate: "2026-09-17T00:00:00.000Z",
        }),
        modal({
          internalModalName: "one-day",
          modalStartDate: "2026-09-15T00:00:00.000Z",
          modalEndDate: "2026-09-16T00:00:00.000Z",
        }),
      ];
      expect(selectContent(docs, viewer(), ContentType.MODAL).internalModalName).toBe("one-day");
    });

    it("tier 6: payload order breaks a complete tie (identical windows AND identical starts)", function () {
      const docs = [modal({ internalModalName: "first" }), modal({ internalModalName: "second" })];
      expect(selectContent(docs, viewer(), ContentType.MODAL).internalModalName).toBe("first");
    });

    it("an earlier tier outranks all later ones combined", function () {
      // The country-targeted document is bilingual with a long window; the untargeted one is
      // locale-exclusive with a short window. Country still wins.
      const docs = [
        modal({
          internalModalName: "specific-late-tiers",
          locales: ["en"],
          modalStartDate: "2026-09-15T00:00:00.000Z",
          modalEndDate: "2026-09-16T00:00:00.000Z",
        }),
        modal({
          internalModalName: "country-targeted",
          locales: ["en", "he"],
          countriesToTarget: { en: include("US"), he: null },
          modalStartDate: "2026-09-10T00:00:00.000Z",
          modalEndDate: "2026-09-17T00:00:00.000Z",
        }),
      ];
      expect(selectContent(docs, viewer(), ContentType.MODAL).internalModalName).toBe("country-targeted");
    });
  });

  describe("ranking, editorial scenarios", function () {
    // The shapes editors actually publish, asserted end to end through the ranking. A
    // locale-exclusive document is authored FOR that audience; a bilingual one is for everyone.

    const weeklyWindow = {
      modalStartDate: "2026-09-12T00:00:00.000Z",
      modalEndDate: "2026-09-19T00:00:00.000Z",
    };
    const dailyWindow = {
      modalStartDate: "2026-09-15T00:00:00.000Z",
      modalEndDate: "2026-09-16T00:00:00.000Z",
    };

    it("a locale-exclusive daily outranks a bilingual weekly for the shared reader (tier 3, before window)", function () {
      const docs = [
        modal({ internalModalName: "bilingual-weekly", locales: ["en", "he"], ...weeklyWindow }),
        modal({ internalModalName: "english-daily", locales: ["en"], ...dailyWindow }),
      ];
      // The English reader can see both; the daily was written for English readers specifically.
      expect(selectContent(docs, viewer({ locale: "en" }), ContentType.MODAL).internalModalName).toBe(
        "english-daily",
      );
      // The Hebrew reader can only see the bilingual weekly — the daily fails the locale GATE,
      // so this is not a ranking outcome. The general-audience document still serves them.
      expect(selectContent(docs, viewer({ locale: "he" }), ContentType.MODAL).internalModalName).toBe(
        "bilingual-weekly",
      );
    });

    it("between two bilingual documents the shorter window wins, for either reader (tier 4)", function () {
      const docs = [
        modal({ internalModalName: "bilingual-weekly", locales: ["en", "he"], ...weeklyWindow }),
        modal({ internalModalName: "bilingual-daily", locales: ["en", "he"], ...dailyWindow }),
      ];
      // Tiers 1-3 tie (untargeted, unrestricted, both bilingual); the more tightly scheduled —
      // potentially more urgent — document takes the slot for every reader.
      expect(selectContent(docs, viewer({ locale: "en" }), ContentType.MODAL).internalModalName).toBe(
        "bilingual-daily",
      );
      expect(selectContent(docs, viewer({ locale: "he" }), ContentType.MODAL).internalModalName).toBe(
        "bilingual-daily",
      );
    });

    it("exclusivity beats urgency: a locale-exclusive weekly outranks a bilingual daily (tier 3 before tier 4)", function () {
      // THE tier-ordering collision, pinned deliberately (user decision, 2026-08-13): when
      // "written for this audience specifically" (locale exclusivity) and "more tightly
      // scheduled" (shorter window) point at DIFFERENT documents, exclusivity wins — it is the
      // stronger signal of intent. This is the discriminating case the scenario above cannot
      // test, because there both tiers favor the same document.
      const docs = [
        modal({ internalModalName: "bilingual-daily", locales: ["en", "he"], ...dailyWindow }),
        modal({ internalModalName: "english-weekly", locales: ["en"], ...weeklyWindow }),
      ];
      // The English reader gets the document written for English readers, even though the
      // bilingual daily is more urgent — and listed first, so order cannot explain it either.
      expect(selectContent(docs, viewer({ locale: "en" }), ContentType.MODAL).internalModalName).toBe(
        "english-weekly",
      );
      // The Hebrew reader never sees the collision: the English-only weekly fails their locale
      // gate and the bilingual daily wins as the only eligible document.
      expect(selectContent(docs, viewer({ locale: "he" }), ContentType.MODAL).internalModalName).toBe(
        "bilingual-daily",
      );
    });

    it("country-targeting outranks urgency: an include-targeted monthly beats an untargeted daily (tier 1 before tier 4)", function () {
      // The other tier-ordering collision, ratified deliberately (user decision, 2026-08-13):
      // naming the viewer's country is a stronger signal of intent than a tighter schedule.
      // The untargeted daily is listed first AND shorter, so only tier 1 explains the winner.
      const docs = [
        modal({
          internalModalName: "untargeted-daily",
          modalStartDate: "2026-09-15T00:00:00.000Z",
          modalEndDate: "2026-09-16T00:00:00.000Z",
        }),
        modal({
          internalModalName: "us-targeted-monthly",
          countriesToTarget: { en: include("US"), he: null },
          modalStartDate: "2026-09-01T00:00:00.000Z",
          modalEndDate: "2026-09-29T00:00:00.000Z",
        }),
      ];
      expect(selectContent(docs, viewer(), ContentType.MODAL).internalModalName).toBe(
        "us-targeted-monthly",
      );
    });

    it("overlapping equal-length campaigns: the earlier start wins, in either payload order (tier 5)", function () {
      // User-ratified tiebreak (2026-08-13): when windows are the same LENGTH and every earlier
      // tier ties, the campaign that STARTED EARLIER wins. Same-length overlapping windows
      // expire in start order, so the earlier one leaves the stage first — the viewer will
      // still get to see the later one after it ends, which makes the earlier one the more
      // urgent of the two right now.
      const incumbent = modal({
        internalModalName: "incumbent",
        modalStartDate: "2026-09-12T00:00:00.000Z",
        modalEndDate: "2026-09-19T00:00:00.000Z",
      });
      const newcomer = modal({
        internalModalName: "newcomer",
        modalStartDate: "2026-09-15T00:00:00.000Z",
        modalEndDate: "2026-09-22T00:00:00.000Z",
      });
      // Both orders — the winner comes from the start date, not from position.
      expect(selectContent([incumbent, newcomer], viewer(), ContentType.MODAL).internalModalName).toBe(
        "incumbent",
      );
      expect(selectContent([newcomer, incumbent], viewer(), ContentType.MODAL).internalModalName).toBe(
        "incumbent",
      );
    });

    it("overlapping campaigns of different lengths: the shorter wins whichever started first", function () {
      const longIncumbent = modal({
        internalModalName: "long-incumbent",
        modalStartDate: "2026-09-12T00:00:00.000Z",
        modalEndDate: "2026-09-19T00:00:00.000Z",
      });
      const shortNewcomer = modal({
        internalModalName: "short-newcomer",
        modalStartDate: "2026-09-15T00:00:00.000Z",
        modalEndDate: "2026-09-16T00:00:00.000Z",
      });
      expect(
        selectContent([longIncumbent, shortNewcomer], viewer(), ContentType.MODAL).internalModalName,
      ).toBe("short-newcomer");
    });
  });
});

describe("sortBy", function () {
  it("sorts by the computed key without mutating the input", function () {
    const list = [{ n: 2 }, { n: 1 }, { n: 3 }];
    expect(sortBy(list, (x) => [x.n])).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(list[0]).toEqual({ n: 2 });
  });

  it("keeps the original order of equal keys (stable)", function () {
    const list = [{ n: 1, tag: "a" }, { n: 1, tag: "b" }, { n: 0, tag: "c" }];
    expect(sortBy(list, (x) => [x.n]).map((x) => x.tag)).toEqual(["c", "a", "b"]);
  });

  it("compares array keys element by element", function () {
    const list = [{ key: [1, 0] }, { key: [0, 9] }, { key: [0, 2] }];
    expect(sortBy(list, (x) => x.key).map((x) => x.key)).toEqual([[0, 2], [0, 9], [1, 0]]);
  });
});

describe("isPathExcluded", function () {
  it("excludes the fixed fundraising/app paths", function () {
    ["/donate", "/mobile", "/app", "/ways-to-give"].forEach((path) => {
      expect(isPathExcluded(modal(), path)).toBe(true);
    });
  });

  it("allows an ordinary page", function () {
    expect(isPathExcluded(modal(), "/texts")).toBe(false);
  });

  it("excludes the page either locale's button links to", function () {
    const doc = modal({
      buttonURL: {
        en: "https://donate.sefaria.org/campaign/779365/donate?c_src=web",
        he: "https://donate.sefaria.org/give/451346#!/donation/checkout",
      },
    });
    expect(isPathExcluded(doc, "/campaign/779365/donate")).toBe(true);
    expect(isPathExcluded(doc, "/give/451346")).toBe(true);
    expect(isPathExcluded(doc, "/texts")).toBe(false);
  });

  it("tolerates a locale with no button URL", function () {
    const doc = modal({ buttonURL: { en: "https://example.org/campaign", he: null } });
    expect(isPathExcluded(doc, "/campaign")).toBe(true);
    expect(isPathExcluded(doc, "/texts")).toBe(false);
  });
});
