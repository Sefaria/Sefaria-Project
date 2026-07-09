import React, { useContext, useEffect, useState } from "react";

const ReaderPanelContext = React.createContext({
  language: "english",
});
ReaderPanelContext.displayName = "ContentLanguageContext"; //This lets us see this name in the devtools

const AdContext = React.createContext({});
AdContext.displayName = "AdContext";

const StrapiDataContext = React.createContext({});
StrapiDataContext.displayName = "StrapiDataContext";

// Flattens Strapi's { data: [{ id, attributes }] } collection shape into a
// plain array of plain objects. Unwrapped, e.g. `sidebarAds` is a truthy
// object, not an array, so Promotions.jsx's `sidebarAds.forEach(...)`
// throws and crashes the tree (no error boundary above it).
const unwrapStrapiCollection = (collection) => {
  const entries = collection?.data ?? [];
  return entries.map((entry) =>
    entry?.attributes ? { ...entry.attributes, id: entry.id } : entry
  );
};

// Flattens Strapi's { data: { id, attributes } | null } single-relation
// shape (e.g. sidebarAd.buttonIcon) into a plain object, or null if unset.
const unwrapStrapiRelation = (relation) => {
  if (!relation || typeof relation !== 'object' || !('data' in relation)) return relation;
  const entry = relation.data;
  return entry?.attributes ? { ...entry.attributes, id: entry.id } : entry;
};

// Gets data from a Strapi CMS instance to be used for displaying static content
function StrapiDataProvider({ children }) {
  const [dataFromStrapiHasBeenReceived, setDataFromStrapiHasBeenReceived] =
    useState(false);
  const [strapiData, setStrapiData] = useState(null);
  const [modal, setModal] = useState(null);
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    if (typeof STRAPI_INSTANCE !== "undefined" && STRAPI_INSTANCE) {
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
            documentId
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
              locale
              buttonText
              buttonURL
              bannerText
            }
            publishedAt
            shouldDeployOnMobile
            showToNewVisitors
            showToNonSustainers
            showToReturningVisitors
            showToSustainers
            showTo
            updatedAt
          }
          modals(
            filters: {
              modalStartDate: { gte: \"${startDate}\" }
              and: [{ modalEndDate: { lte: \"${endDate}\" } }]
            }
          ) {
            documentId
            internalModalName
            buttonText
            buttonURL
            showDelay
            createdAt
            locale
            localizations {
              locale
              buttonText
              buttonURL
              modalHeader
              modalText
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
            showTo
            updatedAt
          }
          sidebarAds(
            filters: {
              startTime: { gte: \"${startDate}\" }
              and: [{ endTime: { lte: \"${endDate}\" } }]
            }
          ) {
            documentId
            buttonAboveOrBelow
            title
            bodyText
            buttonText
            buttonURL
            buttonIcon {
              url
              alternativeText
            }
            createdAt
            debug
            endTime
            hasBlueBackground
            internalCampaignId
            keywords
            locale
            localizations {
              locale
              title
              bodyText
              buttonText
              buttonURL
            }
            publishedAt
            showTo
            startTime
            updatedAt
            isNewsletterSubscriptionInputForm
            newsletterMailingLists {
              newsletterName
            }
          }
        }
        `;
        // Use the new cache endpoint instead of calling Strapi directly to minimize API calls
        const url = new URL("/api/strapi/graphql-cache", window.location.origin);
        url.searchParams.append('start_date', startDate.split('T')[0]); // Only use date part
        url.searchParams.append('end_date', endDate.split('T')[0]);

        const result = fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          body: query,
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP Error: ${response.statusText}`);
            }
            return response.json();
          })
          .then((result) => {
            // Unwrap before anything else touches it — see unwrapStrapiCollection.
            const data = {
              ...result.data,
              banners: unwrapStrapiCollection(result.data?.banners),
              modals: unwrapStrapiCollection(result.data?.modals),
              sidebarAds: unwrapStrapiCollection(result.data?.sidebarAds),
            };
            setStrapiData(data);
            setDataFromStrapiHasBeenReceived(true);

            // Decompose the modals and banners from the GraphQL query response for easier handling
            let modals = data.modals;
            let banners = data.banners;

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
                  currentDate >= new Date(modal.modalStartDate) &&
                  currentDate <= new Date(modal.modalEndDate)
              );
              if (modal) {
                // Remove any other previous modals since there is potentially new modal to replace it
                // However, do not remove the existing modal if the eligible one found is the same as the current one
                removeContentKeysFromLocalStorage({
                  prefix: "modal_",
                  except: modal.internalModalName,
                });

                // Check if there is a Hebrew translation for the modal
                let modalLocalizations = unwrapStrapiCollection(modal.localizations);
                if (modalLocalizations.length) {
                  let localization_attributes = modalLocalizations[0];
                  // Ignore the locale because only Hebrew is supported currently
                  let { locale, ...hebrew_attributes } =
                    localization_attributes;
                  // Iterate over the localizable attributes in parallel to create an object compatible for use in an InterfaceText
                  Object.keys(hebrew_attributes).forEach((attribute) => {
                    modal[attribute] = {
                      en: modal[attribute],
                      he: hebrew_attributes[attribute],
                    };
                  });
                  modal.locales = ["en", "he"];
                } else {
                  [
                    "modalHeader",
                    "modalText",
                    "buttonText",
                    "buttonURL",
                  ].forEach((attribute) => {
                    modal[attribute] = {
                      en: modal[attribute],
                      he: null,
                    };
                  });
                  modal.locales = ["en"];
                }
                setModal(modal);
              }
            }

            if (banners?.length) {
              // Only one banner can be displayed currently. The first one that matches will be the one shown
              let banner = banners.find(
                (b) =>
                  currentDate >= new Date(b.bannerStartDate) &&
                  currentDate <= new Date(b.bannerEndDate)
              );

              if (banner) {
                // Remove any other previous banner since there is potentially new modal to replace it
                // However, do not remove the existing banner if the eligible one found is the same as the current one
                removeContentKeysFromLocalStorage({
                  prefix: "banner_",
                  except: banner.internalBannerName,
                });

                // Check if there is a Hebrew translation
                let bannerLocalizations = unwrapStrapiCollection(banner.localizations);
                if (bannerLocalizations.length) {
                  let localization_attributes = bannerLocalizations[0];
                  // Get the hebrew attributes
                  let { locale, ...hebrew_attributes } =
                    localization_attributes;
                  // Iterate over the localizable attributes in parallel to create an object compatible for use in an InterfaceText
                  Object.keys(hebrew_attributes).forEach((attribute) => {
                    banner[attribute] = {
                      en: banner[attribute],
                      he: hebrew_attributes[attribute],
                    };
                  });
                  banner.locales = ["en", "he"];
                } else {
                  // TODO: Make the GraphQL query return nilable attributes so the attributes (just their keys) can be iterated over within the localization object
                  ["bannerText", "buttonText", "buttonURL"].forEach(
                    (attribute) => {
                      banner[attribute] = {
                        en: banner[attribute],
                        he: null,
                      };
                    }
                  );
                  banner.locales = ["en"];
                }
                setBanner(banner);
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
  ReaderPanelContext,
  AdContext,
  StrapiDataProvider,
  StrapiDataContext,
  unwrapStrapiCollection,
  unwrapStrapiRelation,
};
