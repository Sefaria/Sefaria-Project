/**
 * Writing direction of a language, for text whose language is known but whose direction the data does not say. Text from a version
 * carries its own `direction`; prefer that when there is one.
 *
 * @feature I18-013 Right-to-left layout and Hebrew numerals
 */
const RTL = new Set(["he", "iw", "arc", "yi", "jrb", "ar", "fa", "ur", "syc", "sam"]);

/** "he", "he-IL", "arc" → "rtl"; anything else → "ltr". */
export function dirFor(lang: string): "rtl" | "ltr" {
  return RTL.has(lang.toLowerCase().split("-")[0]!) ? "rtl" : "ltr";
}
