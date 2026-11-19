import { describe, expect, it } from "vitest";
import { newSessionId } from "~/lib/session/ids";
import {
  FOLLOW_STORAGE_KEY,
  clearStoredFollow,
  followParamOf,
  guestName,
  locationLabel,
  readStoredFollow,
  withFollowParam,
  withoutFollowParam,
  writeStoredFollow,
} from "./params";

const id = newSessionId();

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe("the follow parameter", () => {
  it("reads a well-formed session id and ignores anything else", () => {
    expect(followParamOf(`?lang=bi&follow=${id}`)).toBe(id);
    expect(followParamOf(`follow=${id}&with=Rashi`)).toBe(id);
    expect(followParamOf("?follow=short")).toBeNull();
    expect(followParamOf(`?follow=${id}%3Cscript`)).toBeNull();
    expect(followParamOf(`?unfollow=${id}`)).toBeNull();
    expect(followParamOf("")).toBeNull();
  });

  it("strips every follow parameter and keeps the rest byte for byte", () => {
    expect(withoutFollowParam(`?lang=bi&follow=${id}&with=Rashi%20on%20Genesis`)).toBe("?lang=bi&with=Rashi%20on%20Genesis");
    expect(withoutFollowParam(`?follow=${id}`)).toBe("");
    expect(withoutFollowParam(`?follow&follow=x&p2=Exodus.3`)).toBe("?p2=Exodus.3");
    expect(withoutFollowParam("?with=all&lang2=he")).toBe("?with=all&lang2=he");
    expect(withoutFollowParam("")).toBe("");
  });

  it("builds the share link from the current address, replacing an older follow and keeping the hash last", () => {
    expect(withFollowParam("https://www.sefaria.org/Genesis.1.3?lang=bi&with=Rashi", id)).toBe(`https://www.sefaria.org/Genesis.1.3?lang=bi&with=Rashi&follow=${id}`);
    expect(withFollowParam("/Genesis.1", id)).toBe(`/Genesis.1?follow=${id}`);
    expect(withFollowParam(`/Genesis.1?follow=old&lang=he#x`, id)).toBe(`/Genesis.1?lang=he&follow=${id}#x`);
    expect(followParamOf(new URL(withFollowParam("https://x.org/a?b=1", id)).search)).toBe(id);
  });
});

describe("what sessionStorage keeps", () => {
  it("round-trips a session and clears it", () => {
    const s = memoryStorage();
    writeStoredFollow(s, { sessionId: id, role: "host", participantId: "p1" });
    expect(readStoredFollow(s)).toEqual({ sessionId: id, role: "host", participantId: "p1" });
    clearStoredFollow(s);
    expect(readStoredFollow(s)).toBeNull();
  });

  it("rejects malformed or tampered entries", () => {
    const s = memoryStorage();
    for (const bad of ["not json", "null", JSON.stringify({ sessionId: "x", role: "host", participantId: "p" }), JSON.stringify({ sessionId: id, role: "admin", participantId: "p" }), JSON.stringify({ sessionId: id, role: "guest", participantId: "a b" })]) {
      s.setItem(FOLLOW_STORAGE_KEY, bad);
      expect(readStoredFollow(s)).toBeNull();
    }
  });

  it("survives storage that is missing or throws", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    expect(readStoredFollow(null)).toBeNull();
    expect(readStoredFollow(throwing)).toBeNull();
    expect(() => writeStoredFollow(throwing, { sessionId: id, role: "guest", participantId: "p" })).not.toThrow();
    expect(() => clearStoredFollow(throwing)).not.toThrow();
  });
});

describe("labels", () => {
  it("names where someone is from their address", () => {
    expect(locationLabel("/Exodus.3?lang=bi")).toBe("Exodus 3");
    expect(locationLabel("/Mishnah_Berakhot.2.3")).toBe("Mishnah Berakhot 2:3");
    expect(locationLabel("/%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA.1")).toBe("בראשית 1");
    expect(locationLabel("/")).toBeNull();
    expect(locationLabel("https://evil.example/x")).toBeNull();
    expect(locationLabel(undefined)).toBeNull();
  });

  it("gives guests a short distinguishing suffix", () => {
    expect(guestName("0123456789abcdefghijk7x")).toBe("Guest K7X");
  });
});
