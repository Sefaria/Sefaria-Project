/**
 * Reader display settings: model, defaults, old-cookie compatibility and the rules that turn settings
 * plus context (book category, panel width) into what is actually displayed.
 *
 * Cookie names and values match the old client (inv_02 §6) so existing users keep their preferences.
 *
 * @feature SHL-007 Reading settings defaults
 * @feature SHL-008 Settings persistence in cookies (old format kept)
 * @feature TXD-031 @feature TXD-033 @feature TXD-034 @feature TXD-035 @feature TXD-036 @feature TXD-037 @feature TXD-038 @feature SHL-009 @feature SHL-011 @feature SHL-019 @feature SHL-020
 */
import type { VocalizationMode } from "@vendor/sefaria-toolkit/text-transform/index";

export type ContentLanguage = "hebrew" | "english" | "bilingual";
export type Layout = "segmented" | "continuous";
export type BiLayout = "stacked" | "heLeft" | "heRight";
export type Vowels = "all" | "partial" | "none";
export type ColorTheme = "light" | "sepia" | "dark";

export interface ReaderSettings {
  language: ContentLanguage;
  layoutDefault: Layout;
  layoutTalmud: Layout;
  layoutTanakh: Layout;
  biLayout: BiLayout;
  vowels: Vowels;
  punctuationTalmud: boolean;
  aliyotTorah: boolean;
  /** Old client's percentage base: 62.5 = default. Each step multiplies or divides by 1.15. */
  fontSize: number;
  color: ColorTheme;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  language: "bilingual",
  layoutDefault: "segmented",
  layoutTalmud: "continuous",
  layoutTanakh: "segmented",
  biLayout: "stacked",
  vowels: "all",
  punctuationTalmud: true,
  aliyotTorah: false,
  fontSize: 62.5,
  color: "light",
};

export const FONT_STEP = 1.15;
export const DEFAULT_FONT_SIZE = 62.5;
export const MIN_FONT_SIZE = DEFAULT_FONT_SIZE / FONT_STEP ** 4;
export const MAX_FONT_SIZE = DEFAULT_FONT_SIZE * FONT_STEP ** 8;

/** Panel width (px) above which side-by-side bilingual layouts are allowed. Below it, always stacked. */
export const BILINGUAL_SIDE_BY_SIDE_MIN_WIDTH = 500;

const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/**
 * Read settings from cookies (name → value). Unknown or missing values fall back to defaults, so a
 * corrupt cookie can never break the reader.
 */
export function parseCookieSettings(cookies: Record<string, string | undefined>): ReaderSettings {
  const d = DEFAULT_SETTINGS;
  const size = Number.parseFloat(cookies.fontSize ?? "");
  return {
    language: oneOf(cookies.language ?? cookies.contentLang, ["hebrew", "english", "bilingual"], d.language),
    layoutDefault: oneOf(cookies.layoutDefault, ["segmented", "continuous"], d.layoutDefault),
    layoutTalmud: oneOf(cookies.layoutTalmud, ["segmented", "continuous"], d.layoutTalmud),
    layoutTanakh: oneOf(cookies.layoutTanakh, ["segmented", "continuous"], d.layoutTanakh),
    biLayout: oneOf(cookies.biLayout, ["stacked", "heLeft", "heRight"], d.biLayout),
    vowels: oneOf(cookies.vowels, ["all", "partial", "none"], d.vowels),
    punctuationTalmud: cookies.punctuationTalmud ? cookies.punctuationTalmud === "punctuationOn" : d.punctuationTalmud,
    aliyotTorah: cookies.aliyotTorah ? cookies.aliyotTorah === "aliyotOn" : d.aliyotTorah,
    fontSize: Number.isFinite(size) && size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE ? size : d.fontSize,
    color: oneOf(cookies.color, ["light", "sepia", "dark"], d.color),
  };
}

/** The cookie (name, value) the old client would write for one setting. */
export function toCookie<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]): [name: string, value: string] {
  switch (key) {
    case "punctuationTalmud":
      return [key, value ? "punctuationOn" : "punctuationOff"];
    case "aliyotTorah":
      return [key, value ? "aliyotOn" : "aliyotOff"];
    default:
      return [key, String(value)];
  }
}

/** Parse a `document.cookie`-style header into a map. */
export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export type LayoutKey = "layoutTanakh" | "layoutTalmud" | "layoutDefault";

/** Which stored layout applies to a book: Tanakh and Talmud have their own, everything else shares one. */
export function layoutKeyFor(primaryCategory: string | undefined): LayoutKey {
  if (primaryCategory === "Tanakh") return "layoutTanakh";
  if (primaryCategory === "Talmud") return "layoutTalmud";
  return "layoutDefault";
}

export interface LayoutContext {
  primaryCategory?: string;
  /** Panel width in px; undefined when not yet measured (server render). */
  panelWidth?: number;
  /** Connections-sidebar panels never use continuous or side-by-side layouts. */
  inSidebar?: boolean;
}

/**
 * Segmented vs continuous for this book in this panel. Bilingual display is always segmented (its
 * stacked / side-by-side arrangement is `biLayout`); continuous flow only applies to one language.
 */
export function effectiveLayout(s: ReaderSettings, ctx: LayoutContext): Layout {
  if (ctx.inSidebar || s.language === "bilingual") return "segmented";
  return s[layoutKeyFor(ctx.primaryCategory)];
}

/** Stacked vs side-by-side for bilingual display. Narrow panels are always stacked. */
export function effectiveBiLayout(s: ReaderSettings, ctx: LayoutContext): BiLayout {
  if (ctx.inSidebar) return "stacked";
  if (ctx.panelWidth !== undefined && ctx.panelWidth <= BILINGUAL_SIDE_BY_SIDE_MIN_WIDTH) return "stacked";
  return s.biLayout;
}

/**
 * When both sides read in the same direction (Hebrew text with a Hebrew translation, or two English
 * versions) side-by-side layouts make no sense visually; the old client flips `biLayout` so the primary sits
 * on the reading side. Returns the new layout, or undefined when no change is needed.
 */
export function biLayoutForDirections(
  current: BiLayout,
  primaryDir: "rtl" | "ltr" | undefined,
  translationDir: "rtl" | "ltr" | undefined,
): BiLayout | undefined {
  if (current === "stacked" || !primaryDir || !translationDir) return undefined;
  if (primaryDir !== translationDir) return undefined;
  const next: BiLayout = primaryDir === "rtl" ? "heRight" : "heLeft";
  return next === current ? undefined : next;
}

export function stepFontSize(size: number, direction: "larger" | "smaller"): number {
  const next = direction === "larger" ? size * FONT_STEP : size / FONT_STEP;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, next));
}

/** Unitless multiplier for `--sefaria-reader-font-scale`: 1 at the default size. */
export const fontScale = (size: number): number => size / DEFAULT_FONT_SIZE;

export function vocalizationMode(vowels: Vowels): VocalizationMode {
  return vowels === "all" ? "taamim_and_nikkud" : vowels === "partial" ? "nikkud" : "none";
}

/* ── Which controls the display menu offers (rules from inv_02 §7) ───────────────────────────── */

const TORAH_BOOKS = new Set(["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"]);

/** The aliyot toggle is shown only for the five books of the Torah and their Onkelos targum. */
export function supportsAliyot(book: string | undefined): boolean {
  if (!book) return false;
  const m = /^(?:Onkelos )?(.+)$/.exec(book);
  return m ? TORAH_BOOKS.has(m[1]!) : false;
}

/** Nikud / te'amim detection used to decide whether vowel controls apply. */
export const hasNikud = (s: string) => /[ְ-׃ׇ]/.test(s);
export const hasTaamim = (s: string) => /[֑-֯]/.test(s);

export interface DisplayMenuAvailability {
  language: boolean;
  layout: boolean;
  fontSize: boolean;
  vowels: boolean;
  cantillation: boolean;
  /** Cantillation can only be toggled while vowels are on. */
  cantillationEnabled: boolean;
  punctuation: boolean;
  aliyot: boolean;
}

export function displayMenuAvailability(args: {
  settings: ReaderSettings;
  /** True for connections-sidebar panels: only the language control is offered. */
  inSidebar?: boolean;
  isSheet?: boolean;
  book?: string;
  primaryCategory?: string;
  /** A sample of the visible Hebrew text, used to detect nikud and te'amim. */
  hebrewSample?: string;
  panelWidth?: number;
  showsSource: boolean;
}): DisplayMenuAvailability {
  const { settings, inSidebar, isSheet, book, primaryCategory, hebrewSample = "", panelWidth, showsSource } = args;
  if (inSidebar) {
    return { language: true, layout: false, fontSize: false, vowels: false, cantillation: false, cantillationEnabled: false, punctuation: false, aliyot: false };
  }
  const nikud = showsSource && hasNikud(hebrewSample);
  const taamim = showsSource && hasTaamim(hebrewSample);
  // Layout buttons are hidden on narrow panels when bilingual (they could not take effect).
  const layoutHidden = settings.language === "bilingual" && panelWidth !== undefined && panelWidth <= 600;
  return {
    language: true,
    layout: !layoutHidden,
    fontSize: true,
    vowels: nikud,
    cantillation: taamim,
    cantillationEnabled: settings.vowels !== "none",
    punctuation: primaryCategory === "Talmud" && showsSource,
    aliyot: !isSheet && supportsAliyot(book),
  };
}
