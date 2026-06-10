# Login / Register UI (React) — Implementation Plan

## Context

Reimplement `/login`, `/register`, and password-reset as a React app mounted via a dedicated webpack bundle, consuming the new component library ([spec 1601](../2026-06-08-1601-react-component-library/plan.md)) and matching Penina's Figma. Django keeps routing, CSRF, the auth backend, and a no-JS fallback. Strings flow through Weblate.

**Dependency:** library Phases 0–2 (tokens, `Input`/`FormField`, buttons) should land before this spec's Phase 3. Phases 0–2 here (scaffolding) can start immediately in parallel.

---

## Phase 0: Bundle & template scaffolding

### Task 1: Webpack entry
- Add a `login` (auth) entry to `node/webpack.config.js` array; create `node/webpack.login.js` mirroring `webpack.diffPage.js` (`require('./webpack.config.js')[n]`) and the matching `watch-login` / `build-login` npm scripts.
- Entry mounts `<AuthPage>` into a root node.

### Task 2: Slim Django template + props bootstrap
- Replace the body of `templates/registration/login.html` / `register.html` with a mount point + `{% render_bundle 'login' %}`.
- Bootstrap client props into the page: `GOOGLE_SSO_CLIENT_ID`, `APPLE_SSO_CLIENT_ID`, `next`, CSRF token, `mode` (login|register), interface language.
- Preserve the **already-authenticated** branch and keep `CustomLoginView` as the no-JS fallback.

---

## Phase 1: AuthPage shell & state machine

### Task 3: `<AuthPage>` + `AuthCard`
- `static/js/auth/AuthPage.jsx`: state machine (`choose · email-login · email-register · forgot · reset · already-authed`), seeded from `mode`.
- Use `AuthCard` (`Form Card`) from the library: responsive (mobile ≤ 842px), background graphic slot, own back/close buttons (the email form shows a back arrow top-left of the card).

---

## Phase 2: Choose screen

### Task 4: Provider + email buttons + cross-flow
- Render custom `ProviderButton` controls for Google + Apple plus a "Continue with email" button (`Button`), `Divider` ("or"/"או"), cross-flow link (login↔register), and `LegalText` with Privacy/ToS links.
- "Continue with email" transitions `mode` to the email form (content swap, no nav).

---

## Phase 3: Email login form  *(blocked on library Phase 1)*

### Task 5: Login form
- `FormField` email + password (`Input`), inline **"Forgot password?"** link, submit button.
- Submit → `api/auth/login` (new JSON+session endpoint — Task 6) via fetch with CSRF; render inline errors; on success redirect to `next` or `/`.

### Task 6: `api/auth/login` endpoint (backend)
- Thin view: validate `EmailAuthenticationForm`, `auth_login()`, return JSON (`{status:"ok"}` or `{error}`). Register in `sefaria/urls_shared.py`. Keep `CustomLoginView` as fallback.

---

## Phase 4: Email register form

### Task 7: Register form
- `FormField`s in the **Figma order**: Email Address, Password (with show/hide), First Name, Last Name, then `Captcha` (reCAPTCHA "I'm not a robot") with error state, then the primary "Create Account" button, then legal text. *(Note: this differs from the current `forms.py` field order — keep the form's server-side field set, present in Figma order.)*
- First/last name remain **required** (decided). Submit → existing `SefariaNewUserFormAPI` path; inline errors; onboarding side effects already handled server-side. Success → session + redirect.

---

## Phase 5: SSO integration (port POC into React)

### Task 8: Google + Apple in React
- Port the inline-script logic from the legacy templates into the React app: `google.accounts.id` init/render, Apple `AppleID.auth.init`, callback POSTs to the existing `/api/auth/{google,apple}/callback`.
- Handle success (redirect to `next`) and errors inline using the new Weblate strings, including **collision messages with deep links** into the right flow.

---

## Phase 6: Forgot / reset password

### Task 9: Reset flows
- React screens for reset-request and reset-confirm, wired to the existing `password_reset` / `SefariaPasswordResetForm` / `SefariaSetPasswordForm` backend; restyled to match; clean return to sign-in.

---

## Phase 7: One Tap placement

### Task 10: Suppress One Tap on auth pages
- Add a `suppress_one_tap` context flag set on the login/register views; guard the One Tap block in `templates/base.html` so it appears everywhere **except** `/login` and `/register`.

---

## Phase 8: Strings & i18n (existing mechanism — Weblate out of scope)

### Task 11: Wire all copy through the existing interface-strings mechanism
- Use `Sefaria._()` / `InterfaceText` throughout (the same way the rest of the React app does); no hard-coded literals.
- Add new source strings (auth copy from Penina's doc + SSO-collision/captcha/reset strings) the existing way interface strings are added. **No Weblate pipeline work.**
- Verify HE + RTL against Figma `Hebrew Examples` (`187:76018`): Heebo typography, RTL labels and links, LTR email/password controls, provider icons on the right, and a mirrored top-right back arrow.

---

## Phase 9: Retire legacy

### Task 12: Remove old markup + CSS
- Delete the legacy template markup and the old static CSS classes (`registrationContent static`, `registration-links`, `button control-elem`) once the React flow is verified across login/register/reset, EN/HE, desktop/mobile.

---

## Phase 10: Testing & QA

### Task 13: Automated + manual
- Extend Playwright (pattern: `e2e-tests/tests/sso-settings.spec.ts`) to cover choose → email login/register, SSO success/error, forgot/reset, One Tap absence on auth pages, EN/HE.
- Jest for `AuthPage` state transitions.
- QA handoff to Cyril with Figma + flow list (high surface area — many scenarios).

---

## Critical Files

| File | Change |
|---|---|
| `node/webpack.config.js`, `node/webpack.login.js` | New auth bundle entry |
| `package.json` | `build-login` / `watch-login` scripts |
| `templates/registration/login.html`, `register.html` | Slim shell + `render_bundle`; retire legacy markup |
| `templates/registration/password_reset*.html` | Restyle / mount reset flow |
| `static/js/auth/AuthPage.jsx` (+ subcomponents) | New React auth app |
| `sefaria/views.py`, `sefaria/urls_shared.py` | New `api/auth/login`; `suppress_one_tap` flag on auth views |
| `templates/base.html` | Guard One Tap with `suppress_one_tap` |
| `sefaria/forms.py` | Input classes on widgets if any server-rendered fallback remains |
| `e2e-tests/tests/` | New auth-flow Playwright specs |
| `static/css/` | Auth-page styles (token-driven; via library) |

---

## Sequencing

```
Library: P0 tokens → P1 Input/FormField → P2 Buttons ─┐
UI:      P0 bundle/template → P1 shell → P2 choose ────┼─► P3 login + P4 register ─► P5 SSO ─► P6 reset ─► P7 One Tap ─► P8 strings ─► P9 retire ─► P10 QA
                                                       (P3+ consume library P1/P2)
```
Library P0–P2 gate UI P3. UI P0–P2 can begin immediately. QA (Cyril) starts knowledge transfer now, in parallel.
