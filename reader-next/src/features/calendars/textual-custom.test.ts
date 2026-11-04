import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// the server function, stubbed: what Django's profile API would say about the signed-in reader's custom
const serverCustom = vi.fn<(args: { data: string }) => Promise<string>>();
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: () => (args: { data: string }) => serverCustom(args) }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: () => "" }));

const { textualCustomQuery } = await import("./textual-custom");
const { calendarsQueryOptions } = await import("~/lib/library/calendars");

// @feature CAL-004 @feature CAL-005
describe("the reader's textual custom for the Learning Schedules page", () => {
  it("signed out: ashkenazi, without asking anyone", async () => {
    serverCustom.mockReset();
    const qc = new QueryClient();
    expect(await qc.fetchQuery(textualCustomQuery(undefined))).toBe("ashkenazi");
    expect(serverCustom).not.toHaveBeenCalled();
  });

  it("signed in: asks through the server function (in the browser too), with the profile's slug", async () => {
    serverCustom.mockReset().mockResolvedValue("sephardi");
    const qc = new QueryClient();
    expect(await qc.fetchQuery(textualCustomQuery("/profile/ada-lovelace"))).toBe("sephardi");
    expect(serverCustom).toHaveBeenCalledWith({ data: "ada-lovelace" });
  });

  it("sefaria:settings-updated (the root invalidates ['user']) refetches the custom, so the page asks for the other custom's schedules", async () => {
    serverCustom.mockReset().mockResolvedValueOnce("ashkenazi").mockResolvedValueOnce("sephardi");
    const qc = new QueryClient();
    const q = textualCustomQuery("/profile/ada-lovelace");
    expect(q.queryKey[0]).toBe("user");
    const observer = new QueryObserver(qc, q);
    await qc.fetchQuery(q);
    expect(qc.getQueryData(q.queryKey)).toBe("ashkenazi");
    // what __root.tsx's refreshReader does on the event; the page's observer keeps the query active, as the mounted page does
    const unsubscribe = observer.subscribe(() => undefined);
    await qc.invalidateQueries({ queryKey: ["user"] });
    await vi.waitFor(() => expect(qc.getQueryData(q.queryKey)).toBe("sephardi"));
    unsubscribe();
    // the schedules query is keyed by the custom: a new custom is a new request, not the cached ashkenazi answer
    expect(calendarsQueryOptions(true, "sephardi").queryKey).not.toEqual(calendarsQueryOptions(true, "ashkenazi").queryKey);
    expect(calendarsQueryOptions(true, "sephardi").queryKey).toContain("sephardi");
  });
});
