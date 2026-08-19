// Shown in the banner (same shape LoginView's sso_only_account error already uses), not under
// the email field — ErrorBanner already knows how to render both of these. Keyed by the stable
// codes sefaria/forms.py::clean_email raises and sefaria/views.py::WEB_REGISTER_ERROR_CODES
// passes through — not message text, which is gettext_lazy and would vary by interface language.
// Split out of RegisterView.jsx so this stays importable in tests without pulling in Misc.jsx's
// CSS-import chain, which jest isn't configured to handle.
export const EMAIL_EXISTS_ERRORS = {
  sso_google_exists: { code: 'sso_only_account', providers: ['google'] },
  sso_apple_exists: { code: 'sso_only_account', providers: ['apple'] },
  email_exists: { message: 'auth.email_exists_generic', linkText: 'auth.log_in_link' },
};
