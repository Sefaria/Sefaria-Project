from django.core import signing
from django.utils.http import url_has_allowed_host_and_scheme


PROVIDER_LABELS = {
    "apple": "Apple",
    "google": "Google",
}

SSO_ONLY_ACCOUNT_ERROR = "sso_only_account"
SSO_REDIRECT_STATE_SALT = "sso.redirect"


def claim_is_true(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return False


def verified_email_from_claims(claims):
    email = (claims.get("email") or "").strip()
    if not email:
        raise ValueError("Provider token is missing an email")
    if not claim_is_true(claims.get("email_verified")):
        raise ValueError("Provider email is not verified")
    return email


def provider_names_for_user(user):
    providers = dict.fromkeys(user.social_identities.order_by("provider").values_list("provider", flat=True))
    return [PROVIDER_LABELS.get(provider, provider.title()) for provider in providers]


def safe_next_url(request, candidate, default="/"):
    if candidate and url_has_allowed_host_and_scheme(
        candidate,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return candidate
    return default


def make_redirect_state(request, next_url):
    return signing.dumps(
        {"next": safe_next_url(request, next_url)},
        salt=SSO_REDIRECT_STATE_SALT,
        compress=True,
    )


def read_redirect_state(request, state, default="/"):
    if not state:
        return default
    try:
        payload = signing.loads(state, salt=SSO_REDIRECT_STATE_SALT, max_age=15 * 60)
    except signing.BadSignature:
        return default
    return safe_next_url(request, payload.get("next"), default=default)
