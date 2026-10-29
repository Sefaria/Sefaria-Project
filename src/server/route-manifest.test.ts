// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouteManifest, routeOwner, warmRouteManifest } from "./route-manifest";

const nameApi = (refs: Record<string, boolean>) =>
  vi.fn(async (url: string | URL | Request) => {
    const title = decodeURIComponent(String(url).split("/api/name/")[1]!.split("?")[0]!);
    return new Response(JSON.stringify({ is_ref: refs[title] ?? false }));
  }) as unknown as typeof fetch;

// CODE_REVIEW R-36: a path this client does not have was rendered in full (API calls and all) before its 404 sent it to Django
describe("routeOwner", () => {
  beforeEach(async () => {
    resetRouteManifest();
    await warmRouteManifest();
  }, 30_000);
  it("this client's own pages, without asking anyone", async () => {
    const fetcher = nameApi({});
    for (const p of ["/", "/texts", "/texts/Tanakh/Torah", "/search", "/login", "/interface/hebrew", "/assets/x.js"]) expect(await routeOwner(p, { fetcher })).toBe("client");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("a text of the catalog renders here, without a name check", async () => {
    const fetcher = nameApi({});
    expect(await routeOwner("/Genesis.1.1", { fetcher })).toBe("client");
    expect(await routeOwner("/Rashi_on_Genesis.1.1.1", { fetcher })).toBe("client");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("another ref spelling renders here (the canonical redirect is the reader's); anything else is Django's, checked once", async () => {
    const fetcher = nameApi({ Gen: true });
    expect(await routeOwner("/Gen.1.1", { fetcher })).toBe("client");
    expect(await routeOwner("/about", { fetcher })).toBe("django");
    expect(await routeOwner("/about", { fetcher })).toBe("django");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("before the catalog is loaded, the name check answers (no request waits for 3.5 MB)", async () => {
    resetRouteManifest();
    const fetcher = nameApi({ Genesis: true });
    expect(await routeOwner("/Genesis.1.1", { fetcher })).toBe("client");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("when the name check fails, renders here as before (its 404 still goes to Django)", async () => {
    const down = vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await routeOwner("/about", { fetcher: down })).toBe("client");
  });
});

describe("routeOwner with an escaped title", () => {
  beforeEach(() => resetRouteManifest());
  it("reads the title from the encoded path (an escaped / does not split it)", async () => {
    const fetcher = nameApi({ "Book/Part": true });
    expect(await routeOwner("/Book%2FPart.1", { fetcher })).toBe("client");
  });
});
