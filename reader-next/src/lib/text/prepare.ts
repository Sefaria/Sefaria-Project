/**
 * Turns raw API segment HTML into render-ready, safe HTML.
 *
 * Pipeline: sanitise + extract footnotes (vendored normalizeText) → vocalization (nikud / te'amim) →
 * one DOM pass that upgrades the sanitised markers into the elements the reader needs:
 *   citation          → <a href="/Psalms.111.6" data-sefaria-ref>      (real links: new tab, crawlers)
 *   named entity      → <a href="/topics/<slug>">
 *   footnote marker   → <sup role=button data-note>                    (click toggles the note body)
 *   page overlay      → <span class=page-marker data-value="1a">      (Vilna Pages / Venice Columns)
 *   itag (commentary) → <sup class=itag>label</sup>                    (only while that commentator is filtered)
 *
 * @feature TXD-021 Inline citation links in text (refLink)
 * @feature TXD-025 Footnotes toggle inline
 * @feature TXD-051 Poetry line formatting
 * @feature TXD-027 Inline commentary markers (itags)
 * @feature TXD-028 TXT-008 Page-transition overlay markers (Vilna / Venice)
 */
import { type ChildNode, type Element, isTag, isText } from "domhandler";
import { parseHtml, serializeNodes } from "@vendor/sefaria-toolkit/text-transform/html";
import {
  applyVocalizationToHtml,
  normalizeText,
  type VocalizationMode,
} from "@vendor/sefaria-toolkit/text-transform/index";
import { refToUrl } from "~/lib/ref/url";
import { encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";
import { repairHtml } from "~/lib/html/repair";
import { SITE_ORIGIN } from "~/lib/config";

/**
 * Talmud punctuation removal (Hebrew side only, when the reader turns punctuation off).
 * Removes runs of . ! ? : , and gershayim, and an em/en dash followed by a space, EXCEPT a run
 * immediately followed by a single Hebrew letter and then a boundary: that protects abbreviations such
 * as ר״א. Port of the old client's `punctuationre`; unlike the old code it runs on text nodes only.
 */
const TALMUD_PUNCTUATION = /[.!?:,\u05F4]+(?![\u0591-\u05bd\u05bf-\u05c5\u05c7\u200d\u05d0-\u05ea](?:[.!?:,\u05F4\s]|$))|[—–]\s/g;
export const stripTalmudPunctuation = (text: string): string => text.replace(TALMUD_PUNCTUATION, "");

export interface PrepareOptions {
  /** Remove Talmud punctuation from the text (apply to the Hebrew side of Talmud only). */
  stripPunctuation?: boolean;
  vocalization?: VocalizationMode;
  /** Text language code; Hebrew numerals are used for itag order numbers when "he". */
  lang?: string;
  /** href for a citation. Default: Sefaria's canonical path. */
  refHref?: (ref: string) => string;
  /** Show itag superscripts for this commentator (exact `data-commentator` name). */
  itagCommentator?: string;
}

export interface PreparedNote {
  key: number;
  /** Safe marker HTML (e.g. "a" or "1"). */
  markerHtml: string;
  /** Safe body HTML; null when the note is missing. */
  contentHtml: string | null;
}

export interface PreparedSegment {
  html: string;
  notes: PreparedNote[];
}

const defaultRefHref = (ref: string) => `/${refToUrl(ref)}`;

function walk(nodes: ChildNode[], visit: (el: Element) => void): void {
  for (const n of nodes) {
    if (isTag(n)) {
      visit(n);
      walk(n.children, visit);
    }
  }
}

function walkText(nodes: ChildNode[], fn: (t: string) => string): void {
  for (const n of nodes) {
    if (isText(n)) n.data = fn(n.data);
    else if (isTag(n)) walkText(n.children, fn);
  }
}

function setChildrenFromHtml(el: Element, html: string): void {
  const kids = parseHtml(html);
  el.children = kids;
  for (const k of kids) k.parent = el;
}

function textChild(el: Element, text: string): void {
  setChildrenFromHtml(el, serializeNodes([{ type: "text", data: text } as never]));
}

export function prepareSegmentHtml(raw: string, opts: PrepareOptions = {}): PreparedSegment {
  const normalised = normalizeText(repairHtml(raw));
  let body = normalised.bodyHtml;
  if (opts.vocalization && opts.vocalization !== "taamim_and_nikkud") {
    body = applyVocalizationToHtml(body, opts.vocalization);
  }
  const refHref = opts.refHref ?? defaultRefHref;
  const nodes = parseHtml(body);
  const used = new Set<number>();

  walk(nodes, (el) => {
    const a = el.attribs;
    if (el.name === "span" && a["data-sefaria-ref"]) {
      el.name = "a";
      a.href = refHref(a["data-sefaria-ref"]);
      a.class = "ref-link";
    } else if (el.name === "span" && a["data-sefaria-slug"]) {
      el.name = "a";
      // the topic page is the library's until this client has topic pages; a plain click opens the sidebar instead
      a["data-slug"] = a["data-sefaria-slug"];
      a.href = `${SITE_ORIGIN}/topics/${a["data-sefaria-slug"]}`;
      a.class = "entity-link";
    } else if (el.name === "span" && a["data-sefaria-note"] !== undefined) {
      const key = Number(a["data-sefaria-note"]);
      const note = normalised.notes.find((n) => n.key === key);
      el.name = "sup";
      el.attribs = {
        class: "note-marker",
        "data-note": String(key),
        role: "button",
        tabindex: "0",
        "aria-expanded": "false",
      };
      setChildrenFromHtml(el, note?.markerHtml ?? "*");
      used.add(key);
    } else if (el.name === "span" && a["data-sefaria-overlay"]) {
      el.attribs = { class: "page-marker", "data-overlay": a["data-sefaria-overlay"], "data-value": a["data-sefaria-value"] ?? "" };
      textChild(el, a["data-sefaria-value"] ?? "");
    } else if (el.name === "span" && a["data-sefaria-commentator"] !== undefined) {
      if (opts.itagCommentator && a["data-sefaria-commentator"] === opts.itagCommentator) {
        const label = a["data-sefaria-label"] ?? a["data-sefaria-order"] ?? "";
        const shown = !a["data-sefaria-label"] && opts.lang === "he" && /^\d+$/.test(label) ? encodeHebrewNumeral(Number(label), { punctuation: false }) : label;
        el.name = "sup";
        el.attribs = { class: "itag", "data-commentator": a["data-sefaria-commentator"] };
        textChild(el, shown);
      }
    }
  });

  if (opts.stripPunctuation) walkText(nodes, stripTalmudPunctuation);

  return {
    html: serializeNodes(nodes),
    notes: normalised.notes
      .filter((n) => used.has(n.key))
      .map((n) => ({ key: n.key, markerHtml: n.markerHtml, contentHtml: n.contentHtml })),
  };
}
