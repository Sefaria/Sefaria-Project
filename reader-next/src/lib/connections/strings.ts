/**
 * The sidebar's section headings, in the old client's words: `connection_panel_section.*` of
 * static/js/sefaria/i18n/interface/{en,he}.json (strings.test.ts holds them to those files). The Hebrew interface
 * says "מקורות לעיון" / "עזרים", not "טקסטים קשורים" / "משאבים".
 *
 * @feature CON-012 Resources home view
 */
export const CONNECTION_PANEL_SECTION = {
  related_texts: { en: "Related Texts", he: "מקורות לעיון" },
  resources: { en: "Resources", he: "עזרים" },
  tools: { en: "Tools", he: "כלים" },
  share_link: { en: "Share Link", he: "שיתוף קישור" },
  more_options: { en: "More Options", he: "אפשרויות נוספות" },
} as const satisfies Record<string, { en: string; he: string }>;
