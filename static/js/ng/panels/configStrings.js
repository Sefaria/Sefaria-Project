/**
 * Interface strings for the config panel, keyed by interfaceLang. Kept beside the panel (not
 * in ../strings.js) so the panel and the reader's other overlays can change independently.
 */
const STRINGS = {
  english: {
    title: 'Text settings',
    close: 'Close',
    back: 'Back',
    language: 'Language',
    source: 'Source',
    translation: 'Translation',
    both: 'Both',
    bilingualLayout: 'Source and translation',
    stacked: 'Stacked',
    sideBySide: 'Side by side',
    versions: 'Versions',
    sourceVersion: 'Source',
    translationVersion: 'Translation',
    chooseSource: 'Source versions',
    chooseTranslation: 'Translations',
    loadingVersions: 'Loading versions…',
    versionsError: 'Couldn’t load the versions. Tap to try again.',
    switchError: 'Couldn’t switch to that version. Try again.',
    noOtherVersions: 'No other versions of this text.',
    current: 'Current',
    aboutVersion: 'About this version',
    hideAbout: 'Hide details',
    sourceLink: 'Version source',
    text: 'Text',
    fontSize: 'Font size',
    smaller: 'Smaller text',
    larger: 'Larger text',
    flow: 'Layout',
    segmentedTanakh: 'Verse by verse',
    segmented: 'By segment',
    continuous: 'Continuous',
    vowels: 'Vowels and cantillation',
    vowelsOnly: 'Vowels',
    vowelsAll: 'All',
    vowelsPartial: 'Vowels',
    vowelsNone: 'None',
    punctuation: 'Punctuation',
    on: 'On',
    off: 'Off',
    classicView: 'Classic view',
    classicViewNote: 'Open this page in the classic reader',
  },
  hebrew: {
    title: 'הגדרות טקסט',
    close: 'סגירה',
    back: 'חזרה',
    language: 'שפה',
    source: 'מקור',
    translation: 'תרגום',
    both: 'שניהם',
    bilingualLayout: 'מקור ותרגום',
    stacked: 'זה מעל זה',
    sideBySide: 'זה לצד זה',
    versions: 'גרסאות',
    sourceVersion: 'מקור',
    translationVersion: 'תרגום',
    chooseSource: 'גרסאות המקור',
    chooseTranslation: 'תרגומים',
    loadingVersions: 'טוען גרסאות…',
    versionsError: 'טעינת הגרסאות נכשלה. יש להקיש כדי לנסות שוב.',
    switchError: 'המעבר לגרסה זו נכשל. יש לנסות שוב.',
    noOtherVersions: 'אין גרסאות נוספות לטקסט זה.',
    current: 'נוכחית',
    aboutVersion: 'אודות הגרסה',
    hideAbout: 'הסתרת הפרטים',
    sourceLink: 'מקור הגרסה',
    text: 'טקסט',
    fontSize: 'גודל גופן',
    smaller: 'הקטנת הטקסט',
    larger: 'הגדלת הטקסט',
    flow: 'פריסה',
    segmentedTanakh: 'פסוק אחר פסוק',
    segmented: 'לפי קטעים',
    continuous: 'רציף',
    vowels: 'ניקוד וטעמים',
    vowelsOnly: 'ניקוד',
    vowelsAll: 'הכול',
    vowelsPartial: 'ניקוד',
    vowelsNone: 'ללא',
    punctuation: 'פיסוק',
    on: 'מופעל',
    off: 'כבוי',
    classicView: 'תצוגה קלאסית',
    classicViewNote: 'פתיחת הדף בתצוגה הקלאסית',
  },
};

// Licenses as they appear on version records; anything else is shown as is.
const HE_LICENSES = {
  'Public Domain': 'נחלת הכלל',
  'unknown': 'לא ידוע',
};

export function configStrings(interfaceLang) {
  return STRINGS[interfaceLang] || STRINGS.english;
}

export function licenseLabel(license, interfaceLang) {
  if (!license) { return ''; }
  if (interfaceLang === 'hebrew' && HE_LICENSES[license]) { return HE_LICENSES[license]; }
  return license === 'unknown' ? 'Unknown' : license;
}

export default STRINGS;
