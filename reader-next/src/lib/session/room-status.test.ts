import { describe, expect, it } from "vitest";
import { createRoom, type RoomSnapshot } from "./room";
import { STATUS_PATH, statusAuthorized, statusOf } from "./room-status";

const base = (over: Partial<RoomSnapshot> = {}): RoomSnapshot =>
  ({ spotlight: null, term: 0, mode: "host", hands: [], graceUntil: null, participants: [], streams: {}, ...over }) as RoomSnapshot;

const member = (id: string, name: string | undefined, away = false) => ({ id, name, isHost: true, canLead: true, following: null, away, conn: `c-${id}` });

describe("statusOf (spec 032: the feed card's status read)", () => {
  it("an empty room is not live and names nothing", () => {
    expect(statusOf(createRoom({ now: () => 0 }).snapshot())).toEqual({ live: false, away: false, url: null, leader: null, participants: 0 });
  });

  it("gives the spotlight stream's address, the leader's name and the head count", () => {
    const snap = base({
      spotlight: "lead",
      participants: [member("lead", "Rav Levi"), member("g1", undefined)],
      streams: { lead: { seq: 3, t: 1, snapshot: { v: 1, url: "/Exodus.3.2?lang=bi", nav: { private: true }, slices: { settings: { v: 1, value: "x" } } } } },
    });
    expect(statusOf(snap)).toEqual({ live: true, away: false, url: "/Exodus.3.2?lang=bi", leader: "Rav Levi", participants: 2 });
  });

  it("a leader whose tab is hidden is still live, and away; an address that is not a same-site path is dropped", () => {
    const snap = base({
      spotlight: "lead",
      participants: [member("lead", "  ", true)],
      streams: { lead: { seq: 1, t: 1, snapshot: { v: 1, url: "//evil.example/x", nav: null, slices: {} } } },
    });
    expect(statusOf(snap)).toEqual({ live: true, away: true, url: null, leader: null, participants: 1 });
    expect(statusOf(base({ spotlight: "gone", participants: [member("g1", "Guest")] })).live).toBe(false);
  });

  it("takes only the secret, in constant time, and refuses everything without one", () => {
    const eq = (a: Uint8Array, b: Uint8Array) => a.every((x, i) => x === b[i]);
    expect(statusAuthorized("Bearer s3cret", "s3cret", eq)).toBe(true);
    expect(statusAuthorized("Bearer s3cres", "s3cret", eq)).toBe(false);
    expect(statusAuthorized("Bearer s3cret", undefined, eq)).toBe(false);
    expect(statusAuthorized(null, "s3cret", eq)).toBe(false);
    expect(STATUS_PATH.exec("/status/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")?.[1]).toHaveLength(43);
    expect(STATUS_PATH.exec("/status/../x")).toBeNull();
  });
});
