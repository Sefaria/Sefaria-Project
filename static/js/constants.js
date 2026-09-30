export const layoutOptions = {
    'mono': ['continuous', 'segmented'],
    'bi-rtl': ['stacked', 'heRight'],
    'bi-ltr': ['stacked', 'heLeft'],
    'mixed': ['stacked', 'heLeft', 'heRight'],
};
export const layoutLabels = {
    'continuous': 'layout_buttons.show_text_as_a_paragraph',
    'segmented': 'layout_buttons.show_text_segmented',
    'stacked': 'layout_buttons.show_source_translation_stacked',
    'heRight': 'layout_buttons.show_rtl_text_right_of_ltr_text',
    'heLeft': 'layout_buttons.show_rtl_text_left_of_ltr_text',
}
// Interface-string IDs for connections-panel mode names that appear in page
// titles and the connections back-button (values not listed here are data
// values — categories, book titles — translated via the terms dictionary).
export const CONNECTION_MODE_STRING_IDS = {
    "About": "common.about",
    "Web Pages": "connections_panel.web_pages",
    "Sheets": "common.sheets",
    "Notes": "user_history_panel.notes",
    "Translations": "translations_box.translations",
    "Versions": "book_page.versions",
    "Version Open": "connections_panel.version_open",
    "Share": "sheet_options.share",
}
export const VOICES_MODULE = "voices";
export const LIBRARY_MODULE = "library";