/**
 * The session client against fakes: a fake ReaderStateApi (records what was applied, lets the test make local changes and input), fake
 * stream writer/reader (so these tests do not depend on the core's stream internals), and a scripted room on the other end of the
 * transport. The test plays the room: it sends `room`, `participants` and relayed state envelopes, and reads what the client sent.
 */
import { createMemoryPair } from "~/lib/reader-state/core/transports/memory";
import type {
  ApplyContext,
  ReaderSnapshot,
  ReaderStateApi,
  SnapshotChange,
  StateTransport,
  StreamMessage,
  StreamReader,
  StreamWriter,
  TransportStatus,
} from "~/lib/reader-state/core/types";
import type { AnyEnvelope, LeadershipMode, Participant, ParticipantId } from "./protocol";
import { createSessionClient, type StreamFactories } from "./client";

// The core's stream module is another task's; these tests inject their own streams, so only the import has to resolve.
vi.mock("~/lib/reader-state/core/stream", () => ({
  createStreamWriter: () => {
    throw new Error("tests inject streams");
  },
  createStreamReader: () => {
    throw new Error("tests inject streams");
  },
}));

// ── Fakes ────────────────────────────────────────────────────────────────────────────────────────────────────

const snap = (url: string): ReaderSnapshot => ({ v: 1, url, nav: null, slices: { "sefaria.focus": { v: 1, value: null } } });

function fakeApi(initialUrl = "/Genesis.1") {
  let current = snap(initialUrl);
  const applied: { snapshot: ReaderSnapshot; ctx: ApplyContext }[] = [];
  const changeCbs = new Set<(c: SnapshotChange, s: ReaderSnapshot) => void>();
  const inputCbs = new Set<() => void>();
  const api: ReaderStateApi = {
    getSnapshot: () => current,
    async applySnapshot(snapshot, ctx) {
      applied.push({ snapshot, ctx });
      current = snapshot;
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
    applied,
    urls: () => applied.map((a) => a.snapshot.url),
    localChange(url: string) {
      current = snap(url);
      for (const cb of [...changeCbs]) cb({ url }, current);
    },
    input() {
      for (const cb of [...inputCbs]) cb();
    },
    listenerCount: () => changeCbs.size + inputCbs.size,
  };
}

/** Minimal stand-ins with the contract's behaviour: keyframes replace, changes fold the url, seq gaps call onGap, pause keeps folding. */
function fakeStreams() {
  const writers: { keyframes: number; stopped: boolean; opts: unknown }[] = [];
  const readers: StreamReader[] = [];
  const factories: StreamFactories = {
    createStreamWriter(api, opts) {
      const rec = { keyframes: 0, stopped: false, opts };
      writers.push(rec);
      let emit: ((m: StreamMessage) => void) | null = null;
      let seq = 0;
      const w: StreamWriter = {
        start(e) {
          emit = e;
          w.keyframe();
        },
        keyframe() {
          rec.keyframes++;
          emit?.({ type: "keyframe", seq: seq++, t: 0, snapshot: api.getSnapshot() });
        },
        stop() {
          rec.stopped = true;
          emit = null;
        },
      };
      return w;
    },
    createStreamReader(api, ctx) {
      let cur: ReaderSnapshot | undefined;
      let lastSeq = -1;
      let paused = false;
      const gaps = new Set<() => void>();
      const r: StreamReader = {
        async push(msg) {
          if (msg.type === "keyframe") cur = msg.snapshot;
          else {
            if (!cur || msg.seq !== lastSeq + 1) {
              for (const g of gaps) g();
              return undefined;
            }
            cur = { ...cur, ...(msg.change.url ? { url: msg.change.url } : {}) };
          }
          lastSeq = msg.seq;
          return paused ? undefined : api.applySnapshot(cur, ctx);
        },
        current: () => cur,
        pause() {
          paused = true;
        },
        async resume() {
          paused = false;
          return cur ? api.applySnapshot(cur, ctx) : undefined;
        },
        get paused() {
          return paused;
        },
        onGap(cb) {
          gaps.add(cb);
          return () => gaps.delete(cb);
        },
      };
      readers.push(r);
      return r;
    },
  };
  return { factories, writers, readers };
}

/** A transport whose status the test drives, with synchronous delivery both ways. */
function controllableTransport(initial: TransportStatus = "connecting") {
  let status = initial;
  const msgCbs = new Set<(m: AnyEnvelope) => void>();
  const statusCbs = new Set<(s: TransportStatus) => void>();
  const sent: AnyEnvelope[] = [];
  const transport: StateTransport<AnyEnvelope> = {
    send: (m) => void sent.push(JSON.parse(JSON.stringify(m))),
    onMessage(cb) {
      msgCbs.add(cb);
      return () => msgCbs.delete(cb);
    },
    onStatus(cb) {
      statusCbs.add(cb);
      return () => statusCbs.delete(cb);
    },
    get status() {
      return status;
    },
    close() {
      setStatus("closed");
    },
  };
  function setStatus(s: TransportStatus) {
    status = s;
    for (const cb of [...statusCbs]) cb(s);
  }
  return { transport, sent, setStatus, deliver: (m: AnyEnvelope) => [...msgCbs].forEach((cb) => cb(m)) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const me: Participant = { id: "me", isHost: false, canLead: true };
const akiva: Participant = { id: "akiva", name: "Akiva", isHost: true, canLead: true };
const sarah: Participant = { id: "sarah", name: "Sarah", isHost: false, canLead: true };

function roomMsg(spotlight: ParticipantId | null, term: number, extra: { ended?: boolean; mode?: LeadershipMode } = {}): AnyEnvelope {
  return {
    ch: "control",
    body: { type: "room", spotlight, term, mode: extra.mode ?? "presenter", hands: [], ended: extra.ended ?? false },
  };
}
function people(...ps: (Participant & { away?: boolean })[]): AnyEnvelope {
  return {
    ch: "presence",
    body: { type: "participants", participants: ps.map((p) => ({ ...p, following: null, away: p.away ?? false })) },
  };
}
const keyframe = (from: ParticipantId, url: string, seq = 0, term?: number): AnyEnvelope => ({
  ch: "state",
  from,
  ...(term !== undefined ? { term } : {}),
  body: { type: "keyframe", seq, t: 0, snapshot: snap(url) },
});
const change = (from: ParticipantId, url: string, seq: number, term?: number): AnyEnvelope => ({
  ch: "state",
  from,
  ...(term !== undefined ? { term } : {}),
  body: { type: "change", seq, t: 0, change: { url } },
});

function setup(initial: TransportStatus = "open") {
  const a = fakeApi();
  const s = fakeStreams();
  const t = controllableTransport(initial);
  const client = createSessionClient({ api: a.api, transport: t.transport, self: me, streams: s.factories, clientName: "test" });
  const resyncs = () => t.sent.filter((e) => e.ch === "state" && e.body.type === "resync").map((e) => (e.body as { of: string }).of);
  const presence = () => t.sent.filter((e) => e.ch === "presence").map((e) => e.body);
  return { a, s, t, client, resyncs, presence };
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────────────────────────

describe("createSessionClient", () => {
  it("joins and says hello on open, and publishes nothing until someone needs its stream", () => {
    const { t, s, client } = setup("connecting");
    expect(client.getState().status).toBe("connecting");
    expect(t.sent).toHaveLength(0);
    t.setStatus("open");
    expect(t.sent[0]).toEqual({ ch: "control", body: { type: "join", participant: me } });
    expect(t.sent[1]).toEqual({
      ch: "state",
      body: { type: "hello", protocol: 1, slices: [{ id: "sefaria.focus", v: 1 }], client: "test" },
    });
    expect(t.sent).toHaveLength(2);
    expect(s.writers).toHaveLength(0);
    expect(client.getState().status).toBe("connecting");
  });

  it("publishes its moment stream while it holds the spotlight or someone follows it, and stops when nobody does", () => {
    const { t, s } = setup();
    t.deliver(people(me, akiva));
    t.deliver(roomMsg("akiva", 1));
    expect(s.writers).toHaveLength(0);
    // Sarah picks this reader to follow: her presence says so.
    t.deliver({
      ch: "presence",
      body: { type: "participants", participants: [{ ...me, following: "akiva", away: false }, { ...akiva, following: null, away: false }, { ...sarah, following: "me", away: false }] },
    });
    expect(s.writers).toHaveLength(1);
    expect(s.writers[0]!.opts).toMatchObject({ filter: { scope: "moment" }, sampleMs: { "sefaria.scroll": 100 } });
    expect(t.sent.filter((e) => e.ch === "state" && e.body.type === "keyframe")).toMatchObject([{ body: { snapshot: { url: "/Genesis.1" } } }]);
    t.deliver(people(me, akiva, sarah));
    expect(s.writers[0]!.stopped).toBe(true);
    t.deliver(roomMsg("me", 2));
    expect(s.writers).toHaveLength(2);
    expect(s.writers[1]!.stopped).toBe(false);
  });

  it("drops what is not a room message instead of trusting its shape", () => {
    const { t, client } = setup();
    t.deliver(people(me, akiva));
    t.deliver(roomMsg("akiva", 1));
    const before = client.getState();
    t.deliver({ ch: "presence", body: { type: "participants", participants: null } } as unknown as AnyEnvelope);
    t.deliver({ ch: "control", body: { type: "room", spotlight: "sarah", term: "9", mode: "presenter", hands: [], ended: false } } as unknown as AnyEnvelope);
    t.deliver({ ch: "control", body: { type: "room", spotlight: "sarah", term: 9, mode: "presenter", hands: "x", ended: false } } as unknown as AnyEnvelope);
    expect(client.getState()).toBe(before);
    // A bad entry costs only itself.
    t.deliver({ ch: "presence", body: { type: "participants", participants: [{ ...akiva, following: null, away: false }, { id: 5 }] } } as unknown as AnyEnvelope);
    expect(client.getState().participants.map((p) => p.id)).toEqual(["akiva"]);
    expect(client.getState().status).toBe("live");
  });

  it("follows the spotlight holder and applies their moves with origin follow, persist false", async () => {
    const { a, t, client, resyncs, presence } = setup();
    t.deliver(people(me, akiva));
    t.deliver(roomMsg("akiva", 1));
    expect(client.getState()).toMatchObject({ status: "live", following: "akiva", chosen: null });
    expect(resyncs()).toEqual(["akiva"]);
    expect(presence().at(-1)).toEqual({ type: "status", following: "akiva", away: false });

    t.deliver(keyframe("akiva", "/Exodus.3", 0, 1));
    t.deliver(change("akiva", "/Exodus.4", 1, 1));
    // Someone else's stream is not ours to apply.
    t.deliver(keyframe("sarah", "/Ruth.1", 0));
    await flush();
    expect(a.urls()).toEqual(["/Exodus.3", "/Exodus.4"]);
    expect(a.applied[0]!.ctx).toEqual({ origin: "follow", persist: false });
  });

  it("switches streams when the spotlight moves and drops older-term messages", async () => {
    const { a, t, client, resyncs } = setup();
    t.deliver(people(me, akiva, sarah));
    t.deliver(roomMsg("akiva", 1));
    t.deliver(keyframe("akiva", "/Exodus.3", 0, 1));
    await flush();

    t.deliver(roomMsg("sarah", 2));
    expect(client.getState().following).toBe("sarah");
    expect(resyncs()).toEqual(["akiva", "sarah"]);
    // A lagging message from Akiva's term is ignored; Sarah's keyframe applies at once.
    t.deliver(change("akiva", "/Exodus.5", 1, 1));
    t.deliver(keyframe("sarah", "/Ruth.2", 0, 2));
    await flush();
    expect(a.urls()).toEqual(["/Exodus.3", "/Ruth.2"]);

    // Same holder, newer term: messages stamped with the old term are dropped.
    t.deliver(roomMsg("sarah", 3));
    t.deliver(change("sarah", "/Ruth.3", 1, 2));
    t.deliver(change("sarah", "/Ruth.4", 1, 3));
    await flush();
    expect(a.urls()).toEqual(["/Exodus.3", "/Ruth.2", "/Ruth.4"]);
  });

  it("breaks away on local input (not on a change without input), keeps folding, and Follow again applies the latest", async () => {
    const { a, t, client, presence } = setup();
    t.deliver(people(me, akiva));
    t.deliver(roomMsg("akiva", 1));
    t.deliver(keyframe("akiva", "/Exodus.3", 0, 1));
    await flush();

    a.input();
    expect(client.getState().status).toBe("paused");
    expect(presence().at(-1)).toEqual({ type: "status", following: null, away: false });
    t.deliver(change("akiva", "/Exodus.4", 1, 1));
    t.deliver(change("akiva", "/Exodus.5", 2, 1));
    await flush();
    expect(a.urls()).toEqual(["/Exodus.3"]);

    client.followAgain();
    await flush();
    expect(client.getState().status).toBe("live");
    expect(a.urls()).toEqual(["/Exodus.3", "/Exodus.5"]);
    expect(presence().at(-1)).toEqual({ type: "status", following: "akiva", away: false });

    // the reader settling itself (a first position report after joining) is not the person: no break-away
    a.localChange("/Psalms.23");
    expect(client.getState().status).toBe("live");
  });

  it("stays paused when the spotlight moves while broken away", async () => {
    const { a, t, client } = setup();
    t.deliver(people(me, akiva, sarah));
    t.deliver(roomMsg("akiva", 1));
    a.input();
    t.deliver(roomMsg("sarah", 2));
    t.deliver(keyframe("sarah", "/Ruth.1", 0, 2));
    await flush();
    expect(client.getState()).toMatchObject({ status: "paused", following: "sarah" });
    expect(a.urls()).toEqual([]);
    client.followAgain();
    await flush();
    expect(a.urls()).toEqual(["/Ruth.1"]);
  });

  it("follows a chosen participant regardless of the spotlight, and null returns to the spotlight", async () => {
    const { a, t, client, resyncs } = setup();
    t.deliver(people(me, akiva, sarah));
    t.deliver(roomMsg("akiva", 1));
    client.follow("sarah");
    expect(client.getState()).toMatchObject({ status: "live", following: "sarah", chosen: "sarah" });
    expect(resyncs()).toEqual(["akiva", "sarah"]);
    // Chosen streams are not term-filtered (terms belong to the spotlight).
    t.deliver(keyframe("sarah", "/Ruth.1", 0, 0));
    t.deliver(roomMsg("akiva", 5));
    t.deliver(change("sarah", "/Ruth.2", 1, 0));
    await flush();
    expect(a.urls()).toEqual(["/Ruth.1", "/Ruth.2"]);

    client.follow(null);
    expect(client.getState().following).toBe("akiva");
    expect(resyncs().at(-1)).toBe("akiva");
  });

  it("never follows itself; holding the spotlight is leading, and taking it refreshes the room's keyframe", () => {
    const { t, s, client } = setup();
    t.deliver(people(me, akiva));
    t.deliver(roomMsg(null, 0));
    expect(client.getState()).toMatchObject({ status: "no-leader", following: null });
    expect(s.writers).toHaveLength(0);
    t.deliver(roomMsg("me", 1));
    expect(client.getState()).toMatchObject({ status: "leading", following: null });
    expect(s.writers[0]!.keyframes).toBe(1);
    client.follow("me");
    expect(client.getState().chosen).toBeNull();
  });

  it("answers a resync addressed to itself with a keyframe", () => {
    const { t, s } = setup();
    t.deliver(roomMsg("me", 1));
    const before = s.writers[0]!.keyframes;
    t.deliver({ ch: "state", body: { type: "resync", of: "someone-else" } });
    expect(s.writers[0]!.keyframes).toBe(before);
    t.deliver({ ch: "state", body: { type: "resync", of: "me" } });
    expect(s.writers[0]!.keyframes).toBe(before + 1);
  });

  it("asks for a resync on a gap", async () => {
    const { t, resyncs } = setup();
    t.deliver(people(me, akiva));
    t.deliver(roomMsg("akiva", 1));
    t.deliver(keyframe("akiva", "/Exodus.3", 0, 1));
    t.deliver(change("akiva", "/Exodus.9", 5, 1));
    await flush();
    expect(resyncs()).toEqual(["akiva", "akiva"]);
  });

  it("shows leader-away when the followed participant is hidden or gone", () => {
    const { t, client } = setup();
    t.deliver(people(me, { ...akiva, away: true }));
    t.deliver(roomMsg("akiva", 1));
    expect(client.getState().status).toBe("leader-away");
    t.deliver(people(me, akiva));
    expect(client.getState().status).toBe("live");
    t.deliver(people(me));
    expect(client.getState().status).toBe("leader-away");
  });

  it("reconnects: status reconnecting, then re-joins, keyframes and resyncs on reopen", () => {
    const { t, s, client, resyncs } = setup();
    t.deliver({ ch: "presence", body: { type: "participants", participants: [{ ...me, following: null, away: false }, { ...akiva, following: "me", away: false }] } });
    t.deliver(roomMsg("akiva", 1));
    expect(s.writers).toHaveLength(1); // Akiva follows this reader
    t.setStatus("connecting");
    expect(client.getState().status).toBe("reconnecting");

    const sentBefore = t.sent.length;
    const keyframesBefore = s.writers[0]!.keyframes;
    t.setStatus("open");
    const after = t.sent.slice(sentBefore);
    expect(after[0]).toEqual({ ch: "control", body: { type: "join", participant: me } });
    expect(after.some((e) => e.ch === "state" && e.body.type === "hello")).toBe(true);
    expect(s.writers).toHaveLength(1);
    expect(s.writers[0]!.keyframes).toBe(keyframesBefore + 1);
    expect(resyncs()).toEqual(["akiva", "akiva"]);
    expect(client.getState().status).toBe("reconnecting");
    t.deliver(roomMsg("akiva", 1));
    expect(client.getState().status).toBe("live");
  });

  it("ends when the room ends: stops the writer, closes the transport, ignores later messages", async () => {
    const { a, t, s, client } = setup();
    const cb = vi.fn();
    client.subscribe(cb);
    t.deliver(people(me, akiva));
    t.deliver(roomMsg("me", 1));
    t.deliver(roomMsg("akiva", 1, { ended: true }));
    expect(client.getState().status).toBe("ended");
    expect(s.writers[0]!.stopped).toBe(true);
    expect(t.transport.status).toBe("closed");
    expect(a.listenerCount()).toBe(0);
    expect(cb).toHaveBeenCalled();
    t.deliver(keyframe("akiva", "/Exodus.3", 0, 1));
    await flush();
    expect(a.urls()).toEqual([]);
  });

  it("stop() sends leave and ends", () => {
    const { t, client } = setup();
    t.deliver(roomMsg("akiva", 1));
    client.stop();
    expect(t.sent.at(-1)).toEqual({ ch: "control", body: { type: "leave" } });
    expect(client.getState().status).toBe("ended");
    expect(t.transport.status).toBe("closed");
  });

  it("sends control commands", () => {
    const { t, client } = setup();
    client.spotlight("sarah");
    client.raiseHand();
    client.setMode("open");
    client.end();
    expect(t.sent.filter((e) => e.ch === "control").map((e) => e.body)).toEqual([
      { type: "join", participant: me },
      { type: "spotlight", to: "sarah" },
      { type: "raise-hand" },
      { type: "mode", mode: "open" },
      { type: "end" },
    ]);
  });

  it("reports away on visibilitychange", () => {
    const { t, presence } = setup();
    t.deliver(roomMsg(null, 0));
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(presence().at(-1)).toEqual({ type: "status", following: null, away: true });
    vis.mockRestore();
  });

  it("keeps the state object stable between changes (useSyncExternalStore)", () => {
    const { t, client } = setup();
    t.deliver(roomMsg("akiva", 1));
    const s1 = client.getState();
    expect(client.getState()).toBe(s1);
    t.deliver(roomMsg("sarah", 2));
    expect(client.getState()).not.toBe(s1);
  });

  it("works over a memory transport pair with a scripted room", async () => {
    const a = fakeApi();
    const s = fakeStreams();
    const [clientEnd, roomEnd] = createMemoryPair<AnyEnvelope>();
    const fromClient: AnyEnvelope[] = [];
    roomEnd.onMessage((m) => {
      fromClient.push(m);
      if (m.ch === "state" && m.body.type === "resync" && m.body.of === "akiva") roomEnd.send(keyframe("akiva", "/Exodus.3", 0, 1));
    });
    const client = createSessionClient({ api: a.api, transport: clientEnd, self: me, streams: s.factories });
    await flush();
    expect(fromClient[0]).toMatchObject({ ch: "control", body: { type: "join" } });
    roomEnd.send(people(me, akiva));
    roomEnd.send(roomMsg("akiva", 1));
    await flush();
    await flush();
    expect(client.getState().status).toBe("live");
    expect(a.urls()).toEqual(["/Exodus.3"]);
    client.stop();
  });
});
