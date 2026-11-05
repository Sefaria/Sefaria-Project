/**
 * The auth page's interface strings, copied verbatim from the old client's i18n/interface/{en,he}.json (keys `auth.*`, plus the
 * few `header.*` / `common.*` keys the auth views use). Keys stay the old stable IDs so server answers that carry a key (e.g.
 * `{"error": "auth.invalid_credentials"}`) are looked up the same way.
 *
 * @feature ACC-008 Auth page with choose / email views
 */
export const AUTH_STRINGS = {
  "auth.already_have_an_account": { en: "Already have an account?", he: "יש לך חשבון?" },
  "auth.back": { en: "Back", he: "חזרה" },
  "auth.check_your_email": { en: "Check your email and follow the instructions to reset your password.", he: "שלחנו לך הוראות לעדכון הסיסמה לתיבת הדוא״ל שלך." },
  "auth.confirm_new_password": { en: "Confirm New Password", he: "אימות סיסמה חדשה" },
  "auth.continue_with_apple": { en: "Continue with Apple", he: "המשך עם אפל" },
  "auth.continue_with_apple_link": { en: "Continue with Apple", he: "להתחברות דרך אפל" },
  "auth.continue_with_email": { en: "Continue with Email", he: "המשך עם דוא״ל" },
  "auth.continue_with_google": { en: "Continue with Google", he: "המשך עם גוגל" },
  "auth.continue_with_google_link": { en: "Continue with Google", he: "להתחברות דרך גוגל" },
  "auth.create_account": { en: "Create Account", he: "יצירת חשבון" },
  "auth.dont_have_an_account": { en: "Don't have an account?", he: "אין לך חשבון?" },
  "auth.email_address": { en: "Email Address", he: "דוא״ל" },
  "auth.email_exists_apple": { en: "This email address is already registered via Apple Sign-In.", he: "דוא״ל זה כבר רשום דרך אפל." },
  "auth.email_exists_generic": { en: "An account with this email address already exists.", he: "קיים חשבון עם הדוא״ל הזה." },
  "auth.email_exists_google": { en: "This email address is already registered via Google Sign-In.", he: "דוא״ל זה כבר רשום דרך גוגל." },
  "auth.email_registered_apple": { en: "This email address is registered via Apple.", he: "דוא״ל זה רשום דרך אפל." },
  "auth.email_registered_google": { en: "This email address is registered via Google Sign-In.", he: "דוא״ל זה רשום דרך גוגל." },
  "auth.forgot_password": { en: "Forgot Password?", he: "שכחת סיסמה?" },
  "auth.generic_error": { en: "Something went wrong. Try again.", he: "יש תקלה. נסו שוב." },
  "auth.hide_password": { en: "Hide password", he: "הסתרת סיסמה" },
  "auth.invalid_credentials": { en: "Email and/or password are incorrect", he: "דוא״ל ו/או הסיסמה אינם נכונים" },
  "auth.invalid_email": { en: "Invalid email address", he: "דוא״ל שגוי" },
  "auth.loading": { en: "Loading", he: "טוען" },
  "auth.log_in_link": { en: "Log In", he: "להתחברות" },
  "auth.new_password": { en: "New Password", he: "סיסמה חדשה" },
  "auth.or": { en: "or", he: "או" },
  "auth.password": { en: "Password", he: "סיסמה" },
  "auth.password_reset_success_sub": { en: "Your password was reset successfully. Now you can use it to sign in.", he: "הסיסמה שלך עודכנה בהצלחה. כעת תוכל/י להשתמש בה כדי להתחבר." },
  "auth.password_reset_success_title": { en: "Password Reset Successfully", he: "הסיסמה עודכנה בהצלחה" },
  "auth.passwords_dont_match": { en: "Passwords don't match", he: "הסיסמאות אינן תואמות" },
  "auth.privacy_policy": { en: "Privacy Policy", he: "מדיניות הפרטיות" },
  "auth.request_new_link": { en: "Request New Link", he: "בקשה לקישור חדש" },
  "auth.required_field": { en: "Required field", he: "שדה חובה" },
  "auth.reset_link_expired_title": { en: "Password Reset Link Expired", he: "פג התוקף של הקישור לעדכון סיסמה" },
  "auth.reset_link_no_account_sub": { en: "We couldn't find an account for this link.", he: "לא מצאנו חשבון עבור קישור זה." },
  "auth.reset_link_sent": { en: "Reset Link Sent", he: "קישור לעדכון סיסמה נשלח" },
  "auth.reset_password": { en: "Reset Password", he: "עדכון סיסמה" },
  "auth.send_reset_link": { en: "Send Reset Link", he: "שליחת קישור לאיפוס" },
  "auth.show_password": { en: "Show password", he: "הצגת סיסמה" },
  "auth.social_signin_failed": { en: "Sign-in failed. Please try again.", he: "ההתחברות נכשלה. נסו שוב." },
  "auth.terms_conjunction": { en: " and ", he: " ו" },
  "auth.terms_of_use": { en: "Terms of Use", he: "תנאי השימוש" },
  "auth.terms_prefix": { en: "By continuing, you are agreeing to Sefaria's ", he: "המשך מהווה הסכמה ל" },
  "auth.terms_suffix": { en: ".", he: " של ספריא." },
  "auth.verify_not_robot": { en: "Verify that you are not a robot", he: "נא לאשר שאינך רובוט" },
  "header.log_in": { en: "Log in", he: "התחברות" },
  "header.sign_up": { en: "Sign up", he: "להרשמה" },
  "common.first_name": { en: "First Name", he: "שם פרטי" },
  "common.last_name": { en: "Last Name", he: "שם משפחה" },
} as const satisfies Record<string, { en: string; he: string }>;

export type AuthStringKey = keyof typeof AUTH_STRINGS;

export const isAuthStringKey = (k: string): k is AuthStringKey => Object.prototype.hasOwnProperty.call(AUTH_STRINGS, k);

/** A key in the interface language; anything that is not a known key (a server message in plain words) is returned as is, as the old `Sefaria._()` did. */
export function authString(key: string, lang: "english" | "hebrew"): string {
  if (!isAuthStringKey(key)) return key;
  return AUTH_STRINGS[key][lang === "hebrew" ? "he" : "en"];
}
