import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBroadcastChannelTransport } from "./broadcast-channel";

/** A fake BroadcastChannel: delivers to every other open instance of the same name, asynchronously, with a structured clone. */
class FakeBroadcastChannel {
  static all = new Set<FakeBroadcastChannel>();
  onmessage: ((e: MessageEvent) => void) | null = null;
  closed = false;
  constructor(public name: string) {
    FakeBroadcastChannel.all.add(this);
  }
  postMessage(data: unknown) {
    if (this.closed) throw new Error("InvalidStateError");
    const copy = structuredClone(data);
    for (const other of FakeBroadcastChannel.all) {
      if (other === this || other.name !== this.name || other.closed) continue;
      queueMicrotask(() => other.onmessage?.(new MessageEvent("message", { data: copy })));
    }
  }
  close() {
    this.closed = true;
    FakeBroadcastChannel.all.delete(this);
  }
  /** Simulate a post from a foreign script on the same channel name. */
  static inject(name: string, data: unknown) {
    for (const c of FakeBroadcastChannel.all) if (c.name === name) c.onmessage?.(new MessageEvent("message", { data }));
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("createBroadcastChannelTransport", () => {
  beforeEach(() => {
    FakeBroadcastChannel.all.clear();
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is open at once and delivers between ends of the same name only", async () => {
    const a = createBroadcastChannelTransport<{ hi: number }>("room", { selfId: "a" });
    const b = createBroadcastChannelTransport<{ hi: number }>("room", { selfId: "b" });
    const other = createBroadcastChannelTransport<{ hi: number }>("elsewhere", { selfId: "c" });
    expect(a.status).toBe("open");
    const onB = vi.fn();
    const onOther = vi.fn();
    b.onMessage(onB);
    other.onMessage(onOther);
    a.send({ hi: 1 });
    await flush();
    expect(onB).toHaveBeenCalledWith({ hi: 1 });
    expect(onOther).not.toHaveBeenCalled();
  });

  it("ignores its own messages coming back through another instance", async () => {
    const a1 = createBroadcastChannelTransport<string>("room", { selfId: "same" });
    const a2 = createBroadcastChannelTransport<string>("room", { selfId: "same" });
    const on2 = vi.fn();
    a2.onMessage(on2);
    a1.send("x");
    await flush();
    expect(on2).not.toHaveBeenCalled();
  });

  it("sends JSON-safe values: non-JSON fields vanish rather than throw", async () => {
    const a = createBroadcastChannelTransport<Record<string, unknown>>("room", { selfId: "a" });
    const b = createBroadcastChannelTransport<Record<string, unknown>>("room", { selfId: "b" });
    const onB = vi.fn();
    b.onMessage(onB);
    expect(() => a.send({ keep: 1, fn: () => 1, undef: undefined })).not.toThrow();
    await flush();
    expect(onB).toHaveBeenCalledWith({ keep: 1 });
  });

  it("ignores foreign and malformed posts", () => {
    const b = createBroadcastChannelTransport<unknown>("room", { selfId: "b" });
    const onB = vi.fn();
    b.onMessage(onB);
    FakeBroadcastChannel.inject("room", { hello: "world" });
    FakeBroadcastChannel.inject("room", "text");
    FakeBroadcastChannel.inject("room", { tag: "sefaria-reader-state", from: "x", data: "{not json" });
    FakeBroadcastChannel.inject("room", { tag: "sefaria-reader-state", from: "x", data: 5 });
    expect(onB).not.toHaveBeenCalled();
    FakeBroadcastChannel.inject("room", { tag: "sefaria-reader-state", from: "x", data: '{"ok":true}' });
    expect(onB).toHaveBeenCalledWith({ ok: true });
  });

  it("closes: status, no more delivery, channel released, sends ignored", async () => {
    const a = createBroadcastChannelTransport<string>("room", { selfId: "a" });
    const b = createBroadcastChannelTransport<string>("room", { selfId: "b" });
    const onB = vi.fn();
    const statusB = vi.fn();
    b.onMessage(onB);
    b.onStatus(statusB);
    b.close();
    b.close();
    expect(b.status).toBe("closed");
    expect(statusB).toHaveBeenCalledTimes(1);
    expect(statusB).toHaveBeenCalledWith("closed");
    a.send("x");
    await flush();
    expect(onB).not.toHaveBeenCalled();
    expect(() => b.send("y")).not.toThrow();
    expect(FakeBroadcastChannel.all.size).toBe(1);
  });

  it("is born closed where BroadcastChannel does not exist", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const t = createBroadcastChannelTransport<string>("room", { selfId: "a" });
    expect(t.status).toBe("closed");
    expect(() => t.send("x")).not.toThrow();
  });
});
