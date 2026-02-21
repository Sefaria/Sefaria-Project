/**
 * Bilingual text constants for the newsletter signup page components.
 *
 * These constants follow the {en, he} format that is compatible with
 * Sefaria's InterfaceText component from Misc.jsx.
 *
 * Usage:
 *   import { BILINGUAL_TEXT } from './bilingualUtils';
 *   <InterfaceText text={BILINGUAL_TEXT.SOME_KEY} />
 *
 * This keeps translations in one place for easy maintenance while
 * using Sefaria's standard InterfaceText component for rendering.
 */

/**
 * Bilingual text constants for common form labels
 * Keeps translations in one place for easy maintenance
 */
export const BILINGUAL_TEXT = {
  // Header text
  SUBSCRIBE_TITLE: {
    en: 'Sign Up for Emails',
    he: 'הירשם לאימיילים',
  },
  MANAGE_TITLE: {
    en: 'Manage Your Subscriptions',
    he: 'נהל את המינויים שלך',
  },

  // Subtitle/description
  SUBSCRIBE_SUBTITLE: {
    en: 'You can now log into your Sefaria account on the mobile app to sync your reading history and saved texts on your mobile device.',
    he: 'כעת תוכל להתחבר לחשבון Sefaria שלך באפליקציה הניידת כדי לסנכרן את היסטוריית הקריאה והטקסטים השמורים שלך במכשיר הנייד שלך.',
  },
  MANAGE_SUBTITLE: {
    en: 'Choose which newsletters you\'d like to receive.',
    he: 'בחר אילו ניוזלטרים תרצה לקבל.',
  },

  // Form labels
  FIRST_NAME: {
    en: 'First Name',
    he: 'שם פרטי',
  },
  LAST_NAME: {
    en: 'Last Name',
    he: 'שם משפחה',
  },
  EMAIL: {
    en: 'Email',
    he: 'דוא"ל',
  },
  CONFIRM_EMAIL: {
    en: 'Confirm Email',
    he: 'אשר דוא"ל',
  },
  REQUIRED: {
    en: '*',
    he: '*',
  },
  OPTIONAL: {
    en: '(Optional)',
    he: '(אופציונלי)',
  },

  // Form section headers
  NAME_SECTION: {
    en: 'Name',
    he: 'שם',
  },
  CONTACT_SECTION: {
    en: 'Contact',
    he: 'יצירת קשר',
  },
  SELECT_LISTS_SECTION: {
    en: 'Select the lists you wish to subscribe to:',
    he: 'בחר את הרשימות שאליהן ברצונך להירשם:',
  },
  FINISHED_SECTION: {
    en: 'Finished?',
    he: 'סיימת?',
  },

  // Newsletter section (legacy - keeping for compatibility)
  WE_RECOMMEND: {
    en: 'We recommend:',
    he: 'אנחנו ממליצים:',
  },
  CHOOSE_NEWSLETTERS: {
    en: 'Choose which newsletters you\'d like to receive.',
    he: 'בחר אילו ניוזלטרים תרצה לקבל.',
  },

  // Button text
  SUBMIT: {
    en: 'Submit',
    he: 'שלח',
  },
  SUBMITTING: {
    en: 'Submitting...',
    he: 'שולח...',
  },
  SUBSCRIBE: {
    en: 'Subscribe',
    he: 'הרשמו',
  },
  UPDATE_PREFERENCES: {
    en: 'Update Preferences',
    he: 'עדכנו העדפות',
  },
  SUBSCRIBING: {
    en: 'Subscribing...',
    he: 'הרשמה...',
  },
  UPDATING: {
    en: 'Updating...',
    he: 'עדכון...',
  },

  // Confirmation
  THANK_YOU: {
    en: 'Thank you!',
    he: 'תודה רבה!',
  },
  CONFIRMATION_SENT: {
    en: 'We\'ve sent a confirmation to',
    he: 'שלחנו אישור ל',
  },
  SHOULD_SEE_SOON: {
    en: 'You should see it soon.',
    he: 'אתה צריך לראות אותו בקרוב.',
  },
  SUBMISSION_RECEIVED: {
    en: 'We\'ve received your submission.',
    he: 'קיבלנו את ההגשה שלך.',
  },
  PREFERENCES_SAVED: {
    en: 'Your preferences have been saved.',
    he: 'ההעדפות שלך נשמרו.',
  },
  SUBSCRIBED_TO: {
    en: "You've subscribed to:",
    he: 'הרשמת לרשימה:',
  },
  UNSUBSCRIBED_FROM: {
    en: "You've unsubscribed from:",
    he: 'ביטלת את הרשמתך מ:',
  },
  PREFERENCES_UP_TO_DATE: {
    en: 'Your preferences are up to date.',
    he: 'ההעדפות שלך מעודכנות.',
  },
  OPTED_OUT_MARKETING: {
    en: "You've opted out of marketing emails.",
    he: 'ביטלת קבלת מיילים שיווקיים.',
  },

  // Learning level
  HELP_TAILOR_CONTENT: {
    en: 'Help us tailor your content',
    he: 'עזור לנו להתאים את התוכן שלך',
  },
  LEARNING_LEVEL_SUBTITLE: {
    en: 'To make sure we send you the most relevant content, please let us know your learning level. Help us get to know you better.',
    he: 'כדי לוודא שאנו שולחים לך את התוכן הרלוונטי ביותר, אנא הודע לנו את רמת הלמידה שלך. עזור לנו להכיר אותך טוב יותר.',
  },
  LEARNING_LEVEL_HEADER: {
    en: 'In terms of your ability to study Jewish texts, select the statement below that best describes you:',
    he: 'מבחינת היכולת שלך ללמוד טקסטים יהודיים, בחר את ההיגד למטה שמתאר אותך בצורה הטובה ביותר:',
  },
  SAVE_MY_LEVEL: {
    en: 'Save my level',
    he: 'שמור את הרמה שלי',
  },
  SAVING: {
    en: 'Saving...',
    he: 'שמירה...',
  },
  SKIP_TO_HOMEPAGE: {
    en: 'No thanks, take me to the homepage',
    he: 'לא תודה, קח אותי לדף הבית',
  },

  // Success
  ALL_SET: {
    en: 'All set!',
    he: 'הכל מוכן!',
  },
  THANKS_FOR_JOINING: {
    en: 'Thank you for joining our community. We\'re excited to share more with you.',
    he: 'תודה שהצטרפת לקהילה שלנו. אנחנו שמחים לשתף עוד איתך.',
  },
  RETURN_TO_SEFARIA: {
    en: 'Return to Sefaria',
    he: 'חזור ל-Sefaria',
  },

  // Privacy
  PRIVACY_NOTE: {
    en: 'We respect your privacy. You can unsubscribe from any newsletter at any time.',
    he: 'אנחנו מכבדים את הפרטיות שלך. אתה יכול להתנתק מכל ניוזלטר בכל עת.',
  },

  // Marketing email opt-out toggle (logged-in users only)
  MARKETING_EMAIL_QUESTION: {
    en: 'Do you want to receive email updates from Sefaria?',
    he: 'האם תרצו לקבל עדכונים במייל מספריא?',
  },
  YES: {
    en: 'Yes',
    he: 'כן',
  },
  NO: {
    en: 'No',
    he: 'לא',
  },
  ADMIN_EMAILS_NOTE: {
    en: 'Note: You will still receive administrative emails regarding your account and donations.',
    he: 'הערה: עדיין תקבלו הודעות מנהליות בנוגע לחשבון שלכם ולתרומות.',
  },
};
