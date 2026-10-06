// @feature ACC-008
import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { csrfFromCookieString, ensureCsrfToken, getCsrfToken } from "./csrf";

const clearCookies = () => {
  for (const c of document.cookie.split(";")) {
    const name = (c.split("=")[0] ?? "").trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};
afterEach(clearCookies);

describe("csrf token", () => {
  it("takes the LAST csrftoken in the cookie string, as Django's parse_cookie does (cauldron double cookie)", () => {
    expect(csrfFromCookieString("a=1; csrftoken=first; b=2; csrftoken=second")).toBe("second");
    expect(csrfFromCookieString("a=1")).toBe("");
    expect(csrfFromCookieString("")).toBe("");
  });

  it("reads document.cookie in the browser", () => {
    document.cookie = "csrftoken=abc123; path=/";
    expect(getCsrfToken()).toBe("abc123");
  });

  it("asks allauth's session endpoint for a cookie when the browser has none", async () => {
    let asked = 0;
    server.use(
      http.get("*/_allauth/browser/v1/auth/session", () => {
        asked++;
        document.cookie = "csrftoken=fromdjango; path=/"; // what the Set-Cookie would do in a browser
        return HttpResponse.json({ status: 401 }, { status: 401 });
      }),
    );
    expect(await ensureCsrfToken()).toBe("fromdjango");
    expect(await ensureCsrfToken()).toBe("fromdjango");
    expect(asked).toBe(1);
  });
});
