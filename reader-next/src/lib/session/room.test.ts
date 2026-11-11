import { createRoom, parseEnvelope, type Outgoing, type RoomLimits } from "./room";
import type { AnyEnvelope, Participant } from "./protocol";
import type { ReaderSnapshot } from "~/lib/reader-state/core/types";

/** A room with a hand-driven clock. */
function setup(opts: { graceMs?: number; limits?: Partial<RoomLimits> } = {}) {
  let clock = 1_000;
  const room = createRoom({
    now: () => clock,
    graceMs: opts.graceMs,
    limits: { maxMessageBytes: 16_384, maxParticipants: 200, stateMessagesPerSecond: 20, ...opts.limits },
  });
  return {
    room,
    advance(ms: number) {
      clock += ms;
    },
    get now() {
      return clock;
    },
  };
}

const host: Participant = { id: "host", name: "Rabbi", isHost: true, canLead: true };
const reader2: Participant = { id: "reader2", name: "Reader Two", isHost: false, canLead: true };
const dan: Participant = { id: "dan", name: "Dan", isHost: false, canLead: false };
const host2: Participant = { id: "host2", isHost: true, canLead: true };

const join = (p: Participant) => ({ ch: "control", body: { type: "join", participant: p } });
const ctl = (body: object) => ({ ch: "control", body });
const snap = (url: string, slices: ReaderSnapshot["slices"] = {}): ReaderSnapshot => ({ v: 1, url, nav: null, slices });
const keyframe = (seq: number, t: number, snapshot: ReaderSnapshot) => ({ ch: "state", body: { type: "keyframe", seq, t, snapshot } });
const change = (seq: number, t: number, c: object) => ({ ch: "state", body: { type: "change", seq, t, change: c } });

/** Connect and join; returns what the join produced. */
function enter(room: ReturnType<typeof setup>["room"], conn: string, p: Participant): Outgoing[] {
  room.connect(conn);
  return room.handle(conn, join(p));
}

const bodies = (out: Outgoing[]) => out.map((o) => o.envelope.body);
const roomMsgs = (out: Outgoing[]) =>
  out.filter((o) => o.envelope.ch === "control" && o.envelope.body.type === "room") as (Outgoing & {
    envelope: AnyEnvelope & { ch: "control"; body: { type: "room"; spotlight: string | null; term: number } };
  })[];
const refusedOf = (out: Outgoing[]) =>
  out.flatMap((o) => (o.envelope.ch === "control" && o.envelope.body.type === "refused" ? [o.envelope.body] : []));

describe("join and leave", () => {
  it("replies with the room's state to the joiner and broadcasts participants", () => {
    const { room } = setup();
    const out = enter(room, "c1", dan);
    expect(out[0]).toMatchObject({ to: "c1", envelope: { ch: "control", body: { type: "room", spotlight: null, term: 0, mode: "presenter", hands: [], ended: false } } });
    expect(out).toContainEqual(
      expect.objectContaining({
        to: "all",
        envelope: expect.objectContaining({ ch: "presence", body: { type: "participants", participants: [{ ...dan, following: null, away: false }] } }),
      }),
    );
  });

  it("gives the spotlight to the first host to join while it is empty, bumping the term", () => {
    const { room } = setup();
    enter(room, "c1", dan);
    const out = enter(room, "c2", host);
    expect(room.snapshot()).toMatchObject({ spotlight: "host", term: 1 });
    // The joiner hears it directly; the others hear it too.
    expect(roomMsgs(out).map((o) => o.to)).toEqual(["c2", { except: "c2" }]);
    enter(room, "c3", host2);
    expect(room.snapshot()).toMatchObject({ spotlight: "host", term: 1 });
  });

  it("refuses joins beyond maxParticipants, but lets an existing participant rejoin", () => {
    const { room } = setup({ limits: { maxParticipants: 2 } });
    enter(room, "c1", host);
    enter(room, "c2", reader2);
    expect(refusedOf(enter(room, "c3", dan))).toEqual([{ type: "refused", of: "join", reason: "room full" }]);
    expect(refusedOf(enter(room, "c4", reader2))).toEqual([]);
    expect(room.snapshot().participants.map((p) => [p.id, p.conn])).toEqual([["host", "c1"], ["reader2", "c4"]]);
  });

  it("a participant reconnecting on a new connection replaces the old one; the old connection's close does not remove them", () => {
    const { room } = setup();
    enter(room, "c1", reader2);
    enter(room, "c2", reader2);
    expect(room.disconnect("c1")).toEqual([]);
    expect(room.snapshot().participants.map((p) => p.id)).toEqual(["reader2"]);
  });

  it("leave and disconnect remove the participant and broadcast participants", () => {
    const { room } = setup();
    enter(room, "c1", host);
    enter(room, "c2", reader2);
    enter(room, "c3", dan);
    const out = room.handle("c2", ctl({ type: "leave" }));
    expect(bodies(out)).toContainEqual(expect.objectContaining({ type: "participants" }));
    room.disconnect("c3");
    expect(room.snapshot().participants.map((p) => p.id)).toEqual(["host"]);
  });

  it("ignores messages before join, refusing control ones", () => {
    const { room } = setup();
    room.connect("c1");
    expect(room.handle("c1", keyframe(0, 0, snap("/a")))).toEqual([]);
    expect(refusedOf(room.handle("c1", ctl({ type: "spotlight", to: null })))).toEqual([
      { type: "refused", of: "spotlight", reason: "not joined" },
    ]);
  });

  it("ignores connections it was never told about", () => {
    const { room } = setup();
    expect(room.handle("ghost", join(host))).toEqual([]);
  });
});

describe("spotlight rules", () => {
  function three() {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "s", reader2);
    enter(s.room, "d", dan);
    return s;
  }

  it("a host may move it anywhere a leader can go, and clear it", () => {
    const { room } = three();
    let out = room.handle("h", ctl({ type: "spotlight", to: "reader2" }));
    expect(roomMsgs(out)[0]).toMatchObject({ to: "all", envelope: { body: { spotlight: "reader2", term: 2 } } });
    out = room.handle("h", ctl({ type: "spotlight", to: null }));
    expect(room.snapshot()).toMatchObject({ spotlight: null, term: 3 });
  });

  it("refuses a target who cannot lead or is not here", () => {
    const { room } = three();
    expect(refusedOf(room.handle("h", ctl({ type: "spotlight", to: "dan" })))[0]?.reason).toBe("participant cannot lead");
    expect(refusedOf(room.handle("h", ctl({ type: "spotlight", to: "nobody" })))[0]?.reason).toBe("unknown participant");
    expect(room.snapshot().term).toBe(1);
  });

  it("the holder may hand it over; others may not take it in presenter mode", () => {
    const { room } = three();
    room.handle("h", ctl({ type: "spotlight", to: "reader2" }));
    expect(refusedOf(room.handle("d", ctl({ type: "spotlight", to: "dan" })))[0]).toEqual({
      type: "refused",
      of: "spotlight",
      reason: "not permitted",
    });
    room.handle("s", ctl({ type: "spotlight", to: "host" }));
    expect(room.snapshot()).toMatchObject({ spotlight: "host", term: 3 });
    expect(refusedOf(room.handle("s", ctl({ type: "spotlight", to: "reader2" })))[0]?.reason).toBe("not permitted");
  });

  it("in open mode anyone who canLead takes it for themself (but cannot hand it to others)", () => {
    const { room } = three();
    expect(refusedOf(room.handle("s", ctl({ type: "mode", mode: "open" })))[0]?.reason).toBe("host only");
    room.handle("h", ctl({ type: "mode", mode: "open" }));
    expect(room.snapshot().mode).toBe("open");
    room.handle("s", ctl({ type: "spotlight", to: "reader2" }));
    expect(room.snapshot().spotlight).toBe("reader2");
    expect(refusedOf(room.handle("d", ctl({ type: "spotlight", to: "dan" })))[0]?.reason).toBe("not permitted");
  });

  it("re-setting the current holder does not bump the term", () => {
    const { room } = three();
    const out = room.handle("h", ctl({ type: "spotlight", to: "host" }));
    expect(roomMsgs(out).map((o) => o.to)).toEqual(["h"]);
    expect(room.snapshot().term).toBe(1);
  });

  it("raised hands are listed, and cleared when the hand gets the spotlight or leaves", () => {
    const { room } = three();
    room.handle("h", ctl({ type: "mode", mode: "hand-raise" }));
    expect(refusedOf(room.handle("d", ctl({ type: "raise-hand" })))[0]?.reason).toBe("cannot lead");
    const out = room.handle("s", ctl({ type: "raise-hand" }));
    expect(roomMsgs(out)[0]).toMatchObject({ to: "all", envelope: { body: { hands: ["reader2"] } } });
    room.handle("h", ctl({ type: "spotlight", to: "reader2" }));
    expect(room.snapshot().hands).toEqual([]);
    room.handle("h", ctl({ type: "spotlight", to: "host" }));
    room.handle("s", ctl({ type: "raise-hand" }));
    room.disconnect("s");
    expect(room.snapshot().hands).toEqual([]);
  });
});

describe("grace when the holder leaves", () => {
  it("keeps the spotlight for graceMs, then moves it to a connected host", () => {
    const s = setup({ graceMs: 30_000 });
    enter(s.room, "h", host);
    enter(s.room, "h2", host2);
    s.room.disconnect("h");
    expect(s.room.snapshot()).toMatchObject({ spotlight: "host", term: 1, graceUntil: s.now + 30_000 });
    s.advance(29_999);
    expect(s.room.tick()).toEqual([]);
    s.advance(1);
    const out = s.room.tick();
    expect(roomMsgs(out)[0]).toMatchObject({ to: "all", envelope: { body: { spotlight: "host2", term: 2 } } });
    expect(s.room.snapshot().graceUntil).toBeNull();
    expect(s.room.tick()).toEqual([]);
  });

  it("clears it when no host is left", () => {
    const s = setup({ graceMs: 1000 });
    enter(s.room, "h", host);
    enter(s.room, "s", reader2);
    s.room.handle("h", ctl({ type: "spotlight", to: "reader2" }));
    s.room.disconnect("s");
    s.room.disconnect("h");
    s.advance(1000);
    s.room.tick();
    expect(s.room.snapshot()).toMatchObject({ spotlight: null, term: 3 });
  });

  it("a holder who comes back within the grace keeps it, with the same term", () => {
    const s = setup({ graceMs: 1000 });
    enter(s.room, "h", host);
    s.room.disconnect("h");
    s.advance(500);
    enter(s.room, "h-again", host);
    s.advance(1000);
    expect(s.room.tick()).toEqual([]);
    expect(s.room.snapshot()).toMatchObject({ spotlight: "host", term: 1, graceUntil: null });
  });

  it("keeps the departed holder's stream for resync until the spotlight moves on", () => {
    const s = setup({ graceMs: 1000 });
    enter(s.room, "h", host);
    enter(s.room, "d", dan);
    s.room.handle("h", keyframe(0, 0, snap("/Genesis.1")));
    s.room.disconnect("h");
    const out = s.room.handle("d", { ch: "state", body: { type: "resync", of: "host" } });
    expect(out[0]?.envelope.body).toMatchObject({ type: "keyframe", snapshot: { url: "/Genesis.1" } });
    s.advance(1000);
    s.room.tick();
    expect(s.room.snapshot().streams).toEqual({});
    expect(s.room.handle("d", { ch: "state", body: { type: "resync", of: "host" } })).toEqual([]);
  });
});

describe("state relay", () => {
  function pair() {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "s", reader2);
    return s;
  }

  it("relays to everyone but the sender, stamping from and t, and term only for the spotlight holder", () => {
    const s = pair();
    s.advance(5);
    const fromHost = s.room.handle("h", keyframe(0, 0, snap("/Genesis.1")));
    expect(fromHost).toEqual([
      {
        to: { except: "h" },
        envelope: { ch: "state", from: "host", t: s.now, term: 1, body: { type: "keyframe", seq: 0, t: 0, snapshot: snap("/Genesis.1") } },
      },
    ]);
    // Reader Two does not hold the spotlight: her stream goes only to whoever follows her.
    expect(s.room.handle("s", keyframe(0, 0, snap("/Exodus.1")))).toEqual([]);
    s.room.handle("h", { ch: "presence", body: { type: "status", following: "reader2", away: false } });
    const fromSarah = s.room.handle("s", keyframe(1, 0, snap("/Exodus.1")));
    expect(fromSarah).toHaveLength(1);
    expect(fromSarah[0]?.to).toBe("h");
    expect(fromSarah[0]?.envelope).not.toHaveProperty("term");
    expect(fromSarah[0]?.envelope.from).toBe("reader2");
  });

  it("sends a non-spotlight stream only to its followers, never to those who wandered off", () => {
    const s = pair();
    enter(s.room, "d", dan);
    s.room.handle("d", { ch: "presence", body: { type: "status", following: "reader2", away: false } });
    const out = s.room.handle("s", change(1, 1, { url: "/search?q=x" }));
    expect(out.map((o) => o.to)).toEqual(["d"]);
    s.room.handle("d", { ch: "presence", body: { type: "status", following: null, away: false } });
    expect(s.room.handle("s", change(2, 2, { url: "/Ruth.1" }))).toEqual([]);
  });

  it("ignores client-sent from, seq, t and term", () => {
    const s = pair();
    s.room.handle("h", { ch: "presence", body: { type: "status", following: "reader2", away: false } });
    const out = s.room.handle("s", { ...keyframe(0, 0, snap("/a")), from: "host", seq: 99, t: 1, term: 42 });
    expect(out[0]?.envelope).toEqual({ ch: "state", from: "reader2", t: s.now, body: expect.anything() });
  });

  it("stamps the term current when relayed, after the spotlight moves", () => {
    const s = pair();
    s.room.handle("h", ctl({ type: "spotlight", to: "reader2" }));
    s.room.handle("h", { ch: "presence", body: { type: "status", following: "reader2", away: false } });
    s.room.handle("s", { ch: "presence", body: { type: "status", following: "host", away: false } });
    expect(s.room.handle("s", change(1, 10, { url: "/b" }))[0]?.envelope.term).toBe(2);
    expect(s.room.handle("h", change(1, 10, { url: "/c" }))[0]?.envelope).not.toHaveProperty("term");
  });

  it("relays only the fields the protocol defines", () => {
    const s = pair();
    const out = s.room.handle("h", { ch: "state", body: { type: "change", seq: 1, t: 1, change: { url: "/x", evil: 1 }, extra: true } });
    expect(out[0]?.envelope.body).toEqual({ type: "change", seq: 1, t: 1, change: { url: "/x" } });
  });

  it("answers hello with the spotlight holder's keyframe", () => {
    const s = pair();
    s.room.handle("h", keyframe(3, 30, snap("/Genesis.1")));
    const out = s.room.handle("s", { ch: "state", body: { type: "hello", protocol: 1, slices: [], client: "test" } });
    expect(out).toEqual([
      { to: "s", envelope: { ch: "state", from: "host", t: s.now, term: 1, body: { type: "keyframe", seq: 3, t: 30, snapshot: snap("/Genesis.1") } } },
    ]);
    // The holder's own hello gets nothing.
    expect(s.room.handle("h", { ch: "state", body: { type: "hello", protocol: 1, slices: [], client: "test" } })).toEqual([]);
  });
});

describe("resync", () => {
  it("answers with a keyframe of the running snapshot (keyframe + folded changes), latest seq and t", () => {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "d", dan);
    s.room.handle("h", keyframe(0, 0, snap("/Genesis.1", { "sefaria.settings": { v: 1, value: { size: 1 } } })));
    s.room.handle("h", change(1, 100, { url: "/Genesis.2" }));
    s.room.handle("h", change(2, 250, { slices: { "sefaria.scroll": { v: 1, value: { ref: "Genesis 2:3" } }, "sefaria.settings": null } }));
    s.room.handle("h", change(3, 400, { nav: { kind: "text" } }));
    s.advance(7);
    const out = s.room.handle("d", { ch: "state", body: { type: "resync", of: "host" } });
    expect(out).toEqual([
      {
        to: "d",
        envelope: {
          ch: "state",
          from: "host",
          t: s.now,
          term: 1,
          body: {
            type: "keyframe",
            seq: 3,
            t: 400,
            snapshot: { v: 1, url: "/Genesis.2", nav: { kind: "text" }, slices: { "sefaria.scroll": { v: 1, value: { ref: "Genesis 2:3" } } } },
          },
        },
      },
    ]);
  });

  it("a later keyframe replaces the running snapshot", () => {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "d", dan);
    s.room.handle("h", keyframe(0, 0, snap("/a", { x: { v: 1, value: 1 } })));
    s.room.handle("h", keyframe(1, 10, snap("/b")));
    expect(s.room.snapshot().streams.host).toEqual({ seq: 1, t: 10, snapshot: snap("/b") });
  });

  it("answers nothing for a participant without a keyframe (changes before a keyframe are not folded)", () => {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "d", dan);
    s.room.handle("h", change(1, 10, { url: "/b" }));
    expect(s.room.handle("d", { ch: "state", body: { type: "resync", of: "host" } })).toEqual([]);
    expect(s.room.handle("d", { ch: "state", body: { type: "resync", of: "nobody" } })).toEqual([]);
  });

  it("never folds a __proto__ slice", () => {
    const s = setup();
    enter(s.room, "h", host);
    s.room.handle("h", keyframe(0, 0, snap("/a")));
    s.room.handle("h", JSON.stringify(change(1, 1, { slices: JSON.parse('{"__proto__": {"v": 1, "value": "x"}}') })));
    s.room.handle("h", '{"ch":"state","body":{"type":"change","seq":2,"t":2,"change":{"slices":{"__proto__":{"v":1,"value":"y"}}}}}');
    const kept = s.room.snapshot().streams.host!.snapshot!;
    expect(Object.keys(kept.slices)).toEqual([]);
    expect(Object.getPrototypeOf(kept.slices)).toBe(Object.prototype);
  });
});

describe("rate limit", () => {
  it("drops state messages beyond the per-second limit, keyframes beyond their own, and resets each second", () => {
    const s = setup({ limits: { stateMessagesPerSecond: 3, keyframesPerSecond: 2 } });
    enter(s.room, "h", host);
    enter(s.room, "d", dan);
    const relayed = (out: Outgoing[]) => out.length;
    expect(relayed(s.room.handle("h", keyframe(0, 0, snap("/a"))))).toBe(1);
    expect(relayed(s.room.handle("h", change(1, 1, { url: "/b" })))).toBe(1);
    expect(relayed(s.room.handle("h", change(2, 2, { url: "/c" })))).toBe(1);
    expect(relayed(s.room.handle("h", change(3, 3, { url: "/d" })))).toBe(1);
    expect(relayed(s.room.handle("h", change(4, 4, { url: "/d" })))).toBe(0);
    expect(relayed(s.room.handle("h", keyframe(4, 4, snap("/e"))))).toBe(1);
    expect(relayed(s.room.handle("h", keyframe(4, 4, snap("/e"))))).toBe(0);
    expect(relayed(s.room.handle("h", change(5, 5, { url: "/f" })))).toBe(0);
    // Dropped from the relay, still folded: the follower that sees the gap resyncs to the true state.
    expect(s.room.snapshot().streams.host).toMatchObject({ seq: 5, snapshot: { url: "/f" } });
    s.advance(1000);
    expect(relayed(s.room.handle("h", change(6, 6, { url: "/g" })))).toBe(1);
  });

  it("is per participant", () => {
    const s = setup({ limits: { stateMessagesPerSecond: 1 } });
    enter(s.room, "h", host);
    enter(s.room, "s", reader2);
    s.room.handle("h", { ch: "presence", body: { type: "status", following: "reader2", away: false } });
    expect(s.room.handle("h", change(1, 1, { url: "/b" }))).toHaveLength(1);
    expect(s.room.handle("s", change(1, 1, { url: "/b" }))).toHaveLength(1);
    expect(s.room.handle("h", change(2, 2, { url: "/c" }))).toHaveLength(0);
  });
});

describe("control and presence limits", () => {
  it("caps control and presence per connection, but always lets leave through", () => {
    const s = setup({ limits: { controlMessagesPerSecond: 2 } });
    enter(s.room, "h", host); // the join is the first
    enter(s.room, "d", dan);
    const status = (away: boolean) => ({ ch: "presence", body: { type: "status", following: null, away } });
    expect(s.room.handle("d", status(true))).toHaveLength(1);
    expect(s.room.handle("d", status(false))).toEqual([]);
    expect(s.room.handle("d", ctl({ type: "leave" }))).not.toEqual([]);
    s.advance(1000);
    expect(s.room.handle("h", status(true))).toHaveLength(1);
  });

  it("broadcasts nothing for a presence status that changes nothing, or the same join again", () => {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "d", dan);
    const status = { ch: "presence", body: { type: "status", following: "host", away: false } };
    expect(s.room.handle("d", status)).toHaveLength(1);
    expect(s.room.handle("d", status)).toEqual([]);
    s.advance(1000);
    const again = s.room.handle("d", join(dan));
    expect(again.map((o) => o.to)).toEqual(["d", "d"]);
  });
});

describe("size limit and validation", () => {
  it("drops envelopes larger than maxMessageBytes (JSON length), as objects or text", () => {
    const s = setup({ limits: { maxMessageBytes: 200 } });
    enter(s.room, "h", host);
    enter(s.room, "d", dan);
    const big = keyframe(0, 0, snap("/" + "x".repeat(300)));
    expect(s.room.handle("h", big)).toEqual([]);
    expect(s.room.handle("h", JSON.stringify(big))).toEqual([]);
    expect(s.room.handle("h", keyframe(0, 0, snap("/ok")))).toHaveLength(1);
  });

  it.each([
    ["not an object", 42],
    ["bad JSON text", "{nope"],
    ["unknown channel", { ch: "video", body: { type: "x" } }],
    ["chat (reserved)", { ch: "chat", body: { type: "message" } }],
    ["no body", { ch: "state" }],
    ["unknown state type", { ch: "state", body: { type: "explode" } }],
    ["negative seq", { ch: "state", body: { type: "change", seq: -1, t: 0, change: {} } }],
    ["snapshot of another version", { ch: "state", body: { type: "keyframe", seq: 0, t: 0, snapshot: { v: 2, url: "/a", slices: {} } } }],
    ["slice value without v", { ch: "state", body: { type: "change", seq: 0, t: 0, change: { slices: { a: { value: 1 } } } } }],
    ["join without flags", { ch: "control", body: { type: "join", participant: { id: "x" } } }],
    ["unknown mode", { ch: "control", body: { type: "mode", mode: "anarchy" } }],
    ["a client sending room", { ch: "control", body: { type: "room", spotlight: "x", term: 9, mode: "open", hands: [], ended: false } }],
    ["presence with a bad following", { ch: "presence", body: { type: "status", following: 3, away: false } }],
    ["a cycle", (() => { const o: Record<string, unknown> = { ch: "state" }; o.body = o; return o; })()],
  ])("drops %s", (_, raw) => {
    expect(parseEnvelope(raw)).toBeNull();
  });

  it("trims a participant to the protocol's fields", () => {
    expect(parseEnvelope({ ch: "control", body: { type: "join", participant: { ...host, admin: true } } })).toEqual({
      ch: "control",
      body: { type: "join", participant: host },
    });
  });
});

describe("presence", () => {
  it("stores following/away and broadcasts participants", () => {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "d", dan);
    const out = s.room.handle("d", { ch: "presence", body: { type: "status", following: "host", away: true } });
    expect(out).toEqual([
      {
        to: "all",
        envelope: {
          ch: "presence",
          t: s.now,
          body: { type: "participants", participants: [{ ...host, following: null, away: false }, { ...dan, following: "host", away: true }] },
        },
      },
    ]);
  });
});

describe("end", () => {
  it("is host-only; broadcasts ended, then refuses control and drops everything else", () => {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "s", reader2);
    expect(refusedOf(s.room.handle("s", ctl({ type: "end" })))[0]?.reason).toBe("host only");
    const out = s.room.handle("h", ctl({ type: "end" }));
    expect(roomMsgs(out)[0]).toMatchObject({ to: "all", envelope: { body: { ended: true } } });
    expect(refusedOf(s.room.handle("h", ctl({ type: "spotlight", to: "reader2" })))[0]?.reason).toBe("ended");
    expect(s.room.handle("h", keyframe(0, 0, snap("/a")))).toEqual([]);
    expect(s.room.handle("s", { ch: "presence", body: { type: "status", following: null, away: false } })).toEqual([]);
    expect(s.room.tick()).toEqual([]);
    // A late joiner is told the room ended, and is not registered.
    const late = enter(s.room, "d", dan);
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ to: "d", envelope: { body: { type: "room", ended: true } } });
  });
});

describe("envelope stamping and recipients", () => {
  it("numbers control messages it sends", () => {
    const s = setup();
    const out = enter(s.room, "h", host);
    const seqs = out.filter((o) => o.envelope.ch === "control").map((o) => o.envelope.seq);
    expect(seqs).toEqual([1, 2]);
    expect(s.room.handle("h", ctl({ type: "mode", mode: "open" }))[0]?.envelope.seq).toBe(3);
  });

  it("resolves recipients to joined connections", () => {
    const s = setup();
    enter(s.room, "h", host);
    enter(s.room, "s", reader2);
    s.room.connect("lurker");
    expect(s.room.recipients("all")).toEqual(["h", "s"]);
    expect(s.room.recipients({ except: "h" })).toEqual(["s"]);
    expect(s.room.recipients("lurker")).toEqual(["lurker"]);
    expect(s.room.recipients("gone")).toEqual([]);
  });
});
