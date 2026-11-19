import { describe, expect, it } from "vitest";
import { normalizeText } from "@vendor/sefaria-toolkit/text-transform/index";

// @feature TXD-051 TXD-020 Poetry formatting survives normalisation
describe("normalizeText local extensions", () => {
  it("keeps poetry indentation", () => {
    const { bodyHtml } = normalizeText(
      'A psalm of David.<br><span class="poetry indentAll"> G<small>OD</small> is my shepherd;</span><br><span class="poetry indentAllDouble">I lack nothing.</span>',
    );
    expect(bodyHtml).toContain('data-sefaria-poetry="indent"');
    expect(bodyHtml).toContain('data-sefaria-poetry="indent-double"');
    expect(bodyHtml).toContain("I lack nothing.");
  });

  it("keeps muted emphasis", () => {
    expect(normalizeText('x <span class="mediumGrey">note</span>').bodyHtml).toContain('data-sefaria-tone="muted"');
  });

  it("still unwraps unknown spans and strips scripts", () => {
    const { bodyHtml } = normalizeText('<span class="evil" onclick="x()">hi</span><script>alert(1)</script>');
    expect(bodyHtml).toBe("hi");
  });
});
