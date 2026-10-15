/**
 * Interface strings for the NG reader, keyed by interfaceLang. Kept local (not Sefaria._)
 * so a render depends only on its own props, never on state left on the shared singleton.
 */
const STRINGS = {
  english: {
    readerLabel: 'Text reader',
    searchInBook: 'Search in this book',
    contents: 'Table of contents',
    browse: 'Browse the library',
    textSettings: 'Text settings',
    loadingNext: 'Loading the next section',
    loadingPrev: 'Loading the previous section',
    loadPrevious: 'Previous section',
    nextSection: 'Next section',
    retry: 'Couldn’t load this section. Tap to try again.',
    endOfBook: 'End of book',
    close: 'Close',
    source: 'Source',
    translation: 'Translation',
    bilingual: 'Source and translation',
    layout: 'Layout',
    stacked: 'Stacked',
    sideBySide: 'Side by side',
    continuous: 'Continuous',
    segmented: 'Verse by verse',
    classicView: 'Switch to the classic reader',
    connectionsFor: 'Connections for',
    comingSoon: 'Commentary, links and resources will appear here.',
  },
  hebrew: {
    readerLabel: 'קורא טקסטים',
    searchInBook: 'חיפוש בספר',
    contents: 'תוכן העניינים',
    browse: 'עיון בספרייה',
    textSettings: 'הגדרות טקסט',
    loadingNext: 'טוען את הפרק הבא',
    loadingPrev: 'טוען את הפרק הקודם',
    loadPrevious: 'לפרק הקודם',
    nextSection: 'לפרק הבא',
    retry: 'הטעינה נכשלה. יש להקיש כדי לנסות שוב.',
    endOfBook: 'סוף הספר',
    close: 'סגירה',
    source: 'מקור',
    translation: 'תרגום',
    bilingual: 'מקור ותרגום',
    layout: 'פריסה',
    stacked: 'זה מעל זה',
    sideBySide: 'זה לצד זה',
    continuous: 'רציף',
    segmented: 'פסוק אחר פסוק',
    classicView: 'מעבר לתצוגה הקלאסית',
    connectionsFor: 'קישורים עבור',
    comingSoon: 'פרשנים, קישורים ומקורות נוספים יופיעו כאן.',
  },
};

export function strings(interfaceLang) {
  return STRINGS[interfaceLang] || STRINGS.english;
}

export default STRINGS;
