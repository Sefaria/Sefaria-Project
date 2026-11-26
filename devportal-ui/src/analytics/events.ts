// Contract C8: GA4 event names and parameters (PLAN §2.13; devportal/contracts/C8_analytics.md).
// Nothing else may be sent. Parameters never carry parameter values, search text or API keys.

/** Where a Discord CTA sits (PLAN §2.13, I-3). */
export const DISCORD_PLACEMENTS = [
  'home_hero',
  'home_community',
  'sidebar_footer',
  'docs_page_end',
  'reference_request_panel',
  'contact_page',
] as const;
export type DiscordPlacement = (typeof DISCORD_PLACEMENTS)[number];

/** The Copy Page split button and its menu items, in the order PLAN §2.13 lists them. */
export const COPY_PAGE_ACTIONS = [
  'copy_markdown',
  'view_markdown',
  'open_chatgpt',
  'open_claude',
  'connect_cursor',
  'connect_vscode',
  'copy_mcp_config',
  'copy_mcp_command',
] as const;
export type CopyPageAction = (typeof COPY_PAGE_ACTIONS)[number];

/** HTTP method as Try It sends it, upper case. */
export type TryItMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Every event the portal sends, with its parameters. */
export interface AnalyticsEvents {
  /**
   * Sent by hand (the property is configured with `send_page_view: false`): exactly once on the first
   * load and once per client-side navigation, after `document.title` is set. GA4's standard parameters.
   */
  page_view: { page_title: string; page_location: string };
  discord_cta_click: { placement: DiscordPlacement };
  /** `status` is the HTTP status, or 0 when the request failed without a response (network, CORS). */
  try_it_run: { operation_id: string; method: TryItMethod; status: number };
  copy_page_action: { action: CopyPageAction };
  /** Once per page view, when focus first moves into the Formstack frame on the contact page. */
  contact_form_start: Record<string, never>;
}

export type AnalyticsEventName = keyof AnalyticsEvents;

export const ANALYTICS_EVENT_NAMES = [
  'page_view',
  'discord_cta_click',
  'try_it_run',
  'copy_page_action',
  'contact_form_start',
] as const satisfies readonly AnalyticsEventName[];

/** The key events of the GA4 property (PLAN §2.13); `page_view` is not one. */
export const KEY_EVENT_NAMES = [
  'discord_cta_click',
  'try_it_run',
  'copy_page_action',
  'contact_form_start',
] as const satisfies readonly AnalyticsEventName[];

/** A call the analytics module makes: `gtag('event', name, params)`. */
export type AnalyticsEvent = {
  [Name in AnalyticsEventName]: { name: Name; params: AnalyticsEvents[Name] };
}[AnalyticsEventName];
