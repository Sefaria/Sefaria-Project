# Google/Apple SSO Login — Shaping Notes

## Scope

Google One Tap SSO (POC) is complete. This spec covers the full implementation through Apple SSO, account linking UI, and tests.

---

## Architecture

- **No additional auth libraries.** Use the existing Django auth stack (`emailusernames`, `auth_login`). Provider credential verification uses `google-auth` (already in `requirements.txt`) for Google and `authlib` for Apple.
- **Service layer pattern.** All provider-agnostic business logic lives in `SocialAuthService` (`sso/service.py`). Provider-specific JWT/token verification lives in `sso/providers/<provider>.py`. Views are thin wrappers.
- **`SocialIdentity` model** (existing, `sso/models.py`) stores provider identities. No changes to this model.
- **Keep Google Drive OAuth separate.** The existing `sefaria/gauth/` app handles OAuth for Drive export access. Login SSO is a different mechanism and must remain separate in code and UI.

---

## Decisions

- **`SocialAuthService` centralizes:** user creation, collision detection, onboarding side effects, linking, and unlinking. Adding a new provider means adding a `sso/providers/<provider>.py` and a thin view — the service handles everything else identically.
- **No silent account merging.** Email collision always returns a clear error, regardless of what other social identities the existing account has. Users link accounts explicitly via the Settings UI.
- **Disconnect requires a password.** `unlink_provider()` raises `LastLoginMethodError` if the user has no usable password, regardless of how many other social identities exist. The disconnect button is disabled in the UI when `has_usable_password` is False. This guard is enforced at the service layer as well as the UI.
- **Session-based auth only.** Callback views issue Django sessions. JWT token auth (`register_api` path) is out of scope for SSO.
- **`CSRF_EXEMPT` on callbacks is correct.** Google and Apple POST credentials that do not carry Django CSRF tokens. The signed provider JWT is the trust anchor.
- **Case-insensitive email lookups everywhere.** Use `emailusernames/utils.py` utilities (`get_user`, `user_exists`) or `email__iexact` ORM lookups. Never use `email=email` (case-sensitive) for collision detection.
- **Apple name/email stored on first login.** Apple only returns these on the first authorization. Store `given_name` and `family_name` on the `SocialIdentity` row (add fields) or on the `User` row on creation.

---

## Known Bugs in POC (fix in Phase 2 before new features)

| Bug | Location | Fix |
|---|---|---|
| Case-sensitive email collision check | `views.py:242` | `email__iexact=email` or `get_user()` |
| Missing `join_invited_collections()` for SSO new users | `views.py:257` | Add to new-user branch |
| Missing interface language for SSO new users | `views.py` new-user branch | Apply `request.interfaceLang` |
| Missing Gravatar import for SSO new users | `views.py` new-user branch | Same block as `process_register_form` |
| `forms.py` collision check only checks for Google | `forms.py:77` | Use `social_identities.exists()` |

---

## Provider Notes

### Google
- Token verification: `google.oauth2.id_token.verify_oauth2_token` (in `requirements.txt`)
- `sub` is the stable UID; returned on every auth
- One Tap: returns name + email every auth

### Apple
- Token verification: Apple identity token (JWT) against Apple's JWKS (`https://appleid.apple.com/auth/keys`)
- `client_secret` must be a developer-generated RS256 JWT; max 6-month expiry — rotate before expiry
- Apple returns `email` and `name` on **first auth only** — store on first login
- No One Tap equivalent; button on `/login` only
- Button must follow Apple's Human Interface Guidelines (use the JS SDK rendered button)

---

## Edge Cases

| Case | Trigger | Behavior |
|---|---|---|
| Email collision on login/register (any existing account) | SSO callback receives email belonging to any existing user | 409 — direct user to log in with existing method, then connect in Settings |
| Already-linked SSO (different Sefaria account) | `POST /api/auth/link/<provider>` with uid owned by another user | 409 "This account is already linked to another Sefaria account." |
| Disconnect without a password | `DELETE /api/auth/unlink/<provider>` when `has_usable_password` is False | 409 "You must set a password before disconnecting a login method." Button also disabled in UI. |

---

## UI Separation

Account settings must have two distinct sections:

1. **Login Methods** — password, Google, Apple; connect/disconnect actions; last-method guard
2. **Google Drive** — existing export OAuth (unchanged)

Do not conflate these. They use different OAuth flows for different purposes.
