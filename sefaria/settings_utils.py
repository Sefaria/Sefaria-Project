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


def init_sentry(sentry_dsn, sentry_code_version, sentry_environment):
    """
    Configure Sentry for error tracking only.
    Performance and profiling are intentionally disabled to reduce event volume.
    """

    def before_send(event, hint):
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
