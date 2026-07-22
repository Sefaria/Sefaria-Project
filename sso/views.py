from __future__ import annotations

import json

import requests
import structlog
from allauth.socialaccount.adapter import get_adapter as get_social_adapter
from allauth.socialaccount.helpers import complete_social_login
from allauth.socialaccount.providers.google.views import (
    login_by_token as google_login_by_token,
)
from django.contrib.auth import authenticate, login as auth_login
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_POST
from rest_framework_simplejwt.tokens import RefreshToken

from emailusernames.utils import user_exists, get_user
from sefaria.forms import SefariaPasswordResetForm

logger = structlog.get_logger(__name__)


def _jwt_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _clean_name(value):
    if not value:
        return ""
    cleaned = "".join(ch for ch in value if ch.isprintable())
    return cleaned[:150]


def _social_login_or_error(
    request, provider_id, id_token, first_name=None, last_name=None
):
    """Verify a provider ID token and complete the social login.
    Returns (user, None) on success, or (None, JsonResponse(error)) on failure.
    Shared by the web (session) and mobile (JWT) auth views."""
    adapter = get_social_adapter(request)
    try:
        provider = adapter.get_provider(request, provider_id)
        sociallogin = provider.verify_token(request, {"id_token": id_token})
    except Exception as e:
        if isinstance(e.__cause__, requests.RequestException):
            logger.error(f"{provider_id} JWKS fetch failed", error=str(e))
        else:
            logger.warning(f"{provider_id} token verification failed", error=str(e))
        return None, JsonResponse({"error": "Invalid token"}, status=400)

    # Inject name from provider SDK response (absent from the ID token, e.g. Apple)
    if first_name and not sociallogin.user.first_name:
        sociallogin.user.first_name = _clean_name(first_name)
    if last_name and not sociallogin.user.last_name:
        sociallogin.user.last_name = _clean_name(last_name)

    complete_social_login(request, sociallogin)

    if not request.user.is_authenticated:
        return None, JsonResponse({"error": "Authentication failed"}, status=400)
    return request.user, None


# Google One Tap redirect mode (ux_mode: 'redirect') POSTs a signed credential +
# g_csrf_token double-submit cookie to login_uri. Allauth's LoginByTokenView
# handles both verification and the double-submit CSRF check, so we expose it
# directly at this URL.
google_redirect = google_login_by_token


@csrf_exempt
@require_POST
def google_mobile(request):
    """
    Mobile Google Sign In. The native app (RN) obtains a Google ID token via
    the platform's native SDK and POSTs it here. There is no session/cookie
    to protect with CSRF — the request is authenticated by the signed
    provider token itself, mirroring the DRF token endpoints rather than the
    cookie-CSRF web views.

    Body (JSON): { id_token } (also accepts { credential } as an alias)

    Returns:
      200 { access, refresh }  — simplejwt tokens for the mobile app
      400 { error }            — missing/invalid token or auth failure
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    id_token = data.get("id_token") or data.get("credential") or ""

    if not id_token:
        return JsonResponse({"error": "id_token required"}, status=400)

    user, err = _social_login_or_error(request, "google", id_token)
    if err:
        return err
    tokens = _jwt_for_user(user)
    request.session.flush()  # JWT-only client: don't persist a Django session cookie
    return JsonResponse(tokens)


@require_POST
@ensure_csrf_cookie
def apple_callback(request):
    """
    Apple Sign In — popup mode. Called from ChooseView.jsx after the AppleID JS
    SDK fires AppleIDSignInOnSuccess.

    Body (JSON): { id_token, first_name, last_name }

    Apple only includes name in the SDK response on the very first sign-in; it
    is never in the ID token. We inject first_name/last_name directly onto the
    sociallogin.user object after token verification so save_user() picks them up.
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    id_token = data.get("id_token", "")
    first_name = data.get("first_name", "")
    last_name = data.get("last_name", "")

    if not id_token:
        return JsonResponse({"error": "id_token required"}, status=400)

    user, err = _social_login_or_error(
        request, "apple", id_token, first_name, last_name
    )
    if err:
        return err
    return JsonResponse({})


@csrf_exempt
@require_POST
def apple_mobile(request):
    """
    Mobile Apple Sign In. Same verification/name-injection flow as
    apple_callback, but for the native app: there is no session/cookie to
    protect with CSRF, so this is authenticated by the signed provider token
    itself (mirroring the DRF token endpoints rather than the cookie-CSRF web
    views), and it returns simplejwt tokens instead of an empty success body.

    Body (JSON): { id_token, first_name, last_name }

    Returns:
      200 { access, refresh }  — simplejwt tokens for the mobile app
      400 { error }            — missing/invalid token or auth failure
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    id_token = data.get("id_token", "")
    first_name = data.get("first_name", "")
    last_name = data.get("last_name", "")

    if not id_token:
        return JsonResponse({"error": "id_token required"}, status=400)

    user, err = _social_login_or_error(
        request, "apple", id_token, first_name, last_name
    )
    if err:
        return err
    tokens = _jwt_for_user(user)
    request.session.flush()  # JWT-only client: don't persist a Django session cookie
    return JsonResponse(tokens)


@require_POST
def password_reset_api(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    form = SefariaPasswordResetForm(data={"email": data.get("email", "")})
    if not form.is_valid():
        return JsonResponse({"error": "Enter a valid email address."}, status=400)

    form.save(
        request=request,
        domain_override=request.get_host(),
        use_https=request.is_secure(),
        email_template_name="registration/password_reset_email.txt",
        html_email_template_name="registration/password_reset_email.html",
    )
    return JsonResponse({})


@require_POST
def email_login(request):
    """
    JSON email/password login for the SSO auth page. Session-based (not JWT).
    The existing /login form view and /api/login JWT endpoint are unchanged.

    Body (JSON): { email, password }

    Returns:
      200 {}                                       — success, session set
      401 { error }                                — wrong credentials
      401 { code: 'sso_only_account', providers }  — account has no password
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    email = data.get("email", "")
    password = data.get("password", "")

    user = authenticate(request, username=email, password=password)
    if user is None:
        if user_exists(email):
            u = get_user(email)
            if not u.has_usable_password() and u.socialaccount_set.exists():
                providers = list(u.socialaccount_set.values_list("provider", flat=True))
                return JsonResponse(
                    {
                        "error": "This account uses social sign-in. Please sign in using one of the buttons above.",
                        "_auth": {"code": "sso_only_account", "providers": providers},
                    },
                    status=401,
                )
        return JsonResponse(
            {"error": "Email and/or password are incorrect"}, status=401
        )

    auth_login(request, user)
    return JsonResponse({})
