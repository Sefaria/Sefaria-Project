import { describe, expect, it, vi } from "vitest";
import type { PostResult } from "~/lib/auth/http";
import { createIdentityTokenSource, expiryMs, SignedOutError, TOKEN_PATH } from "./identity";

const answer = (data: Record<string, unknown>, status = 200): PostResult => ({ ok: status < 300, status, data, networkError: false });

// @feature SHL-078
describe("host.viewer.identityToken()", () => {
  it("asks Django once and reuses the token until 60 seconds before it expires", async () => {
    let now = 1_000_000;
    const post = vi.fn(async () => answer({ token: `t${post.mock.calls.length}`, expires_at: (now + 600_000) / 1000 }));
    const token = createIdentityTokenSource({ post, viewerId: () => 7, now: () => now });
    expect(await token()).toBe("t1");
    expect(post).toHaveBeenCalledWith(TOKEN_PATH, {});
    now += 500_000;
    expect(await token()).toBe("t1");
    now += 50_000; // 50 s left: inside the margin
    expect(await token()).toBe("t2");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent callers", async () => {
    const post = vi.fn(async () => answer({ token: "t", expires_at: new Date(Date.now() + 600_000).toISOString() }));
    const token = createIdentityTokenSource({ post, viewerId: () => 7 });
    expect(await Promise.all([token(), token(), token()])).toEqual(["t", "t", "t"]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("rejects when signed out, without asking", async () => {
    const post = vi.fn();
    await expect(createIdentityTokenSource({ post, viewerId: () => null })()).rejects.toBeInstanceOf(SignedOutError);
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects when Django says signed out, or answers badly", async () => {
    await expect(createIdentityTokenSource({ post: async () => answer({}, 403), viewerId: () => 7 })()).rejects.toBeInstanceOf(SignedOutError);
    await expect(createIdentityTokenSource({ post: async () => answer({}, 500), viewerId: () => 7 })()).rejects.toThrow(/HTTP 500/);
    await expect(createIdentityTokenSource({ post: async () => answer({ token: "t" }), viewerId: () => 7 })()).rejects.toThrow();
    await expect(createIdentityTokenSource({ post: async () => ({ ok: false, status: 0, data: {}, networkError: true }), viewerId: () => 7 })()).rejects.toThrow(/network/);
  });

  it("forgets the token when the signed-in reader changes", async () => {
    let viewer = 7;
    const post = vi.fn(async () => answer({ token: `for${viewer}`, expires_at: Date.now() + 600_000 }));
    const token = createIdentityTokenSource({ post, viewerId: () => viewer });
    expect(await token()).toBe("for7");
    viewer = 8;
    expect(await token()).toBe("for8");
  });

  it("reads expires_at as epoch seconds, milliseconds or an ISO date", () => {
    expect(expiryMs(1_800_000_000)).toBe(1_800_000_000_000);
    expect(expiryMs(1_800_000_000_000)).toBe(1_800_000_000_000);
    expect(expiryMs("1800000000")).toBe(1_800_000_000_000);
    expect(expiryMs("2027-01-15T08:00:00Z")).toBe(Date.parse("2027-01-15T08:00:00Z"));
    expect(expiryMs(undefined)).toBeNaN();
  });
});
