import type { StateTransport, TransportStatus } from "../types";
import { createListeners, utf8Bytes } from "./listeners";

/** The relay refuses frames over 16 KB (docs/READER_STATE_API.md, "Limits"); dropping them here saves the round trip. */
export const MAX_FRAME_BYTES = 16 * 1024;

export interface WebSocketTransportOptions {
  protocols?: string | string[];
  /** Reconnect delays: initialMs, doubling per failed attempt up to maxMs, each jittered. Default { initialMs: 500, maxMs: 30_000 }. */
  backoff?: { initialMs: number; maxMs: number };
  /** Messages kept while connecting; the oldest are dropped past this (a keyframe on reconnect supersedes them). Default 100. */
  maxQueue?: number;
}

/**
 * The room over a WebSocket: JSON text frames, and reconnection until the caller closes it.
 *
 * Status goes connecting → open, back to connecting when the socket drops (with exponential back-off and jitter, so a relay restart
 * is not met by every client at once), and closed only when the caller closes (or WebSocket does not exist: SSR, where the transport
 * is born closed and nothing touches WebSocket at import time). Sends made while connecting are queued and flushed on open.
 */
export function createWebSocketTransport<M>(
  url: string,
  { protocols, backoff = { initialMs: 500, maxMs: 30_000 }, maxQueue = 100 }: WebSocketTransportOptions = {},
): StateTransport<M> {
  const messages = createListeners<M>();
  const statuses = createListeners<TransportStatus>();
  let status: TransportStatus = "connecting";
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  const queue: string[] = [];

  function setStatus(next: TransportStatus) {
    if (status === next) return;
    status = next;
    statuses.emit(next);
  }

  function delay(): number {
    const base = Math.min(backoff.maxMs, backoff.initialMs * 2 ** attempt);
    // "Equal jitter": at least half the back-off, so retries never collapse to zero, and spread over the other half.
    return base / 2 + Math.random() * (base / 2);
  }

  function scheduleReconnect() {
    if (status === "closed" || timer !== null) return;
    setStatus("connecting");
    const ms = delay();
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, ms);
  }

  function connect() {
    if (status === "closed") return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, protocols);
    } catch (err) {
      // A malformed URL never becomes valid: give up instead of retrying forever.
      console.warn("WebSocket transport: cannot connect", err);
      shutdown();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      attempt = 0;
      setStatus("open");
      while (queue.length > 0 && socket === ws && status === "open") ws.send(queue.shift()!);
    };
    ws.onmessage = (event: MessageEvent) => {
      if (socket !== ws || status === "closed") return;
      if (typeof event.data !== "string") return;
      if (utf8Bytes(event.data) > MAX_FRAME_BYTES) {
        console.warn(`WebSocket transport: dropped an incoming frame over ${MAX_FRAME_BYTES} bytes`);
        return;
      }
      let msg: M;
      try {
        msg = JSON.parse(event.data) as M;
      } catch {
        return;
      }
      messages.emit(msg);
    };
    // An error is always followed by close; reconnecting happens there, once.
    ws.onerror = () => {};
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      scheduleReconnect();
    };
  }

  function shutdown() {
    if (status === "closed") return;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const ws = socket;
    socket = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close(1000);
      } catch {
        // already closing
      }
    }
    queue.length = 0;
    setStatus("closed");
    messages.clear();
  }

  if (typeof WebSocket === "undefined") status = "closed";
  else connect();

  return {
    send(msg) {
      if (status === "closed") return;
      const text = JSON.stringify(msg);
      if (text === undefined) return;
      if (utf8Bytes(text) > MAX_FRAME_BYTES) {
        console.warn(`WebSocket transport: dropped an outgoing frame over ${MAX_FRAME_BYTES} bytes`);
        return;
      }
      if (status === "open" && socket) {
        socket.send(text);
        return;
      }
      queue.push(text);
      while (queue.length > maxQueue) queue.shift();
    },
    onMessage: (cb) => messages.add(cb),
    onStatus: (cb) => statuses.add(cb),
    get status() {
      return status;
    },
    close: shutdown,
  };
}
