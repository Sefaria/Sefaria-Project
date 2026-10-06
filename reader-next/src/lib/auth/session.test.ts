// @feature ACC-007 @feature GUI-010 @feature ACC-016
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { fetchViewer, hasSessionCookie, initials } from "./session";

const ORIGIN = "http://varnish.internal:8040";
const anonymous = { status: 401, data: { flows: [{ id: "login" }] }, meta: { is_authenticated: false } }; // recorded from www.sefaria.org 2026-10-06

describe("fetchViewer", () => {
  it("is null for allauth's anonymous answer (401)", async () => {
    server.use(http.get(`${ORIGIN}/_allauth/browser/v1/auth/session`, () => HttpResponse.json(anonymous, { status: 401 })));
    expect(await fetchViewer(ORIGIN, "sessionid=x")).toBeNull();
  });

  it("forwards the reader's cookie and joins the session user with public_user_data", async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${ORIGIN}/_allauth/browser/v1/auth/session`, ({ request }) => {
        seen.push(request.headers.get("cookie"));
        return HttpResponse.json({ status: 200, data: { user: { id: 42, display: "a@b.org", email: "a@b.org" } }, meta: { is_authenticated: true } });
      }),
      http.get(`${ORIGIN}/api/user_stats/42`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("quick")).toBe("1");
        seen.push(request.headers.get("cookie"));
        return HttpResponse.json({ name: "Ada Lovelace", profileUrl: "/profile/ada-lovelace", imageUrl: "https://example.org/a.png", uid: 42, isStaff: false });
      }),
    );
    expect(await fetchViewer(ORIGIN, "sessionid=abc; csrftoken=t")).toEqual({
      id: 42, name: "Ada Lovelace", email: "a@b.org", imageUrl: "https://example.org/a.png", profileUrl: "/profile/ada-lovelace", isStaff: false,
    });
    expect(seen).toEqual(["sessionid=abc; csrftoken=t", "sessionid=abc; csrftoken=t"]);
  });

  it("falls back to the session's display name when the profile lookup fails", async () => {
    server.use(
      http.get(`${ORIGIN}/_allauth/browser/v1/auth/session`, () => HttpResponse.json({ data: { user: { id: 7, display: "Bo" } }, meta: { is_authenticated: true } })),
      http.get(`${ORIGIN}/api/user_stats/7`, () => new HttpResponse("nope", { status: 500 })),
    );
    expect(await fetchViewer(ORIGIN, "sessionid=x")).toEqual({ id: 7, name: "Bo", email: undefined });
  });

  it("is null when the network fails", async () => {
    server.use(http.get(`${ORIGIN}/_allauth/browser/v1/auth/session`, () => HttpResponse.error()));
    expect(await fetchViewer(ORIGIN, "sessionid=x")).toBeNull();
  });

  it("asks the page's own origin in the browser", async () => {
    server.use(http.get(`${window.location.origin}/_allauth/browser/v1/auth/session`, () => HttpResponse.json(anonymous, { status: 401 })));
    expect(await fetchViewer("")).toBeNull();
  });
});

describe("helpers", () => {
  it("hasSessionCookie", () => {
    expect(hasSessionCookie("a=1; sessionid=x")).toBe(true);
    expect(hasSessionCookie("sessionid=x")).toBe(true);
    expect(hasSessionCookie("mysessionid=x")).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
  });
  it("initials like the old ProfilePic", () => {
    expect(initials("Ada Byron Lovelace")).toBe("AL");
    expect(initials("Ada")).toBe("A");
    expect(initials("  ")).toBe("");
  });
});
