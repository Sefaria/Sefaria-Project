import type { AuthError } from "./utils";

/**
 * Registration errors that belong in the banner (not under the email field), keyed by the stable codes sefaria/forms.py::clean_email
 * raises and sefaria/views.py::WEB_REGISTER_ERROR_CODES passes through — never by message text, which is translated.
 * Ported from static/js/auth/emailExistsErrors.js.
 *
 * @feature ACC-010 Email registration with reCAPTCHA
 */
export const EMAIL_EXISTS_ERRORS: Record<string, AuthError> = {
  sso_google_exists: { code: "sso_only_account", providers: ["google"] },
  sso_apple_exists: { code: "sso_only_account", providers: ["apple"] },
  email_exists: { message: "auth.email_exists_generic", linkText: "auth.log_in_link" },
};
