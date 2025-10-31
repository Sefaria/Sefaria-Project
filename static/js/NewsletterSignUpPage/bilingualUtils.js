import React from 'react';
import Sefaria from '../sefaria/sefaria';

/**
 * Utility functions for handling bilingual (English/Hebrew) text
 * in the newsletter signup form components.
 *
 * This helps avoid duplication of JSX elements and data attributes
 * by using a text object pattern similar to Sefaria's InterfaceText component.
 *
 * Pattern adopted from InterfaceText to:
 * - Only render the current language (not both hidden by CSS)
 * - Automatically detect language via Sefaria.interfaceLang
 * - Fall back to other language if current is missing
 */

/**
 * Renders bilingual text - only renders the current language
 * @param {Object} textObj - Object with 'en' and 'he' properties
 * @returns {React.ReactNode} JSX with only the current language
 *
 * Usage:
 *   {renderBilingual({en: 'Hello', he: 'שלום'})}
 *
 * If interfaceLang is 'english', renders:
 *   <span className="int-en">Hello</span>
 *
 * If interfaceLang is 'hebrew', renders:
 *   <span className="int-he">שלום</span>
 *
 * Falls back to other language if current language text is missing.
 */
export const renderBilingual = (textObj) => {
  if (!textObj || typeof textObj !== 'object') {
    return null;
  }

  const isHebrew = Sefaria.interfaceLang === 'hebrew';
  const className = isHebrew ? 'int-he' : 'int-en';

  // Use requested language, fall back to other if not available
  const text = isHebrew ? (textObj.he || textObj.en) : (textObj.en || textObj.he);

  return (
    <span className={className}>{text}</span>
  );
};

/**
 * Alternative: Renders bilingual text inside a specified wrapper element
 * @param {Object} textObj - Object with 'en' and 'he' properties
 * @param {string} wrapperTag - HTML tag name ('p', 'h2', 'label', etc.)
 * @param {Object} attributes - HTML attributes for the wrapper element
 * @returns {React.ReactNode} JSX with wrapper
 *
 * Usage:
 *   {renderBilingualElement('h2', 'Hello', 'שלום', { className: 'title' })}
 *
 * Renders:
 *   <h2 className="title">
 *     <span className="int-en">Hello</span>
 *     <span className="int-he">שלום</span>
 *   </h2>
 */
export const renderBilingualElement = (
  wrapperTag,
  textObj,
  attributes = {}
) => {
  const WrapperElement = wrapperTag;

  return (
    <WrapperElement {...attributes}>
      {renderBilingual(textObj)}
    </WrapperElement>
  );
};

/**
 * Creates text object from individual language strings
 * Useful for constructing text objects programmatically
 * @param {string} enText - English text
 * @param {string} heText - Hebrew text
 * @returns {Object} Text object {en, he}
 *
 * Usage:
 *   const text = createBilingualText('Hello', 'שלום');
 *   {renderBilingual(text)}
 */
export const createBilingualText = (enText, heText) => ({
  en: enText,
  he: heText,
});

/**
 * Bilingual text constants for common form labels
 * Keeps translations in one place for easy maintenance
 */
export const BILINGUAL_TEXT = {
  // Header text
  SUBSCRIBE_TITLE: {
    en: 'Subscribe to Our Newsletters',
    he: 'הצטרף לניוזלטרים שלנו',
  },
  MANAGE_TITLE: {
    en: 'Manage Your Subscriptions',
    he: 'נהל את המינויים שלך',
  },

  // Subtitle/description
  SUBSCRIBE_SUBTITLE: {
    en: 'Stay updated with content curated just for you.',
    he: 'הישאר עדכני עם תוכן שנקורט עבורך.',
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
  REQUIRED: {
    en: '*',
    he: '*',
  },
  OPTIONAL: {
    en: '(Optional)',
    he: '(אופציונלי)',
  },

  // Newsletter section
  WE_RECOMMEND: {
    en: 'We recommend:',
    he: 'אנחנו ממליצים:',
  },
  CHOOSE_NEWSLETTERS: {
    en: 'Choose which newsletters you\'d like to receive.',
    he: 'בחר אילו ניוזלטרים תרצה לקבל.',
  },

  // Button text
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

  // Learning level
  HELP_TAILOR_CONTENT: {
    en: 'Help us tailor your content',
    he: 'עזור לנו להתאים את התוכן שלך',
  },
  LEARNING_LEVEL_SUBTITLE: {
    en: 'To make sure we send you the most relevant content, please let us know your learning level. Help us get to know you better.',
    he: 'כדי לוודא שאנו שולחים לך את התוכן הרלוונטי ביותר, אנא הודע לנו את רמת הלמידה שלך. עזור לנו להכיר אותך טוב יותר.',
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
};
