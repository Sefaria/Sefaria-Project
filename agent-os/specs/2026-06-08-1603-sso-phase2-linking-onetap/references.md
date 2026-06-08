# References — SSO Phase 2 (Linking & One Tap Compliance)

## Source of truth

- **Product doc:** [Registration/Login with Google & Apple](https://docs.google.com/document/d/1RuYfwVraTTfQ--78SltEGETm5ugoBtk1FD2cLj5yCtw/edit)
  - Provider Coverage table (web all ✅; Android Apple-register ❌)
  - Presentation of Authorization Flow table (Desktop = popup, Mobile Web = redirect)
  - Google One-Tap Experience (clean-session-only logic)
  - Linking Accounts (auto-link + password "effectively erased"; block SSO accounts from email/password with an informing link)

## Code under audit

| Concern | Location |
|---|---|
| Auto-link branch (Task 1) | `sso/service.py` — `get_or_create_social_user`, existing-user branch |
| Unlink last-method guard (consistent with password-erase) | `sso/service.py` — `unlink_provider` (`has_usable_password()`) |
| Provider token verification (Task 1b `email_verified`) | `sso/providers/google.py`, `sso/providers/apple.py` — `verify_token` |
| Registration block (Task 2a) | `sefaria/forms.py` — `SefariaNewUserForm.clean_email` |
| Login path (Task 2b) | `sefaria/views.py` — `CustomLoginView` (`SefariaLoginForm` / `EmailAuthenticationForm`) |
| One Tap render (Task 3) | `templates/base.html` — Google One Tap block + init JS |
| Provider presentation (Task 4) | `templates/registration/login.html`, `register.html` — Apple `usePopup`, Google `ux_mode` |
| Existing tests | `sso/tests.py` (auto-link, callbacks); `e2e-tests/tests/sso-settings.spec.ts` |

## External

- Google Identity Services — One Tap display & `ux_mode`: https://developers.google.com/identity/gsi/web/reference/js-reference
- Google ID token `email_verified` claim: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Sign in with Apple — `email_verified` in identity token: https://developer.apple.com/documentation/sign_in_with_apple/authenticating_users_with_sign_in_with_apple
- Apple JS `usePopup`: https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js

## Related specs

- [`2026-04-28-1601-apple-sso-login`](../2026-04-28-1601-apple-sso-login/plan.md) — the SSO POC this audits; shared `standards.md`.
- [`2026-06-08-1602-login-register-ui-react`](../2026-06-08-1602-login-register-ui-react/plan.md) — front-end home for Tasks 3–4.
