import { describe, expect, it } from "vitest";
import { cleanCopy } from "./copy";

const frag = (html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content;
};
const seg = (n: string, he: string, en: string) =>
  `<div role="group"><span data-number="true">${n}</span><span data-no-select="true"><span>●</span><span>12 connections available</span></span><p><span data-side="primary" dir="rtl"><span lang="he">${he}</span></span><span data-side="translation" dir="ltr"><span lang="en">${en}<sup class="note-marker" data-note="0">a</sup> <a class="ref-link" href="/x">Gen 1</a></span></span> </p></div>`;

// @feature TXD-001 @feature TXD-058
describe("cleanCopy", () => {
  it("drops numbers, dots, footnote markers and link styling; one line per version", () => {
    const out = cleanCopy(frag(seg("1", "בראשית", "When God") + seg("2", "והארץ", "the earth")), document, { continuous: false, hebrewPanel: false });
    expect(out.text).toBe("בראשית\nWhen God Gen 1\nוהארץ\nthe earth Gen 1");
    expect(out.html).toBe('<div><div dir="rtl">בראשית</div><div dir="ltr">When God Gen 1</div><div dir="rtl">והארץ</div><div dir="ltr">the earth Gen 1</div></div>');
    expect(out.html).not.toContain("<a");
  });
  it("a Hebrew panel's container is right-to-left", () => {
    expect(cleanCopy(frag(seg("1", "בראשית", "x")), document, { continuous: false, hebrewPanel: true }).html.startsWith('<div dir="rtl">')).toBe(true);
  });
  it("continuous layout is running text", () => {
    const out = cleanCopy(frag(seg("1", "בראשית", "When God") + seg("2", "והארץ", "the earth")), document, { continuous: true, hebrewPanel: false });
    expect(out.text).toBe("בראשית When God Gen 1 והארץ the earth Gen 1");
  });
  it("part of one version is just its words", () => {
    const out = cleanCopy(frag("created <b>heaven</b> and "), document, { continuous: false, hebrewPanel: false });
    expect(out.text).toBe("created heaven and");
    expect(out.html).toBe("created heaven and");
  });
  it("an open footnote is copied after an asterisk", () => {
    const out = cleanCopy(frag('<span data-side="translation" dir="ltr">text<span role="note">the note</span></span>'), document, { continuous: false, hebrewPanel: false });
    expect(out.text).toBe("text *the note");
  });
});
