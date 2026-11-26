/**
 * The reader's end of an asset's connection (lib/assets/protocol.ts): accept the frame's hello, hand it a MessagePort, send it its places,
 * and pass its own (validated, rate-limited, echo-guarded) on.
 *
 * @feature SHL-094 Asset protocol
 */
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { ECHO_WINDOW_MS, fromAssetSchema, isReady, PROTOCOL_VERSION, rateLimiter, type InitMessage, type PlaceCause, type ToAsset } from "~/lib/assets/protocol";

export interface AssetChannelOptions {
  frame: RefObject<HTMLIFrameElement | null>;
  /** The first message, built when the asset connects (its text's place at that moment). */
  init: () => Omit<InitMessage, "type" | "v">;
  /** The asset now shows this ref. */
  onPlace: (ref: string) => void;
  /** The asset asks to take its text panel to this ref. */
  onOpen: (ref: string) => void;
  /** Is the reader being driven from outside (a replay, a followed leader)? The asset's own reports are ignored meanwhile. */
  driven: () => boolean;
}

export function useAssetChannel(o: AssetChannelOptions) {
  const opts = useRef(o);
  opts.current = o;
  const port = useRef<MessagePort | null>(null);
  const sentAt = useRef(0);
  /** The segment last sent, so the same place is not sent twice in a row. */
  const sent = useRef<string | undefined>(undefined);

  useEffect(() => {
    const allow = rateLimiter();
    const onWindow = (e: MessageEvent) => {
      const frame = opts.current.frame.current;
      // only our own frame's hello; a second hello (the shim retries) while connected is ignored
      if (!frame || e.source !== frame.contentWindow || !isReady(e.data)) return;
      if (port.current) return;
      const channel = new MessageChannel();
      port.current = channel.port1;
      channel.port1.onmessage = (m: MessageEvent) => {
        if (!allow()) return;
        const parsed = fromAssetSchema.safeParse(m.data);
        if (!parsed.success) return;
        if (parsed.data.type === "open") {
          opts.current.onOpen(parsed.data.ref);
          return;
        }
        // its echo of what the reader just sent it, or anything while a replay drives the reader: not the viewer's own movement
        if (Date.now() - sentAt.current < ECHO_WINDOW_MS || opts.current.driven()) return;
        opts.current.onPlace(parsed.data.ref);
      };
      // the frame's origin is opaque (sandboxed): "*" is the only target that reaches it; the port is the capability, nothing secret is sent
      frame.contentWindow!.postMessage({ type: "sefaria:connect", v: PROTOCOL_VERSION }, "*", [channel.port2]);
      const init = opts.current.init();
      if (init.place) {
        sent.current = init.place.segments[0] ?? init.place.ref;
        sentAt.current = Date.now();
      }
      channel.port1.postMessage({ type: "init", v: PROTOCOL_VERSION, ...init } satisfies ToAsset);
    };
    window.addEventListener("message", onWindow);
    return () => {
      window.removeEventListener("message", onWindow);
      port.current?.close();
      port.current = null;
    };
  }, []);

  /** A frame that reloads (a new page) connects again. */
  const reset = useCallback(() => {
    port.current?.close();
    port.current = null;
    sent.current = undefined;
  }, []);

  /** Send the asset its text's place; false when it is not connected (yet). */
  const sendPlace = useCallback((segment: string, cause: PlaceCause) => {
    if (!port.current) return false;
    if (sent.current === segment) return true;
    sent.current = segment;
    sentAt.current = Date.now();
    port.current.postMessage({ type: "place", ref: segment, segments: [segment], cause } satisfies ToAsset);
    return true;
  }, []);

  // a stable object: the panel's effects depend on it
  return useMemo(() => ({ sendPlace, reset, connected: () => !!port.current }), [sendPlace, reset]);
}
