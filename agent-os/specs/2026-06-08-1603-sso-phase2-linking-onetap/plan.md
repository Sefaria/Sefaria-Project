# SSO Phase 2 — Account-Linking & One Tap Compliance — Implementation Plan

## Context

Bring the shipped SSO POC in line with the product doc ([Registration/Login with Google & Apple](https://docs.google.com/document/d/1RuYfwVraTTfQ--78SltEGETm5ugoBtk1FD2cLj5yCtw/edit)). Four gaps: (1) password-erase on auto-link, (2) informative+linked block on the login path, (3) overlay-aware One Tap, (4) device-aware popup/redirect. Tasks 1–2 are backend and can ship independently; Tasks 3–4 are front-end and fold into the React UI work (spec 1602) but are specified here as the behavioral contract.

Follow the existing SSO conventions in [`2026-04-28-1601-apple-sso-login/standards.md`](../2026-04-28-1601-apple-sso-login/standards.md).

---

## Task 1: Erase password on auto-link

**Files:** `sso/service.py`, `sso/utils.py`.

```python
if user_exists(email):
    with transaction.atomic():
        existing_user = User.objects.select_for_update().get(pk=get_user(email).pk)
        SocialIdentity.objects.create(provider=provider, uid=uid, email=email, user=existing_user)
        if existing_user.has_usable_password():
            existing_user.set_unusable_password()
            existing_user.save(update_fields=["password"])
    return existing_user, False
```

- Identity creation and password invalidation run in one transaction.
- After this, the account is SSO-only. Account settings identify the connected provider(s) and registration email; provider unlinking and email changes are not offered.
- Idempotent: a no-op if the password is already unusable.

### Task 1b: `email_verified` gate (security precondition)

**Files:** `sso/providers/google.py`, `sso/providers/apple.py` — `verify_token`.

- Google: reject if `payload.get("email_verified")` is not truthy.
- Apple: reject if `claims.get("email_verified")` (string `"true"`/bool) is not truthy.
- Return / raise so the callback yields a 401 before any auto-link or password-erase happens.

---

## Task 2: Block + inform + link SSO accounts on email/password

### Task 2a: Registration message gets a sign-in link

**File:** `sefaria/forms.py` — `SefariaNewUserForm.clean_email` (currently ~lines 78-81).

- Keep the `social_identities.exists()` block and attach a structured `sso_only_account` code plus provider names.
- Templates/JSON clients render provider-specific actions. Do not put HTML in `ValidationError`; the registration AJAX path inserts error text safely.

### Task 2b: Handle the login path (the real gap)

**File:** `sefaria/views.py` — `CustomLoginView` (uses `SefariaLoginForm` / `EmailAuthenticationForm`).

- `SefariaLoginForm.clean` detects an existing SSO-only account after password authentication fails and emits the same typed error/provider metadata.
- The provider-specific response is an intentional account-enumeration tradeoff required by the product behavior.

### Task 2c: Provider-managed account settings

**Files:** `reader/views.py`, `templates/account_settings.html`.

- If a user has no social identities, retain the existing email-change controls.
- If a user has one or more social identities, hide email-change controls and show the connected provider(s) plus the account email.
- Do not expose provider unlinking or a password-restoration path in this phase.

---

## Task 3: Overlay-aware Google One Tap

**File:** `templates/base.html` (One Tap block, ~lines 189-198) + its init JS.

- **Suppress on `/login` and `/register`** via a `suppress_one_tap` context flag set on those views (this also satisfies the React UI spec's One Tap task — implement once).
- **Clean-session gate:** initialize One Tap programmatically after interruptive UI has mounted. Banners and cookie consent call `window.SefariaInterruptiveUI.markShown()`; a `sessionStorage` flag suppresses later prompts in the session.
- **Scope:** desktop **and** mobile web.

---

## Task 4: Device-aware popup vs redirect

**Files:** `templates/registration/login.html`, `templates/registration/register.html` (or their React equivalents once spec 1602 lands).

- **Apple:** desktop uses popup; mobile posts its redirect response to `/auth/apple/redirect` with signed state.
- **Google:** desktop uses popup; mobile posts to the exact registered `/auth/google/redirect` URI. Signed `next` state is stored in a short-lived first-party cookie.
- Use the shared `window.SefariaAuth.useRedirect()` policy so both providers agree.
- Note: on Apple/Google *devices* an OS-native component may still appear regardless — accepted (documented in the product doc).

---

## Verification

- **Unit (`sso/tests.py`):**
  - Auto-link sets `has_usable_password() == False` and disables password login for that user.
  - `email_verified=false` token → 401, no user/identity created, no password change.
  - Returning/auto-link paths remain idempotent.
- **Integration:**
  - SSO-only user posting email+password to `/login` gets the informative SSO message + link, not the generic error.
  - Registration block message renders the sign-in link.
- **Manual / Playwright:**
  - One Tap absent on `/login` and `/register`; absent when an overlay is shown/dismissed; present on a clean session (desktop + mobile-web viewport).
  - Mobile-web viewport uses redirect; desktop uses popup, for both providers.

---

## Critical Files

| File | Change |
|---|---|
| `sso/service.py` | Erase password on auto-link (Task 1) |
| `sso/providers/google.py`, `apple.py` | `email_verified` gate (Task 1b) |
| `sefaria/forms.py` | Registration block message + link (Task 2a) |
| `sefaria/views.py` | Signed redirect returns and `suppress_one_tap` context |
| `reader/views.py`, `templates/account_settings.html` | Provider-managed account settings |
| `templates/base.html` | Overlay-aware + page-suppressed One Tap (Task 3) |
| `static/js/auth/AuthPage.jsx`, auth templates | Device-aware popup/redirect and signed redirect-state bootstrap (Task 4) |
| `sso/tests.py` | Password-erase, email_verified, login-path-block tests |

---

## Dependencies & sequencing

- Tasks **1, 1b, 2** are backend-only and can ship now, independent of the React UI.
- Tasks **3, 4** are front-end; if the React reimplementation (spec 1602) is proceeding, implement them there so they aren't built twice on the legacy templates. If 1602 slips, they can be done on the current templates as a stopgap.
