/**
 * The follow controller against the real room (src/lib/session/room.ts) and the real session client, over memory transports standing in
 * for the room's connections. The reader APIs are fakes (no router).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryPair } from "~/lib/reader-state/core/transports/memory";
import type { ApplyContext, ReaderSnapshot, ReaderStateApi, SnapshotChange, StateTransport } from "~/lib/reader-state/core/types";
import type { AnyEnvelope } from "~/lib/session/protocol";
import { createRoom } from "~/lib/session/room";
import { createFollowController, roomSocketUrl, type FollowConnection, type FollowController } from "./controller";
import { followParamOf, readStoredFollow } from "./params";

const snap = (url: string): ReaderSnapshot => ({ v: 1, url, nav: null, slices: {} });

function fakeApi(url: string) {
  let current = snap(url);
  const applied: ReaderSnapshot[] = [];
  const changeCbs = new Set<(c: SnapshotChange, s: ReaderSnapshot) => void>();
  const api: ReaderStateApi = {
    getSnapshot: () => current,
    async applySnapshot(snapshot: ReaderSnapshot, _ctx: ApplyContext) {
      applied.push(snapshot);
      current = { ...current, ...snapshot };
      return { warnings: [] };
    },
    subscribe(cb) {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onLocalInput: () => () => {},
    applying: false,
  };
  return {
    api,
    urls: () => applied.map((s) => s.url),
    localChange(next: string) {
      current = snap(next);
      for (const cb of [...changeCbs]) cb({ url: next }, current);
    },
  };
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { length: 0, clear: () => m.clear(), key: () => null, getItem: (k) => m.get(k) ?? null, removeItem: (k) => void m.delete(k), setItem: (k, v) => void m.set(k, v) } as Storage;
}

/** One room per session id; connect() opens a memory connection to it. `reconnects: false` behaves like the in-browser room. */
function rooms({ reconnects = true } = {}) {
  const all = new Map<string, { room: ReturnType<typeof createRoom>; ends: Map<string, StateTransport<AnyEnvelope>> }>();
  const opened: { sessionId: string; role: string; transport: StateTransport<AnyEnvelope> }[] = [];
  let n = 0;
  let refuse = false;
  const connect = (sessionId: string, role: "host" | "guest"): FollowConnection => {
    let r = all.get(sessionId);
    if (!r) all.set(sessionId, (r = { room: createRoom({ now: () => Date.now() }), ends: new Map() }));
    const { room, ends } = r;
    const conn = `c${n++}`;
    const [clientEnd, roomEnd] = createMemoryPair<AnyEnvelope>();
    opened.push({ sessionId, role, transport: clientEnd });
    if (refuse) {
      clientEnd.close();
      return { transport: clientEnd, close: () => clientEnd.close(), reconnects };
    }
    const deliver = (out: ReturnType<typeof room.handle>) => {
      for (const o of out) for (const c of room.recipients(o.to)) ends.get(c)?.send(o.envelope);
    };
    ends.set(conn, roomEnd);
    room.connect(conn);
    roomEnd.onMessage((m) => deliver(room.handle(conn, m)));
    roomEnd.onStatus((s) => s === "closed" && deliver(room.disconnect(conn)));
    return { transport: clientEnd, close: () => clientEnd.close(), reconnects };
  };
  return { connect, opened, setRefuse: (v: boolean) => (refuse = v) };
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

const made: FollowController[] = [];
function controller(opts: Parameters<typeof createFollowController>[0]) {
  const c = createFollowController(opts);
  made.push(c);
  return c;
}
afterEach(() => {
  for (const c of made.splice(0)) c.dispose();
});

describe("follow controller", () => {
  it("the host starts, shares a link, a guest joins and follows, and Stop sharing ends it for both", async () => {
    const net = rooms();
    const hostStorage = memoryStorage();
    const guestStorage = memoryStorage();
    const hostReader = fakeApi("/Genesis.1");
    const guestReader = fakeApi("/Psalms.1");
    const host = controller({ api: hostReader.api, connect: net.connect, storage: hostStorage, viewerName: () => "Dana Levi" });
    const guest = controller({ api: guestReader.api, connect: net.connect, storage: guestStorage });

    expect(host.followMe.getState()).toEqual({ status: "idle", following: 0 });
    const sessionId = host.startSharing();
    expect(readStoredFollow(hostStorage)).toMatchObject({ sessionId, role: "host" });
    await settle();
    const hostClient = host.getState().session!.client;
    expect(hostClient.getState()).toMatchObject({ status: "leading", self: { name: "Dana Levi", isHost: true, canLead: true } });
    expect(host.followMe.getState().status).toBe("sharing");
    expect(followParamOf(new URL(host.followMe.linkFor("https://www.sefaria.org/Genesis.1?lang=bi")!).search)).toBe(sessionId);

    guest.join(sessionId);
    await settle();
    const guestClient = guest.getState().session!.client;
    expect(guestClient.getState()).toMatchObject({ status: "live", following: hostClient.getState().self.id });
    expect(guestClient.getState().self.name).toMatch(/^Guest [0-9A-Z]{3}$/);
    expect(guestReader.urls().at(-1)).toBe("/Genesis.1");
    expect(host.followMe.getState()).toEqual({ status: "sharing", following: 1 });
    // The guest knows where the host is, for "… is reading …".
    expect(guest.getState().locations[hostClient.getState().self.id]).toBe("/Genesis.1");

    hostReader.localChange("/Genesis.2");
    await settle();
    expect(guest.getState().locations[hostClient.getState().self.id]).toBe("/Genesis.2");

    host.endSharing();
    await settle();
    expect(host.getState().session).toBeNull();
    expect(host.followMe.getState().status).toBe("idle");
    expect(guestClient.getState().status).toBe("ended");
    expect(readStoredFollow(hostStorage)).toBeNull();
    expect(readStoredFollow(guestStorage)).toBeNull();

    guest.dismiss();
    expect(guest.getState().session).toBeNull();
  });

  it("a guest shows as busy to Share, and leaving clears what a reload would rejoin", async () => {
    const net = rooms();
    const storage = memoryStorage();
    const host = controller({ api: fakeApi("/Genesis.1").api, connect: net.connect, storage: memoryStorage() });
    const guest = controller({ api: fakeApi("/Psalms.1").api, connect: net.connect, storage });
    const sessionId = host.startSharing();
    guest.join(sessionId);
    await settle();
    expect(guest.followMe.getState().status).toBe("busy");
    expect(guest.followMe.linkFor("https://x.org/a")).toBeNull();
    expect(readStoredFollow(storage)).toMatchObject({ sessionId, role: "guest" });
    guest.leave();
    expect(guest.getState().session).toBeNull();
    expect(readStoredFollow(storage)).toBeNull();
  });

  it("resuming after a reload comes back under the same participant id", async () => {
    const net = rooms();
    const host = controller({ api: fakeApi("/Genesis.1").api, connect: net.connect, storage: memoryStorage() });
    const sessionId = host.startSharing();
    const guest = controller({ api: fakeApi("/Psalms.1").api, connect: net.connect, storage: memoryStorage() });
    guest.resume({ sessionId, role: "guest", participantId: "returning1" });
    await settle();
    expect(guest.getState().session!.client.getState().self.id).toBe("returning1");
  });

  it("rebuilds a lost in-browser room connection, then gives up and says so", async () => {
    vi.useFakeTimers();
    try {
      const net = rooms({ reconnects: false });
      const storage = memoryStorage();
      const guest = controller({ api: fakeApi("/Psalms.1").api, connect: net.connect, storage, retryMs: 100, maxRetries: 2 });
      guest.resume({ sessionId: "s".repeat(43), role: "guest", participantId: "p1" });
      expect(net.opened).toHaveLength(1);

      net.setRefuse(true);
      net.opened[0]!.transport.close();
      await vi.advanceTimersByTimeAsync(100);
      expect(net.opened).toHaveLength(2);
      expect(guest.getState().session).not.toBeNull();
      await vi.advanceTimersByTimeAsync(100);
      expect(net.opened).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(100);
      expect(guest.getState()).toMatchObject({ session: null, lost: true });
      expect(readStoredFollow(storage)).toBeNull();
      guest.dismiss();
      expect(guest.getState().lost).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("roomSocketUrl", () => {
  it("joins the room path to ws(s) URLs only", () => {
    expect(roomSocketUrl("ws://192.168.1.5:3199", "abc")).toBe("ws://192.168.1.5:3199/r/abc");
    expect(roomSocketUrl("wss://live.sefaria.org/", "abc")).toBe("wss://live.sefaria.org/r/abc");
    expect(roomSocketUrl("https://live.sefaria.org", "abc")).toBeNull();
    expect(roomSocketUrl("", "abc")).toBeNull();
    expect(roomSocketUrl(undefined, "abc")).toBeNull();
  });
});
