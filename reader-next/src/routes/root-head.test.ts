// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CODE_REVIEW R-01: scripts declared in the router's head() are re-injected on client navigation (GTM loaded again, an extra gtag
// 'config' = an extra page view). Third-party bootstraps belong in RootDocument as plain <script> tags.
describe("the root route's head()", () => {
  it("declares no scripts", () => {
    const src = readFileSync(new URL("./__root.tsx", import.meta.url), "utf8");
    const head = src.slice(src.indexOf("head: ("), src.indexOf("component:", src.indexOf("head: (")));
    expect(head.length).toBeGreaterThan(0);
    expect(head).not.toMatch(/\bscripts\s*:/);
  });
});
