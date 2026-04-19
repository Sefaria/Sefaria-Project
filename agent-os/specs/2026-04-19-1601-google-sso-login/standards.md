# Standards for Google SSO Login

No standards are currently defined in `agent-os/standards/index.yml`. The following implicit conventions from the codebase apply and were followed in this implementation:

## API Response Format

- Use `jsonResponse(data)` from `sefaria.client.util` for all JSON responses (consistent with all existing API views)
- Errors returned as `jsonResponse({"error": "message"}, status=NNN)`
- Success: `jsonResponse({"status": "ok", "is_new_user": bool})`

## Django Views

- Use `@api_view(["POST"])` decorator from DRF for the callback endpoint
- Use `@csrf_exempt` on the callback (Google One Tap POSTs do not include Django CSRF tokens — JWT signature verification is the trust anchor)
- Wrap user + profile creation in `transaction.atomic()`

## Models

- `SocialIdentity` lives in its own `sso/` Django app, registered as `'sso.apps.SSOConfig'` in `INSTALLED_APPS`
- FK to `auth.User` with `on_delete=models.CASCADE`
- `unique_together = [("provider", "uid")]`
- `default_auto_field = "django.db.models.AutoField"` (matches project default, not `BigAutoField`)

## Settings

- New settings added to `sefaria/local_settings_example.py` and `sefaria/local_settings.py`
- Template-visible settings exposed via `sefaria/system/context_processors.global_settings`
