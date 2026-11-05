/**
 * The session client end to end against the real room (./room.ts) and the core's real stream writer and reader, over memory transports.
 * The reader APIs are fakes (no router): each records what was applied and lets the test make local changes.
 */
import { createMemoryPair } from "~/lib/reader-state/core/transports/memory";
import type { ApplyContext, ReaderSnapshot, ReaderStateApi, SnapshotChange, StateTransport } from "~/lib/reader-state/core/types";
import type { AnyEnvelope, Participant } from "./protocol";
import { createRoom } from "./room";
import { createSessionClient } from "./client";

const snap = (url: string): ReaderSnapshot => ({ v: 1, url, nav: null, slices: {} });

function fakeApi(url: string) {
  let current = snap(url);
  const applied: { snapshot: ReaderSnapshot; ctx: ApplyContext }[] = [];
  const changeCbs = new Set<(c: SnapshotChange, s: ReaderSnapshot) => void>();
  const inputCbs = new Set<() => void>();
  const api: ReaderStateApi = {
    getSnapshot: () => current,
    async applySnapshot(snapshot, ctx) {
      applied.push({ snapshot, ctx });
      current = { ...current, ...snapshot };
      return { warnings: [] };
    },
    subscribe(cb) {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onLocalInput(cb) {
      inputCbs.add(cb);
      return () => inputCbs.delete(cb);
    },
    applying: false,
  };
  return {
    api,
    urls: () => applied.map((a) => a.snapshot.url),
    localChange(next: string) {
      current = snap(next);
      for (const cb of [...changeCbs]) cb({ url: next }, current);
    },
    input: () => [...inputCbs].forEach((cb) => cb()),
  };
}

function harness() {
  let clock = 0;
  const room = createRoom({ now: () => clock });
  const ends = new Map<string, StateTransport<AnyEnvelope>>();
  const deliver = (out: ReturnType<typeof room.handle>) => {
    for (const o of out) for (const conn of room.recipients(o.to)) ends.get(conn)?.send(o.envelope);
  };
  let n = 0;
  return {
    room,
    advance: (ms: number) => (clock += ms),
    connect(self: Participant, url: string) {
      const conn = `c${n++}`;
      const [clientEnd, roomEnd] = createMemoryPair<AnyEnvelope>();
      ends.set(conn, roomEnd);
      room.connect(conn);
      roomEnd.onMessage((m) => deliver(room.handle(conn, m)));
      roomEnd.onStatus((s) => {
        if (s === "closed") deliver(room.disconnect(conn));
      });
      const reader = fakeApi(url);
      const client = createSessionClient({ api: reader.api, transport: clientEnd, self, now: () => clock });
      return { client, reader };
    },
  };
}

/** Let microtask-delivered messages and async applies settle. */
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

const host: Participant = { id: "akiva", name: "Akiva", isHost: true, canLead: true };
const guest: Participant = { id: "guest", isHost: false, canLead: true };
const sarah: Participant = { id: "sarah", name: "Sarah", isHost: false, canLead: true };

describe("session client with the real room", () => {
  it("a follower lands on the host's state, follows, breaks away and follows again", async () => {
    const h = harness();
    const leader = h.connect(host, "/Genesis.1");
    await settle();
    expect(leader.client.getState().status).toBe("leading");

    const follower = h.connect(guest, "/Psalms.1");
    await settle();
    expect(follower.client.getState()).toMatchObject({ status: "live", following: "akiva" });
    expect(follower.reader.urls().at(-1)).toBe("/Genesis.1");

    h.advance(1000);
    leader.reader.localChange("/Genesis.2");
    await settle();
    expect(follower.reader.urls().at(-1)).toBe("/Genesis.2");

    follower.reader.input();
    h.advance(1000);
    leader.reader.localChange("/Genesis.3");
    await settle();
    expect(follower.client.getState().status).toBe("paused");
    expect(follower.reader.urls().at(-1)).toBe("/Genesis.2");
    // The room hears that the follower wandered off.
    expect(h.room.snapshot().participants.find((p) => p.id === "guest")?.following).toBeNull();

    follower.client.followAgain();
    await settle();
    expect(follower.reader.urls().at(-1)).toBe("/Genesis.3");
    expect(h.room.snapshot().participants.find((p) => p.id === "guest")?.following).toBe("akiva");
  });

  it("switches to a new spotlight holder and lands on their state", async () => {
    const h = harness();
    const leader = h.connect(host, "/Genesis.1");
    await settle();
    const s = h.connect(sarah, "/Ruth.1");
    const follower = h.connect(guest, "/Psalms.1");
    await settle();
    expect(follower.reader.urls().at(-1)).toBe("/Genesis.1");

    leader.client.spotlight("sarah");
    await settle();
    expect(s.client.getState().status).toBe("leading");
    expect(follower.client.getState().following).toBe("sarah");
    // Sarah was following Akiva, so her state is Genesis.1 too: the new leader does not jump.
    expect(follower.reader.urls().at(-1)).toBe("/Genesis.1");

    h.advance(1000);
    s.reader.localChange("/Ruth.2");
    await settle();
    expect(follower.reader.urls().at(-1)).toBe("/Ruth.2");
  });

  it("ends everyone when the host ends the room", async () => {
    const h = harness();
    const leader = h.connect(host, "/Genesis.1");
    const follower = h.connect(guest, "/Psalms.1");
    await settle();
    leader.client.end();
    await settle();
    expect(follower.client.getState().status).toBe("ended");
    expect(leader.client.getState().status).toBe("ended");
  });
});
