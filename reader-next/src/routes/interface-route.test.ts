// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const passThrough = vi.fn();
let passOn = true;
vi.mock("~/server/pass-through", () => ({
  passThrough: (r: Request) => passThrough(r),
  passThroughEnabled: () => passOn,
  requestHost: (r: Request) => r.headers.get("x-forwarded-host") ?? new URL(r.url).host,
}));
vi.mock("~/server/language-domain", async (orig) => ({
  ...(await orig<typeof import("~/server/language-domain")>()),
  domainModulesFromEnv: () => ({
    en: { library: "https://www.sefaria.org", voices: "https://voices.sefaria.org" },
    he: { library: "https://www.sefaria.org.il", voices: "https://chiburim.sefaria.org.il" },
  }),
}));

const { Route } = await import("./interface.$lang");
type Get = (ctx: { request: Request; params: { lang: string } }) => Response | Promise<Response>;
const get = (lang: string, cookie: string, host = "www.sefaria.org") =>
  (Route.options.server!.handlers as unknown as { GET: Get }).GET({
    request: new Request(`http://reader.internal/interface/${lang}?next=/texts`, { headers: { cookie, "x-forwarded-host": host } }),
    params: { lang },
  });

// @feature RTE-034 — v-security nit 5, rework round 1: the signed-in switch is Django's (profile), and the stale host-only cookie goes too
describe("/interface/<lang>, signed in", () => {
  beforeEach(() => {
    passOn = true;
    passThrough.mockReset();
    passThrough.mockResolvedValue(new Response(null, { status: 302, headers: [["location", "https://www.sefaria.org.il/texts?set-language-cookie="], ["set-cookie", "interfaceLang=hebrew; Domain=.sefaria.org; Path=/"]] }));
  });
  it("Django answers (it saves the profile); the host-only interfaceLang is expired with its domain cookie", async () => {
    const r = await get("hebrew", "sessionid=abc; interfaceLang=english");
    expect(passThrough).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://www.sefaria.org.il/texts?set-language-cookie=");
    expect(r.headers.getSetCookie()).toEqual(["interfaceLang=hebrew; Domain=.sefaria.org; Path=/", "interfaceLang=; Max-Age=0; Path=/"]);
  });
  it("on a host-only setup (localhost) nothing is expired", async () => {
    const r = await get("hebrew", "sessionid=abc", "localhost:3000");
    expect(r.headers.getSetCookie()).toEqual(["interfaceLang=hebrew; Domain=.sefaria.org; Path=/"]);
  });
  it("signed out, or without pass-through, the reader answers itself", async () => {
    const r = await get("hebrew", "interfaceLang=english");
    expect(passThrough).not.toHaveBeenCalled();
    expect(r.headers.getSetCookie()).toEqual(["interfaceLang=; Max-Age=0; Path=/", "interfaceLang=hebrew; Domain=.sefaria.org; Path=/"]);
    expect(r.headers.get("location")).toBe("https://www.sefaria.org.il/texts?set-language-cookie=");
    passOn = false;
    await get("hebrew", "sessionid=abc");
    expect(passThrough).not.toHaveBeenCalled();
  });
});
