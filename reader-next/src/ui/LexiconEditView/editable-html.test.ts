import { describe, expect, it } from "vitest";
import { editableHtml } from "./editable-html";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

// @feature CON-072 — v-security nit 3 and rework round 1: the server's allowlist for an entry, nothing that runs
describe("editableHtml (the dictionary editor's box)", () => {
  it("an element named like an Object property (constructor, toString, hasOwnProperty) is dropped, not a crash", () => {
    expect(editableHtml("<constructor>a</constructor><tostring>b</tostring><hasownproperty>c</hasownproperty>")).toBe("abc");
  });
  it("keeps <big>, which the server keeps", () => {
    expect(editableHtml("a <big>b</big> c")).toBe("a <big>b</big> c");
  });
  it("keeps a raster data image (png, jpeg, gif, webp) with its src only", () => {
    for (const t of ["png", "jpeg", "gif", "webp", "PNG"]) {
      const src = `data:image/${t};base64,AAAA`;
      expect(editableHtml(`<img src="${src}" width="9" onerror="alert(1)">`)).toBe(`<img src="${src}">`);
    }
    expect(editableHtml(`<p><img src="${PNG}"/>x</p>`)).toBe(`<img src="${PNG}">x`);
  });
  it("drops an SVG data image, and any image that is not a data image", () => {
    expect(editableHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=">x')).toBe("x");
    expect(editableHtml('<img src="data:image/svg+xml,<svg onload=alert(1)>">x')).toBe("x");
    expect(editableHtml('<img src="https://evil.example/a.png">x')).toBe("x");
    expect(editableHtml('<img src="javascript:alert(1)">x')).toBe("x");
  });
  it("drops a javascript: (or data:, or protocol-relative) link address, keeping the text", () => {
    for (const href of ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "data:text/html,<b>", "//evil.example", "/\\evil.example"]) {
      expect(editableHtml(`<a href="${href}">t</a>`)).toBe("<a>t</a>");
    }
  });
  it("keeps the links the editor makes and stored ones as written (a path with or without a leading slash, http, mailto)", () => {
    const ref = '<a class="refLink" data-ref="Proverbs 4:18" href="/Proverbs.4.18">P</a>';
    expect(editableHtml(ref)).toBe('<a class="refLink" href="/Proverbs.4.18" data-ref="Proverbs 4:18">P</a>');
    expect(editableHtml('<a href="Proverbs.4.18">P</a>')).toBe('<a href="Proverbs.4.18">P</a>');
    expect(editableHtml('<a href="https://www.sefaria.org/x" target="_blank">x</a>')).toBe('<a href="https://www.sefaria.org/x">x</a>');
    expect(editableHtml('<a href="mailto:a@b.org">m</a>')).toBe('<a href="mailto:a@b.org">m</a>');
  });
  it("runs nothing: scripts and styles go with their content, handlers and unknown attributes go", () => {
    expect(editableHtml('<b onclick="x()">b</b><script>alert(1)<br></script><style>*{}</style><i data-commentator="Rashi" style="x">n</i>')).toBe(
      '<b>b</b><i data-commentator="Rashi">n</i>',
    );
  });
});
