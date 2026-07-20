from __future__ import annotations

import json

import requests
import structlog
from allauth.socialaccount.adapter import get_adapter as get_social_adapter
from allauth.socialaccount.helpers import complete_social_login
from allauth.socialaccount.providers.google.views import login_by_token as google_login_by_token
from django.contrib.auth import authenticate, login as auth_login
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from emailusernames.utils import user_exists, get_user
from sefaria.forms import SefariaPasswordResetForm

logger = structlog.get_logger(__name__)


# Google One Tap redirect mode (ux_mode: 'redirect') POSTs a signed credential +
# g_csrf_token double-submit cookie to login_uri. Allauth's LoginByTokenView
# handles both verification and the double-submit CSRF check, so we expose it
# directly at this URL.
google_redirect = google_login_by_token


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

    adapter = get_social_adapter(request)
    try:
        provider = adapter.get_provider(request, "apple")
        sociallogin = provider.verify_token(request, {"id_token": id_token})
    except Exception as e:
        if isinstance(e.__cause__, requests.RequestException):
            logger.error("Apple JWKS fetch failed", error=str(e))
        else:
            logger.warning("Apple token verification failed", error=str(e))
        return JsonResponse({"error": "Invalid token"}, status=400)

    # Inject name from Apple SDK response (absent from ID token)
    if not sociallogin.user.first_name and first_name:
        sociallogin.user.first_name = first_name
    if not sociallogin.user.last_name and last_name:
        sociallogin.user.last_name = last_name

    complete_social_login(request, sociallogin)

    if request.user.is_authenticated:
        return JsonResponse({})
    return JsonResponse({"error": "Authentication failed"}, status=400)


@require_POST
def password_reset_api(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    form = SefariaPasswordResetForm(data={'email': data.get('email', '')})
    if not form.is_valid():
        return JsonResponse({"error": "Enter a valid email address."}, status=400)

    form.save(
        request=request,
        domain_override=request.get_host(),
        use_https=request.is_secure(),
        email_template_name='registration/password_reset_email.txt',
        html_email_template_name='registration/password_reset_email.html',
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
                providers = list(
                    u.socialaccount_set.values_list("provider", flat=True)
                )
                return JsonResponse(
                    {
                        "error": "This account uses social sign-in. Please sign in using one of the buttons above.",
                        "_auth": {"code": "sso_only_account", "providers": providers},
                    },
                    status=401,
                )
        return JsonResponse({"error": "Email and/or password are incorrect"}, status=401)

    auth_login(request, user)
    return JsonResponse({})
