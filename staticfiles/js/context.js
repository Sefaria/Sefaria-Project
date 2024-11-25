import React, { useContext, useEffect, useState } from "react";

const ContentLanguageContext = React.createContext({
  language: "english",
});
ContentLanguageContext.displayName = "ContentLanguageContext"; //This lets us see this name in the devtools

const AdContext = React.createContext({});
AdContext.displayName = "AdContext";

const StrapiDataContext = React.createContext({});
StrapiDataContext.displayName = "StrapiDataContext";

// Gets data from a Strapi CMS instance to be used for displaying static content
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
        // The GraphQL query has a filter for each content type to find instances that have start dates earlier than the present time
        // Content type instances will be found that are one month within their start date. Their date range can't exceed one month
        // There is no conflict resolution for overlapping timeframes
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
                showDelay
                bannerBackgroundColor
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
                showDelay
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

            // Decompose the modals and banners from the GraphQL query response for easier handling
            let modals = result.data?.modals?.data;
            let banners = result.data?.banners?.data;

            let removeContentKeysFromLocalStorage = ({ prefix = "", except = "" } = {}) => {
              let keysToRemove = [];
              // Removing keys while iterating affects the length of localStorage
              for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (
                  key.startsWith(prefix) &&
                  (except === "" || key !== prefix + except)
                ) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach((key) => {
                localStorage.removeItem(key);
              });
            };

            const currentDate = new Date();
            if (modals?.length) {
              // Only one modal can be displayed currently. The first one that matches will be the one shown
              let modal = modals.find(
                (modal) =>
                  currentDate >= new Date(modal.attributes.modalStartDate) &&
                  currentDate <= new Date(modal.attributes.modalEndDate)
              );
              if (modal) {
                // Remove any other previous modals since there is potentially new modal to replace it
                // However, do not remove the existing modal if the eligible one found is the same as the current one
                removeContentKeysFromLocalStorage({
                  prefix: "modal_",
                  except: modal.attributes.internalModalName,
                });

                // Check if there is a Hebrew translation for the modal
                if (modal.attributes.localizations?.data?.length) {
                  let localization_attributes =
                    modal.attributes.localizations.data[0].attributes;
                  // Ignore the locale because only Hebrew is supported currently
                  let { locale, ...hebrew_attributes } =
                    localization_attributes;
                  // Iterate over the localizable attributes in parallel to create an object compatible for use in an InterfaceText
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
              // Only one banner can be displayed currently. The first one that matches will be the one shown
              let banner = banners.find(
                (b) =>
                  currentDate >= new Date(b.attributes.bannerStartDate) &&
                  currentDate <= new Date(b.attributes.bannerEndDate)
              );

              if (banner) {
                // Remove any other previous banner since there is potentially new modal to replace it
                // However, do not remove the existing banner if the eligible one found is the same as the current one
                removeContentKeysFromLocalStorage({
                  prefix: "banner_",
                  except: banner.attributes.internalBannerName,
                });

                // Check if there is a Hebrew translation
                if (banner.attributes.localizations?.data?.length) {
                  let localization_attributes =
                    banner.attributes.localizations.data[0].attributes;
                  // Get the hebrew attributes
                  let { locale, ...hebrew_attributes } =
                    localization_attributes;
                  // Iterate over the localizable attributes in parallel to create an object compatible for use in an InterfaceText
                  Object.keys(hebrew_attributes).forEach((attribute) => {
                    banner.attributes[attribute] = {
                      en: banner.attributes[attribute],
                      he: hebrew_attributes[attribute],
                    };
                  });
                  banner.attributes.locales = ["en", "he"];
                } else {
                  // TODO: Make the GraphQL query return nilable attributes so the attributes (just their keys) can be iterated over within the localization object
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
        strapiData, // All the data returned from the GraphQL query is here but only Promotions uses it in this current state
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
