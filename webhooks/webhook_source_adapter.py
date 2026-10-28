"""
What every webhook source adapter provides, and the types they all return or raise.

Each source parses a differently shaped payload, but every adapter uses THESE types. That is
what lets one view function, one dispatcher and one Celery task serve every source.

A request that is refused (secret not configured, bad signature, malformed payload) raises one
of the exceptions below, and receive_webhook in views.py turns each into its status code. An
ignored event is returned instead, because it is a successful delivery (200), not an error.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from sefaria.donors.types import EventIndicatingPersonIsDonor, as_utc_datetime


class WebhookSource(Enum):
    CLASSY = "classy"
    SALESFORCE = "salesforce"


class WebhookSecretNotConfigured(Exception):
    """The endpoint's secret setting is unset. Answered 503, so the sender retries while ops sets it."""

    def __init__(self, setting_name: str):
        super().__init__(setting_name)
        # Named in the warning log so ops knows exactly what to set. Only the name, never a value.
        self.setting_name = setting_name


class SignatureRejected(Exception):
    """The signature or shared secret didn't match. Answered 401."""


class ReasonWebhookEventWasIgnored(Enum):
    NOT_A_SUCCESSFUL_NONZERO_DONATION = "not_a_successful_nonzero_donation"
    UNHANDLED_EVENT_TYPE = "unhandled_event_type"


@dataclass(frozen=True)
class WebhookEventIgnored:
    reason: ReasonWebhookEventWasIgnored


class MalformedWebhookPayload(Exception):
    """The verified body isn't the payload the source promised. Answered 400."""


type ParsedWebhookEvent = EventIndicatingPersonIsDonor | WebhookEventIgnored


@dataclass(frozen=True)
class WebhookSourceAdapter:
    webhook_source: WebhookSource
    # Returns only when the sender is verified. Raises WebhookSecretNotConfigured or
    # SignatureRejected otherwise.
    verify_request_signature: Callable[[bytes, Mapping[str, str]], None]
    # Raises MalformedWebhookPayload for a body it can't read as the source's contract.
    parse_verified_payload: Callable[[bytes, Mapping[str, str]], ParsedWebhookEvent]


def is_json_integer(value: object) -> bool:
    # bool is a subclass of int in Python, so isinstance(True, int) is True; JSON `true` is not a number.
    return isinstance(value, int) and not isinstance(value, bool)


def is_json_number(value: object) -> bool:
    # Same bool exclusion as is_json_integer.
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def lowercase_header_names(headers: Mapping[str, str]) -> dict[str, str]:
    # Django's request.headers is case-insensitive, but a plain dict (what the adapters and every
    # test pass around) is not. Lowercasing once makes both behave the same.
    return {name.lower(): value for name, value in headers.items()}


def parse_timezone_aware_timestamp(text: object) -> datetime | None:
    """An ISO 8601 timestamp WITH an offset, or None. For our own Salesforce contract, which requires one."""
    parsed = _parse_iso_timestamp(text)
    return parsed if parsed is not None and parsed.tzinfo is not None else None


def _parse_iso_timestamp(text: object) -> datetime | None:
    if not isinstance(text, str):
        return None
    try:
        # Python 3.11+ accepts "Z", "+00:00" and "+0000" here.
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def parse_timestamp_assuming_utc(text: object) -> datetime | None:
    """An ISO 8601 timestamp, where a missing offset means UTC. For Classy, whose payload format we don't control."""
    parsed = _parse_iso_timestamp(text)
    return as_utc_datetime(parsed) if parsed is not None else None
