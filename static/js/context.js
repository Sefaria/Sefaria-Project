import React, { useContext, useEffect, useState } from "react";
import {
  SUPPORTED_LOCALES,
  LOCALIZED_FIELDS,
  mapLocales,
  groupByDocumentIdWithDiagnostics,
  buildInterfaceTextDoc,
} from "./sefaria/strapiLocalization";
import {
  ContentType,
  CONTENT_FIELDS,
  selectContent,
  buildViewerContext,
} from "./sefaria/strapiSelection";

const ReaderPanelContext = React.createContext({
  language: "english",
});
ReaderPanelContext.displayName = "ContentLanguageContext"; //This lets us see this name in the devtools

const AdContext = React.createContext({});
AdContext.displayName = "AdContext";

const StrapiDataContext = React.createContext({});
StrapiDataContext.displayName = "StrapiDataContext";

// Each content type's fields, queried per locale (below) instead of a single default-locale query with a `localizations` child - 
// that older shape could only ever discover documents that have an English version, since a Strapi collection query with no `locale` argument returns only the default locale. 
// `documentId` is stable across every locale of a document (Strapi v5), so it's the join key used to recombine the per-locale rows after the fetch.
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

// Sidebar-ad fields as a LIST rather than a template string like bannerFields/modalFields above:
// one entry per field keeps additions reviewable line-by-line, and the e2e suite asserts the
// assembled query actually names its fields (the synthetic Strapi route matches the URL alone,
// so without that assertion a dropped field would leave every e2e test green — see
// strapi-sidebar-ad-page-type.spec.js).
const SIDEBAR_AD_FIELD_LIST = [
  "documentId",
  "buttonAboveOrBelow",
  "title",
  "bodyText",
  "buttonText",
  "buttonURL",
  "buttonIcon {\n              url\n              alternativeText\n            }",
  "createdAt",
  "debug",
  "endTime",
  "hasBlueBackground",
  "internalCampaignId",
  "keywords",
  "locale",
  "pageType",
  "publishedAt",
  "showTo",
  "startTime",
  "updatedAt",
  "isNewsletterSubscriptionInputForm",
  "newsletterMailingLists {\n              newsletterName\n            }",
];

// COMPATIBILITY CONTRACT: every field above must exist on the Strapi schema of every deployed
// environment. Querying a field the schema lacks makes GraphQL reject the WHOLE query, so an
// out-of-date Strapi means NO promotions render (banners, modals, and ads all stay dark) and the
// failure is logged — see the schema-mismatch note in the error guard below. This is deliberate
// (decision 2026-09-01): frontend and Strapi are always deployed compatibly, and a brief dark
// window during a deploy beats a silent-degradation mechanism whose fallback responses could be
// cached and served to healthy clients.
const buildFieldsSelection = (fieldList) => `\n            ${fieldList.join("\n            ")}\n`;

const sidebarAdFields = buildFieldsSelection(SIDEBAR_AD_FIELD_LIST);

// Emits one aliased query field per supported locale (e.g. `en_banners`, `he_banners`), so adding a locale to SUPPORTED_LOCALES fans out to every content type automatically.
// The `en_banners:` before the real `banners` field is a GraphQL alias:
// it lets us query the same collection field once per locale in a single request and get each locale's rows back under a distinct response key (which rowsByLocale() reads below).
// Without the alias GraphQL treats `en_banners` as a (nonexistent) field name and rejects the query.
const buildLocalizedQueryBlock = (contentType, filtersExpression, fieldsSelection) =>
  SUPPORTED_LOCALES.map(
    (locale) => `
          ${locale}_${contentType}: ${contentType}(
            locale: "${locale}"
            filters: ${filtersExpression}
            pagination: { limit: -1 }
          ) {
            ${fieldsSelection}
          }
`,
  ).join("\n");

// Gets data from a Strapi CMS instance to be used for displaying static content
function StrapiDataProvider({ children }) {
  const [dataFromStrapiHasBeenReceived, setDataFromStrapiHasBeenReceived] = useState(false);
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
        // The GraphQL query fetches, per content type, every document whose WHOLE date window fits
        // inside this ±14-day envelope around now (so a window can span four weeks at most). All
        // overlapping documents arrive; which ONE a viewer sees is decided below by chooseContent.
        const query = `
        query {
          ${buildLocalizedQueryBlock(
            "banners",
            `{
              bannerStartDate: { gte: "${startDate}" }
              and: [{ bannerEndDate: { lte: "${endDate}" } }]
            }`,
            bannerFields,
          )}
          ${buildLocalizedQueryBlock(
            "modals",
            `{
              modalStartDate: { gte: "${startDate}" }
              and: [{ modalEndDate: { lte: "${endDate}" } }]
            }`,
            modalFields,
          )}
          ${buildLocalizedQueryBlock(
            "sidebarAds",
            `{
              startTime: { gte: "${startDate}" }
              and: [{ endTime: { lte: "${endDate}" } }]
            }`,
            sidebarAdFields,
          )}
        }
        `;
        // Use the new cache endpoint instead of calling Strapi directly to minimize API calls
        const url = new URL("/api/strapi/graphql-cache", window.location.origin);
        url.searchParams.append("start_date", startDate.split("T")[0]); // Only use date part
        url.searchParams.append("end_date", endDate.split("T")[0]);

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
            // GraphQL reports failures INSIDE a 200 response ({errors: [...], data: null}), and
            // the cache endpoint passes those through uncached (sefaria/views.py). Treat them
            // like the network failures they morally are. Without this guard a transient error
            // is indistinguishable from "nothing published": the dismissal-key cleanup below
            // would wipe every viewer's dismissal state, re-showing dismissed campaigns the
            // moment the error clears. A REAL nothing-published response still carries a data
            // OBJECT (with empty per-locale arrays), so it passes this check and proceeds.
            if (!result?.data || result.errors) {
              const errorsJson = result?.errors ? JSON.stringify(result.errors) : "";
              // "Cannot query field" is GraphQL's schema-validation wording: the server's Strapi
              // does not have a field this frontend asks for (most likely a frontend deployed
              // ahead of a Strapi schema update — see the COMPATIBILITY CONTRACT note above).
              // Naming the diagnosis here saves whoever reads the log from hunting a transient
              // outage that is actually a version mismatch. Detection is diagnostics only — the
              // failure handling is identical either way: nothing renders until the fetch works.
              const schemaMismatchHint = /cannot query field/i.test(errorsJson)
                ? " (LIKELY SCHEMA MISMATCH: this frontend queries a field the Strapi environment lacks)"
                : "";
              throw new Error(
                `Strapi response carried no data${schemaMismatchHint}` +
                  (errorsJson ? `: ${errorsJson.slice(0, 500)}` : ""),
              );
            }
            setDataFromStrapiHasBeenReceived(true);

            // Each content type's per-locale rows, keyed by locale, e.g. {en: [...], he: [...]}
            const rowsByLocale = (contentType) =>
              mapLocales((locale) => result.data?.[`${locale}_${contentType}`] || []);

            const groupedModals = groupByDocumentIdWithDiagnostics(
              rowsByLocale("modals"),
              LOCALIZED_FIELDS.modal,
            );
            const groupedBanners = groupByDocumentIdWithDiagnostics(
              rowsByLocale("banners"),
              LOCALIZED_FIELDS.banner,
            );
            const groupedSidebarAds = groupByDocumentIdWithDiagnostics(
              rowsByLocale("sidebarAds"),
              LOCALIZED_FIELDS.sidebarAd,
            );

            // Promotions is the only consumer of strapiData; it iterates each grouped ad's `locales`/`byLocale` directly, so no InterfaceText normalization needed here.
            setStrapiData({ sidebarAds: groupedSidebarAds.documents });

            // Forget dismissals of documents that are no longer in the payload, so a campaign
            // republished much later gets a fresh chance. Dismissals of every LIVE document are
            // kept — that is what lets selection fall through to the runner-up instead of
            // re-showing something the viewer already closed.
            const removeStaleDismissals = ({ prefix, keep }) => {
              const keysToKeep = new Set(keep.map((name) => prefix + name));
              // Collect keys first, then remove: deleting while looping shifts localStorage's indexing.
              const allKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
              allKeys
                .filter((key) => key.startsWith(prefix) && !keysToKeep.has(key))
                .forEach((key) => localStorage.removeItem(key));
            };

            // Only one modal and one banner can be displayed at a time. All the viewer gates
            // (date window, locale, country, audience, dismissal) run HERE, during selection, so
            // a document this viewer can't see is skipped in favor of one they can — not chosen
            // and then suppressed at display time, which would leave the surface empty
            // (sc-45891). Among several eligible documents the most specific one wins; see
            // strapiSelection.js for the ranking tiers.
            const viewerContext = buildViewerContext();
            const chooseContent = (groupedResult, contentType, localizedFields) => {
              const docs = groupedResult.documents.map((doc) => buildInterfaceTextDoc(doc, localizedFields));
              const { storagePrefix, name } = CONTENT_FIELDS[contentType];
              // A discarded row may be the only surviving representation of a still-live
              // campaign. In that case the partial payload cannot prove the campaign vanished,
              // so preserve this content type's dismissal keys until a healthy response arrives.
              if (groupedResult.discardedRowCount === 0) {
                removeStaleDismissals({ prefix: storagePrefix, keep: docs.map((doc) => doc[name]) });
              }
              return selectContent(docs, viewerContext, contentType);
            };

            setModal(chooseContent(groupedModals, ContentType.MODAL, LOCALIZED_FIELDS.modal));
            setBanner(chooseContent(groupedBanners, ContentType.BANNER, LOCALIZED_FIELDS.banner));
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

export { ReaderPanelContext, AdContext, StrapiDataProvider, StrapiDataContext };
