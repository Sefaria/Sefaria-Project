import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../test/msw/server";
import { assistantAccessQuery } from "./access";

const fetchAccess = (body: Record<string, unknown>, status = 200) => {
  server.use(http.get("*/api/library-assistant", () => HttpResponse.json(body as never, { status })));
  return new QueryClient().fetchQuery(assistantAccessQuery(7));
};

// @feature AI-003 — what GET /api/library-assistant answers, read defensively
describe("assistantAccessQuery", () => {
  it("a reader with the assistant: enabled, with the token", async () => {
    expect(await fetchAccess({ enabled: true, userToken: "tok", isModerator: true })).toEqual({ enabled: true, userToken: "tok", isModerator: true });
  });
  it("enabled without a token is not enabled; odd fields are ignored", async () => {
    expect(await fetchAccess({ enabled: true, userToken: "" })).toEqual({ enabled: false, userToken: null, isModerator: false });
    expect(await fetchAccess({ enabled: "yes", userToken: 5 })).toEqual({ enabled: false, userToken: null, isModerator: false });
  });
  it("a server error is an error (the assistant stays hidden)", async () => {
    await expect(fetchAccess({ error: "x" }, 500)).rejects.toThrow(/HTTP 500/);
  });
  it("asks nothing for a guest", () => {
    expect(assistantAccessQuery(null).enabled).toBe(false);
  });
});
