/**
 * Interface-string IDs for the newsletter sign-up page.
 *
 * The text itself lives in i18n/interface/{en,he}.json (the Weblate source files), under the
 * "newsletter_sign_up_page." namespace. Render an ID with <InterfaceText>{TEXT_KEYS.X}</InterfaceText>
 * or resolve it with Sefaria._(TEXT_KEYS.X). Never put English or Hebrew prose in this file.
 */
export const TEXT_KEYS = {
  HERO_TITLE: "newsletter_sign_up_page.hero_title",
  HERO_DESCRIPTION: "newsletter_sign_up_page.hero_description",
  SUBSCRIBE_TITLE: "newsletter_sign_up_page.subscribe_title",
  MANAGE_TITLE: "newsletter_sign_up_page.manage_title",
  SUBSCRIBE_SUBTITLE: "newsletter_sign_up_page.subscribe_subtitle",
  MANAGING_SUBSCRIPTIONS_FOR: "newsletter_sign_up_page.managing_subscriptions_for",
  OPTIONAL: "newsletter_sign_up_page.optional",
  SELECT_LISTS_SECTION: "newsletter_sign_up_page.select_lists_section",
  EMAIL_EXAMPLES_HEADER: "newsletter_sign_up_page.email_examples_header",
  TESTIMONIALS_HEADER: "newsletter_sign_up_page.testimonials_header",
  SUBMIT: "newsletter_sign_up_page.submit",
  SUBMITTING: "newsletter_sign_up_page.submitting",
  UPDATE_PREFERENCES: "newsletter_sign_up_page.update_preferences",
  UPDATING: "newsletter_sign_up_page.updating",
  THANK_YOU: "newsletter_sign_up_page.thank_you",
  CONFIRMATION_SENT: "newsletter_sign_up_page.confirmation_sent",
  SHOULD_SEE_SOON: "newsletter_sign_up_page.should_see_soon",
  SUBMISSION_RECEIVED: "newsletter_sign_up_page.submission_received",
  PREFERENCES_SAVED: "newsletter_sign_up_page.preferences_saved",
  SUBSCRIBED_TO: "newsletter_sign_up_page.subscribed_to",
  UNSUBSCRIBED_FROM: "newsletter_sign_up_page.unsubscribed_from",
  PREFERENCES_UP_TO_DATE: "newsletter_sign_up_page.preferences_up_to_date",
  OPTED_OUT_MARKETING: "newsletter_sign_up_page.opted_out_marketing",
  LEARNING_LEVEL_HEADER: "newsletter_sign_up_page.learning_level_header",
  SKIP_THIS_STEP: "newsletter_sign_up_page.skip_this_step",
  ALL_SET: "newsletter_sign_up_page.all_set",
  THANKS_FOR_JOINING: "newsletter_sign_up_page.thanks_for_joining",
  RETURN_TO_SEFARIA: "newsletter_sign_up_page.return_to_sefaria",
  PRIVACY_NOTE_1: "newsletter_sign_up_page.privacy_note_1",
  PRIVACY_NOTE_2: "newsletter_sign_up_page.privacy_note_2",
  MARKETING_EMAIL_QUESTION: "newsletter_sign_up_page.marketing_email_question",
  YES: "newsletter_sign_up_page.yes",
  NO: "newsletter_sign_up_page.no",
  ADMIN_EMAILS_NOTE: "newsletter_sign_up_page.admin_emails_note",
  FIX_ERRORS: "newsletter_sign_up_page.fix_errors",
  ENTER_FIRST_NAME: "newsletter_sign_up_page.enter_first_name",
  ENTER_LAST_NAME: "newsletter_sign_up_page.enter_last_name",
  ENTER_EMAIL: "newsletter_sign_up_page.enter_email",
  VALID_EMAIL: "newsletter_sign_up_page.valid_email",
  EMAILS_MISMATCH: "newsletter_sign_up_page.emails_mismatch",
  SELECT_NEWSLETTER: "newsletter_sign_up_page.select_newsletter",
  SELECT_LEARNING_LEVEL: "newsletter_sign_up_page.select_learning_level",
  GENERIC_ERROR: "newsletter_sign_up_page.generic_error",
  LEARNING_LEVEL_EXPIRED: "newsletter_sign_up_page.learning_level_expired",
  SKIP_PROMPT: "newsletter_sign_up_page.skip_prompt",
  CONFIRM_EMAIL_ADDRESS: "newsletter_sign_up_page.confirm_email_address",
  NEWSLETTER_OPTIONS: "newsletter_sign_up_page.newsletter_options",
  MARKETING_EMAIL_PREFERENCE: "newsletter_sign_up_page.marketing_email_preference",
  NEWSLETTER_UNAVAILABLE: "newsletter_sign_up_page.newsletter_unavailable",
};

// "analyticsName" is the stable English label sent to analytics; it is not shown to users.
export const LEARNING_LEVELS = [
  {
    value: 1,
    analyticsName: "Newcomer",
    label: "newsletter_sign_up_page.learning_level_1.label",
    description: "newsletter_sign_up_page.learning_level_1.description",
  },
  {
    value: 2,
    analyticsName: "Beginner",
    label: "newsletter_sign_up_page.learning_level_2.label",
    description: "newsletter_sign_up_page.learning_level_2.description",
  },
  {
    value: 3,
    analyticsName: "Intermediate",
    label: "newsletter_sign_up_page.learning_level_3.label",
    description: "newsletter_sign_up_page.learning_level_3.description",
  },
  {
    value: 4,
    analyticsName: "Advanced",
    label: "newsletter_sign_up_page.learning_level_4.label",
    description: "newsletter_sign_up_page.learning_level_4.description",
  },
  {
    value: 5,
    analyticsName: "Expert",
    label: "newsletter_sign_up_page.learning_level_5.label",
    description: "newsletter_sign_up_page.learning_level_5.description",
  },
];
