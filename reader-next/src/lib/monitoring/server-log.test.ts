// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { beginRequestLog, onRequestLogged, requestIdOf, setLogSink, withRequestId, type RequestLogLine } from "./server-log";

const lines: RequestLogLine[] = [];
setLogSink((l) => lines.push(JSON.parse(l)));
afterEach(() => (lines.length = 0));

// @feature PLT-031
describe("server request log", () => {
  it("one JSON line with the fields operations alert on, and X-Request-Id on the response", () => {
    const log = beginRequestLog(new Request("http://reader/Genesis.1?lang=bi", { headers: { "x-request-id": "abc-123-def-456", cookie: "sessionid=secret" } }), "v1");
    const res = log.finish(new Response("ok", { status: 200 }), { upstreamStatus: 200 });
    expect(res.headers.get("x-request-id")).toBe("abc-123-def-456");
    expect(lines).toHaveLength(1);
    const l = lines[0]!;
    expect(l).toMatchObject({ level: "info", logger: "reader", request_id: "abc-123-def-456", http: { method: "GET", url_details: { path: "/Genesis.1" }, status_code: 200, route_kind: "reader" }, upstream_status: 200, pass_through: false, release: "v1" });
    expect(l.duration).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(l)).not.toMatch(/lang=bi|secret/);
  });

  it("levels by status; pass-through from the flag or Django's x-served-by; an immutable response is copied", async () => {
    beginRequestLog(new Request("http://reader/search")).finish(new Response("", { status: 503 }), { upstreamFailed: true });
    const passed = Response.redirect("http://reader/sheets/2", 302); // immutable headers, as a fetched (pass-through) response's
    const res = beginRequestLog(new Request("http://reader/sheets/1")).finish(passed, { passThrough: true, upstreamStatus: 302 });
    beginRequestLog(new Request("http://reader/login")).finish(new Response("", { status: 404, headers: { "x-served-by": "django" } }));
    expect(lines.map((l) => [l.level, l.http.status_code, l.pass_through, l.upstream_failed ?? false])).toEqual([
      ["error", 503, false, true],
      ["info", 302, true, false],
      ["warn", 404, true, false],
    ]);
    expect(res.headers.get("x-request-id")).toMatch(/.{8,}/);
    expect(res.status).toBe(302);
  });

  it("an id that is malformed is replaced; upstream headers carry it; hooks see each line", () => {
    expect(requestIdOf(new Headers({ "x-request-id": "<script>alert(1)</script>" }))).not.toContain("<");
    expect(requestIdOf(new Headers({ "x-request-id": "x" }))).not.toBe("x");
    expect(withRequestId({ accept: "application/json" }, "id-12345678").get("x-request-id")).toBe("id-12345678");
    const seen: number[] = [];
    const off = onRequestLogged((l) => seen.push(l.http.status_code));
    beginRequestLog(new Request("http://reader/texts")).finish(new Response("", { status: 200 }));
    off();
    beginRequestLog(new Request("http://reader/texts")).finish(new Response("", { status: 200 }));
    expect(seen).toEqual([200]);
  });
});
