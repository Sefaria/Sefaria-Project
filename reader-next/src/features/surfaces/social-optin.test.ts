import { describe, expect, it } from "vitest";
import { SOCIAL_COOKIE_MAX_AGE_S, clearSocialCookie, hasSocialCookie, setSocialCookie } from "./social-optin";

function fakeDoc(initial: string, protocol = "https:") {
  let jar = initial;
  const writes: string[] = [];
  const doc = {
    location: { protocol },
    get cookie() {
      return jar;
    },
    set cookie(v: string) {
      writes.push(v);
      jar = v.startsWith("reader_social=1") ? "reader_social=1" : "";
    },
  } as unknown as Document;
  return { doc, writes };
}

// @feature SHL-076 Social lab and /social routes
describe("the Social routing cookie", () => {
  it("sets reader_social=1 for a year, host-only, secure on https", () => {
    const { doc, writes } = fakeDoc("");
    setSocialCookie(doc);
    expect(writes).toEqual([`reader_social=1; max-age=${SOCIAL_COOKIE_MAX_AGE_S}; path=/; samesite=lax; secure`]);
    expect(hasSocialCookie(doc.cookie)).toBe(true);
  });

  it("leaves out secure on http (local dev)", () => {
    const { doc, writes } = fakeDoc("", "http:");
    setSocialCookie(doc);
    expect(writes).toEqual([`reader_social=1; max-age=${SOCIAL_COOKIE_MAX_AGE_S}; path=/; samesite=lax`]);
  });

  it("clears it only when present", () => {
    const empty = fakeDoc("a=1");
    clearSocialCookie(empty.doc);
    expect(empty.writes).toEqual([]);
    const set = fakeDoc("a=1; reader_social=1");
    clearSocialCookie(set.doc);
    expect(set.writes).toEqual(["reader_social=; max-age=0; path=/; samesite=lax; secure"]);
  });

  it("reads only reader_social=1", () => {
    expect(hasSocialCookie("a=1; reader_social=1; b=2")).toBe(true);
    expect(hasSocialCookie("reader_social=0")).toBe(false);
    expect(hasSocialCookie("xreader_social=1")).toBe(false);
  });
});
