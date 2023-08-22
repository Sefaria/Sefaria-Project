import React, { useContext, useEffect, useState } from "react";

const ContentLanguageContext = React.createContext({
  language: "english",
});
ContentLanguageContext.displayName = "ContentLanguageContext"; //This lets us see this name in the devtools

const AdContext = React.createContext({});
AdContext.displayName = "AdContext";

const StrapiDataContext = React.createContext({});
StrapiDataContext.displayName = "StrapiDataContext";

const transformValues = (obj, callback) => {
  const newObj = {};
  for (let key in obj) {
    newObj[key] = obj[key] !== null ? callback(obj[key]) : null;
  }
  return newObj;
};

export function replaceNewLinesWithLinebreaks(content) {
  return transformValues(
    content,
    (s) => s.replace(/\n/gi, "&nbsp; \n") + "&nbsp; \n"
  );
}

function StrapiDataProvider({ children }) {
  const [dataFromStrapiHasBeenReceived, setDataFromStrapiHasBeenReceived] =
    useState(false);
  const [strapiData, setStrapiData] = useState(null);
  const [modal, setModal] = useState(null);
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    if (STRAPI_INSTANCE) {
      const getStrapiData = async () => {
        let getDateWithoutTime = (date) => date.toISOString().split("T")[0];
        let getJSONDateStringInLocalTimeZone = (date) => {
          let parts = getDateWithoutTime(date).split("-");
          return new Date(parts[0], parts[1] - 1, parts[2]).toJSON();
        };
        let [currentDate, twoWeeksAgo, twoWeeksFromNow] = Array(3)
          .fill()
          .map(() => {
            return new Date();
          });
        twoWeeksFromNow.setDate(currentDate.getDate() + 14);
        twoWeeksAgo.setDate(currentDate.getDate() - 14);
        let startDate = getJSONDateStringInLocalTimeZone(twoWeeksAgo);
        let endDate = getJSONDateStringInLocalTimeZone(twoWeeksFromNow);
        const query = `
        query {
          banners(
            filters: {
              bannerStartDate: { gte: \"${startDate}\" }
              and: [{ bannerEndDate: { lte: \"${endDate}\" } }]
            }
          ) {
            data {
              id
              attributes {
                internalBannerName
                bannerEndDate
                bannerStartDate
                bannerText
                buttonText
                buttonURL
                createdAt
                locale
                localizations {
                  data {
                    attributes {
                      locale
                      buttonText
                      buttonURL
                      bannerText
                    }
                  }
                }
                publishedAt
                shouldDeployOnMobile
                showToNewVisitors
                showToNonSustainers
                showToReturningVisitors
                showToSustainers
                updatedAt
              }
            }
          }
          modals(
            filters: {
              modalStartDate: { gte: \"${startDate}\" }
              and: [{ modalEndDate: { lte: \"${endDate}\" } }]
            }
          ) {
            data {
              id
              attributes {
                internalModalName
                buttonText
                buttonURL
                createdAt
                locale
                localizations {
                  data {
                    attributes {
                      locale
                      buttonText
                      buttonURL
                      modalHeader
                      modalText
                    }
                  }
                }
                modalEndDate
                modalStartDate
                modalHeader
                modalText
                publishedAt
                shouldDeployOnMobile
                showToNewVisitors
                showToNonSustainers
                showToReturningVisitors
                showToSustainers
                updatedAt
              }
            }
          }
          sidebarAds(
            filters: {
              startTime: { gte: \"${startDate}\" }
              and: [{ endTime: { lte: \"${endDate}\" } }]
            }
          ) {
            data {
              id
              attributes {
                buttonAboveOrBelow
                title
                bodyText
                buttonText
                buttonURL
                buttonIcon {
                  data {
                    attributes {
                      url
                      alternativeText
                    }
                  }
                }
                createdAt
                debug
                endTime
                hasBlueBackground
                internalCampaignId
                keywords
                locale
                localizations {
                  data {
                    attributes {
                      locale
                      title
                      bodyText
                      buttonText
                      buttonURL
                    }
                  }
                }
                publishedAt
                showTo
                startTime
                updatedAt
              }
            }
          }
        }
        `;
        const result = fetch(STRAPI_INSTANCE + "/graphql", {
          method: "POST",
          mode: "cors",
          cache: "no-cache",
          credentials: "omit",
          headers: {
            "Content-Type": "application/json",
          },
          redirect: "follow",
          referrerPolicy: "no-referrer",
          body: JSON.stringify({ query }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP Error: ${response.statusText}`);
            }
            return response.json();
          })
          .then((result) => {
            setStrapiData(result.data);
            setDataFromStrapiHasBeenReceived(true);
            // maybe sort by start date to choose which one should have a greater priority if more than one compatible one exists
            // e.g. there are modals with overlapping time frames
            let modals = result.data?.modals?.data;
            console.log(modals);
            let banners = result.data?.banners?.data;
            console.log(banners);

            const currentDate = new Date();
            if (modals?.length) {
              // if they end up being sorted, the first one will be the compatible one
              let modal = modals.find(
                (modal) =>
                  currentDate >= new Date(modal.attributes.modalStartDate) &&
                  currentDate <= new Date(modal.attributes.modalEndDate)
              );
              console.log("found acceptable modal:");
              console.log(modal);
              if (modal) {
                console.log("setting the modal");
                if (modal.attributes.localizations?.data?.length) {
                  let localization_attributes =
                    modal.attributes.localizations.data[0].attributes;
                  let { locale, ...hebrew_attributes } =
                    localization_attributes;
                  Object.keys(hebrew_attributes).forEach((attribute) => {
                    modal.attributes[attribute] = {
                      en: modal.attributes[attribute],
                      he: hebrew_attributes[attribute],
                    };
                  });
                  modal.attributes.locales = ["en", "he"];
                } else {
                  [
                    "modalHeader",
                    "modalText",
                    "buttonText",
                    "buttonURL",
                  ].forEach((attribute) => {
                    modal.attributes[attribute] = {
                      en: modal.attributes[attribute],
                      he: null,
                    };
                  });
                  modal.attributes.locales = ["en"];
                }
                setModal(modal.attributes);
              }
            }

            if (banners?.length) {
              let banner = banners.find(
                (b) =>
                  currentDate >= new Date(b.attributes.bannerStartDate) &&
                  currentDate <= new Date(b.attributes.bannerEndDate)
              );

              console.log("found acceptable banner:");
              console.log(banner);
              if (banner) {
                console.log("setting the banner");
                if (banner.attributes.localizations?.data?.length) {
                  let localization_attributes =
                    banner.attributes.localizations.data[0].attributes;
                  let { locale, ...hebrew_attributes } =
                    localization_attributes;
                  Object.keys(hebrew_attributes).forEach((attribute) => {
                    banner.attributes[attribute] = {
                      en: banner.attributes[attribute],
                      he: hebrew_attributes[attribute],
                    };
                  });
                  banner.attributes.locales = ["en", "he"];
                } else {
                  // Maybe have the GraphQL return null entries for each key so the same technique can be used from above?
                  ["bannerText", "buttonText", "buttonURL"].forEach(
                    (attribute) => {
                      banner.attributes[attribute] = {
                        en: banner.attributes[attribute],
                        he: null,
                      };
                    }
                  );
                  banner.attributes.locales = ["en"];
                }
                setBanner(banner.attributes);
                console.log(banner.attributes);
              }
            }
          })
          .catch((error) => {
            console.error("Failed to get strapi data: ", error);
          });
      };
      getStrapiData();
    }
  }, []);

  return (
    <StrapiDataContext.Provider
      value={{
        dataFromStrapiHasBeenReceived,
        strapiData,
        modal,
        banner,
      }}
    >
      {children}
    </StrapiDataContext.Provider>
  );
}

export {
  ContentLanguageContext,
  AdContext,
  StrapiDataProvider,
  StrapiDataContext,
};
