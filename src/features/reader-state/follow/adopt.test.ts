import { describe, expect, it, vi } from "vitest";
import { newSessionId } from "~/lib/session/ids";
import { adoptFollowLocation, keptHistoryState, type AdoptRouter } from "./adopt";
import type { FollowController, FollowControllerState } from "./controller";
import { createFakeSessionClient, fakeSessionState } from "./fake-client";
import { readStoredFollow, writeStoredFollow } from "./params";

const id = newSessionId();

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { length: 0, clear: () => m.clear(), key: () => null, getItem: (k) => m.get(k) ?? null, removeItem: (k) => void m.delete(k), setItem: (k, v) => void m.set(k, v) } as Storage;
}

function fakeRouter(search: string, state: unknown = { __TSR_key: "k1", __TSR_index: 3, key: "k1", nav: "go", panel: "p1" }) {
  const order: string[] = [];
  const router = {
    history: { location: { pathname: "/Genesis.1.3", search, hash: "", state } },
    navigate: vi.fn(async (opts: { href: string }) => {
      order.push(`navigate ${opts.href}`);
    }),
  };
  return { router: router as unknown as AdoptRouter & { navigate: typeof router.navigate }, order };
}

function fakeController(order: string[] = [], session: FollowControllerState["session"] = null) {
  const resume = vi.fn((stored: { sessionId: string }) => void order.push(`resume ${stored.sessionId}`));
  const controller = { getState: () => ({ session, locations: {}, lost: false }), resume } as unknown as FollowController;
  return { controller, resume };
}

describe("adopting a follow link", () => {
  it("stores the id, strips the parameter with one replace that keeps the rest and the history state, then joins", async () => {
    const storage = memoryStorage();
    const { router, order } = fakeRouter(`?lang=bi&follow=${id}&with=Rashi`);
    const { controller, resume } = fakeController(order);

    await expect(adoptFollowLocation(router, controller, storage)).resolves.toBe("joined");

    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith({ href: "/Genesis.1.3?lang=bi&with=Rashi", replace: true, state: { nav: "go", panel: "p1" }, resetScroll: false });
    // Joining only after the address changed: the session client would count the replace as the person's own move.
    expect(order).toEqual(["navigate /Genesis.1.3?lang=bi&with=Rashi", `resume ${id}`]);
    const stored = readStoredFollow(storage);
    expect(stored).toMatchObject({ sessionId: id, role: "guest" });
    expect(resume).toHaveBeenCalledWith(stored);
  });

  it("ignores a follow parameter that is not a session id", async () => {
    const { router } = fakeRouter("?follow=../../etc");
    const { controller, resume } = fakeController();
    await expect(adoptFollowLocation(router, controller, memoryStorage())).resolves.toBe("none");
    expect(router.navigate).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it("opening the link of the session this tab already hosts strips it but keeps the host role", async () => {
    const storage = memoryStorage();
    writeStoredFollow(storage, { sessionId: id, role: "host", participantId: "me" });
    const { router } = fakeRouter(`?follow=${id}`);
    const client = createFakeSessionClient(fakeSessionState({ status: "leading" }));
    const { controller, resume } = fakeController([], { sessionId: id, role: "host", client });
    await expect(adoptFollowLocation(router, controller, storage)).resolves.toBe("none");
    expect(router.navigate).toHaveBeenCalledWith(expect.objectContaining({ href: "/Genesis.1.3", replace: true }));
    expect(readStoredFollow(storage)).toEqual({ sessionId: id, role: "host", participantId: "me" });
    expect(resume).not.toHaveBeenCalled();
  });

  it("joins even if the replace navigation fails", async () => {
    const { router } = fakeRouter(`?follow=${id}`);
    router.navigate.mockRejectedValueOnce(new Error("cancelled"));
    const { controller, resume } = fakeController();
    await expect(adoptFollowLocation(router, controller, memoryStorage())).resolves.toBe("joined");
    expect(resume).toHaveBeenCalledTimes(1);
  });
});

describe("after a reload", () => {
  it("rejoins what sessionStorage kept, with the same participant id, without navigating", async () => {
    const storage = memoryStorage();
    writeStoredFollow(storage, { sessionId: id, role: "guest", participantId: "abc" });
    const { router } = fakeRouter("?lang=bi");
    const { controller, resume } = fakeController();
    await expect(adoptFollowLocation(router, controller, storage)).resolves.toBe("resumed");
    expect(resume).toHaveBeenCalledWith({ sessionId: id, role: "guest", participantId: "abc" });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("does nothing while a session is open or when nothing was kept", async () => {
    const storage = memoryStorage();
    const { router } = fakeRouter("");
    const { controller, resume } = fakeController();
    await expect(adoptFollowLocation(router, controller, storage)).resolves.toBe("none");
    writeStoredFollow(storage, { sessionId: id, role: "guest", participantId: "abc" });
    const busy = fakeController([], { sessionId: id, role: "guest", client: createFakeSessionClient() });
    await expect(adoptFollowLocation(router, busy.controller, storage)).resolves.toBe("none");
    expect(resume).not.toHaveBeenCalled();
    expect(busy.resume).not.toHaveBeenCalled();
  });
});

describe("keptHistoryState", () => {
  it("drops only the router's per-entry keys", () => {
    expect(keptHistoryState({ __TSR_key: "a", __TSR_index: 1, key: "a", nav: "scroll", canonical: true })).toEqual({ nav: "scroll", canonical: true });
    expect(keptHistoryState(undefined)).toEqual({});
  });
});
