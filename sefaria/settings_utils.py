import re

from django.core.exceptions import PermissionDenied, SuspiciousOperation
from django.http import Http404
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from remote_config import remoteConfigCache
from remote_config.keys import SENTRY_CONFIG_JSON

IGNORED_EXCEPTIONS = (
    Http404,
    PermissionDenied,
    SuspiciousOperation,
)

API_KEY_RE = re.compile(r"sfr_[A-Za-z0-9]+")
API_KEY_REPLACEMENT = "sfr_[Filtered]"


def scrub_api_keys(value):
    """Replaces Sefaria API key values (sfr_...) in every string of a Sentry event."""
    if isinstance(value, str):
        return API_KEY_RE.sub(API_KEY_REPLACEMENT, value)
    if isinstance(value, dict):
        return {scrub_api_keys(k): scrub_api_keys(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(scrub_api_keys(v) for v in value)
    return value


def init_sentry(sentry_dsn, sentry_code_version, sentry_environment):
    """
    Configure Sentry for error tracking only.
    Performance and profiling are intentionally disabled to reduce event volume.
    """

    def before_send(event, hint):
        event = filter_event(event, hint)
        return scrub_api_keys(event) if event is not None else None

    def filter_event(event, hint):
        if "exception" not in event:
            # Drop non-exception events (messages/log records).
            return None

        exc_info = hint.get("exc_info")
        if not exc_info:
            # Keep exception events even when hint metadata is unavailable.
            return event

        _, exc_value, _ = exc_info

        # Drop expected non-error HTTP exceptions.
        if isinstance(exc_value, IGNORED_EXCEPTIONS):
            return None

        # If an exception carries a status code, only keep server errors (5xx).
        status_code = getattr(exc_value, "status_code", None)
        if isinstance(status_code, int) and status_code < 500:
            return None

        return event

    sentry_config = remoteConfigCache.get(SENTRY_CONFIG_JSON) or {}
    sample_rate = sentry_config.get("sample_rate", 0.01)
    traces_sample_rate = sentry_config.get("traces_sample_rate", 0.0)
    profiles_sample_rate = sentry_config.get("profiles_sample_rate", 0.0)

    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=sentry_environment,
        integrations=[DjangoIntegration()],
        sample_rate=sample_rate,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
        send_default_pii=False,
        before_send=before_send,
        max_breadcrumbs=10,
        release=sentry_code_version,
    )
