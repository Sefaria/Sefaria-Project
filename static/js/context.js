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
// the legacy-Strapi fallback (see getStrapiData) needs a second selection with `pageType`
// removed, and deriving both selections from one list keeps them from drifting apart.
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

// `pageType` is newer than some deployed Strapi environments. Querying a field the schema lacks
// makes GraphQL reject the WHOLE query — every banner, modal, and ad would go dark, not just the
// new feature — so getStrapiData retries once without it and the missing field then defaults to
// "no page-type restriction" downstream (normalizePageType in sefaria/pageTypes.js).
const FIELDS_UNKNOWN_TO_LEGACY_STRAPI = ["pageType"];

// Stable console prefix (same pattern as SKIPPED_ROWS_LOG) so tests — and anyone reading a
// production console — can identify a legacy-Strapi retry without matching the whole message.
const LEGACY_STRAPI_RETRY_LOG = "Strapi rejected the full query; retrying without post-freeze fields:";

const buildFieldsSelection = (fieldList) => `\n            ${fieldList.join("\n            ")}\n`;

const sidebarAdFields = buildFieldsSelection(SIDEBAR_AD_FIELD_LIST);
const legacySidebarAdFields = buildFieldsSelection(
  SIDEBAR_AD_FIELD_LIST.filter((field) => !FIELDS_UNKNOWN_TO_LEGACY_STRAPI.includes(field)),
);

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
        // A function of the sidebar-ad fields selection because the legacy-Strapi fallback below
        // re-issues the same query with the post-freeze fields stripped.
        const buildQuery = (sidebarAdFieldsSelection) => `
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
            sidebarAdFieldsSelection,
          )}
        }
        `;
        // Use the new cache endpoint instead of calling Strapi directly to minimize API calls
        const url = new URL("/api/strapi/graphql-cache", window.location.origin);
        url.searchParams.append("start_date", startDate.split("T")[0]); // Only use date part
        url.searchParams.append("end_date", endDate.split("T")[0]);

        const fetchStrapiQuery = (graphqlQuery) =>
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain",
            },
            body: graphqlQuery,
          }).then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP Error: ${response.statusText}`);
            }
            return response.json();
          });

        const result = fetchStrapiQuery(buildQuery(sidebarAdFields))
          .then((result) => {
            if (result?.data && !result.errors) return result;
            // LEGACY-STRAPI FALLBACK. A Strapi environment whose sidebar-ad content type predates
            // `pageType` rejects the whole query ({errors: [...], data: null} inside a 200), which
            // would black out every promo surface — banners and modals included — over one field.
            // Retry ONCE with the legacy field selection; rows arriving without `pageType` then
            // normalize to "no page-type restriction" (sefaria/pageTypes.js), i.e. exact
            // pre-feature behavior. The retry is deliberately unconditional on the error's text —
            // matching GraphQL message wording across Strapi versions is brittle, and a retry that
            // also fails lands in the same guard below either way. Logged loudly (not swallowed)
            // so a mis-deployed environment is visible in the console, not just quietly degraded.
            console.error(
              `${LEGACY_STRAPI_RETRY_LOG} ${JSON.stringify(result?.errors ?? null).slice(0, 300)}`,
            );
            return fetchStrapiQuery(buildQuery(legacySidebarAdFields));
          })
          .then((result) => {
            // GraphQL reports failures INSIDE a 200 response ({errors: [...], data: null}), and
            // the cache endpoint passes those through uncached (sefaria/views.py). Treat them
            // like the network failures they morally are. Without this guard a transient error
            // is indistinguishable from "nothing published": the dismissal-key cleanup below
            // would wipe every viewer's dismissal state, re-showing dismissed campaigns the
            // moment the error clears. A REAL nothing-published response still carries a data
            // OBJECT (with empty per-locale arrays), so it passes this check and proceeds.
            // By this point the legacy retry above has already had its one chance, so an error
            // here — from either attempt — is terminal for this fetch.
            if (!result?.data || result.errors) {
              throw new Error(
                "Strapi response carried no data" +
                  (result?.errors ? `: ${JSON.stringify(result.errors).slice(0, 200)}` : ""),
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
