import type { StateTransport, TransportStatus } from "../types";
import { createListeners } from "./listeners";

export interface BroadcastChannelTransportOptions {
  /**
   * This end's id. A BroadcastChannel already skips the instance that posted, but two transports in one tab (a local room and a
   * participant, two players in a test) are different instances; the id lets each drop its own messages wherever they come back.
   */
  selfId: string;
}

/** The wire shape: a tag (so foreign posts on the same channel name are ignored), the sender and the message as JSON text. */
interface Frame {
  tag: "sefaria-reader-state";
  from: string;
  data: string;
}

function isFrame(x: unknown): x is Frame {
  if (typeof x !== "object" || x === null) return false;
  const f = x as Record<string, unknown>;
  return f.tag === "sefaria-reader-state" && typeof f.from === "string" && typeof f.data === "string";
}

/**
 * Tabs of one browser: local development and e2e tests without a server.
 *
 * Messages are sent as JSON text rather than structured-cloned objects, so this transport carries exactly what the WebSocket one
 * does (no Dates, Maps or undefined slipping through in development and failing in production), and posting never throws
 * DataCloneError. The channel is opened inside the factory, never at import time (SSR); where BroadcastChannel does not exist the
 * transport is born closed.
 */
export function createBroadcastChannelTransport<M>(
  name: string,
  { selfId }: BroadcastChannelTransportOptions,
): StateTransport<M> {
  const messages = createListeners<M>();
  const statuses = createListeners<TransportStatus>();
  let status: TransportStatus = "closed";
  let channel: BroadcastChannel | null = null;

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(name);
    status = "open";
    channel.onmessage = (event: MessageEvent) => {
      if (status === "closed") return;
      const frame: unknown = event.data;
      if (!isFrame(frame) || frame.from === selfId) return;
      let msg: M;
      try {
        msg = JSON.parse(frame.data) as M;
      } catch {
        return;
      }
      messages.emit(msg);
    };
  }

  return {
    send(msg) {
      if (status === "closed" || !channel) return;
      const data = JSON.stringify(msg);
      if (data === undefined) return;
      const frame: Frame = { tag: "sefaria-reader-state", from: selfId, data };
      channel.postMessage(frame);
    },
    onMessage: (cb) => messages.add(cb),
    onStatus: (cb) => statuses.add(cb),
    get status() {
      return status;
    },
    close() {
      if (status === "closed") return;
      status = "closed";
      if (channel) {
        channel.onmessage = null;
        channel.close();
        channel = null;
      }
      statuses.emit("closed");
      messages.clear();
    },
  };
}
