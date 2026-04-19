# Google SSO Login — Shaping Notes

## Scope

Implement Google One Tap SSO login/registration for Sefaria. Anonymous users can register or log in with their Google account via One Tap on any page or an explicit button on `/login`. A new `SocialIdentity` Django model links Google identities to existing `User` rows. MongoDB `UserProfile` creation is reused from the existing `process_register_form` pattern.

## Decisions

- `SocialIdentity` lives in its own `sso/` Django app (not `reader/models.py`) — cleaner separation of concerns, mirrors the `specs/sso/` product spec structure
- Backend endpoint: `POST /api/auth/google/callback` verifies Google JWT using existing `google-auth` library
- Reuse `auth_login(request, user, backend="emailusernames.backends.EmailAuthBackend")` for session issuance
- Reuse `UserProfile` creation pattern from `process_register_form` in `sefaria/views.py`
- No silent account merging — email collision returns a clear error
- POC scope: Google only, session-based (not JWT tokens)
- `GOOGLE_SSO_CLIENT_ID` added to `local_settings_example.py` / `local_settings.py` and exposed via `context_processors.global_settings`

## Context

- **Visuals:** None provided — to be added later
- **References:** `sefaria/views.py` (`process_register_form`) for UserProfile creation + session login pattern
- **Product alignment:** N/A (no agent-os/product/ found)

## Standards Applied

- No standards defined in `agent-os/standards/index.yml` yet
