# References for SSO Login

## Internal Codebase

### `process_register_form` — canonical onboarding side effects
- **Location:** `sefaria/views.py:146`
- **What it does:** Creates `User`, `UserProfile`, calls `assign_slug()`, `join_invited_collections()`, sets interface language from `request.interfaceLang`, imports Gravatar. `SocialAuthService.apply_signup_side_effects()` must replicate this exactly.

### `emailusernames` utilities
- **Location:** `emailusernames/utils.py`
- **Functions to use:**
  - `create_user(email, password)` — creates `User` with email as identifier; pass `password=None` for SSO users (sets unusable password)
  - `get_user(email)` — case-insensitive lookup; use instead of `AuthUser.objects.get(email=email)`
  - `user_exists(email)` — case-insensitive existence check

### `EmailAuthBackend`
- **Location:** `emailusernames/backends.py`
- **Usage:** `auth_login(request, user, backend="emailusernames.backends.EmailAuthBackend")` — call this directly after SSO verification, bypassing `authenticate()` (provider JWT already proves identity).

### `SocialIdentity` model
- **Location:** `sso/models.py`
- **Fields:** `user` (FK), `provider`, `uid`, `email`, `created`. Unique on `(provider, uid)`.

### `google_sso_callback`
- **Location:** `sefaria/views.py:205`
- **Status:** Implemented; to be refactored in Phase 3 to call `SocialAuthService`.

### URL registration
- **Location:** `sefaria/urls_shared.py`
- **Convention:** New endpoints use `api/` prefix and are registered here.

### Google Drive OAuth (separate)
- **Location:** `sefaria/gauth/views.py`
- **Note:** OAuth for Drive export access — different mechanism and purpose from login SSO. Do not touch this for SSO work.

---

## External — Google

- Google Identity Services (One Tap): https://developers.google.com/identity/gsi/web/guides/overview
- JS reference: https://developers.google.com/identity/gsi/web/reference/js-reference
- `verify_oauth2_token`: https://google-auth.readthedocs.io/en/master/reference/google.oauth2.id_token.html

---

## External — Apple

- Sign in with Apple overview: https://developer.apple.com/sign-in-with-apple/
- Identity token validation: https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/verifying_a_user
- JWKS endpoint: https://appleid.apple.com/auth/keys
- Generating the client secret: https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
- Apple JS SDK: https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js
- HIG for "Sign in with Apple" button: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
