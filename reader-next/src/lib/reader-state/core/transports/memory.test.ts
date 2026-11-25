import { describe, expect, it, vi } from "vitest";
import { createMemoryPair } from "./memory";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("createMemoryPair", () => {
  it("delivers to the other end, asynchronously, as a copy", async () => {
    const [a, b] = createMemoryPair<{ n: number; nested: { x: number } }>();
    const got: unknown[] = [];
    b.onMessage((m) => got.push(m));
    const sent = { n: 1, nested: { x: 2 } };
    a.send(sent);
    expect(got).toEqual([]);
    await flush();
    expect(got).toEqual([sent]);
    expect(got[0]).not.toBe(sent);
  });

  it("does not echo to the sender and works both ways", async () => {
    const [a, b] = createMemoryPair<string>();
    const onA = vi.fn();
    const onB = vi.fn();
    a.onMessage(onA);
    b.onMessage(onB);
    a.send("to-b");
    b.send("to-a");
    await flush();
    expect(onA).toHaveBeenCalledWith("to-a");
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledWith("to-b");
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it("starts open; closing one end closes both and drops in-flight messages", async () => {
    const [a, b] = createMemoryPair<string>();
    expect(a.status).toBe("open");
    const statusA = vi.fn();
    const statusB = vi.fn();
    a.onStatus(statusA);
    b.onStatus(statusB);
    const onB = vi.fn();
    b.onMessage(onB);
    a.send("lost");
    b.close();
    await flush();
    expect(onB).not.toHaveBeenCalled();
    expect(a.status).toBe("closed");
    expect(b.status).toBe("closed");
    expect(statusA).toHaveBeenCalledWith("closed");
    expect(statusB).toHaveBeenCalledWith("closed");
    a.close();
    expect(statusA).toHaveBeenCalledTimes(1);
    a.send("ignored");
    await flush();
    expect(onB).not.toHaveBeenCalled();
  });

  it("unsubscribes", async () => {
    const [a, b] = createMemoryPair<number>();
    const cb = vi.fn();
    const off = b.onMessage(cb);
    off();
    a.send(1);
    await flush();
    expect(cb).not.toHaveBeenCalled();
  });

  it("keeps delivering when a listener throws", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const [a, b] = createMemoryPair<number>();
    const good = vi.fn();
    b.onMessage(() => {
      throw new Error("boom");
    });
    b.onMessage(good);
    a.send(1);
    await flush();
    expect(good).toHaveBeenCalledWith(1);
    expect(report).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
