import React, {useState, useContext, useEffect, useRef} from "react";
import { AdContext, StrapiDataProvider, StrapiDataContext } from "./context";
import { buildInAppAdsFromSidebarAds } from "./sefaria/sidebarAds";
import classNames from "classnames";
import Sefaria from "./sefaria/sefaria";
import Util from "./sefaria/util";
import {EnglishText, HebrewText, InterfaceText, OnInView} from "./Misc";
import $ from "./sefaria/sefariaJquery";
import { NewsletterSignUpForm } from "./NewsletterSignUpForm";

const Promotions = () => {
  const [inAppAds, setInAppAds] = useState(Sefaria._inAppAds); // local cache
  const [matchingAds, setMatchingAds] = useState(null); // match the ads to what comes from Strapi
  const context = useContext(AdContext);
  const strapi = useContext(StrapiDataContext);
  useEffect(() => {
    if (strapi.dataFromStrapiHasBeenReceived) {
      // Guard against unexpected Strapi payload shapes so a processing error here so the code can never unmount the whole React tree
      try {
        Sefaria._inAppAds = [];

        const sidebarAds = strapi.strapiData?.sidebarAds;

        // Only an array is iterable here. A stale/incompatible payload may nest the ads under a wrapper object (Strapi v4's { data: [...] })
        // The wrong data type  must be treated as "no ads" rather than crashing on .forEach iterator
        if (Array.isArray(sidebarAds)) {
          Sefaria._inAppAds = buildInAppAdsFromSidebarAds(sidebarAds);
          setInAppAds(Sefaria._inAppAds);
        }
      } catch (error) {
        console.error("Failed to process sidebar ads from Strapi: ", error);
      }
    }
    // strapiData must be a dependency, not just the received-flag: context.js sets the flag and
    // the data in two separate setState calls, and React 16 does not batch updates made inside a
    // promise callback. The flag can therefore flip in its own commit while strapiData is still
    // null, in which case this effect runs, finds no array, and — keyed on the flag alone — would
    // never run again once the data arrived. The ad then only appeared after some later navigation
    // remounted this component.
  }, [strapi.dataFromStrapiHasBeenReceived, strapi.strapiData]);
  // dataFromStrapiHasBeenReceived will originally be null until that part is scheduled and executed
  
  useEffect(() => {
    if (inAppAds) {
      setMatchingAds(getCurrentMatchingAds());
    }
  }, [context, inAppAds]);


  function showToUser(ad) {
    if (ad.trigger.showTo === "all") {
      return true;
    } else if (ad.trigger.showTo === "loggedIn" && context.isLoggedIn) {
      return true;
    } else if (ad.trigger.showTo === "loggedOut" && !context.isLoggedIn) {
      return true;
    } else {
      return false;
    }
  }

  function showGivenDebugMode(ad) {
    if (!ad.debug) {
      return true;
    } else if (context.isDebug == true) {
      return true;
    } else {
      return false;
    }
  }

  function getCurrentMatchingAds() {
    // TODO: refine matching algorithm to order by matchingness?
    return inAppAds.filter((ad) => {
      return (
        showToUser(ad) &&
        showGivenDebugMode(ad) &&
        ad.trigger.interfaceLang === context.interfaceLang &&
        context.dt >= ad.trigger.startTimeDate &&
        context.dt <= ad.trigger.endTimeDate &&
        (context.keywordTargets.some((kw) =>
          ad.trigger.keywordTargets.includes(kw)
        ) ||
          (ad.trigger.excludeKeywordTargets.length !== 0 &&
            !context.keywordTargets.some((kw) =>
              ad.trigger.excludeKeywordTargets.includes(kw)
            )))
      );
    });
  }

  return matchingAds
    ? matchingAds.map((ad) => (
        <SidebarAd context={context} matchingAd={ad} key={ad.campaignId} />
      ))
    : null;
};

function trackSidebarAdImpression(ad) {
  console.log(ad.campaignId + " has been seen");
  gtag("event", "promo_viewed", {
    campaignID: ad.campaignId,
    adType: "sidebar",
  });
}

function trackSidebarAdClick(ad) {
  gtag("event", "promo_clicked", {
    campaignID: ad.campaignId,
    adType: "sidebar",
  });
}
const cookie = Sefaria._inBrowser ? $.cookie : Sefaria.util.cookie;
const GDocAdvertText = () => {
    const learnMoreLink = "https://voices.sefaria.org/sheets/529099?origin=AddToSheetsPromo"
    return    <InterfaceText>
                <EnglishText> Add texts directly to your Google Docs with our <span id="newExtension">new extension</span>! <a href={learnMoreLink} data-target-module={Sefaria.VOICES_MODULE}>Learn more</a></EnglishText>
                <HebrewText> הוסיפו טקסטים מספריא ישירות לקובץ גוגל עם <span id="newExtension">התוסף החדש</span> שלנו! <a href={learnMoreLink} data-target-module={Sefaria.VOICES_MODULE}>למדו עוד</a></HebrewText>
             </InterfaceText>;
}
const GDocAdvertBox = React.memo(() => {
    const gdocsCampaignId = "GDocs_Promo_AddToSheet";
    const installNowLink = 'https://workspace.google.com/marketplace/app/sefaria/849562338091?utm_source=SefariaOrg&utm_medium=SidebarAdButton&utm_campaign=AddToSheetPromotion&utm_content=InstallFromAddToSheet';
    const gdocsCampaignAd = {campaignId: gdocsCampaignId};
    const gdocInstalled = 'gdoc_installed';
    const handleInstall = () => {
        cookie(gdocInstalled, JSON.stringify(1), {path: "/"});
        trackSidebarAdClick(gdocsCampaignAd);
    }
    return !cookie(gdocInstalled) &&
        <OnInView onVisible={() => trackSidebarAdImpression(gdocsCampaignAd)}>
            <div className="gDocAdvertBox">
              <GDocAdvertText/>
              <div id="installNow">
                <a 
                  href={installNowLink}
                  onClick={handleInstall}
                  onKeyDown={(e) => Util.handleLinkSpaceKey(e, handleInstall)}
                >
                  <InterfaceText>promotions.install_now</InterfaceText>
                </a>
              </div>
            </div>
          </OnInView>;
});

// Don't continuously rerender a SidebarAd if the parent component decides to rerender
// This is done to prevent multiple views from registering from OnInView
const SidebarAd = React.memo(({ context, matchingAd }) => {
  const classes = classNames({
    sidebarPromo: 1,
    blue: matchingAd.hasBlueBackground,
  });

  function getButton() {
    return (
      <a
        className="button small"
        href={matchingAd.buttonURL}
        onClick={() => trackSidebarAdClick(matchingAd)}
      >
        {matchingAd.buttonIcon ? (
          <img
            // TODO: Create middleware to handle serving media assets to distinguish between different environments
            // The absolute path is needed for debugging purposes to get the media asset from the local Strapi server
            // The local Strapi instance provides a relative path through the API
            src={(matchingAd.debug ? STRAPI_INSTANCE : '') + matchingAd.buttonIcon.url}
            alt={matchingAd.buttonIcon.alternativeText}
            aria-hidden="true"
          />
        ) : null}
        {matchingAd.buttonText}
      </a>
    );
  }

    const isHebrew = context.interfaceLang === "hebrew";
    const getLanguageClass = () => (isHebrew ? "int-he" : "int-en");

    return (
      <OnInView onVisible={() => trackSidebarAdImpression(matchingAd)}>
        <div className={classes}>
          <h3 className={getLanguageClass()}>{matchingAd.title}</h3>
          {matchingAd.buttonLocation === "below" ? (
            matchingAd.isNewsletterSubscriptionInputForm ? (
              <>
                <p className={getLanguageClass()}>{matchingAd.bodyText}</p>
                <NewsletterSignUpForm
                  context={"Sidebar Ad: " + context.keywordTargets.toString()}
                  includeEducatorOption={false}
                  additionalNewsletterMailingLists={matchingAd.newsletterMailingLists}
                />
              </>
            ) : (
              <>
                <p className={getLanguageClass()}>{matchingAd.bodyText}</p>
                {getButton()}
              </>
            )
          ) : matchingAd.isNewsletterSubscriptionInputForm ? (
            <>
              <NewsletterSignUpForm
                context={"Sidebar Ad: " + context.keywordTargets.toString()}
                includeEducatorOption={false}
                additionalNewsletterMailingLists={matchingAd.newsletterMailingLists}
              />
              <p className={getLanguageClass()}>{matchingAd.bodyText}</p>
            </>
          ) : (
            <>
              {getButton()}
              <p className={getLanguageClass()}>{matchingAd.bodyText}</p>
            </>
          )}
        </div>
      </OnInView>
    );
});

export { Promotions, GDocAdvertBox };
