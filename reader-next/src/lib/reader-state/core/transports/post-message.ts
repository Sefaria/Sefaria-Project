import type { StateTransport, TransportStatus } from "../types";
import { createListeners } from "./listeners";

export interface PostMessageTransportOptions {
  /** The peer: an iframe's contentWindow, window.parent or window.opener. */
  target: Window;
  /** Where our messages may go: the peer's exact origin. "*" is refused, since a message could then reach any page loaded there. */
  targetOrigin: string;
  /** The origins we accept messages from (exact match against event.origin). Everything else is dropped. */
  allowedOrigins: string[];
  /** A tag both sides agree on, so other postMessage traffic on the page (analytics, extensions, other widgets) is ignored. */
  channel: string;
  /** The window to listen on. Default: the global window. */
  self?: Window;
}

interface Frame {
  channel: string;
  data: string;
}

/**
 * An embedding page and the reader in its iframe (or a popup). Every incoming message is untrusted: it must come from the target
 * window, from an allowed origin, and carry our channel tag and JSON text, or it is dropped silently. Messages are JSON text for the
 * same reason as over BroadcastChannel: what arrives is exactly what a WebSocket would carry, and the caller still validates it.
 */
export function createPostMessageTransport<M>({
  target,
  targetOrigin,
  allowedOrigins,
  channel,
  self,
}: PostMessageTransportOptions): StateTransport<M> {
  if (targetOrigin === "*") throw new Error('createPostMessageTransport: targetOrigin "*" is not allowed');
  const messages = createListeners<M>();
  const statuses = createListeners<TransportStatus>();
  const allowed = new Set(allowedOrigins);
  const host: Window | undefined = self ?? (typeof window !== "undefined" ? window : undefined);
  let status: TransportStatus = host ? "open" : "closed";

  const onMessage = (event: MessageEvent) => {
    if (status === "closed") return;
    if (!allowed.has(event.origin)) return;
    if (event.source !== target) return;
    const frame: unknown = event.data;
    if (typeof frame !== "object" || frame === null) return;
    const f = frame as Partial<Frame>;
    if (f.channel !== channel || typeof f.data !== "string") return;
    let msg: M;
    try {
      msg = JSON.parse(f.data) as M;
    } catch {
      return;
    }
    messages.emit(msg);
  };
  host?.addEventListener("message", onMessage);

  return {
    send(msg) {
      if (status === "closed") return;
      const data = JSON.stringify(msg);
      if (data === undefined) return;
      const frame: Frame = { channel, data };
      target.postMessage(frame, targetOrigin);
    },
    onMessage: (cb) => messages.add(cb),
    onStatus: (cb) => statuses.add(cb),
    get status() {
      return status;
    },
    close() {
      if (status === "closed") return;
      status = "closed";
      host?.removeEventListener("message", onMessage);
      statuses.emit("closed");
      messages.clear();
    },
  };
}
