// src/reference (PLAN §2.1): the endpoint article, parameters, schemas, playground, code samples, Try It and
// Recent Requests. W3, Phase 2.
//
// The shell renders an endpoint page as:
//   <Endpoint op={spec} apiOrigin={payload.site.apiOrigin} title={payload.page.title}
//             descriptionHtml={payload.page.descriptionHtml} bodyHtml={payload.page.bodyHtml}
//             headerActions={<CopyPageMenu …/>} footer={<PageFooter …/>} discordButton={<DiscordButton …/>}
//             onAnalyticsEvent={track} />
// where `spec` is the C3 file at `payload.operation.specUrl` (loadOperationSpec).
export {
  Endpoint,
  EndpointArticle,
  EndpointPlayground,
  EndpointProvider,
  type EndpointArticleProps,
  type EndpointProps,
  type EndpointProviderProps,
} from './Endpoint';
export { loadOperationSpec } from './spec/load';
export { LANGUAGE_KEY } from './state';
export { RECENT_REQUESTS_KEY, RECENT_REQUESTS_MAX } from './tryit/recent';
