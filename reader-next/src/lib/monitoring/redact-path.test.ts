import { describe, expect, it } from "vitest";
import { redactPath } from "./redact-path";

// @feature ANL-017
describe("redactPath", () => {
  it("collapses tokens, keys, profile slugs and e-mail addresses", () => {
    expect(redactPath("/password/reset/confirm/MTIz/c4k2j8-3f9a1b2c3d4e5f6a7b8c/")).toBe("/password/reset/confirm/:uid/:token/");
    expect(redactPath("/password/reset/confirm/MTIz/set-password/")).toBe("/password/reset/confirm/:uid/:token/");
    expect(redactPath("/accounts/password/reset/key/3-c4k2j8a1b2/")).toBe("/accounts/password/reset/key/:token/");
    expect(redactPath("/accounts/confirm-email/MjA:1tAbCd:xyZ123/")).toBe("/accounts/confirm-email/:token/");
    expect(redactPath("/unsubscribe/abc/def")).toBe("/unsubscribe/:token/:token");
    expect(redactPath("/profile/ada-lovelace")).toBe("/profile/:slug");
    expect(redactPath("/profile/ada-lovelace/sheets")).toBe("/profile/:slug/sheets");
    expect(redactPath("/api/subscribe/ada%40example.com")).toBe("/api/subscribe/[email]");
    expect(redactPath("/api/collections/my-col/invite/ada@example.com")).toBe("/api/collections/my-col/invite/:who");
    expect(redactPath("/api/collections/my-col/invite/1234")).toBe("/api/collections/my-col/invite/:who");
    expect(redactPath("/x/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b")).toBe("/x/:token");
  });
  it("leaves the reader's own paths alone", () => {
    for (const p of ["/", "/Genesis.1.3", "/Rashi_on_Genesis.1.1.1", "/Shulchan_Arukh,_Orach_Chayim.1", "/topics/moses", "/texts/Tanakh/Torah", "/search", "/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible", "/Mishneh_Torah,_Shabbat.1.1", "/translations/he"])
      expect(redactPath(p)).toBe(p);
  });

  it("ignores case and sees through %2F and ;parameters (round 2)", () => {
    expect(redactPath("/Password/Reset/Confirm/MTIz/c4k2j8-3f9a1b2c3d4e5f6a7b8c/")).toBe("/Password/Reset/Confirm/:uid/:token/");
    expect(redactPath("/Profile/ada-lovelace")).toBe("/Profile/:slug");
    expect(redactPath("/password/reset/confirm%2FMTIz%2Fc4k2j8")).toBe("/password/reset/confirm/:uid/:token");
    expect(redactPath("/password/reset/confirm;x/MTIz/c4k2j8/")).toBe("/password/reset/confirm;x/:uid/:token/");
    expect(redactPath("/accounts/Confirm-Email;a=b/MjA:xyz/")).toBe("/accounts/Confirm-Email;a=b/:token/");
    expect(redactPath("/Redeeming_Relevance;_Exodus,_CHAPTER_3")).toBe("/Redeeming_Relevance;_Exodus,_CHAPTER_3");
  });
  it("decodes %XX escapes in keywords, as Django does (/%63onfirm is confirm)", () => {
    expect(redactPath("/password/reset/%63onfirm/MTIz/c4k2j8/")).toBe("/password/reset/%63onfirm/:uid/:token/");
    expect(redactPath("/%70rofile/ada-lovelace")).toBe("/%70rofile/:slug");
    expect(redactPath("/accounts/%63onfirm-email/mja_xyz/")).toBe("/accounts/%63onfirm-email/:token/");
    // a malformed escape is compared as written, never throws
    expect(redactPath("/texts/%E0%A4%A")).toBe("/texts/%E0%A4%A");
  });
  it("is linear: an 8 KB path, long segments and many segments are fast", () => {
    const cases = [`/${"a".repeat(8000)}`, "/a".repeat(4000), `/${"a".repeat(2000)}`, "/a".repeat(1000), `/${"a.".repeat(1000)}`, `/${"a".repeat(60)}@${"b".repeat(1900)}`];
    redactPath("/warm/up"); // compile the patterns before timing
    // The best of five runs: a single timing on a loaded machine (CI, parallel test workers) measured scheduling, not the function
    // (5.6 ms and 147 ms seen for a ~0.04 ms call). The quadratic version this guards against took 350–590 ms per call, so 50 ms
    // still fails it by an order of magnitude.
    for (const p of cases) {
      let best = Infinity;
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        redactPath(p);
        best = Math.min(best, performance.now() - t);
      }
      expect(best, `${p.length} chars`).toBeLessThan(50);
    }
    expect(redactPath(`/${"a".repeat(8000)}`)).toBe("/:long-path");
  });
});
