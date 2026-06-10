# Standards for SSO Login

## API Responses

- Use `jsonResponse(data)` from `sefaria.client.util` for all JSON responses
- Errors: `jsonResponse({"error": "message"}, status=NNN)`
- Success: `jsonResponse({"status": "ok", ...})`

## View Decorators

- All SSO callback views: `@csrf_exempt` + `@api_view(["POST"])`
- Linking/unlinking views: `@login_required` + `@api_view(["POST"])` / `@api_view(["DELETE"])`
- `@csrf_exempt` is required on callbacks — provider credential POSTs do not carry Django CSRF tokens; the signed JWT is the trust anchor

## View Responsibility

Callback views contain only: parse request → call provider module to verify token → call `SocialAuthService` → issue session → return response. No business logic in views.

## Email Lookups

Always use case-insensitive email lookups:
- `user_exists(email)` from `emailusernames/utils.py`
- `get_user(email)` from `emailusernames/utils.py`
- Raw ORM: `email__iexact=email`

Never use `AuthUser.objects.get(email=email)` or `filter(email=email)` — these are case-sensitive and will miss collisions.

## Provider Strings

Use lowercase string constants: `"google"`, `"apple"`. Apply consistently across:
- `SocialIdentity.provider` values
- URL path segments (`/api/auth/link/google`)
- Any template conditionals

## `SocialAuthService` Rules

- `get_or_create_social_user()` raises typed exceptions (`EmailCollisionError`) — never returns status strings or `None` to signal failure
- `apply_signup_side_effects()` must be idempotent
- `unlink_provider()` enforces the last-login-method guard at the service layer — raises `LastLoginMethodError` before deleting the row

## Collision Checks in Forms

`SefariaNewUserForm.clean_email` must check `social_identities.exists()` (any provider), not `social_identities.filter(provider="google").exists()`.

## Transaction Wrapping

Wrap all multi-step user creation (User + SocialIdentity + UserProfile) in `transaction.atomic()` inside the service method, not in the view.

## Models

- `SocialIdentity` lives in the `sso/` app, registered as `'sso.apps.SSOConfig'`
- FK to `auth.User` with `on_delete=models.CASCADE`
- `unique_together = [("provider", "uid")]`
- `default_auto_field = "django.db.models.AutoField"` (matches project default)

## Settings

- New settings go in `sefaria/local_settings_example.py` (documented) and `sefaria/local_settings.py` (empty stub)
- Template-visible settings exposed via `sefaria/system/context_processors.global_settings`
- `APPLE_SSO_PRIVATE_KEY` is loaded from environment — never committed to version control

## Tests

- Mock provider JWT verification at the `sso/providers/<provider>.py` boundary — not inside `SocialAuthService`
- All service methods have unit tests covering happy path and all exception paths
- Case-insensitive collision must have an integration test
- Tests live in `sso/tests.py`
