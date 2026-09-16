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
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_POST
from rest_framework import exceptions
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from emailusernames.utils import get_user
from sefaria.forms import SefariaPasswordResetForm

logger = structlog.get_logger(__name__)


def _jwt_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def sso_only_account_info(email):
    """
    Return the list of SSO provider ids linked to `email`'s account if that
    account is SSO-only (no usable password), or None if the account can
    (also) sign in with a password, or doesn't exist.

    Shared by email_login (web, session-based) and MobileTokenObtainPairView
    (mobile, JWT-based) so both surface the same 'this account only has
    Google/Apple sign-in' signal on a failed credential check.

    One user lookup plus one social-account fetch: has_usable_password()
    reads a field already on the fetched user, so it needs no query of
    its own.

    That password check is defence-in-depth rather than a live branch: an
    account with both a usable password and a linked provider is not
    reachable today, since linking wipes the password (adapters.py's
    "SSO always wins on an email collision"). It is kept because it is
    free and because that is a product decision, not an invariant -- if it
    is ever revisited, this check is what stops a mistyped password being
    reported as "your account is Google-only".
    """
    try:
        user = get_user(email)
    except User.DoesNotExist:
        return None
    if user.has_usable_password():
        return None
    providers = list(user.socialaccount_set.values_list("provider", flat=True))
    return providers or None


class SSOAwareTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    SimpleJWT's TokenObtainPairSerializer with SSO-only-account detection
    layered onto the failure path. On success, behaves identically to the
    stock serializer (returns {access, refresh}). On failure, if the account
    turns out to be SSO-only, raises AuthenticationFailed with a structured
    detail mirroring email_login's JSON shape instead of SimpleJWT's generic
    'no active account' message. Any other failure is re-raised unchanged.
    """

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except exceptions.AuthenticationFailed:
            providers = sso_only_account_info(attrs.get(self.username_field, ""))
            if providers:
                raise exceptions.AuthenticationFailed(
                    {
                        "error": "auth.generic_error",
                        "_auth": {"code": "sso_only_account", "providers": providers},
                    }
                )
            raise


class MobileTokenObtainPairView(TokenObtainPairView):
    """
    api/login/ -- the JWT login endpoint used by the mobile app. Identical to
    SimpleJWT's stock TokenObtainPairView except for SSO-only-account
    detection on the failure path; see SSOAwareTokenObtainPairSerializer.
    """

    serializer_class = SSOAwareTokenObtainPairSerializer


def _clean_name(value):
    if not value:
        return ""
    cleaned = "".join(ch for ch in value if ch.isprintable())
    return cleaned[:150]


def _sso_only_account_response(providers, status=401):
    """Build the shared 'sso_only_account' JsonResponse from a provider list."""
    return JsonResponse(
        {
            "error": "auth.generic_error",
            "_auth": {"code": "sso_only_account", "providers": providers},
        },
        status=status,
    )


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
        return None, JsonResponse({"error": "auth.social_signin_failed"}, status=400)

    # Inject name from provider SDK response (absent from the ID token, e.g. Apple)
    if first_name and not sociallogin.user.first_name:
        sociallogin.user.first_name = _clean_name(first_name)
    if last_name and not sociallogin.user.last_name:
        sociallogin.user.last_name = _clean_name(last_name)

    complete_social_login(request, sociallogin)

    if not request.user.is_authenticated:
        return None, JsonResponse({"error": "auth.social_signin_failed"}, status=400)
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
        return JsonResponse({"error": "auth.generic_error"}, status=400)

    id_token = data.get("id_token") or data.get("credential") or ""

    if not id_token:
        return JsonResponse({"error": "auth.generic_error"}, status=400)

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
        return JsonResponse({"error": "auth.generic_error"}, status=400)

    id_token = data.get("id_token", "")
    first_name = data.get("first_name", "")
    last_name = data.get("last_name", "")

    if not id_token:
        return JsonResponse({"error": "auth.generic_error"}, status=400)

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
        return JsonResponse({"error": "auth.generic_error"}, status=400)

    id_token = data.get("id_token", "")
    first_name = data.get("first_name", "")
    last_name = data.get("last_name", "")

    if not id_token:
        return JsonResponse({"error": "auth.generic_error"}, status=400)

    user, err = _social_login_or_error(
        request, "apple", id_token, first_name, last_name
    )
    if err:
        return err
    tokens = _jwt_for_user(user)
    request.session.flush()  # JWT-only client: don't persist a Django session cookie
    return JsonResponse(tokens)


@csrf_exempt
@require_POST
def password_reset_api(request):
    # Target email comes from the body, not the session, so CSRF adds no
    # protection here; the mobile client carries no cookie/Referer to supply it.
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "auth.generic_error"}, status=400)

    email = data.get("email", "")

    form = SefariaPasswordResetForm(data={"email": email})
    if not form.is_valid():
        return JsonResponse({"error": "auth.invalid_email"}, status=400)

    providers = sso_only_account_info(email)
    if providers:
        return _sso_only_account_response(providers)

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
    The existing /login form view is unchanged; /api/login (mobile, JWT) uses
    the same SSO-only-account detection via sso_only_account_info -- see
    MobileTokenObtainPairView.

    Body (JSON): { email, password }

    Returns:
      200 {}                                                          — success, session set
      401 { error }                                                   — wrong credentials
      401 { error, _auth: { code: 'sso_only_account', providers } }   — account has no password
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "auth.generic_error"}, status=400)

    email = data.get("email", "")
    password = data.get("password", "")

    user = authenticate(request, username=email, password=password)
    if user is None:
        providers = sso_only_account_info(email)
        if providers:
            return _sso_only_account_response(providers)
        return JsonResponse({"error": "auth.invalid_credentials"}, status=401)

    auth_login(request, user)
    return JsonResponse({})
