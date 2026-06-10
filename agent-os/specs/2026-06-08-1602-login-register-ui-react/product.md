# Login / Register UI (React) — Product Spec

**Status:** Planned
**Owner:** Akiva Berger
**Designer:** Penina Levy
**Last Updated:** 2026-06-08

> Depends on [`2026-06-08-1601-react-component-library`](../2026-06-08-1601-react-component-library/plan.md) for `Input`, `ProviderButton`, `Captcha`, `AuthCard`, `Divider`, `LegalText`, and button treatments.

---

## Problem

The login, registration, and password-reset pages are server-rendered Django templates using static CSS from ~12 years ago (not even S2), with SSO buttons bolted on via inline `<script>`. The markup is legacy spaghetti (e.g. stray `<td>`s with no table). The SSO POC works but the UI is inconsistent with the rest of Sefaria and with Penina's Figma refresh. We are reimplementing these pages **properly in React**, consuming the new component library, matching the Figma design.

This supersedes the SSO meeting's interim "restyle-in-place" compromise: we are doing the full React reimplementation now, inputs included.

---

## Goals

1. Reimplement `/login`, `/register`, and password-reset as a **React application** mounted via a dedicated webpack bundle, matching the Figma.
2. Use the **card + content-swap** model: choosing "Continue with email" swaps the card's content in place (no page navigation) with its own back button.
3. Provide **Google** + **Apple** sign-in plus email, with consistent placement and **cross-flow** navigation between login and registration.
4. Move **"Forgot password?" inline** into the login form where users expect it.
5. Show **Google One Tap on all pages except `/login` and `/register`**.
6. Add inline **error states** (replacing native browser tooltips) including the currently-missing **captcha error**.
7. Full **EN/HE** with correct RTL, using the **existing interface-strings mechanism** (`Sefaria._()` / `InterfaceText`).
8. Responsive: mobile = **all screens ≤ 842px**, desktop ≥ 843; white `Form Card` on the navy source-connections wave graphic; serif headings.

---

## Non-Goals

- The **mobile app** (React Native) sign-in screens — separate codebase, separate plan ("poor man's" buttons handled there).
- Changing the core **SSO verification/onboarding backend** — reuse the existing callbacks and onboarding service.
- Removing the first/last-name required fields — **decided: keep them required for now** (Michael's "drop them eventually" is tracked separately, not in this spec).
- **Weblate** workflow — out of scope. Use the existing interface-strings mechanism; no new translation-pipeline work.
- Voices / Library auth pages — they share the same components but their rollout is tracked separately (they keep their module theming, e.g. blue buttons under the Voices header).

---

## User Flows

### Flow 1: Choose screen
Anonymous user hits `/login` or `/register`. The card shows **Continue with Google**, **Continue with Apple**, **Continue with email**, a cross-flow link ("Create a new account" / "Already have an account?"), and legal text (Privacy / ToS links).

### Flow 2: Continue with email (content swap)
Clicking **Continue with email** swaps the card content in place to the email form (login: email + password + inline "Forgot password?"; register: first/last name + email + password + captcha). The card has its own **back button**. URL does not change; browser back goes to the previous site page (accepted).

### Flow 3: SSO sign-in
Google/Apple buttons run the existing POC flow (popup on desktop, redirect on mobile web; OS-native component may appear on Apple/Chrome devices). On success → session established, redirect to `next` or `/`. On collision/error → inline message using the new Weblate strings (with deep links into the right flow).

### Flow 4: Forgot / reset password
"Forgot password?" (inline in the login form) → reset-request screen → email → reset-confirform, all restyled to match. Land back on sign-in cleanly.

### Flow 5: Already authenticated
Visiting `/login` while logged in shows the existing "already logged in as … / Logout" state (preserve current behavior).

---

## Backend reuse (no changes unless noted)

| Need | Endpoint / mechanism | Status |
|---|---|---|
| Google SSO | `POST /api/auth/google/callback` | exists (establishes session + returns JWT) |
| Apple SSO | `POST /api/auth/apple/callback` | exists |
| Email/password **login** (session) | new JSON `api/auth/login` that validates the login form, calls `auth_login()`, returns JSON | **to build** (Phase 3); `CustomLoginView` kept as no-JS fallback |
| Email/password **register** | `SefariaNewUserFormAPI` path | exists |
| JWT (mobile/API) | `api/login/` (`TokenObtainPairView`), `api/login/refresh/` | exists |
| Password reset | `password_reset` / `SefariaPasswordResetForm` / `SefariaSetPasswordForm` | exists |

---

## Success Criteria

- [ ] `/login`, `/register`, reset render as React from a dedicated bundle; legacy template markup + old static CSS retired.
- [ ] Card content-swap works for email login/register with a working back button.
- [ ] Google, Apple, and email all succeed end-to-end; sessions established; `next` honored.
- [ ] One Tap suppressed on `/login` and `/register`, present elsewhere.
- [ ] Inline errors (incl. captcha) match Figma; native browser tooltips gone.
- [ ] SSO collision strings show with working deep links.
- [ ] Full EN/HE via the existing interface-strings mechanism; RTL correct, including LTR email/password fields in Hebrew.
- [ ] Playwright covers the new flows; QA handoff to Cyril complete.

---

## Resolved Decisions

1. **Login submission** → add a JSON `api/auth/login` endpoint that validates the login form, calls `auth_login()`, and returns JSON. `CustomLoginView` stays as the no-JS fallback. *(Decided 2026-06-08.)*
2. **First/last-name required fields** → keep them required for now. Dropping them is a separate product track. *(Decided 2026-06-08.)*
3. **Strings** → use the existing interface-strings mechanism (`Sefaria._()` / `InterfaceText`); **Weblate is out of scope** for this project. *(Decided 2026-06-08.)*
