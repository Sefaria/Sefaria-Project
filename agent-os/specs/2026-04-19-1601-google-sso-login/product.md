# SSO Login — Product Spec

**Status:** POC  
**Owner:** Akiva Berger  
**Last Updated:** 2026-04-19

---

## Problem

Users currently register and log in via email/password. This creates friction at the top of the funnel. Sefaria wants to reduce sign-up friction for anonymous visitors by offering Google SSO — particularly via Google One Tap, which surfaces a low-friction registration prompt without interrupting the reading experience.

---

## Goals

1. Allow anonymous users to register and log in with their Google account in one tap.
2. Preserve existing email/password login for legacy users.
3. Allow a single user account to have both a legacy password identity and a Google SSO identity linked to it.
4. Create the required Django SQL model and MongoDB profile assets on first SSO login.

---

## Non-Goals (POC scope)

- Other SSO providers (Apple, Facebook, etc.)
- Admin/staff SSO enforcement
- SAML / enterprise IdP support
- Merging two existing accounts

---

## User Flows

### Flow 1: Anonymous user registers via Google One Tap

1. Unauthenticated user visits any page on Sefaria.
2. The Google One Tap prompt appears in the top-right corner (Google's `accounts.google.com/gsi/client` library).
3. User clicks **Continue as [Name]** and completes any Google-side consent screens.
4. Google returns a signed JWT (credential) to Sefaria's callback endpoint.
5. Sefaria backend verifies the JWT, creates a new Django `User`, links it to a `SocialIdentity` record (provider=`google`, subject=Google `sub`), and creates the MongoDB UserProfile document.
6. User is issued a Django session and is now logged in.
7. Page reloads or state updates to reflect the authenticated state.

### Flow 2: Returning SSO user logs in

1. Unauthenticated user visits any page or the Login page.
2. Google One Tap prompt appears (or user clicks **Sign in with Google** button on `/login`).
3. Sefaria backend receives credential, looks up `SocialIdentity` by `(provider, sub)`, retrieves the linked `User`, and issues a session.

### Flow 3: Login page — explicit Google button

The `/login` page includes a prominent **Sign in with Google** button (Google Identity Services rendered button) as an alternative to the One Tap popup, for users who dismissed the prompt or navigate directly.

### Flow 4: User tries to register via Google with an email that already has a password account

- Backend detects the Google email matches an existing `User` with no linked Google `SocialIdentity`.
- **Do not silently merge.** Return a clear error to the frontend:  
  > "An account with this email already exists. Sign in with your password, then link your Google account in Settings."
- Future: settings page flow to link Google identity post-login (out of POC scope).

### Flow 5: User tries to create an email/password account with an email already used for SSO

- Registration form detects the email matches a `User` that was created via Google SSO.
- Show message:  
  > "This email is already registered via Google. Use **Sign in with Google** to access your account."

---

## Data Model

### Django: `SocialIdentity`

A new model that allows multiple authentication identities per user.

| Field | Type | Notes |
|---|---|---|
| `user` | FK → `auth.User` | The Sefaria account |
| `provider` | CharField | e.g. `"google"` |
| `uid` | CharField | Provider's stable subject ID (`sub` from Google JWT) |
| `email` | EmailField | Email from provider at time of linking |
| `created` | DateTimeField | |

Unique constraint: `(provider, uid)`.

This model is additive — existing `User` rows are unaffected. A user can have zero (password-only), one, or multiple `SocialIdentity` rows.

### MongoDB: `UserProfile`

On first SSO login, the existing `UserProfile` document creation path is reused. No new fields required for POC. Future: store `picture` URL from Google JWT.

---

## Backend Endpoint

`POST /api/auth/google/callback`

- Accepts: `{ credential: "<JWT>" }` (posted from frontend after One Tap / button click)
- Verifies JWT signature using Google's public keys (`google-auth` library)
- Resolves or creates `User` + `SocialIdentity`
- Creates Django session
- Returns: `{ status: "ok", is_new_user: bool }` or structured error

---

## Frontend

- Load `https://accounts.google.com/gsi/client` on all pages for anonymous users.
- Initialize One Tap with Sefaria's `client_id` and the callback endpoint.
- On the `/login` page, also render the Google Identity Services button.
- On credential receipt (client-side callback), POST to `/api/auth/google/callback` and handle response.

---

## Edge Cases Summary

| Scenario | Behavior |
|---|---|
| New user, no existing account | Create account, log in |
| Returning SSO user | Log in, no account creation |
| Google email matches password account | Error: prompt to log in with password and link later |
| Password registration with SSO email | Error: prompt to use Google login |
| User dismisses One Tap | No action; prompt does not re-appear until next session (Google default behavior) |
| Google JWT verification fails | Return 401; show generic error |

---

## Success Criteria (POC)

- [ ] Anonymous user can register and be logged in via One Tap on any page.
- [ ] Anonymous user can register/login via Google button on `/login`.
- [ ] Returning SSO user can log back in.
- [ ] Django `User`, `SocialIdentity`, and MongoDB `UserProfile` are all created correctly on first SSO login.
- [ ] Collision edge cases surface clear, actionable error messages.
- [ ] Legacy email/password login is unaffected.

---

## Open Questions

1. Should One Tap be suppressed on the login and register pages (to avoid double-prompt UI)?
2. What is the cooldown / re-prompt strategy after a user dismisses One Tap?
3. Do we need an email verification step for SSO users, or do we trust Google's verified email?
4. Post-POC: settings page UI to link/unlink Google identity.
