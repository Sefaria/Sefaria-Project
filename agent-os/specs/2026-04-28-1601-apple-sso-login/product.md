# SSO Login — Product Spec

**Status:** Phase 1 (Google POC) complete; Phases 2–6 in progress  
**Owner:** Akiva Berger  
**Last Updated:** 2026-04-28

---

## Problem

Users currently register and log in via email/password. This creates friction at the top of the funnel. Sefaria wants to reduce sign-up friction for anonymous visitors by offering social SSO — particularly via Google One Tap, which surfaces a low-friction registration prompt without interrupting the reading experience.

---

## Goals

1. Allow anonymous users to register and log in with their Google account in one tap.
2. Allow anonymous users to register and log in with their Apple ID.
3. Preserve existing email/password login for legacy users.
4. Allow a single user account to have both a password identity and social identities linked to it — manageable from account settings.
5. Create all required Django and MongoDB assets on first SSO login, with the same side effects as email/password registration.

---

## Non-Goals

- Other SSO providers (Facebook, GitHub, etc.)
- Admin/staff SSO enforcement
- SAML / enterprise IdP support
- Merging two fully separate existing accounts

---

## User Flows

### Flow 1: Anonymous user registers via Google One Tap

1. Unauthenticated user visits any Sefaria page.
2. Google One Tap prompt appears in the top-right corner.
3. User clicks **Continue as [Name]** and completes Google consent.
4. Sefaria backend receives and verifies the signed JWT.
5. Backend creates `User`, `SocialIdentity`, `UserProfile`; applies side effects (collections, interface language, Gravatar).
6. User is issued a Django session and is now logged in.
7. Page reloads to reflect authenticated state.

### Flow 2: Returning SSO user logs in

1. Unauthenticated user visits any page or `/login`.
2. Google One Tap prompt appears (or user clicks **Sign in with Google**).
3. Backend verifies credential, looks up `SocialIdentity` by `(provider, sub)`, retrieves the linked `User`, issues a session.

### Flow 3: Login page — explicit provider buttons

`/login` shows:
- **Sign in with Google** (Google Identity Services rendered button)
- **Sign in with Apple** (Apple SDK rendered button)

### Flow 4: Anonymous user registers via Apple

Same as Flow 1 via the Apple sign-in button. Apple only returns `email` and `name` on the first authorization — store them on first login.

### Flow 5: Logged-in user connects a social identity

1. User goes to account settings → **Login Methods**.
2. Clicks **Connect Google** or **Connect Apple**.
3. Provider OAuth flow completes; new `SocialIdentity` row is created for the current user.
4. Settings page reflects the provider as connected.

### Flow 6: Logged-in user disconnects a social identity

1. User goes to **Settings → Login Methods**.
2. Clicks **Disconnect** on a connected provider.
3. If another login method exists (password or another social identity), the `SocialIdentity` row is deleted.
4. If this would be the last login method, the action is blocked: "Set a password before removing your only login method."

### Flow 7: SSO email matches existing password account (auto-link, password erased)

- Backend detects the SSO email (case-insensitively) matches an existing `User` with no linked identity for this `(provider, uid)`.
- **The provider has signed a verified email into the ID token, so the SSO user demonstrably controls the mailbox.** The backend therefore **auto-links** a new `SocialIdentity` to the existing account and logs the user in — no error, no separate "connect in Settings" step required.
- **The legacy password is then disabled** (`set_unusable_password()`): from that point the account is **SSO-only** and can only be accessed via Google/Apple. (The user can later re-add a password via Settings → Login Methods.) Per the product doc, the password is "effectively erased."
- Implemented in `SocialAuthService.get_or_create_social_user` (`sso/service.py`).
- **Precondition (hardening):** the provider verifier must assert `email_verified` before this auto-link/password-erase path runs. Auto-linking on an unverified provider email would be an account-takeover surface.
- Password-erase and the `email_verified` gate are tracked in [`2026-06-08-1603-sso-phase2-linking-onetap`](../2026-06-08-1603-sso-phase2-linking-onetap/plan.md) (Tasks 1, 1b).

### Flow 8: Email/password attempt for an account already registered via SSO

- An SSO-registered account is **blocked from the email/password path on both register and login**, informed that the account uses SSO, and given a **link to sign in via the provider**.
- **Register:** `SefariaNewUserForm.clean_email` checks `social_identities.exists()` (any provider) and shows: "This email is already registered via {provider}. Sign in to access your account." (with a link to `/login`).
- **Login:** `CustomLoginView` detects an SSO-only account (social identity present, no usable password) on auth failure and shows the same informative message + provider link instead of the generic "username and password didn't match."
- The login-path handling and the registration link are tracked in [`2026-06-08-1603-sso-phase2-linking-onetap`](../2026-06-08-1603-sso-phase2-linking-onetap/plan.md) (Task 2).

---

## Data Model

### `SocialIdentity` (Django, `sso/` app)

| Field | Type | Notes |
|---|---|---|
| `user` | FK → `auth.User` | The Sefaria account |
| `provider` | CharField | `"google"` or `"apple"` |
| `uid` | CharField | Provider's stable subject ID (`sub`) |
| `email` | EmailField | Email from provider at time of linking |
| `created` | DateTimeField | |

Unique constraint: `(provider, uid)`. A user can have zero (password-only), one, or multiple rows.

### `UserProfile` (MongoDB)

On first SSO login: `assign_slug()`, `join_invited_collections()`, interface language, Gravatar import — same side effects as email/password registration.

---

## Backend Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/google/callback` | Verify Google JWT, create or log in user |
| `POST` | `/api/auth/apple/callback` | Verify Apple identity token, create or log in user |
| `POST` | `/api/auth/link/<provider>` | Link a provider to the current authenticated user |
| `DELETE` | `/api/auth/unlink/<provider>` | Unlink a provider from the current authenticated user |

---

## Frontend

- Load Google GSI script on all pages for anonymous users (One Tap).
- `/login`: render Google button and Apple button.
- Account settings: "Login Methods" section — distinct from the existing "Google Drive" export OAuth section.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| New user, no existing account | Create account with full side effects, log in |
| Returning SSO user | Log in, no new records created |
| Google/Apple email matches password account | Auto-link a new `SocialIdentity`, **disable the password** (`set_unusable_password()`), and log in. Provider email must be verified (`email_verified` gate at the provider boundary). Account becomes SSO-only. |
| Email/password attempt (login or register) for an SSO account | Blocked, informed it's an SSO account, with a link to sign in via the provider — on **both** the register and login paths. |
| Password registration with SSO email | Error prompting use of social login button |
| User dismisses One Tap | No action; Google's default re-prompt behavior applies |
| JWT verification fails | 401; generic error shown |
| Disconnect last login method | Blocked; prompt to set password first |
| Apple re-auth without name/email in token | Use stored values from first login |
| Email case mismatch (e.g. `User@Gmail.com` vs `user@gmail.com`) | Collision detected correctly via case-insensitive lookup |

---

## Success Criteria

### Phase 1 — complete
- [x] Anonymous user can register and log in via One Tap on any page
- [x] Anonymous user can register/login via Google button on `/login`
- [x] Returning SSO user can log back in
- [x] `User`, `SocialIdentity`, and `UserProfile` created on first SSO login
- [x] Collision edge cases surface error messages
- [x] Legacy email/password login is unaffected

### Phase 2 — bug fixes
- [ ] Email collision check is case-insensitive
- [ ] SSO new users receive `join_invited_collections`, interface language, Gravatar
- [ ] Registration collision message applies to any SSO provider, not just Google

### Phase 3–4 — service layer + linking UI
- [ ] `SocialAuthService` centralizes all provider-agnostic onboarding logic
- [ ] Account settings has a working "Login Methods" section
- [ ] Logged-in users can connect a social identity
- [ ] Logged-in users can disconnect a social identity (with last-method guard)
- [ ] Collision error message links to the working Settings page

### Phase 5 — Apple SSO
- [ ] Anonymous user can register and log in via Apple on `/login`
- [ ] Apple name/email stored on first login; used on subsequent re-auths
- [ ] Apple users get identical onboarding side effects to Google and password users

### Phase 6 — tests
- [ ] All `SocialAuthService` paths have unit tests
- [ ] Case-insensitive collision has an integration test

---

## Open Questions

1. Should One Tap be suppressed on `/login` and `/register` to avoid a double-prompt?
2. What is the re-prompt strategy after a user dismisses One Tap?
3. Do we trust Google/Apple verified email without an additional verification step?
