from django.core.exceptions import PermissionDenied, SuspiciousOperation
from django.http import Http404
import sentry_sdk
from urllib.parse import urlsplit
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.types import Event, Hint
from sentry_sdk.utils import iter_event_frames
from remote_config import remoteConfigCache
from remote_config.keys import SENTRY_CONFIG_JSON

IGNORED_EXCEPTIONS = (
    Http404,
    PermissionDenied,
    SuspiciousOperation,
)

# Custom secret-bearing headers that send_default_pii=False does not strip: the Salesforce
# webhook's shared secret and the Svix signature. Stored lowercase; compared against name.lower().
WEBHOOK_SECRET_HEADER_NAMES = frozenset({"x-sefaria-webhook-secret", "svix-signature", "webhook-signature"})
WEBHOOK_URL_PATH_PREFIX = "/api/webhooks/"
DONOR_TASK_NAME = "webhooks.process_event_indicating_person_is_donor"


def remove_webhook_secrets_and_payloads(event: Event) -> Event:
    """
    Remove everything from a Sentry event that could carry a webhook secret or payload.
    Secret headers go from every event; for events from a webhook URL, the request body, query
    string and the local variables of every stack frame go too. Donor Celery events also
    lose task arguments and all frame locals, which can contain donor data and OAuth secrets.
    """
    request = event.get("request") or {}

    headers = request.get("headers")
    if isinstance(headers, dict):
        request["headers"] = {
            name: value for name, value in headers.items() if name.lower() not in WEBHOOK_SECRET_HEADER_NAMES
        }
    elif headers is not None:
        # A shape we can't filter (for example a list of pairs) must not pass through: it could
        # hold the secret header, and we have no way to remove just that entry.
        request.pop("headers")

    celery_job = (event.get("extra") or {}).get("celery-job")
    is_donor_task = (
        isinstance(celery_job, dict) and celery_job.get("task_name") == DONOR_TASK_NAME
    ) or event.get("transaction") == DONOR_TASK_NAME
    if is_donor_task and isinstance(celery_job, dict):
        celery_job.pop("args", None)
        celery_job.pop("kwargs", None)

    url = request.get("url")
    # A url that isn't a string can't be checked, so it is scrubbed as if it were a webhook URL,
    # the same rule as unfilterable headers above. Passing it to urlsplit would raise instead,
    # and Sentry silently drops an event whose before_send raises. No url at all (a Celery
    # event) is not a webhook request.
    is_webhook_request = urlsplit(url).path.startswith(WEBHOOK_URL_PATH_PREFIX) if isinstance(url, str) else url is not None
    if is_webhook_request or is_donor_task:
        # The Sentry Django integration can attach the parsed request body to an error event. A
        # Classy payload carries card, account, billing-address and phone fields that must never
        # be stored anywhere, so a webhook request's body and query string are dropped entirely.
        request.pop("data", None)
        request.pop("query_string", None)
        # Sentry also captures the local variables of each stack frame. In the webhook views
        # those are raw_body, headers and presented_secret. Donor tasks can also capture donor
        # emails and OAuth credentials in library frames, so remove locals from every frame.
        for frame in iter_event_frames(event):
            frame.pop("vars", None)
    return event


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
            return remove_webhook_secrets_and_payloads(event)

        _, exc_value, _ = exc_info

        # Drop expected non-error HTTP exceptions.
        if isinstance(exc_value, IGNORED_EXCEPTIONS):
            return None

        # If an exception carries a status code, only keep server errors (5xx).
        status_code = getattr(exc_value, "status_code", None)
        if isinstance(status_code, int) and status_code < 500:
            return None

        return remove_webhook_secrets_and_payloads(event)

    def before_send_transaction(event: Event, hint: Hint) -> Event:
        # Sentry calls this hook with (event, hint), unlike our one-argument scrub function.
        return remove_webhook_secrets_and_payloads(event)

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
        # Transaction events skip before_send but carry the same request headers.
        before_send_transaction=before_send_transaction,
        max_breadcrumbs=10,
        release=sentry_code_version,
    )
