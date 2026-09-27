/**
 * Interface strings for associated texts: the panel, the segment badges and the pinned
 * comments. Separate from ./strings.js so the panels can grow their vocabularies independently.
 */
const STRINGS = {
  english: {
    panelLabel: 'Associated texts',
    majorCommentators: 'Major commentators',
    byCategory: 'By category',
    citedBy: 'Cited by',
    citedByNote: 'Later works that quote this text',
    yourNotes: 'Your notes',
    hebrewOnly: 'Hebrew only',
    works: (n) => (n === 1 ? '1 work' : `${n} works`),
    comments: (n) => (n === 1 ? '1 comment' : `${n} comments`),
    connections: (n) => (n === 1 ? '1 associated text' : `${n.toLocaleString('en-US')} associated texts`),
    loading: 'Loading',
    noConnections: 'Nothing is linked to this passage yet.',
    loadFailed: 'Couldn’t load. Tap to try again.',
    back: 'Back',
    close: 'Close',
    pin: 'Pin under the text',
    pinned: 'Pinned under the text',
    pinFull: 'Two commentators are pinned. Unpin one to pin another.',
    openInReader: 'Open in the reader',
    showSource: 'Source',
    showTranslation: 'Translation',
    showBoth: 'Both',
    textLanguage: 'Language of associated texts',
    trail: 'Where you are',
    more: 'More',
  },
  hebrew: {
    panelLabel: 'מקורות קשורים',
    majorCommentators: 'פרשנים מרכזיים',
    byCategory: 'לפי סוג',
    citedBy: 'מצוטט אצל',
    citedByNote: 'חיבורים מאוחרים המביאים את הטקסט',
    yourNotes: 'ההערות שלך',
    hebrewOnly: 'בעברית בלבד',
    works: (n) => (n === 1 ? 'חיבור אחד' : `${n} חיבורים`),
    comments: (n) => (n === 1 ? 'פירוש אחד' : `${n} פירושים`),
    connections: (n) => (n === 1 ? 'מקור קשור אחד' : `${n.toLocaleString('en-US')} מקורות קשורים`),
    loading: 'טוען',
    noConnections: 'אין עדיין מקורות המקושרים לקטע זה.',
    loadFailed: 'הטעינה נכשלה. יש להקיש כדי לנסות שוב.',
    back: 'חזרה',
    close: 'סגירה',
    pin: 'הצמדה מתחת לטקסט',
    pinned: 'מוצמד מתחת לטקסט',
    pinFull: 'שני פרשנים כבר מוצמדים. יש לבטל הצמדה כדי להצמיד אחר.',
    openInReader: 'פתיחה בקורא',
    showSource: 'מקור',
    showTranslation: 'תרגום',
    showBoth: 'שניהם',
    textLanguage: 'שפת המקורות הקשורים',
    trail: 'המיקום שלך',
    more: 'עוד',
  },
};

export function associatedStrings(interfaceLang) {
  return STRINGS[interfaceLang] || STRINGS.english;
}

export default STRINGS;
