/**
 * The messages between the reader and an asset in its sandboxed frame (LINKED_PANELS_AND_ASSETS_PLAN.md §5.2–5.3).
 *
 * Connection: the frame's origin is opaque (sandbox="allow-scripts" without same-origin), so origins cannot be checked. The asset posts
 * `{type: "sefaria:ready", v: 1}` to its parent; the reader accepts it only from its own frame's window (`event.source`) and answers
 * `{type: "sefaria:connect", v: 1}` with one end of a MessageChannel. Every later message travels on that port: nothing on the window.
 *
 * Reader → asset: `init` (once), then `place` whenever the linked text panel settles on a segment.
 * Asset → reader: `place` (the asset now shows this: move the text there) and `open` (take the text panel to another text).
 * The asset can only move the panel it is linked to: it gets no snapshot, no address, no viewer.
 *
 * @feature SHL-094 Asset protocol
 */
import { z } from "zod";

export const PROTOCOL_VERSION = 1;

export type PlaceCause = "user" | "link" | "replay";

export interface InitMessage {
  type: "init";
  v: typeof PROTOCOL_VERSION;
  theme: "light" | "dark" | "sepia";
  interfaceLang: "english" | "hebrew";
  dir: "ltr" | "rtl";
  /** Where it is shown: a panel beside a text, inside a shiur, or previewed from the sidebar. */
  context: "panel" | "shiur" | "sidebar";
  place?: { ref: string; segments: string[] };
}
export interface PlaceToAsset {
  type: "place";
  ref: string;
  segments: string[];
  cause: PlaceCause;
}
export type ToAsset = InitMessage | PlaceToAsset;

const ref = z.string().trim().min(1).max(300);
export const fromAssetSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("place"), ref }), z.object({ type: z.literal("open"), ref })]);
export type FromAsset = z.infer<typeof fromAssetSchema>;

/** Is this window message the asset's hello? */
export const isReady = (data: unknown): boolean =>
  !!data && typeof data === "object" && (data as { type?: unknown }).type === "sefaria:ready" && (data as { v?: unknown }).v === PROTOCOL_VERSION;

/** At most this many messages a second from an asset; the rest are dropped. */
export const MAX_MESSAGES_PER_SECOND = 10;
/** After the reader sends the asset a place, the asset's own place reports are ignored this long (its echo). */
export const ECHO_WINDOW_MS = 400;

/** A token bucket for the asset's messages. */
export function rateLimiter(perSecond = MAX_MESSAGES_PER_SECOND, now: () => number = () => Date.now()) {
  let tokens = perSecond;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(perSecond, tokens + ((t - last) / 1000) * perSecond);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
