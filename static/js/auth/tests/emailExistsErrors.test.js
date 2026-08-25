/* Testing done using Jest */
// EMAIL_EXISTS_ERRORS must be keyed by sefaria/forms.py::clean_email's stable error codes
// (sso_google_exists / sso_apple_exists / email_exists), passed through verbatim by
// sefaria/views.py::WEB_REGISTER_ERROR_CODES -- not by message text, which is gettext_lazy
// and would silently stop matching on any non-English interface. See the comments at all
// three of those call sites for the full picture (including why the messages themselves
// still can't be wrapped in _() until Mobile's AuthPage.js gets an equivalent fix).
import { EMAIL_EXISTS_ERRORS } from '../emailExistsErrors.js';

describe('EMAIL_EXISTS_ERRORS', () => {
  it('is keyed by backend error codes, not message text', () => {
    expect(Object.keys(EMAIL_EXISTS_ERRORS).sort()).toEqual(
      ['email_exists', 'sso_apple_exists', 'sso_google_exists'].sort(),
    );
  });

  it('does not match the old raw English sentences (regression guard)', () => {
    expect(EMAIL_EXISTS_ERRORS['This email address is already registered via Google Sign-In.']).toBeUndefined();
    expect(EMAIL_EXISTS_ERRORS['This email address is already registered via Apple Sign-In.']).toBeUndefined();
    expect(EMAIL_EXISTS_ERRORS['An account with this email address already exists.']).toBeUndefined();
  });

  it('maps sso_google_exists/sso_apple_exists to sso_only_account banner shape', () => {
    expect(EMAIL_EXISTS_ERRORS.sso_google_exists).toEqual({ code: 'sso_only_account', providers: ['google'] });
    expect(EMAIL_EXISTS_ERRORS.sso_apple_exists).toEqual({ code: 'sso_only_account', providers: ['apple'] });
  });

  it('maps email_exists to the generic message+link shape', () => {
    expect(EMAIL_EXISTS_ERRORS.email_exists).toEqual({ message: 'auth.email_exists_generic', linkText: 'auth.log_in_link' });
  });
});
