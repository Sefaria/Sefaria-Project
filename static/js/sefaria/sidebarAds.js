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
    .filter((entry) => entry !== "");
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

// The values the sidebar ad's Strapi `showTo` field can hold. Strings, not Symbols, because they
// compare against CMS data. NOT the same vocabulary as banners and modals (ShowTo in
// strapiSelection.js spells "everyone" as "both_logged_in_and_logged_out") — the sidebar ad
// content type has its own enumeration, and production ads carry "all".
const SHOW_TO = Object.freeze({
  ALL: "all",
  LOGGED_IN: "loggedIn",
  LOGGED_OUT: "loggedOut",
});

const KNOWN_SHOW_TO_VALUES = new Set(Object.values(SHOW_TO));

// Stable console prefix (UNKNOWN_PAGE_TYPE_LOG pattern) so vocabulary drift between the Strapi
// enumeration and SHOW_TO is findable, instead of surfacing as "why did that ad never show".
const UNKNOWN_SHOW_TO_LOG = "Unknown sidebar-ad showTo from Strapi (ad will show to nobody):";

// Strapi value -> internal value. Same contract as normalizePageType in pageTypes.js:
//   - absent (null/undefined/"") means no audience restriction, so it becomes ALL — an ad an
//     editor never set an audience on should show, not silently vanish;
//   - an UNKNOWN string is passed through UNCHANGED so adMatchesShowTo rejects it for everyone.
//     Normalizing unknowns to ALL would let a typo (or a value pasted from the banner/modal
//     vocabulary) widen a logged-in-only campaign to every visitor. The warn keeps it visible.
const normalizeShowTo = (rawShowTo) => {
  if (rawShowTo && !KNOWN_SHOW_TO_VALUES.has(rawShowTo)) {
    console.warn(`${UNKNOWN_SHOW_TO_LOG} "${rawShowTo}"`);
  }
  return rawShowTo || SHOW_TO.ALL;
};

// Does this ad's audience admit the current viewer? Pure, so Jest holds the truth table;
// Promotions calls it per ad at match time. Anything outside SHOW_TO matches nobody.
const adMatchesShowTo = (showTo, isLoggedIn) => {
  switch (showTo) {
    case SHOW_TO.ALL:
      return true;
    case SHOW_TO.LOGGED_IN:
      return Boolean(isLoggedIn);
    case SHOW_TO.LOGGED_OUT:
      return !isLoggedIn;
    default:
      return false;
  }
};

// Stable console prefix (same idea as SKIPPED_ROWS_LOG in strapiLocalization.js) so a skipped
// ad is findable in a console or a test instead of looking like "no campaign running".
const SKIPPED_SIDEBAR_AD_LOG = "Skipped malformed sidebar ad from Strapi:";

// sidebarAds: array of grouped docs from groupByDocumentId (each carrying byLocale/locales).
// One in-app ad per locale actually present on the document, so a locale with no
// counterpart in another locale (e.g. Hebrew-only) is no longer skipped.
//
// Each document is built inside its OWN try/catch. Before, one malformed document (say, a
// non-string `keywords`) threw out of the whole flatMap, and the catch in Promotions then
// dropped every sidebar ad on the site. Now a bad document is logged and contributes no ads,
// and the rest render normally. The guard is per DOCUMENT rather than per locale because a
// document is one campaign: a partly broken campaign shouldn't show in one language only.
const buildInAppAdsFromSidebarAds = (sidebarAds) =>
  sidebarAds.flatMap((sidebarAd) => {
    try {
      return buildInAppAdsFromSidebarAd(sidebarAd);
    } catch (error) {
      console.error(`${SKIPPED_SIDEBAR_AD_LOG} "${sidebarAd?.internalCampaignId}"`, error);
      return [];
    }
  });

// One grouped document -> its in-app ads, one per locale. May throw on a malformed document;
// buildInAppAdsFromSidebarAds contains that to the one document.
const buildInAppAdsFromSidebarAd = (sidebarAd) => {
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
        // Missing -> "all"; unknown -> passed through so it matches nobody (see normalizeShowTo).
        showTo: normalizeShowTo(sidebarAd.showTo),
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
};

export {
  buildInAppAdsFromSidebarAds,
  adMatchesKeywords,
  parseKeywords,
  isLightBackground,
  SKIPPED_SIDEBAR_AD_LOG,
  SHOW_TO,
  UNKNOWN_SHOW_TO_LOG,
  normalizeShowTo,
  adMatchesShowTo,
};
