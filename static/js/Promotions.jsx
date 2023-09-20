import React, { useState, useContext, useEffect } from "react";
import { AdContext, StrapiDataProvider, StrapiDataContext } from "./context";
import classNames from "classnames";
import Sefaria from "./sefaria/sefaria";
import { OnInView } from "./Misc";

const Promotions = () => {
  const [inAppAds, setInAppAds] = useState(Sefaria._inAppAds); // local cache
  const [matchingAds, setMatchingAds] = useState(null); // match the ads to what comes from Strapi
  const context = useContext(AdContext);
  const strapi = useContext(StrapiDataContext);
  useEffect(() => {
    if (strapi.dataFromStrapiHasBeenReceived) {
      Sefaria._inAppAds = [];

      const sidebarAds = strapi.strapiData?.sidebarAds?.data;

      if (sidebarAds) {
        sidebarAds.forEach((sidebarAd) => {
          sidebarAd = sidebarAd.attributes;
          console.log(JSON.stringify(sidebarAd, null, 2));
          let keywordTargetsArray = sidebarAd.keywords
            .split(",")
            .map((x) => x.trim().toLowerCase());
          let excludeKeywordTargets = keywordTargetsArray
            .filter((x) => x[0] === "!")
            .map((x) => x.slice(1));
          keywordTargetsArray = keywordTargetsArray.filter((x) => x[0] !== "!");
          Sefaria._inAppAds.push({
            campaignId: sidebarAd.internalCampaignId,
            title: sidebarAd.title,
            bodyText: sidebarAd.bodyText,
            buttonText: sidebarAd.buttonText,
            buttonURL: sidebarAd.buttonURL,
            buttonIcon: sidebarAd.buttonIcon,
            buttonLocation: sidebarAd.buttonAboveOrBelow,
            hasBlueBackground: sidebarAd.hasBlueBackground,
            trigger: {
              showTo: sidebarAd.showTo,
              interfaceLang: "english",
              startTimeDate: Date.parse(sidebarAd.startTime),
              endTimeDate: Date.parse(sidebarAd.endTime),
              keywordTargets: keywordTargetsArray,
              excludeKeywordTargets: excludeKeywordTargets,
            },
            debug: sidebarAd.debug,
          });
          // Add a separate ad if there's a Hebrew translation. There can't be an ad with only Hebrew
          if (sidebarAd.localizations?.data?.length) {
            const hebrewAttributes = sidebarAd.localizations.data[0].attributes;
            const [buttonText, bodyText, buttonURL, title] = [
              hebrewAttributes.buttonText,
              hebrewAttributes.bodyText,
              hebrewAttributes.buttonURL,
              hebrewAttributes.title,
            ];
            Sefaria._inAppAds.push({
              campaignId: sidebarAd.internalCampaignId,
              title: title,
              bodyText: bodyText,
              buttonText: buttonText,
              buttonURL: buttonURL,
              buttonIcon: sidebarAd.buttonIcon,
              buttonLocation: sidebarAd.buttonAboveOrBelow,
              hasBlueBackground: sidebarAd.hasBlueBackground,
              trigger: {
                showTo: sidebarAd.showTo,
                interfaceLang: "hebrew",
                startTimeDate: Date.parse(sidebarAd.startTime),
                endTimeDate: Date.parse(sidebarAd.endTime),
                keywordTargets: keywordTargetsArray,
                excludeKeywordTargets: excludeKeywordTargets,
              },
              debug: sidebarAd.debug,
            });
          }
        });
        setInAppAds(Sefaria._inAppAds);
      }
    }
  }, [strapi.dataFromStrapiHasBeenReceived]);
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
        {matchingAd.buttonIcon?.data ? (
          <img
            // TODO: Create middleware to handle serving media assets to distinguish between different environments
            // The absolute path is needed for debugging purposes to get the media asset from the local Strapi server
            // The local Strapi instance provides a relative path through the API
            src={(matchingAd.debug ? STRAPI_INSTANCE : '') + matchingAd.buttonIcon.data.attributes.url}
            alt={matchingAd.buttonIcon.data.attributes.alternativeText}
            aria-hidden="true"
          />
        ) : null}
        {matchingAd.buttonText}
      </a>
    );
  }

  return (
    <OnInView onVisible={() => trackSidebarAdImpression(matchingAd)}>
      <div className={classes}>
        <h3
          className={context.interfaceLang === "hebrew" ? "int-he" : "int-en"}
        >
          {matchingAd.title}
        </h3>
        {matchingAd.buttonLocation === "below" ? (
          <>
            <p
              className={
                context.interfaceLang === "hebrew" ? "int-he" : "int-en"
              }
            >
              {matchingAd.bodyText}
            </p>
            {getButton()}
          </>
        ) : (
          <>
            {getButton()}
            <p
              className={
                context.interfaceLang === "hebrew" ? "int-he" : "int-en"
              }
            >
              {matchingAd.bodyText}
            </p>
          </>
        )}
      </div>
    </OnInView>
  );
});

export { Promotions };
