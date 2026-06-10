# SSO Phase 2 — Account-Linking & One Tap Compliance

**Status:** Implemented; full Django verification pending local Mongo availability
**Owner:** Akiva Berger
**Last Updated:** 2026-06-08
**Source of truth:** [Registration/Login with Google & Apple](https://docs.google.com/document/d/1RuYfwVraTTfQ--78SltEGETm5ugoBtk1FD2cLj5yCtw/edit) (product spec doc)

> This spec captures the gaps found when auditing the shipped SSO POC against the product doc. It is **behavioral/backend compliance work**, distinct from the visual rework in [`2026-06-08-1602-login-register-ui-react`](../2026-06-08-1602-login-register-ui-react/plan.md). Several items here can be implemented before or alongside the React UI; items 3–4 land naturally inside it.

---

## Problem

The SSO POC implements the *core* linking model correctly (auto-link on matching email; block email/password registration for SSO accounts). But an audit against the product doc found four behaviors that deviate or are incomplete. This spec brings the implementation in line with the doc.

---

## Scope (the four gaps)

| # | Doc requirement | Current behavior | Type |
|---|---|---|---|
| 1 | On auto-link, the password is "effectively erased" — user can **only** log in via Google/Apple afterward | Auto-link creates the `SocialIdentity` but leaves the password **usable** | Backend |
| 2 | An SSO-registered user attempting email/password (login **or** register) is **blocked, informed, and given a link** to sign in via their provider | Register: blocked but no link. **Login: not handled** — generic "didn't match" error | Backend |
| 3 | Google One Tap shows only on **clean sessions** (no marketing banner/modal/cookie overlay, and not after one was dismissed); desktop + mobile web; not on login/register | One Tap auto-prompts for **every** anonymous user unconditionally, including on `/login` and `/register` | Frontend |
| 4 | Presentation: Desktop Web = **popup**, Mobile Web = **redirect** (Google & Apple) | Popup hardcoded on all devices (Apple `usePopup: true`; Google no `ux_mode`) | Frontend |

In line already (no work): auto-link direction, registration block core, web provider coverage, desktop popup.

---

## Goals

1. After auto-linking, the legacy password is disabled so the account is SSO-only, exactly as the doc states.
2. Email/password attempts by SSO accounts are blocked **and** informative (message + deep link) on **both** the login and registration paths.
3. Google One Tap appears only on overlay-free ("clean") sessions, across desktop and mobile web, and never on `/login` or `/register`.
4. Provider auth uses popup on desktop and redirect on mobile web.
5. Provider-linked accounts remain provider-managed: account settings identify the connected provider(s) and registration email, and do not expose email-change or provider-unlink controls.

---

## Non-Goals

- Native app behaviors (Android Apple-register = ❌; iOS/Android native sheets) — separate app codebase.
- The visual refresh / React reimplementation — see spec 1602.
- Changing the auto-link decision itself (confirmed canon).

---

## Security note (carried from the SSO shape doc)

Auto-link + password-erase makes the **verified-email assumption load-bearing**: a matched email silently takes over an existing account and disables its password. The provider verifiers (`sso/providers/{google,apple}.py`) must assert the `email_verified` claim before the auto-link path runs. Tracked as Task 1b below.

---

## Success Criteria

- [ ] After an email/password user signs in via Google/Apple with the same email, `has_usable_password()` is `False` and only SSO login works.
- [ ] Provider verifiers reject tokens whose email is not verified.
- [ ] An SSO-only user typing email+password on `/login` sees an informative message + provider link (not the generic failure).
- [ ] The registration block message includes a working sign-in link.
- [ ] One Tap is suppressed when any marketing banner/modal/cookie overlay is present or was dismissed this session, and on `/login` + `/register`; shown on clean sessions (desktop + mobile web).
- [ ] Google & Apple use popup on desktop, redirect on mobile web.
- [ ] Provider-linked account settings show the provider(s) and registration email, without email-change or unlink controls.
- [ ] Tests updated to cover password-erase, login-path block, email_verified rejection, and provider-managed account settings.

---

## Open Questions

1. "Overlay present" detection — what is the authoritative signal for marketing banner / modal / cookie message presence (a JS flag, DOM selectors, a cookie)? Needs a definition from the front-end overlay code.
2. Provider linkage is permanent in this phase. Account settings show the provider(s) and registration email rather than offering password restoration, email changes, or unlinking.

## Implementation decisions

- SSO-only form failures use a structured `sso_only_account` code plus provider names; translated validation strings do not contain HTML.
- Google mobile redirect preserves signed state in a short-lived first-party cookie so `login_uri` remains an exact registered URI. Apple uses its signed `state` parameter.
- Interruptive UI reports through `window.SefariaInterruptiveUI`; the session is marked in `sessionStorage`, and One Tap is initialized programmatically only after the clean-session gate.
- Provider-linked accounts do not expose provider unlinking. Their account email remains tied to the verified provider identity.
