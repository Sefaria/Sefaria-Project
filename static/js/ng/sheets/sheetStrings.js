/**
 * Interface strings for the reader's bottom sheets (table of contents, search in the book),
 * keyed by interfaceLang. Local, like ../strings.js, so a render depends only on its props.
 */
const STRINGS = {
  english: {
    close: 'Close',
    contents: 'Table of contents',
    contentsOf: (title) => `Contents of ${title}`,
    loading: 'Loading…',
    loadFailed: 'Couldn’t load the table of contents.',
    retry: 'Try again',
    current: 'You are here',
    expand: 'Show',
    collapse: 'Hide',
    searchIn: (title) => `Search in ${title}`,
    searchPlaceholder: (title) => `Search in ${title}`,
    clear: 'Clear',
    typeToSearch: 'Words or phrases, in Hebrew or English.',
    searching: 'Searching…',
    results: (n, more) => (n === 1 && !more ? '1 passage' : `${n}${more ? '+' : ''} passages`),
    noResults: (q, title) => `Nothing for “${q}” in ${title}.`,
    searchFailed: 'Search isn’t available right now.',
    loadMore: 'More results',
    versions: (n) => (n > 1 ? `${n} versions` : ''),
  },
  hebrew: {
    close: 'סגירה',
    contents: 'תוכן העניינים',
    contentsOf: (title) => `תוכן העניינים של ${title}`,
    loading: 'טוען…',
    loadFailed: 'לא ניתן לטעון את תוכן העניינים.',
    retry: 'לנסות שוב',
    current: 'המיקום הנוכחי',
    expand: 'הצגה',
    collapse: 'הסתרה',
    searchIn: (title) => `חיפוש ב${title}`,
    searchPlaceholder: (title) => `חיפוש ב${title}`,
    clear: 'ניקוי',
    typeToSearch: 'מילים או ביטויים, בעברית או באנגלית.',
    searching: 'מחפש…',
    results: (n, more) => (n === 1 && !more ? 'מקור אחד' : `${n}${more ? '+' : ''} מקורות`),
    noResults: (q, title) => `לא נמצאו תוצאות עבור „${q}” ב${title}.`,
    searchFailed: 'החיפוש אינו זמין כרגע.',
    loadMore: 'תוצאות נוספות',
    versions: (n) => (n > 1 ? `${n} נוסחים` : ''),
  },
};

export function sheetStrings(interfaceLang) {
  return STRINGS[interfaceLang] || STRINGS.english;
}

export default STRINGS;
