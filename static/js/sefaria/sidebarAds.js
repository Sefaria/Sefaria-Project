import { LOCALE_TO_INTERFACE_LANG } from "./strapiLocalization";
import { normalizePageType } from "./pageTypes";

// The Strapi `keywords` field, parsed: a comma-separated list where a `!` prefix means exclude.
// An EMPTY (or missing/whitespace) field means "no keyword restriction" — the honest way to say
// "any page", replacing the old editor hack of an exclusion that never matches ("!nowhere").
// Blank entries from stray commas are dropped rather than becoming unmatchable include keywords.
const parseKeywords = (rawKeywords) => {
  const entries = (rawKeywords || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return {
    keywordTargets: entries.filter((entry) => entry[0] !== "!"),
    excludeKeywordTargets: entries.filter((entry) => entry[0] === "!").map((entry) => entry.slice(1)),
  };
};

// Does this ad's keyword rule admit a page carrying `pageKeywords`? (Pure — Jest holds the truth
// table; Promotions calls it per ad at match time.)
//
// Semantics (revised 2026-09-01, replacing an include-OR-exclude rule):
//   - no keywords at all            -> no restriction; every page passes, including pages that
//                                      produce no keywords (homepage, calendars, notifications…).
//   - include keywords present      -> the page must carry at least one of them (so it can never
//                                      match a keyword-less page — those pages aren't "about"
//                                      anything an include list could name).
//   - exclude keywords present      -> the page must CARRY keywords and none may be excluded.
//                                      A keyword-less page does NOT match an exclusion-only ad:
//                                      exclusions subtract from the world of keyword-bearing
//                                      pages, they are no longer a backdoor way to say
//                                      "everywhere" (use an empty field + pageType for that).
//   - both present                  -> both rules must hold (AND — the old rule ORed them, which
//                                      let "a, !b" match a page carrying both a AND b).
const adMatchesKeywords = ({ keywordTargets, excludeKeywordTargets }, pageKeywords) => {
  const includesPass =
    keywordTargets.length === 0 ||
    pageKeywords.some((keyword) => keywordTargets.includes(keyword));
  const excludesPass =
    excludeKeywordTargets.length === 0 ||
    (pageKeywords.length > 0 &&
      !pageKeywords.some((keyword) => excludeKeywordTargets.includes(keyword)));
  return includesPass && excludesPass;
};

// Is a CSS hex color light enough that dark text stays readable on it?
//
// Drives the ad's "colored treatment": a DARK background (like the old blue ads) flips the title,
// body, and button to the white-on-color look, while a WHITISH background keeps the ad's default
// styling — same text and button as an ad with no color at all, per the design decision
// (2026-09-15) that light tints must not change how the ad reads. Uses the standard perceived-
// luminance weights (ITU-R BT.601); the 0.7 threshold is a judgment line, not physics — tune it
// if an editor ever picks a mid-tone that lands on the wrong side.
const isLightBackground = (hexColor) => {
  if (!hexColor) return true; // no color -> default styling, same as light
  const hex = hexColor.replace("#", "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return true; // unparseable -> fail toward readable default
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7;
};

// sidebarAds: array of grouped docs from groupByDocumentId (each carrying byLocale/locales).
// One in-app ad per locale actually present on the document, so a locale with no
// counterpart in another locale (e.g. Hebrew-only) is no longer skipped.
const buildInAppAdsFromSidebarAds = (sidebarAds) =>
  sidebarAds.flatMap((sidebarAd) => {
    const { keywordTargets: keywordTargetsArray, excludeKeywordTargets } = parseKeywords(sidebarAd.keywords);

    return sidebarAd.locales.map((locale) => {
      const localizedFields = sidebarAd.byLocale[locale];
      return {
        campaignId: sidebarAd.internalCampaignId,
        title: localizedFields.title,
        bodyText: localizedFields.bodyText,
        buttonText: localizedFields.buttonText,
        buttonURL: localizedFields.buttonURL,
        buttonIcon: sidebarAd.buttonIcon,
        buttonLocation: sidebarAd.buttonAboveOrBelow,
        // Mirrors the banner's bannerBackgroundColor: a hex string applied inline, null = the
        // default look (replaced the old hasBlueBackground boolean, 2026-09-15).
        backgroundColor: sidebarAd.sidebarAdBackgroundColor,
        isNewsletterSubscriptionInputForm: sidebarAd.isNewsletterSubscriptionInputForm,
        newsletterMailingLists:
          sidebarAd.newsletterMailingLists?.map((mailingLists) => mailingLists.newsletterName) ?? [],
        trigger: {
          showTo: sidebarAd.showTo,
          interfaceLang: LOCALE_TO_INTERFACE_LANG[locale],
          startTimeDate: Date.parse(sidebarAd.startTime),
          endTimeDate: Date.parse(sidebarAd.endTime),
          keywordTargets: keywordTargetsArray,
          excludeKeywordTargets: excludeKeywordTargets,
          // A document that predates the pageType field (or arrived from a Strapi without it)
          // normalizes to all_pages, so older ads keep matching exactly as they always did.
          pageType: normalizePageType(sidebarAd.pageType),
        },
        debug: sidebarAd.debug,
      };
    });
  });

export { buildInAppAdsFromSidebarAds, adMatchesKeywords, parseKeywords, isLightBackground };
