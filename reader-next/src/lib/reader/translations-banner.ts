/**
 * When to offer "Want to change the translation?": the text's corpus is Tanakh, Mishnah or Bavli, the panel is not
 * Hebrew-only, and the reader has not dismissed it in this browser session (session cookie `open_trans_banner_shown`,
 * as the old site). VERIFIED on sefaria.org: Genesis in English and bilingual shows it; "Go to translations" opens
 * `with=Translations` and sets the cookie.
 *
 * @feature TXD-064 Open translations banner
 */
export const OPEN_TRANS_BANNER_COOKIE = "open_trans_banner_shown";
const CORPORA = new Set(["Tanakh", "Mishnah", "Bavli"]);

export const openTransBannerApplies = (corpus: string | undefined, language: "hebrew" | "english" | "bilingual"): boolean =>
  language !== "hebrew" && corpus !== undefined && CORPORA.has(corpus);

export const bannerDismissed = (cookie: string): boolean => new RegExp(`(?:^|;\\s*)${OPEN_TRANS_BANNER_COOKIE}=`).test(cookie);

export const dismissBanner = (): void => {
  if (typeof document !== "undefined") document.cookie = `${OPEN_TRANS_BANNER_COOKIE}=1; path=/; samesite=lax`;
};
