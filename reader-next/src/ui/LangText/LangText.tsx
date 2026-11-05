import { createElement, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";
import { useContentLang, type ContentLang } from "~/lib/i18n/content-lang";
import { dirFor } from "~/lib/i18n/direction";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";

type Tag = "span" | "div" | "p" | "li" | "h1" | "h2" | "h3" | "h4" | "label" | "a" | "strong" | "em";

export type LangTextProps<T extends Tag = "span"> = {
  /** BCP-47 code of the text ("he", "en", "arc", a version's actualLanguage). */
  lang: string;
  /** The text's direction when the data says it (a version's `direction`); otherwise worked out from `lang`. */
  dir?: "rtl" | "ltr";
  /** The element to render. A block (`div`, `p`) also takes the direction for its lines: alignment, wrapping, list markers. */
  as?: T;
  /** Already-sanitised HTML in place of children (API HTML must go through lib/text first). */
  html?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "lang" | "dir" | "children" | "dangerouslySetInnerHTML">;

/**
 * The base of every run or block of library text in one known language: it always carries `lang` (fonts, hyphenation, screen
 * readers) and `dir` together. A `lang="he"` with no `dir` inside a left-to-right block shows Hebrew in the right font but lays the
 * lines out left-to-right — a short last line sits on the left, and a final colon or period lands at the wrong end.
 *
 * Replaces the old client's `.he` / `.contentSpan.he` / `.int-he` classes, whose CSS set `direction: rtl` (s2.css `.readerPanel .he`).
 *
 * @feature I18-013 Right-to-left layout and Hebrew numerals
 */
export function LangText<T extends Tag = "span">({ lang, dir, as, html, children, ...rest }: LangTextProps<T>) {
  const props = { ...rest, lang, dir: dir ?? dirFor(lang) } as Record<string, unknown>;
  if (html !== undefined) props.dangerouslySetInnerHTML = { __html: html };
  return createElement(as ?? "span", props, html !== undefined ? undefined : children);
}

export type ContentTextProps<T extends Tag = "span"> = {
  en?: string | null;
  he?: string | null;
  /** Which side to show. Default: the content language provided above (ContentLangProvider), else the interface language. */
  lang?: ContentLang;
  /** Show the other side when the chosen one is missing. Off by default: content language is strict, as the old ContentText was
   *  (an English sidebar does not show a Hebrew-only description). An interface string that may lack a translation wants it on. */
  fallback?: boolean;
  /** Treat `en` / `he` as already-sanitised HTML. */
  html?: boolean;
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, "lang" | "dir" | "children" | "dangerouslySetInnerHTML">;

/**
 * Bilingual library data — a title, a ref, a description — shown in the content language, tagged with that side's `lang` and
 * `dir`. Renders nothing when the side to show is empty. The old client's ContentText.
 *
 * @feature I18-010 Interface and content language resolution
 * @feature I18-013 Right-to-left layout and Hebrew numerals
 */
export function ContentText<T extends Tag = "span">({ en, he, lang, fallback, html, as, ...rest }: ContentTextProps<T>) {
  const provided = useContentLang();
  const iface = useInterfaceLang();
  const want = lang ?? provided ?? iface;
  const pick = (l: ContentLang) => (l === "hebrew" ? he : en) || "";
  let side: ContentLang = want;
  if (!pick(want) && fallback) side = want === "hebrew" ? "english" : "hebrew";
  const text = pick(side);
  if (!text) return null;
  const code = side === "hebrew" ? "he" : "en";
  const Base = LangText as (p: LangTextProps<Tag>) => ReturnType<typeof LangText>;
  return html ? <Base {...rest} as={as} lang={code} html={text} /> : <Base {...rest} as={as} lang={code}>{text}</Base>;
}
