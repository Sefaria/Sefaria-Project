import { CONNECT_TIMEOUT_MS, DEAD_AFTER_MS, channelName, connectLocalRoom, hostLocalRoom } from "./local-room";
import type { AnyEnvelope, Participant } from "./protocol";
import type { StateTransport } from "~/lib/reader-state/core/types";

/** A BroadcastChannel stand-in: every instance with the same name but the sender gets each post, asynchronously, as a structured clone. */
class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((e: MessageEvent) => void) | null = null;
  closed = false;
  constructor(readonly name: string) {
    if (!FakeBroadcastChannel.channels.has(name)) FakeBroadcastChannel.channels.set(name, new Set());
    FakeBroadcastChannel.channels.get(name)!.add(this);
  }
  postMessage(data: unknown) {
    if (this.closed) throw new Error("InvalidStateError");
    const peers = [...(FakeBroadcastChannel.channels.get(this.name) ?? [])].filter((c) => c !== this);
    const copy = structuredClone(data);
    queueMicrotask(() => {
      for (const peer of peers) if (!peer.closed) peer.onmessage?.({ data: copy } as MessageEvent);
    });
  }
  close() {
    this.closed = true;
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

const host: Participant = { id: "host", isHost: true, canLead: true };
const dan: Participant = { id: "dan", isHost: false, canLead: false };
const joinMsg = (p: Participant): AnyEnvelope => ({ ch: "control", body: { type: "join", participant: p } });

function record(t: StateTransport<AnyEnvelope>) {
  const got: AnyEnvelope[] = [];
  t.onMessage((m) => got.push(m));
  return got;
}

/** A raw tab on the channel, speaking the frame format directly (for a tab that vanishes without saying bye). */
function rawTab(sessionId: string, conn: string) {
  const bc = new FakeBroadcastChannel(channelName(sessionId));
  return {
    post(frame: object) {
      bc.postMessage({ tag: "sefaria-reader-state", from: conn, data: JSON.stringify({ to: "room", conn, ...frame }) });
    },
    close: () => bc.close(),
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  FakeBroadcastChannel.channels.clear();
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("local room", () => {
  it("connects a tab: connecting until the room answers, then follows the host's stream", async () => {
    const roomHost = hostLocalRoom("s1");
    const self = roomHost.connectSelf();
    const selfGot = record(self);
    self.send(joinMsg(host));
    await flush();
    expect(roomHost.room.snapshot().spotlight).toBe("host");

    const tab = connectLocalRoom("s1");
    const statuses: string[] = [];
    tab.onStatus((s) => statuses.push(s));
    expect(tab.status).toBe("connecting");
    await flush();
    expect(tab.status).toBe("open");
    expect(statuses).toEqual(["open"]);

    const got = record(tab);
    tab.send(joinMsg(dan));
    await flush();
    expect(got.map((e) => [e.ch, e.body.type])).toEqual([
      ["control", "room"],
      ["presence", "participants"],
    ]);
    // The host tab's own client hears the newcomer too.
    expect(selfGot.at(-1)).toMatchObject({ ch: "presence", body: { type: "participants" } });

    self.send({ ch: "state", body: { type: "keyframe", seq: 0, t: 0, snapshot: { v: 1, url: "/Genesis.1", nav: null, slices: {} } } });
    await flush();
    expect(got.at(-1)).toMatchObject({ ch: "state", from: "host", term: 1, body: { type: "keyframe", snapshot: { url: "/Genesis.1" } } });
    // Not echoed to the sender.
    expect(selfGot.some((e) => e.ch === "state")).toBe(false);

    // A tab's state reaches the host's own client once it follows that tab (a stream goes only to whoever follows it).
    self.send({ ch: "presence", body: { type: "status", following: "dan", away: false } });
    await flush();
    tab.send({ ch: "state", body: { type: "change", seq: 1, t: 5, change: { url: "/Exodus.1" } } });
    await flush();
    expect(selfGot.at(-1)).toMatchObject({ ch: "state", from: "dan", body: { type: "change" } });
    roomHost.close();
  });

  it("delivers nothing to a tab before its join is answered, nor frames for other tabs", async () => {
    const roomHost = hostLocalRoom("s2");
    const self = roomHost.connectSelf();
    self.send(joinMsg(host));
    const lurker = connectLocalRoom("s2");
    const got = record(lurker);
    await flush();
    const other = connectLocalRoom("s2");
    other.send(joinMsg(dan));
    await flush();
    expect(lurker.status).toBe("open");
    expect(got).toEqual([]);
    roomHost.close();
  });

  it("closes a tab when no room answers within the timeout", async () => {
    const tab = connectLocalRoom("nobody-here");
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 1);
    expect(tab.status).toBe("connecting");
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.status).toBe("closed");
  });

  it("closes tabs and own connections when the room closes", async () => {
    const roomHost = hostLocalRoom("s3");
    const self = roomHost.connectSelf();
    const tab = connectLocalRoom("s3");
    await flush();
    expect(tab.status).toBe("open");
    roomHost.close();
    await flush();
    expect(tab.status).toBe("closed");
    expect(self.status).toBe("closed");
    expect(roomHost.connectSelf().status).toBe("closed");
  });

  it("a tab that closes says bye and leaves the room", async () => {
    const roomHost = hostLocalRoom("s4");
    const tab = connectLocalRoom("s4");
    await flush();
    tab.send(joinMsg(dan));
    await flush();
    expect(roomHost.room.snapshot().participants.map((p) => p.id)).toEqual(["dan"]);
    tab.close();
    await flush();
    expect(tab.status).toBe("closed");
    expect(roomHost.room.snapshot().participants).toEqual([]);
    roomHost.close();
  });

  it("drops a tab that vanished without a bye once it has been silent too long", async () => {
    const roomHost = hostLocalRoom("s5");
    const ghost = rawTab("s5", "tab-ghost");
    ghost.post({ envelope: joinMsg(dan) });
    await flush();
    expect(roomHost.room.snapshot().participants.map((p) => p.id)).toEqual(["dan"]);
    ghost.close();
    await vi.advanceTimersByTimeAsync(DEAD_AFTER_MS + 1_000);
    expect(roomHost.room.snapshot().participants).toEqual([]);
    roomHost.close();
  });

  it("keeps a live tab that pings", async () => {
    const roomHost = hostLocalRoom("s6");
    const tab = connectLocalRoom("s6");
    await flush();
    tab.send(joinMsg(dan));
    await vi.advanceTimersByTimeAsync(DEAD_AFTER_MS * 3);
    expect(tab.status).toBe("open");
    expect(roomHost.room.snapshot().participants.map((p) => p.id)).toEqual(["dan"]);
    roomHost.close();
  });

  it("ticks the room: the spotlight clears after the holder's grace", async () => {
    const roomHost = hostLocalRoom("s7");
    const self = roomHost.connectSelf();
    self.send(joinMsg(host));
    const tab = connectLocalRoom("s7");
    const got = record(tab);
    await flush();
    tab.send(joinMsg(dan));
    await flush();
    self.close();
    await flush();
    expect(roomHost.room.snapshot().spotlight).toBe("host");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(roomHost.room.snapshot()).toMatchObject({ spotlight: null, term: 2 });
    expect(got.at(-1)).toMatchObject({ ch: "control", body: { type: "room", spotlight: null, term: 2 } });
    roomHost.close();
  });

  it("is born closed where BroadcastChannel does not exist (SSR)", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const tab = connectLocalRoom("s8");
    expect(tab.status).toBe("closed");
    tab.send(joinMsg(dan));
    tab.close();
  });
});
