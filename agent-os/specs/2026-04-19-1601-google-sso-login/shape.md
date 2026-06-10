# Google SSO Login — Shaping Notes

## Scope

Implement Google One Tap SSO login/registration for Sefaria. Anonymous users can register or log in with their Google account via One Tap on any page or an explicit button on `/login`. A new `SocialIdentity` Django model links Google identities to existing `User` rows. MongoDB `UserProfile` creation is reused from the existing `process_register_form` pattern.

## Decisions

- `SocialIdentity` lives in its own `sso/` Django app (not `reader/models.py`) — cleaner separation of concerns, mirrors the `specs/sso/` product spec structure
- Backend endpoint: `POST /api/auth/google/callback` verifies Google JWT using existing `google-auth` library
- Reuse `auth_login(request, user, backend="emailusernames.backends.EmailAuthBackend")` for session issuance
- Reuse `UserProfile` creation pattern from `process_register_form` in `sefaria/views.py`
- No silent account merging — email collision always returns a clear error, regardless of what other social identities the existing account has
- POC scope: Google only, session-based (not JWT tokens)
- `GOOGLE_SSO_CLIENT_ID` added to `local_settings_example.py` / `local_settings.py` and exposed via `context_processors.global_settings`

## Edge Cases

- **Email collision (any existing account):** If `POST /api/auth/google/callback` receives an email that belongs to any existing account (password-only or a different SSO provider), return 409 with a message directing the user to log in with their existing method and connect Google in Settings → Login Methods.
- **Already-linked SSO account:** If a user tries to connect a Google account (via Settings) that is already linked to a *different* Sefaria account, return 409 "This account is already linked to another Sefaria account."
- **Disconnect requires password:** A user may only disconnect Google SSO if they have a usable password set. The disconnect button is disabled in the UI when `has_usable_password` is False, and `SocialAuthService.unlink_provider()` raises `LastLoginMethodError` at the service layer as a server-side guard.

## Context

- **Visuals:** None provided — to be added later
- **References:** `sefaria/views.py` (`process_register_form`) for UserProfile creation + session login pattern
- **Product alignment:** N/A (no agent-os/product/ found)

## Standards Applied

- No standards defined in `agent-os/standards/index.yml` yet
