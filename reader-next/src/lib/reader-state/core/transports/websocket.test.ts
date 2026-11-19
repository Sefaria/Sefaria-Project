import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransportStatus } from "../types";
import { createWebSocketTransport, MAX_FRAME_BYTES } from "./websocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static last(): FakeWebSocket {
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!ws) throw new Error("no socket was created");
    return ws;
  }
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closedWith: number | undefined;
  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  send(text: string) {
    this.sent.push(text);
  }
  close(code?: number) {
    this.closedWith = code;
  }
  // test helpers
  open() {
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
  drop() {
    this.onerror?.();
    this.onclose?.();
  }
}

describe("createWebSocketTransport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(Math, "random").mockReturnValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("connects at once with the url and protocols; connecting → open", () => {
    const t = createWebSocketTransport("wss://room.example/s", { protocols: ["v1"] });
    const statuses: TransportStatus[] = [];
    t.onStatus((s) => statuses.push(s));
    expect(t.status).toBe("connecting");
    expect(FakeWebSocket.last().url).toBe("wss://room.example/s");
    expect(FakeWebSocket.last().protocols).toEqual(["v1"]);
    FakeWebSocket.last().open();
    expect(t.status).toBe("open");
    expect(statuses).toEqual(["open"]);
    t.close();
  });

  it("sends and receives JSON frames", () => {
    const t = createWebSocketTransport<{ a: number }>("wss://x");
    const got = vi.fn();
    t.onMessage(got);
    const ws = FakeWebSocket.last();
    ws.open();
    t.send({ a: 1 });
    expect(ws.sent).toEqual(['{"a":1}']);
    ws.receive('{"a":2}');
    ws.receive("{bad json");
    ws.receive(new ArrayBuffer(4));
    expect(got).toHaveBeenCalledTimes(1);
    expect(got).toHaveBeenCalledWith({ a: 2 });
    t.close();
  });

  it("queues sends while connecting, bounded, dropping the oldest; flushes in order on open", () => {
    const t = createWebSocketTransport<number>("wss://x", { maxQueue: 3 });
    for (let i = 1; i <= 5; i++) t.send(i);
    const ws = FakeWebSocket.last();
    expect(ws.sent).toEqual([]);
    ws.open();
    expect(ws.sent).toEqual(["3", "4", "5"]);
    t.close();
  });

  it("drops frames over 16 KB both ways, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = createWebSocketTransport<string>("wss://x");
    const got = vi.fn();
    t.onMessage(got);
    const ws = FakeWebSocket.last();
    ws.open();
    const big = "x".repeat(MAX_FRAME_BYTES);
    t.send(big); // + 2 quote bytes → over
    expect(ws.sent).toEqual([]);
    ws.receive(JSON.stringify(big));
    expect(got).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    // Multi-byte characters count in UTF-8 bytes.
    t.send("א".repeat(MAX_FRAME_BYTES / 2));
    expect(ws.sent).toEqual([]);
    t.send("small");
    expect(ws.sent).toEqual(['"small"']);
    t.close();
  });

  it("reconnects with exponential back-off capped at maxMs, and resets after a successful open", () => {
    const t = createWebSocketTransport<number>("wss://x", { backoff: { initialMs: 100, maxMs: 400 } });
    const statuses: TransportStatus[] = [];
    t.onStatus((s) => statuses.push(s));
    FakeWebSocket.last().open();
    FakeWebSocket.last().drop();
    expect(t.status).toBe("connecting");
    expect(FakeWebSocket.instances).toHaveLength(1);
    // random() = 1 → the full base delay: 100, 200, 400, 400 (capped).
    for (const ms of [100, 200, 400, 400]) {
      const before = FakeWebSocket.instances.length;
      vi.advanceTimersByTime(ms - 1);
      expect(FakeWebSocket.instances).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(before + 1);
      FakeWebSocket.last().drop();
    }
    vi.advanceTimersByTime(400);
    FakeWebSocket.last().open();
    expect(t.status).toBe("open");
    FakeWebSocket.last().drop();
    const before = FakeWebSocket.instances.length;
    vi.advanceTimersByTime(100);
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
    expect(statuses).toEqual(["open", "connecting", "open", "connecting"]);
    t.close();
  });

  it("jitters: the delay is at least half the back-off", () => {
    vi.mocked(Math.random).mockReturnValue(0);
    createWebSocketTransport<number>("wss://x", { backoff: { initialMs: 1000, maxMs: 10_000 } });
    FakeWebSocket.last().drop();
    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("queues sends made while reconnecting", () => {
    const t = createWebSocketTransport<number>("wss://x", { backoff: { initialMs: 10, maxMs: 10 } });
    FakeWebSocket.last().open();
    FakeWebSocket.last().drop();
    t.send(7);
    vi.advanceTimersByTime(10);
    const ws = FakeWebSocket.last();
    ws.open();
    expect(ws.sent).toEqual(["7"]);
    t.close();
  });

  it("close by the caller: closed status once, socket closed, no reconnect, nothing delivered", () => {
    const t = createWebSocketTransport<number>("wss://x", { backoff: { initialMs: 10, maxMs: 10 } });
    const statuses: TransportStatus[] = [];
    const got = vi.fn();
    t.onStatus((s) => statuses.push(s));
    t.onMessage(got);
    const ws = FakeWebSocket.last();
    ws.open();
    t.close();
    t.close();
    expect(ws.closedWith).toBe(1000);
    expect(t.status).toBe("closed");
    expect(statuses).toEqual(["open", "closed"]);
    ws.drop();
    ws.receive("1");
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(got).not.toHaveBeenCalled();
    t.send(1);
    expect(ws.sent).toEqual([]);
  });

  it("close during back-off cancels the pending reconnect", () => {
    const t = createWebSocketTransport<number>("wss://x", { backoff: { initialMs: 10, maxMs: 10 } });
    FakeWebSocket.last().drop();
    t.close();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("is born closed where WebSocket does not exist (SSR)", () => {
    vi.stubGlobal("WebSocket", undefined);
    const t = createWebSocketTransport<number>("wss://x");
    expect(t.status).toBe("closed");
    expect(() => t.send(1)).not.toThrow();
  });

  it("gives up when the constructor throws (malformed url)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          throw new SyntaxError("bad url");
        }
      },
    );
    const t = createWebSocketTransport<number>("nope");
    expect(t.status).toBe("closed");
  });
});
