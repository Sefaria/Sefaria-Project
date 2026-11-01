import { describe, expect, it, vi } from "vitest";
import type { FollowMeSource, FollowMeState } from "~/ui/ShareView/follow-me";
import { lazyFollowMe } from "./lazy";

function fakeSource(): FollowMeSource & { set(s: FollowMeState): void } {
  let state: FollowMeState = { status: "idle", following: 0 };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    start: vi.fn(),
    stop: vi.fn(),
    linkFor: (url) => `${url}?follow=x`,
    set(s) {
      state = s;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("lazyFollowMe", () => {
  it("reads idle and loads nothing until started; Start loads, attaches and starts the real source", async () => {
    const real = fakeSource();
    let lazySource!: ReturnType<typeof lazyFollowMe>;
    const load = vi.fn(async () => lazySource.attach(real));
    lazySource = lazyFollowMe(load);
    expect(lazySource.getState()).toEqual({ status: "idle", following: 0 });
    expect(lazySource.linkFor("/Genesis.1")).toBeNull();
    expect(load).not.toHaveBeenCalled();

    const cb = vi.fn();
    lazySource.subscribe(cb);
    lazySource.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(real.start).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalled();
    real.set({ status: "sharing", following: 2 });
    expect(lazySource.getState()).toEqual({ status: "sharing", following: 2 });
    expect(lazySource.linkFor("/Genesis.1")).toBe("/Genesis.1?follow=x");
    lazySource.stop();
    expect(real.stop).toHaveBeenCalled();
  });

  it("stays idle when loading fails", async () => {
    const s = lazyFollowMe(() => Promise.reject(new Error("offline")));
    s.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.getState().status).toBe("idle");
  });
});
