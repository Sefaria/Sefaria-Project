# Google One Tap SSO Login — Implementation Plan

## Context

Sefaria currently requires email/password registration. This plan adds Google One Tap and Apple SSO so anonymous users can register or log in in one click. A `SocialIdentity` model links provider identities to existing Django `User` rows. All provider-agnostic business logic lives in a `SocialAuthService`. Existing email/password flows are preserved.

The Google One Tap POC (Tasks 1–6) is complete. Begin at Task 7.

---

## Phase 1: Google One Tap POC (complete)

### Task 1: Spec documentation ✅
### Task 2: `SocialIdentity` model + migration ✅
### Task 3: `google_sso_callback` view ✅
### Task 4: One Tap on all pages (`base.html`) ✅
### Task 5: Explicit Google button on `/login` ✅
### Task 6: Password registration collision validator (`forms.py`) ✅

---

## Phase 2: Bug Fixes

Fix these before adding any new features.

### Task 7: Fix case-insensitive email collision check

**File:** `sefaria/views.py`, the email collision block in `google_sso_callback`

Replace:
```python
existing_user = AuthUser.objects.get(email=email)
```
With:
```python
existing_user = AuthUser.objects.filter(email__iexact=email).first()
if existing_user and not existing_user.social_identities.filter(provider="google").exists():
    return jsonResponse({...}, status=409)
```

Remove the `try/except AuthUser.DoesNotExist` wrapper — the `filter().first()` pattern doesn't raise.

### Task 8: Apply full onboarding side effects to SSO new users

**File:** `sefaria/views.py`, new-user branch of `google_sso_callback`

After `p.assign_slug()`, add:
```python
p.join_invited_collections()
if hasattr(request, "interfaceLang"):
    p.settings["interface_language"] = request.interfaceLang
```

Also add the Gravatar import block from `process_register_form` (lines 167–184) before `p.save()`.

### Task 9: Fix `forms.py` provider check

**File:** `sefaria/forms.py`, line 77

Replace:
```python
if user.social_identities.filter(provider="google").exists():
```
With:
```python
if user.social_identities.exists():
```

And update the error message to not mention Google specifically:
> "This email is already registered via social login. Use the Sign in button for that provider to access your account."

---

## Phase 3: Service Layer

### Task 10: Create `SocialAuthService`

**File:** `sso/service.py` (new)

```python
class EmailCollisionError(Exception):
    pass

class AlreadyLinkedError(Exception):
    pass

class LastLoginMethodError(Exception):
    pass

class SocialAuthService:
    @staticmethod
    def get_or_create_social_user(provider, uid, email, first_name, last_name, request):
        """Returns (user, is_new_user). Raises EmailCollisionError if email matches a non-SSO account."""

    @staticmethod
    def apply_signup_side_effects(user, request):
        """Runs join_invited_collections, interface language, Gravatar. Idempotent."""

    @staticmethod
    def link_provider(user, provider, uid, email):
        """Adds a SocialIdentity to an already-authenticated user. Raises AlreadyLinkedError if (provider, uid) exists on another user."""

    @staticmethod
    def unlink_provider(user, provider):
        """Removes a SocialIdentity. Raises LastLoginMethodError if user has no usable password and this is their only social identity."""
```

Move all business logic from `google_sso_callback` into `get_or_create_social_user` and `apply_signup_side_effects`.

### Task 11: Refactor `google_sso_callback` to use the service

**File:** `sefaria/views.py`

The view body becomes: verify JWT → extract `sub`/`email`/`given_name`/`family_name` → call `SocialAuthService.get_or_create_social_user()` → call `apply_signup_side_effects()` if new → issue session → return response. No business logic in the view itself.

---

## Phase 4: Account Linking UI

### Task 12: Add linking/unlinking API endpoints

**File:** `sefaria/views.py`

```python
@login_required
@api_view(["POST"])
def link_social_provider(request, provider):
    # Validate provider is in allowed list
    # Call SocialAuthService.link_provider(request.user, provider, uid, email)
    # uid and email come from a provider token in request.data

@login_required
@api_view(["DELETE"])
def unlink_social_provider(request, provider):
    # Call SocialAuthService.unlink_provider(request.user, provider)
    # Raises LastLoginMethodError → return 409 with message to set password first
```

**File:** `sefaria/urls_shared.py`

Register:
```python
path('api/auth/link/<str:provider>', sefaria_views.link_social_provider),
path('api/auth/unlink/<str:provider>', sefaria_views.unlink_social_provider),
```

### Task 13: "Login Methods" section in account settings

**File:** `templates/account_settings.html`

Add a distinct "Login Methods" section — separate from the existing Google Drive export OAuth section. Show:
- Password: connected / not set (with "Set a password" link if not set)
- Google: connected (with Disconnect button) / not connected (with Connect button)
- Apple: connected (with Disconnect button) / not connected (with Connect button)

Disconnect is disabled if it would leave the user with no login method; show inline message: "Set a password before removing your only login method."

Connect triggers the provider OAuth flow while authenticated, then calls `POST /api/auth/link/<provider>`.

### Task 14: Update collision error message

**File:** `sefaria/views.py`, the 409 response in `google_sso_callback` (and later `apple_sso_callback`)

Update the message to reference the actual Settings page:
> "An account with this email already exists. Sign in with your password, then connect Google in **Settings → Login Methods**."

---

## Phase 5: Apple SSO

### Task 15: Apple token verification module

**File:** `sso/providers/apple.py` (new)

Verify Apple identity tokens against Apple's JWKS endpoint (`https://appleid.apple.com/auth/keys`). The `client_secret` is a signed RS256 JWT generated from the Apple Developer key — regenerate before it expires (max 6 months). Return a dict with `sub`, `email`, `given_name`, `family_name` (name fields available on first auth only; store them on `SocialIdentity` on first login).

Add to `requirements.txt`: `authlib` (for JWKS verification and JWT generation).

Add settings:
```python
APPLE_SSO_CLIENT_ID = ''    # Services ID (e.g. com.sefaria.signin)
APPLE_SSO_TEAM_ID = ''
APPLE_SSO_KEY_ID = ''
APPLE_SSO_PRIVATE_KEY = ''  # Content of .p8 file — load from environment, never commit
```

Expose `APPLE_SSO_CLIENT_ID` in `context_processors.global_settings`.

### Task 16: `apple_sso_callback` view

**File:** `sefaria/views.py`

Same shape as `google_sso_callback`: verify token via `sso/providers/apple.py` → call `SocialAuthService.get_or_create_social_user(provider="apple", ...)` → issue session → return response.

**File:** `sefaria/urls_shared.py`
```python
path('api/auth/apple/callback', sefaria_views.apple_sso_callback),
```

### Task 17: Apple sign-in button on `/login`

**File:** `templates/registration/login.html`

Load `https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`. Render the Apple button per Apple's HIG (use the JS SDK rendered button — do not create a custom-styled button). On credential receipt, POST to `/api/auth/apple/callback` and handle response the same way as the Google button.

Guard with `{% if APPLE_SSO_CLIENT_ID %}`.

Apple does not offer a One Tap equivalent — button on `/login` only.

---

## Phase 6: Tests

### Task 18: Unit tests for `SocialAuthService`

**File:** `sso/tests.py`

Mock provider JWT verification at the `sso/providers/<provider>.py` boundary.

Cover:
- New user: creates `User`, `SocialIdentity`, `UserProfile`; all side effects applied (collections, language, Gravatar)
- Returning user: issues session, no new records created
- Email collision (case-insensitive — `User@Gmail.com` vs `user@gmail.com`): raises `EmailCollisionError`
- Invalid JWT: raises appropriate exception before service is called
- `link_provider`: adds `SocialIdentity` to authenticated user
- `unlink_provider`: removes `SocialIdentity`
- `unlink_provider` with no remaining login method: raises `LastLoginMethodError`

### Task 19: Integration test for case-insensitive collision

User registers with `User@Gmail.com`. Google SSO callback receives `user@gmail.com`. Assert collision path is triggered, no duplicate user created.

---

## Critical Files

| File | Change |
|---|---|
| `sso/models.py` | Existing `SocialIdentity` — no changes |
| `sso/service.py` | New — `SocialAuthService` |
| `sso/providers/google.py` | New — extract Google JWT verification from view |
| `sso/providers/apple.py` | New — Apple identity token verification |
| `sso/tests.py` | New — all service + integration tests |
| `sefaria/views.py` | Bug fixes; refactor `google_sso_callback`; add `apple_sso_callback`; add link/unlink views |
| `sefaria/forms.py` | Fix provider check to `social_identities.exists()` |
| `sefaria/urls_shared.py` | Register Apple callback and link/unlink endpoints |
| `sefaria/local_settings_example.py` | Document Apple settings |
| `sefaria/local_settings.py` | Add Apple setting stubs |
| `sefaria/system/context_processors.py` | Expose `APPLE_SSO_CLIENT_ID` |
| `templates/account_settings.html` | Add "Login Methods" section |
| `templates/registration/login.html` | Add Apple sign-in button |
