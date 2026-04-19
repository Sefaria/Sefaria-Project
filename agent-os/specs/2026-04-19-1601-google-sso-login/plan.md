# Google One Tap SSO Login

## Context

Sefaria currently requires email/password registration, creating friction for new users. This adds Google One Tap SSO so anonymous visitors can register or log in in one click. A new `SocialIdentity` model links Google identities to existing Django `User` rows, while preserving all existing email/password flows. The product spec lives at `specs/sso/product.md`.

---

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-04-19-1601-google-sso-login/` with:
- `plan.md` — this full plan ✅
- `shape.md` — shaping notes ✅
- `standards.md` — conventions that apply ✅
- `references.md` — reference implementations ✅

---

## Task 2: Add `SocialIdentity` Django model + migration ✅

**App:** `sso/` (standalone Django app — `sso/__init__.py`, `sso/apps.py`, `sso/models.py`, `sso/migrations/0001_initial.py`)

```python
class SocialIdentity(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="social_identities")
    provider = models.CharField(max_length=50)   # e.g. "google"
    uid = models.CharField(max_length=255)        # Google "sub"
    email = models.EmailField()
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("provider", "uid")]
```

Registered in `sefaria/settings.py` `INSTALLED_APPS` as `'sso.apps.SSOConfig'`.

Run migration: `python manage.py migrate sso`

---

## Task 3: Backend callback view ✅

**File:** `sefaria/views.py` (after `register_api`, around line 197)

New view: `google_sso_callback(request)`

Logic:
1. Parse `credential` from POST body
2. Verify JWT: `google.oauth2.id_token.verify_oauth2_token(token, requests.Request(), settings.GOOGLE_SSO_CLIENT_ID)` — `google-auth` is already in `requirements.txt`
3. Extract `sub`, `email`, `given_name`, `family_name` from verified payload
4. **Returning SSO user:** `SocialIdentity.objects.get(provider="google", uid=sub)` → `auth_login(request, identity.user, backend="emailusernames.backends.EmailAuthBackend")` → return `{"status": "ok", "is_new_user": False}`
5. **Email collision (password account):** return 409 `{"error": "An account with this email already exists. Sign in with your password, then link your Google account in Settings."}`
6. **New user:** `transaction.atomic()` → `emailusernames.utils.create_user(email, password=None)` → set first/last name → create `SocialIdentity` → create `UserProfile`, `p.assign_slug()`, `p.save()` → `auth_login(...)` → return `{"status": "ok", "is_new_user": True}`
7. **JWT verification fails:** return 401 `{"error": "Google sign-in failed. Please try again."}`

Decorators: `@csrf_exempt` + `@api_view(["POST"])` (JWT signature is the trust anchor)

**URL** registered in `sefaria/urls_shared.py`:
```python
path('api/auth/google/callback', sefaria_views.google_sso_callback, name='google_sso_callback'),
```

**Settings** in `sefaria/local_settings_example.py` and `sefaria/local_settings.py`:
```python
GOOGLE_SSO_CLIENT_ID = ''  # Google OAuth client ID for One Tap / Sign in with Google
```

`GOOGLE_SSO_CLIENT_ID` is exposed to all templates via `global_settings` in `sefaria/system/context_processors.py`.

---

## Task 4: Frontend — load Google One Tap on all pages ✅

**File:** `templates/base.html`

Injected before `</head>`, guarded by `{% if GOOGLE_SSO_CLIENT_ID and not request.user.is_authenticated %}`:
- Loads `https://accounts.google.com/gsi/client` async
- Renders `#g_id_onload` div with `data-callback="handleGoogleOneTapCredential"`
- Inline JS: `handleGoogleOneTapCredential(response)` POSTs credential to `/api/auth/google/callback`, reloads on success, logs error on failure

---

## Task 5: Frontend — explicit button on `/login` page ✅

**File:** `templates/registration/login.html`

Added below the "Create a new account" link, guarded by `{% if GOOGLE_SSO_CLIENT_ID %}`:
- Divider ("or" / "או")
- `#google-signin-button` div rendered via `google.accounts.id.renderButton()`
- `#google-sso-error` div for inline error display
- Inline JS that initializes GSI and reuses `handleGoogleOneTapCredential`, redirecting to `{{ next|default:"/" }}` on success

---

## Task 6: Edge case — password registration collision (Flow 5) ✅

**File:** `sefaria/forms.py` — `SefariaNewUserForm.clean_email`

Before the existing "user already exists" check, detects if the email belongs to a user with a linked Google `SocialIdentity` and raises:
> "This email is already registered via Google. Use Sign in with Google to access your account."

---

## Verification

1. **Unit tests:** Add `sso/tests.py` or `sefaria/tests/test_google_sso.py`
   - Mock `id_token.verify_oauth2_token` to return a payload
   - Test: new user flow creates `User`, `SocialIdentity`, `UserProfile`
   - Test: returning user issues session without creating new records
   - Test: email collision returns 409
   - Test: invalid JWT returns 401

2. **Manual test:**
   - Set `GOOGLE_SSO_CLIENT_ID` in `local_settings.py`, run `python manage.py migrate`
   - Visit any page as anonymous → One Tap prompt appears
   - Complete One Tap → session is issued, page reloads as logged-in user
   - Check Django admin: `User`, `SocialIdentity` records exist under `sso` app
   - Visit `/login` → Google button visible
   - Attempt to register with an SSO email → collision error shown

---

## Critical Files

| File | Change |
|---|---|
| `sso/__init__.py` | New app |
| `sso/apps.py` | `SSOConfig` AppConfig |
| `sso/models.py` | `SocialIdentity` model |
| `sso/migrations/0001_initial.py` | Initial migration |
| `sefaria/settings.py` | Add `'sso.apps.SSOConfig'` to `INSTALLED_APPS` |
| `sefaria/views.py` | Add `google_sso_callback` view (imports from `sso.models`) |
| `sefaria/urls_shared.py` | Register `api/auth/google/callback` |
| `sefaria/local_settings_example.py` | Document `GOOGLE_SSO_CLIENT_ID` |
| `sefaria/local_settings.py` | Add `GOOGLE_SSO_CLIENT_ID = ''` |
| `sefaria/system/context_processors.py` | Expose `GOOGLE_SSO_CLIENT_ID` to templates |
| `sefaria/forms.py` | SSO email collision validator |
| `templates/base.html` | Load GSI, init One Tap for anonymous users |
| `templates/registration/login.html` | Explicit Google sign-in button |
