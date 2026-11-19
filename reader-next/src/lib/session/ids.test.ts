import { isSessionId, newParticipantId, newSessionId } from "./ids";

describe("session ids", () => {
  it("makes 43-character base62 session ids", () => {
    for (let i = 0; i < 50; i++) {
      const id = newSessionId();
      expect(id).toMatch(/^[0-9A-Za-z]{43}$/);
      expect(isSessionId(id)).toBe(true);
    }
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 200 }, newSessionId));
    expect(ids.size).toBe(200);
  });

  it("draws from crypto.getRandomValues (32 bytes)", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    newSessionId();
    expect(spy).toHaveBeenCalled();
    expect((spy.mock.calls[0]![0] as Uint8Array).length).toBe(32);
    spy.mockRestore();
  });

  it("encodes all-zero and all-ones bytes at the fixed length", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    spy.mockImplementationOnce((a) => a);
    expect(newSessionId()).toBe("0".repeat(43));
    spy.mockImplementationOnce((a) => {
      (a as Uint8Array).fill(255);
      return a;
    });
    const max = newSessionId();
    expect(max).toHaveLength(43);
    expect(isSessionId(max)).toBe(true);
    spy.mockRestore();
  });

  it("makes 22-character participant ids", () => {
    expect(newParticipantId()).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(newParticipantId()).not.toBe(newParticipantId());
  });

  it("rejects anything else as a session id", () => {
    expect(isSessionId("")).toBe(false);
    expect(isSessionId("a".repeat(42))).toBe(false);
    expect(isSessionId("a".repeat(44))).toBe(false);
    expect(isSessionId("-".repeat(43))).toBe(false);
    expect(isSessionId(`${"a".repeat(42)}/`)).toBe(false);
    expect(isSessionId(null)).toBe(false);
    expect(isSessionId(42)).toBe(false);
  });
});
