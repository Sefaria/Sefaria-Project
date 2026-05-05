/**
 * FORM_STATUS — Symbols for form submission state machine
 * Lifecycle: IDLE → SUBMITTING → SUCCESS | ERROR
 */
export const FORM_STATUS = Object.freeze({
  IDLE: Symbol("idle"),
  SUBMITTING: Symbol("submitting"),
  SUCCESS: Symbol("success"),
  ERROR: Symbol("error"),
});

/**
 * STAGE — Symbols for which view is currently rendered
 * Flow: NEWSLETTER_SELECTION → CONFIRMATION → SUCCESS
 */
export const STAGE = Object.freeze({
  NEWSLETTER_SELECTION: Symbol("newsletter_selection"),
  CONFIRMATION: Symbol("confirmation"),
  SUCCESS: Symbol("success"),
});

export const NEWSLETTERS = [
  { key: 'sefaria_news', labelKey: 'Sefaria News & Resources', icon: 'news-and-resources.svg' },
  { key: 'educator_resources', labelKey: 'Educator Resources', icon: 'educator-resources.svg' },
  { key: 'text_updates', labelKey: 'New Text Updates', icon: 'new-text-release-updates.svg' },
  { key: 'parashah_series', labelKey: 'Weekly Parashah Study Series', icon: 'weekly-study-guide.svg' },
  { key: 'tech_updates', labelKey: 'Technology and Developer Updates', icon: 'technology-updates.svg' },
  { key: 'timeless_topics', labelKey: 'Timeless Topics', icon: 'timeless-topics.svg' },
];

export const LEARNING_LEVELS = [
  {
    value: 1,
    label: { en: 'Newcomer', he: 'מתחיל' },
    description: {
      en: 'I need significant guidance and translation to navigate and study the texts in the Jewish library.',
      he: 'אני צריך הנחיה משמעותית ותרגום כדי לנווט ללמוד טקסטים בספרייה היהודית.',
    },
  },
  {
    value: 2,
    label: { en: 'Beginner', he: 'חדש' },
    description: {
      en: 'I need translation and contextual information to navigate and study the Jewish library.',
      he: 'אני צריך תרגום ומידע הקשרי כדי לנווט ללמוד את הספרייה היהודית.',
    },
  },
  {
    value: 3,
    label: { en: 'Intermediate', he: 'ביניים' },
    description: {
      en: 'I can navigate the library but need translation and/or context for meaningful study.',
      he: 'אני יכול לנווט בספרייה אך אני צריך תרגום ו/או הקשר ללימוד משמעותי.',
    },
  },
  {
    value: 4,
    label: { en: 'Advanced', he: 'מתקדם' },
    description: {
      en: 'I can easily navigate the Jewish library but benefit from translation and/or context in some cases.',
      he: 'אני יכול לנווט בקלות בספרייה היהודית אך מקבל תועלת מתרגום ו/או הקשר במקרים מסוימים.',
    },
  },
  {
    value: 5,
    label: { en: 'Expert', he: 'מומחה' },
    description: {
      en: 'I can easily study the texts of the Jewish library independently in their original language.',
      he: 'אני יכול בקלות ללמוד את הטקסטים של הספרייה היהודית באופן עצמאי בשפתם המקורית.',
    },
  },
];
