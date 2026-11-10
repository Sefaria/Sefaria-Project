import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorReporter, MAX_PER_PAGE, reportError, scrub, setPageReporter, uaClass, type ErrorReport } from "./error-reporter";
import { routeKind } from "./route-kind";

const make = (o: Partial<ConstructorParameters<typeof ErrorReporter>[0]> = {}) => {
  const sent: ErrorReport[] = [];
  const r = new ErrorReporter({ endpoint: "/__errors", release: "v7.12.0", random: () => 0, signedIn: () => true, send: (_u, b) => (sent.push(JSON.parse(b)), true), ...o });
  return { r, sent };
};

afterEach(() => setPageReporter(null));

// @feature ANL-017
describe("ErrorReporter", () => {
  it("is off without an endpoint, and sampled per page load", () => {
    expect(make({ endpoint: undefined }).r.enabled).toBe(false);
    expect(make({ sampleRate: 0.25, random: () => 0.5 }).r.enabled).toBe(false);
    expect(make({ sampleRate: 0.25, random: () => 0.1 }).r.enabled).toBe(true);
    const { r, sent } = make({ sampleRate: 0, random: () => 0 });
    expect(r.report("error", new Error("x"))).toBeNull();
    expect(sent).toEqual([]);
  });

  it("sends message, stack, release, route kind, signed-in flag, path, UA class: no query, no ids", () => {
    window.history.pushState({}, "", "/Genesis.1.3?lang=bi&with=Rashi#x");
    const { r, sent } = make();
    const e = new TypeError("Cannot read x of undefined at https://www.sefaria.org/api/texts/Genesis.1?context=1 for reader@example.com");
    e.stack = "TypeError: boom\n    at f (http://localhost:3000/assets/main.js?v=abc123:10:5)";
    r.report("error", e);
    expect(sent).toHaveLength(1);
    const rep = sent[0]!;
    expect(rep).toMatchObject({ v: 1, kind: "error", release: "v7.12.0", route: "reader", signedIn: true, path: "/Genesis.1.3", sampleRate: 1 });
    expect(rep.message).toBe("TypeError: Cannot read x of undefined at https://www.sefaria.org/api/texts/Genesis.1 for [email]");
    expect(rep.stack).toContain("http://localhost:3000/assets/main.js:10:5");
    expect(JSON.stringify(rep)).not.toMatch(/lang=bi|with=Rashi|context=1|v=abc|reader@example/);
    expect(Object.keys(rep).sort()).toEqual(["kind", "message", "path", "release", "route", "sampleRate", "signedIn", "stack", "t", "ua", "v"]);
  });

  it("truncates, drops duplicates and stops at the per-page cap", () => {
    const { r, sent } = make();
    const big = () => new Error("x".repeat(5000)); // the same message and stack frame each time
    r.report("error", big());
    expect(sent[0]!.message.length).toBeLessThanOrEqual(500);
    r.report("error", big());
    expect(sent).toHaveLength(1);
    for (let i = 0; i < 30; i++) r.report("unhandledrejection", new Error(`e${i}`));
    expect(sent).toHaveLength(MAX_PER_PAGE);
  });

  it("listens to window errors and unhandled rejections; a hydration error is labelled", () => {
    const { r, sent } = make();
    // a stand-in for window (an ErrorEvent dispatched on jsdom's window is also the test runner's uncaught error)
    const win = new EventTarget() as unknown as Window;
    const off = r.install(win);
    win.dispatchEvent(new ErrorEvent("error", { error: new Error("plain"), message: "plain", filename: "http://x/a.js?q=1", lineno: 3, colno: 4 }));
    win.dispatchEvent(new ErrorEvent("error", { error: new Error("Hydration failed because the server rendered text didn't match the client"), message: "h" }));
    const ev = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(ev, "reason", { value: "rejected!" });
    win.dispatchEvent(ev);
    win.dispatchEvent(new Event("error")); // a resource that failed to load: not reported
    off();
    win.dispatchEvent(new ErrorEvent("error", { error: new Error("after uninstall") }));
    expect(sent.map((s) => [s.kind, s.message, s.source])).toEqual([
      ["error", "Error: plain", "http://x/a.js:3:4"],
      ["hydration", "Error: Hydration failed because the server rendered text didn't match the client", undefined],
      ["unhandledrejection", "rejected!", undefined],
    ]);
  });

  it("boundaries report through the page's reporter; a failed beacon is not counted", () => {
    expect(reportError("boundary", new Error("no reporter"))).toBeNull();
    const { r, sent } = make();
    setPageReporter(r);
    expect(reportError("boundary", new Error("panel broke"), { boundary: "panel" })).toMatchObject({ kind: "boundary", boundary: "panel" });
    expect(sent).toHaveLength(1);
    const failing = make({ send: vi.fn(() => false) });
    expect(failing.r.report("error", new Error("q"))).toBeNull();
  });
});

describe("helpers", () => {
  it("scrub removes queries, fragments and emails only", () => {
    expect(scrub("see /search?q=secret and https://a.b/c#frag, mail x.y@z.org")).toBe("see /search and https://a.b/c, mail [email]");
    expect(scrub("Is this a question? yes")).toBe("Is this a question? yes");
  });
  it("uaClass is coarse", () => {
    expect(uaClass("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36")).toBe("chrome-mobile");
    expect(uaClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("safari-mobile");
    expect(uaClass("Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/128.0")).toBe("firefox-desktop");
    expect(uaClass("Googlebot/2.1")).toBe("bot");
  });
  it("routeKind names the pages", () => {
    expect([routeKind("/Genesis.1"), routeKind("/texts"), routeKind("/texts/Tanakh"), routeKind("/topics/moses"), routeKind("/search"), routeKind("/login"), routeKind("/texts/notes"), routeKind("/healthz-reader")]).toEqual(["reader", "texts", "texts", "topics", "search", "auth", "user", "health"]);
  });
});
