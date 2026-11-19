// Ported from the postJson/postForm part of Sefaria-Project static/js/auth/tests/utils.test.js
// @feature ACC-009
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { postForm, postJson } from "./http";

beforeEach(() => {
  document.cookie = "csrftoken=csrf-token; path=/";
});
afterEach(() => {
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("postJson / postForm", () => {
  it("postJson sends a JSON body with X-CSRFToken, same origin, and reports ok on 2xx", async () => {
    let seen: { headers: Headers; body: string; url: string } | undefined;
    server.use(
      http.post("*/api/auth/login", async ({ request }) => {
        seen = { headers: request.headers, body: await request.text(), url: request.url };
        return HttpResponse.json({ foo: "bar" });
      }),
    );
    const result = await postJson("/api/auth/login", { email: "a@test.com" });
    expect(seen!.url).toBe(`${window.location.origin}/api/auth/login`);
    expect(seen!.headers.get("content-type")).toBe("application/json");
    expect(seen!.headers.get("x-csrftoken")).toBe("csrf-token");
    expect(seen!.body).toBe(JSON.stringify({ email: "a@test.com" }));
    expect(result).toEqual({ ok: true, status: 200, data: { foo: "bar" }, networkError: false });
  });

  it("postForm urlencodes the body and reports ok:false on a non-2xx answer", async () => {
    let body = "";
    server.use(
      http.post("*/register", async ({ request }) => {
        body = await request.text();
        expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
        return HttpResponse.json({ error: "auth.invalid_email" }, { status: 400 });
      }),
    );
    const result = await postForm("/register", new URLSearchParams({ email: "a@test.com" }));
    expect(body).toBe("email=a%40test.com");
    expect(result).toEqual({ ok: false, status: 400, data: { error: "auth.invalid_email" }, networkError: false });
  });

  it("reports networkError when the request itself fails", async () => {
    server.use(http.post("*/api/auth/login", () => HttpResponse.error()));
    expect(await postJson("/api/auth/login", {})).toEqual({ ok: false, status: 0, data: {}, networkError: true });
  });

  it("tolerates a non-JSON answer", async () => {
    server.use(http.post("*/api/auth/login", () => new HttpResponse("<html>", { status: 200 })));
    expect(await postJson("/api/auth/login", {})).toEqual({ ok: true, status: 200, data: {}, networkError: false });
  });
});
