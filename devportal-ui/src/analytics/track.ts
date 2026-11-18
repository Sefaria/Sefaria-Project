// The portal's analytics event bus (contract C8). Components never call gtag: they dispatch a
// `dp-analytics` DOM event on window (the name src/docs/contactForm.ts already uses), and the analytics
// module (`startAnalytics`) checks it against C8 and forwards it. With no measurement id configured
// nothing listens and nothing is sent.
import {
  COPY_PAGE_ACTIONS,
  DISCORD_PLACEMENTS,
  KEY_EVENT_NAMES,
  type AnalyticsEvent,
  type AnalyticsEvents,
  type TryItMethod,
} from './events';

/** The window event the analytics module listens for; `detail` is `{ name, params }`. */
export const ANALYTICS_EVENT = 'dp-analytics';

/** Put on any link that is a Discord CTA, with the placement as value (C8 `placement`). */
export const DISCORD_CTA_ATTRIBUTE = 'data-discord-cta';

export type KeyEventName = (typeof KEY_EVENT_NAMES)[number];

export interface AnalyticsEventDetail {
  name: string;
  params?: unknown;
}

/** Reports a key event (C8). Safe to call when analytics is off. */
export function track<Name extends KeyEventName>(
  name: Name,
  ...params: AnalyticsEvents[Name] extends Record<string, never> ? [] : [AnalyticsEvents[Name]]
): void {
  if (typeof window === 'undefined') return;
  const detail: AnalyticsEventDetail = { name, params: params[0] ?? {} };
  window.dispatchEvent(new CustomEvent(ANALYTICS_EVENT, { detail }));
}

const METHODS: readonly TryItMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
// An OpenAPI operationId: an identifier, never a filled-in URL or a parameter value.
const OPERATION_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/**
 * The C8 event for a bus message, keeping only the parameters C8 names and only values from their
 * allowed sets; null when the message is not a key event or a parameter is not allowed. This is what
 * keeps parameter values, search text and keys out of GA4 whatever a caller passes.
 */
export function sanitizeEvent(detail: unknown): AnalyticsEvent | null {
  const { name, params } = record(detail) as { name?: unknown; params?: unknown };
  if (!oneOf(KEY_EVENT_NAMES, name)) return null;
  const p = record(params);
  switch (name) {
    case 'discord_cta_click':
      return oneOf(DISCORD_PLACEMENTS, p.placement) ? { name, params: { placement: p.placement } } : null;
    case 'copy_page_action':
      return oneOf(COPY_PAGE_ACTIONS, p.action) ? { name, params: { action: p.action } } : null;
    case 'try_it_run': {
      const method = typeof p.method === 'string' ? p.method.toUpperCase() : '';
      const status = p.status;
      if (typeof p.operation_id !== 'string' || !OPERATION_ID.test(p.operation_id)) return null;
      if (!oneOf(METHODS, method)) return null;
      if (typeof status !== 'number' || !Number.isInteger(status) || status < 0 || status > 599) return null;
      return { name, params: { operation_id: p.operation_id, method, status } };
    }
    case 'contact_form_start':
      return { name, params: {} };
  }
}
