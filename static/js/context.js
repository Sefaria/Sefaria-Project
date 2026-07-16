import React, { useContext, useEffect, useState } from "react";
import {
  SUPPORTED_LOCALES,
  LOCALIZED_FIELDS,
  mapLocales,
  groupByDocumentId,
  buildInterfaceTextDoc,
} from "./sefaria/strapiLocalization";

const ReaderPanelContext = React.createContext({
  language: "english",
});
ReaderPanelContext.displayName = "ContentLanguageContext"; //This lets us see this name in the devtools

const AdContext = React.createContext({});
AdContext.displayName = "AdContext";

const StrapiDataContext = React.createContext({});
StrapiDataContext.displayName = "StrapiDataContext";

// Each content type's fields, queried per locale (below) instead of a single default-locale
// query with a `localizations` child - that older shape could only ever discover documents
// that have an English version, since a Strapi collection query with no `locale` argument
// returns only the default locale. `documentId` is stable across every locale of a document
// (Strapi v5), so it's the join key used to recombine the per-locale rows after the fetch.
const bannerFields = `
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
            publishedAt
            shouldDeployOnMobile
            showToNewVisitors
            showToNonSustainers
            showToReturningVisitors
            showToSustainers
            showTo
            countriesToTarget {
              countryMode
              countries {
                name
                code
              }
            }
            updatedAt
`;

const modalFields = `
            documentId
            internalModalName
            buttonText
            buttonURL
            showDelay
            createdAt
            locale
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
            countriesToTarget {
              countryMode
              countries {
                name
                code
              }
            }
            updatedAt
`;

const sidebarAdFields = `
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
            publishedAt
            showTo
            startTime
            updatedAt
            isNewsletterSubscriptionInputForm
            newsletterMailingLists {
              newsletterName
            }
`;

// Emits one aliased query field per supported locale (e.g. `en_banners`, `he_banners`),
// so adding a locale to SUPPORTED_LOCALES fans out to every content type automatically.
// The `en_banners:` before the real `banners` field is a GraphQL alias: it lets us query
// the same collection field once per locale in a single request and get each locale's rows
// back under a distinct response key (which rowsByLocale() reads below). Without the alias
// GraphQL treats `en_banners` as a (nonexistent) field name and rejects the query.
const buildLocalizedQueryBlock = (contentType, filtersExpression, fieldsSelection) =>
  SUPPORTED_LOCALES.map(
    (locale) => `
          ${locale}_${contentType}: ${contentType}(
            locale: "${locale}"
            filters: ${filtersExpression}
          ) {
            ${fieldsSelection}
          }
`
  ).join("\n");

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
          ${buildLocalizedQueryBlock(
            "banners",
            `{
              bannerStartDate: { gte: "${startDate}" }
              and: [{ bannerEndDate: { lte: "${endDate}" } }]
            }`,
            bannerFields
          )}
          ${buildLocalizedQueryBlock(
            "modals",
            `{
              modalStartDate: { gte: "${startDate}" }
              and: [{ modalEndDate: { lte: "${endDate}" } }]
            }`,
            modalFields
          )}
          ${buildLocalizedQueryBlock(
            "sidebarAds",
            `{
              startTime: { gte: "${startDate}" }
              and: [{ endTime: { lte: "${endDate}" } }]
            }`,
            sidebarAdFields
          )}
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
            setDataFromStrapiHasBeenReceived(true);

            // Each content type's per-locale rows, keyed by locale, e.g. {en: [...], he: [...]}
            const rowsByLocale = (contentType) =>
              mapLocales((locale) => result.data?.[`${locale}_${contentType}`] || []);

            const groupedModals = groupByDocumentId(rowsByLocale("modals"), LOCALIZED_FIELDS.modal);
            const groupedBanners = groupByDocumentId(rowsByLocale("banners"), LOCALIZED_FIELDS.banner);
            const groupedSidebarAds = groupByDocumentId(rowsByLocale("sidebarAds"), LOCALIZED_FIELDS.sidebarAd);

            // Promotions.jsx is the only consumer of strapiData; it iterates each grouped
            // ad's `locales`/`byLocale` directly, so no InterfaceText normalization needed here.
            setStrapiData({ sidebarAds: groupedSidebarAds });

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
            if (groupedModals.length) {
              // Only one modal can be displayed currently. The first one that matches will be the one shown
              let matchedModal = groupedModals.find(
                (modal) =>
                  currentDate >= new Date(modal.modalStartDate) &&
                  currentDate <= new Date(modal.modalEndDate)
              );
              if (matchedModal) {
                // Remove any other previous modals since there is potentially new modal to replace it
                // However, do not remove the existing modal if the eligible one found is the same as the current one
                removeContentKeysFromLocalStorage({
                  prefix: "modal_",
                  except: matchedModal.internalModalName,
                });
                setModal(buildInterfaceTextDoc(matchedModal, LOCALIZED_FIELDS.modal));
              }
            }

            if (groupedBanners.length) {
              // Only one banner can be displayed currently. The first one that matches will be the one shown
              let matchedBanner = groupedBanners.find(
                (b) =>
                  currentDate >= new Date(b.bannerStartDate) &&
                  currentDate <= new Date(b.bannerEndDate)
              );

              if (matchedBanner) {
                // Remove any other previous banner since there is potentially new modal to replace it
                // However, do not remove the existing banner if the eligible one found is the same as the current one
                removeContentKeysFromLocalStorage({
                  prefix: "banner_",
                  except: matchedBanner.internalBannerName,
                });
                setBanner(buildInterfaceTextDoc(matchedBanner, LOCALIZED_FIELDS.banner));
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
};
