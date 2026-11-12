import type { StateTransport, TransportStatus } from "../types";
import { createListeners } from "./listeners";

/**
 * Two linked ends: what one sends, the other receives. For unit tests and for wiring two APIs in one page.
 *
 * Delivery is asynchronous (queueMicrotask), as it is over every real transport, so tests do not pass by relying on synchronous
 * delivery. Messages go through a JSON round trip, so a test catches a message a real transport could not carry (functions,
 * undefined fields, Maps), and the receiver never shares an object with the sender. Closing either end closes both.
 */
export function createMemoryPair<M>(): [StateTransport<M>, StateTransport<M>] {
  let status: TransportStatus = "open";
  const message = [createListeners<M>(), createListeners<M>()] as const;
  const statusListeners = [createListeners<TransportStatus>(), createListeners<TransportStatus>()] as const;

  function close() {
    if (status === "closed") return;
    status = "closed";
    statusListeners[0].emit("closed");
    statusListeners[1].emit("closed");
    message[0].clear();
    message[1].clear();
  }

  function end(self: 0 | 1): StateTransport<M> {
    const peer = self === 0 ? 1 : 0;
    return {
      send(msg) {
        if (status === "closed") return;
        const json = JSON.stringify(msg);
        queueMicrotask(() => {
          // Closed in between: a closed transport delivers nothing.
          if (status === "closed" || json === undefined) return;
          message[peer].emit(JSON.parse(json) as M);
        });
      },
      onMessage: (cb) => message[self].add(cb),
      onStatus: (cb) => statusListeners[self].add(cb),
      get status() {
        return status;
      },
      close,
    };
  }

  return [end(0), end(1)];
}
