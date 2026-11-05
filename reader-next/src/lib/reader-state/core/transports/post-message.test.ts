import { describe, expect, it, vi } from "vitest";
import { createPostMessageTransport } from "./post-message";

function fakeTarget() {
  return { postMessage: vi.fn() } as unknown as Window & { postMessage: ReturnType<typeof vi.fn> };
}

function deliver(origin: string, source: unknown, data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { origin, source: source as Window, data }));
}

const ORIGIN = "https://embedder.example";

describe("createPostMessageTransport", () => {
  it("refuses targetOrigin *", () => {
    expect(() =>
      createPostMessageTransport({ target: fakeTarget(), targetOrigin: "*", allowedOrigins: [], channel: "c" }),
    ).toThrow();
  });

  it("posts JSON frames tagged with the channel to the target origin", () => {
    const target = fakeTarget();
    const t = createPostMessageTransport<{ a: number }>({
      target,
      targetOrigin: ORIGIN,
      allowedOrigins: [ORIGIN],
      channel: "sefaria",
    });
    expect(t.status).toBe("open");
    t.send({ a: 1 });
    expect(target.postMessage).toHaveBeenCalledWith({ channel: "sefaria", data: '{"a":1}' }, ORIGIN);
    t.close();
  });

  it("accepts only allowed origin + target source + channel + JSON", () => {
    const target = fakeTarget();
    const stranger = fakeTarget();
    const t = createPostMessageTransport<unknown>({
      target,
      targetOrigin: ORIGIN,
      allowedOrigins: [ORIGIN],
      channel: "sefaria",
    });
    const cb = vi.fn();
    t.onMessage(cb);
    const good = { channel: "sefaria", data: '{"ok":1}' };
    deliver("https://evil.example", target, good);
    deliver(ORIGIN, stranger, good);
    deliver(ORIGIN, target, { channel: "other", data: '{"ok":1}' });
    deliver(ORIGIN, target, { channel: "sefaria", data: "{nope" });
    deliver(ORIGIN, target, { channel: "sefaria", data: { ok: 1 } });
    deliver(ORIGIN, target, "string");
    deliver(ORIGIN, target, null);
    expect(cb).not.toHaveBeenCalled();
    deliver(ORIGIN, target, good);
    expect(cb).toHaveBeenCalledWith({ ok: 1 });
    t.close();
  });

  it("stops listening and sending once closed", () => {
    const target = fakeTarget();
    const t = createPostMessageTransport<unknown>({
      target,
      targetOrigin: ORIGIN,
      allowedOrigins: [ORIGIN],
      channel: "sefaria",
    });
    const cb = vi.fn();
    const status = vi.fn();
    t.onMessage(cb);
    t.onStatus(status);
    t.close();
    t.close();
    expect(t.status).toBe("closed");
    expect(status).toHaveBeenCalledTimes(1);
    deliver(ORIGIN, target, { channel: "sefaria", data: "1" });
    expect(cb).not.toHaveBeenCalled();
    t.send(1);
    expect(target.postMessage).not.toHaveBeenCalled();
  });
});
