# References for Google SSO Login

## Similar Implementations

### process_register_form + auth_login

- **Location:** `sefaria/views.py:138`
- **Relevance:** Creates Django `User`, initializes `UserProfile` (MongoDB), assigns slug, handles gravatar, issues session via `auth_login`. The SSO callback view reuses this pattern for new-user creation.
- **Key patterns:** `transaction.atomic()` wrapping user + profile creation; `auth_login(request, user, backend=...)` for session; `UserProfile(id=user.id, user_registration=True).assign_slug()`

### emailusernames.utils.create_user

- **Location:** `emailusernames/utils.py:52`
- **Relevance:** Used to create a Django `User` where the username is an SHA-256 hash of the email. Called with `password=None` for SSO users (sets an unusable password).

### UserExperimentSettings (reader/models.py)

- **Location:** `reader/models.py`
- **Relevance:** Example of a Django model that FKs to `auth.User`. `SocialIdentity` follows the same FK + `on_delete=CASCADE` pattern but lives in the dedicated `sso/` app.

### EmailAuthBackend (emailusernames/backends.py)

- **Location:** `emailusernames/backends.py`
- **Relevance:** The existing authentication backend. `google_sso_callback` calls `auth_login(request, user, backend="emailusernames.backends.EmailAuthBackend")` directly (bypassing `authenticate()`) since the Google JWT already proves identity.

### Existing gauth OAuth (sefaria/gauth/views.py)

- **Location:** `sefaria/gauth/views.py`
- **Relevance:** Existing Google OAuth 2.0 redirect flow for Drive access. SSO login uses a different mechanism (One Tap JWT verification via `google.oauth2.id_token.verify_oauth2_token`) — not copied, but used as context for how Google credentials are handled elsewhere.

### URL registration pattern

- **Location:** `sefaria/urls_shared.py`
- **Relevance:** New endpoint `POST /api/auth/google/callback` added here following the `api/` prefix convention used by all other API endpoints.
