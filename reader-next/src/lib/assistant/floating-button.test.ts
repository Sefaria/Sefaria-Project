import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../../test/msw/server";
import { assistantAccessQuery } from "./access";
import { FLOATING_BUTTON_HIDDEN_KEY, launcherHiddenFromDetail, saveFloatingButtonHidden } from "./floating-button";

beforeEach(() => {
  document.cookie = "csrftoken=csrf-token; path=/";
});
afterEach(() => {
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

/** Record what POST /api/profile receives. */
const captureProfilePosts = () => {
  const posts: { json: unknown; csrf: string | null }[] = [];
  server.use(
    http.post("*/api/profile", async ({ request }) => {
      const form = new URLSearchParams(await request.text());
      posts.push({ json: JSON.parse(form.get("json") ?? "null"), csrf: request.headers.get("x-csrftoken") });
      return HttpResponse.json({});
    }),
  );
  return posts;
};

// @feature AI-011 — master #4004: the "Hide Ask button" choice follows a signed-in reader
describe("saveFloatingButtonHidden", () => {
  it("signed in: posts the setting to /api/profile with the CSRF token, and keeps it for a remounted widget", async () => {
    const posts = captureProfilePosts();
    const qc = new QueryClient();
    qc.setQueryData(assistantAccessQuery(7).queryKey, { enabled: true, userToken: "tok", isModerator: false, floatingButtonHidden: false });
    await saveFloatingButtonHidden(qc, 7, true);
    expect(posts).toEqual([{ json: { settings: { [FLOATING_BUTTON_HIDDEN_KEY]: true } }, csrf: "csrf-token" }]);
    expect(qc.getQueryData(assistantAccessQuery(7).queryKey)?.floatingButtonHidden).toBe(true);
    await saveFloatingButtonHidden(qc, 7, false);
    expect(posts[1]!.json).toEqual({ settings: { library_assistant_floating_button_hidden: false } });
    expect(qc.getQueryData(assistantAccessQuery(7).queryKey)?.floatingButtonHidden).toBe(false);
  });
  it("signed out: saves nothing (the widget keeps the browser's choice)", async () => {
    const posts = captureProfilePosts();
    await saveFloatingButtonHidden(new QueryClient(), null, true);
    expect(posts).toEqual([]);
  });
});

describe("launcherHiddenFromDetail", () => {
  it("reads detail.hidden when it is a boolean", () => {
    expect(launcherHiddenFromDetail({ hidden: true })).toBe(true);
    expect(launcherHiddenFromDetail({ hidden: false })).toBe(false);
    for (const d of [null, undefined, "x", {}, { hidden: 1 }, { hidden: "false" }]) expect(launcherHiddenFromDetail(d)).toBeNull();
  });
});
