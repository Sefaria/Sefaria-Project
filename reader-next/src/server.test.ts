import { describe, expect, it } from "vitest";
import { withOwnUrl } from "./server";

// A request whose address holds %5C (a backslash in a title) is handed on with a URL of its own, body and all; any other
// request passes untouched.
describe("withOwnUrl", () => {
  it("passes a request without %5C through as it is", () => {
    const r = new Request("http://x/Genesis.1");
    expect(withOwnUrl(r)).toBe(r);
  });
  it("copies a GET whose address holds %5C, keeping the address and headers", () => {
    const r = new Request("http://x/Book%5CPart.1?lang=en", { headers: { cookie: "a=1" } });
    const c = withOwnUrl(r);
    expect(c).not.toBe(r);
    expect(c.url).toBe("http://x/Book%5CPart.1?lang=en");
    expect(c.headers.get("cookie")).toBe("a=1");
  });
  it("keeps a POST's method and body", async () => {
    const r = new Request("http://x/Book%5cPart.1", { method: "POST", body: "a=1&b=2", headers: { "content-type": "application/x-www-form-urlencoded" } });
    const c = withOwnUrl(r);
    expect(c.method).toBe("POST");
    expect(await c.text()).toBe("a=1&b=2");
    expect(c.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
  });
});
