/** Analytics: the only module that talks to GA4 / GTM / Simple Analytics / Sentry. See core.ts. */
export { analyticsLog, bothEvent, gtagEvent, oncePerSession, saEvent, uaEvent, type AnalyticsParams, type LoggedEvent } from "./core";
export { attachDeclarativeAnalytics, collectAnalytics, DEFAULT_EVENT_TYPES } from "./declarative";
export { analyticsHeadScripts, saMetadataScript, simpleAnalyticsScript } from "./scripts";
export { copyEvents, setAnalyticsUser, setSaMetadata, useAppAnalytics, useOnceFullyVisible, visitor } from "./session";
export { initSentry } from "./sentry";
export { searchBoxAnalytics } from "./search-box";
export { readerAnalytics } from "./reader";
export { searchFlow, tabLabel, type SearchApi } from "./search-flow";
