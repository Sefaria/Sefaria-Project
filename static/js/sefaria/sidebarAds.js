import { LOCALE_TO_INTERFACE_LANG } from "./strapiLocalization";

// sidebarAds: array of grouped docs from groupByDocumentId (each carrying byLocale/locales).
// One in-app ad per locale actually present on the document, so a locale with no
// counterpart in another locale (e.g. Hebrew-only) is no longer skipped.
const buildInAppAdsFromSidebarAds = (sidebarAds) =>
  sidebarAds.flatMap((sidebarAd) => {
    let keywordTargetsArray = sidebarAd.keywords
      .split(",")
      .map((x) => x.trim().toLowerCase());
    const excludeKeywordTargets = keywordTargetsArray
      .filter((x) => x[0] === "!")
      .map((x) => x.slice(1));
    keywordTargetsArray = keywordTargetsArray.filter((x) => x[0] !== "!");

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
        hasBlueBackground: sidebarAd.hasBlueBackground,
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
        },
        debug: sidebarAd.debug,
      };
    });
  });

export { buildInAppAdsFromSidebarAds };
