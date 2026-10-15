/**
 * What lands on the clipboard when the reader copies text: the words, without segment numbers, link dots, footnote
 * markers or link styling — each version of a segment on its own line (block) with its direction, the way the old
 * client rewrote the selection (ReaderApp.handleCopyEvent). No citation is added. VERIFIED on sefaria.org: copying
 * Genesis 1:1-3 gives `<div dir=rtl>Hebrew</div><div dir=ltr>English</div>` per segment and, as plain text, one line per
 * version.
 *
 * @feature TXD-001 Custom copy formatting for selected text
 * @feature TXD-058 Copy text with clean formatting
 */

export interface CopyOptions {
  /** Continuous layout: no line breaks between versions, just running text. */
  continuous: boolean;
  /** Hebrew panel: the container is right-to-left. */
  hebrewPanel: boolean;
}
export interface CleanCopy {
  html: string;
  text: string;
}

/** Elements that are interface, not text. */
const CHROME = "[data-number], [data-no-select], [data-note], sup.note-marker, style, script";

const rtl = (s: string) => /[֐-׿]/.test(s);

export function cleanCopy(fragment: DocumentFragment, doc: Document, opts: CopyOptions): CleanCopy {
  const root = doc.createElement("div");
  root.append(fragment);
  root.querySelectorAll(CHROME).forEach((el) => el.remove());
  // a footnote the reader opened is part of what they selected, marked with an asterisk
  root.querySelectorAll("[role=note]").forEach((n) => n.replaceWith(doc.createTextNode(` *${(n.textContent ?? "").trim()}`)));
  // links become their words
  root.querySelectorAll("a").forEach((a) => a.replaceWith(...a.childNodes));

  const sides = [...root.querySelectorAll<HTMLElement>("[data-side]")];
  if (opts.continuous) {
    // running text: the versions' words one after another
    const text = (sides.length ? sides.map((s) => s.textContent ?? "") : [root.textContent ?? ""]).join(" ").replace(/\s+/g, " ").trim();
    const out = doc.createElement("div");
    out.setAttribute("dir", opts.hebrewPanel ? "rtl" : "ltr");
    out.textContent = text;
    return { html: out.outerHTML, text };
  }
  if (!sides.length) {
    // part of one version: just its words
    const text = (root.textContent ?? "").replace(/\s+$/g, "");
    return { html: opts.hebrewPanel ? `<div dir="rtl">${escape(text)}</div>` : escape(text), text };
  }
  const out = doc.createElement("div");
  if (opts.hebrewPanel) out.setAttribute("dir", "rtl");
  const lines: string[] = [];
  for (const side of sides) {
    const line = (side.textContent ?? "").replace(/\s+$/g, "").replace(/^\s+/g, "");
    if (!line) continue;
    const d = doc.createElement("div");
    d.setAttribute("dir", rtl(line) ? "rtl" : "ltr");
    d.textContent = line;
    out.append(d);
    lines.push(line);
  }
  return { html: out.outerHTML, text: lines.join("\n") };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
