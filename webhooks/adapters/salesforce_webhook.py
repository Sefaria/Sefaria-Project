"""
Our own Salesforce payload, sent by a Streamscript from a record-triggered Flow.

The contract is ours to define (spec §7). It is validated strictly, except that an unknown
eventType is ignored with a 200, so Salesforce-side Flows can change after a Sefaria deploy.

Verification is a shared secret in a header, compared in constant time. The request comes
over HTTPS from a system we configure, and a header is what Streamscript sends most simply.
HMAC signing can be added later without changing the payload.
"""

import hmac
import json
from collections.abc import Mapping
from enum import Enum
from typing import assert_never

from django.conf import settings

from sefaria.donors.types import NormalizedEmailAddress, PersonAsIdentifiedBySalesforce, UserBecameDonorAccordingToSalesforce
from webhooks.webhook_source_adapter import (
    MalformedWebhookPayload,
    ParsedWebhookEvent,
    ReasonWebhookEventWasIgnored,
    SignatureCheckResult,
    SignatureRejected,
    SignatureVerified,
    WebhookEventIgnored,
    WebhookSecretNotConfigured,
    is_json_integer,
    is_json_number,
    lowercase_header_names,
    parse_timezone_aware_timestamp,
)

SALESFORCE_WEBHOOK_SECRET = getattr(settings, "SALESFORCE_WEBHOOK_SECRET", None)
SECRET_HEADER_NAME = "x-sefaria-webhook-secret"


class SalesforceWebhookEventType(Enum):
    USER_BECAME_DONOR = "UserBecameDonor"


def verify_salesforce_request_secret(raw_body: bytes, headers: Mapping[str, str]) -> SignatureCheckResult:
    # Must come first: hmac.compare_digest("", "") is True, so an unset secret compared with an
    # empty header would pass. Failing closed here prevents that.
    if not SALESFORCE_WEBHOOK_SECRET:
        return WebhookSecretNotConfigured("SALESFORCE_WEBHOOK_SECRET")
    presented_secret = lowercase_header_names(headers).get(SECRET_HEADER_NAME, "")
    if hmac.compare_digest(presented_secret.encode(), SALESFORCE_WEBHOOK_SECRET.encode()):
        return SignatureVerified()
    return SignatureRejected()


def parse_salesforce_payload(raw_body: bytes, headers: Mapping[str, str]) -> ParsedWebhookEvent:
    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return MalformedWebhookPayload()
    match payload:
        case {"source": "salesforce", "eventType": str() as event_type_name}:
            try:
                event_type = SalesforceWebhookEventType(event_type_name)
            except ValueError:
                return WebhookEventIgnored(ReasonWebhookEventWasIgnored.UNHANDLED_EVENT_TYPE)
            match event_type:
                case SalesforceWebhookEventType.USER_BECAME_DONOR:
                    return _user_became_donor_event_from_payload(payload)
                case unreachable:
                    assert_never(unreachable)
        case _:
            return MalformedWebhookPayload()


def _user_became_donor_event_from_payload(payload: dict) -> ParsedWebhookEvent:
    match payload:
        case {"sourceEventId": str() as source_event_id, "occurredAt": occurred_at_text,
              "person": {"email": email_text, "salesforceContactId": str() as salesforce_contact_id} as person} \
                if source_event_id and salesforce_contact_id:
            email_address = NormalizedEmailAddress.parse(email_text)
            occurred_at = parse_timezone_aware_timestamp(occurred_at_text)
            classy_supporter_id = person.get("classySupporterId")
            if (email_address is None or occurred_at is None
                    or not _is_optional_int(classy_supporter_id)
                    or not _is_valid_optional_donation(payload.get("donation"))):
                return MalformedWebhookPayload()
            return UserBecameDonorAccordingToSalesforce(
                event_id_assigned_by_source=source_event_id,
                occurred_at_according_to_source=occurred_at,
                person=PersonAsIdentifiedBySalesforce(
                    email_address=email_address,
                    salesforce_contact_id=salesforce_contact_id,
                    classy_supporter_id=classy_supporter_id,
                ),
            )
        case _:
            return MalformedWebhookPayload()


def _is_optional_int(value: object) -> bool:
    return value is None or is_json_integer(value)


def _is_valid_optional_donation(donation: object) -> bool:
    # Validated but not carried into the domain in this PR. A future Salesforce
    # DonationReceived Flow can reuse the payload shape unchanged.
    match donation:
        case None:
            return True
        case {"amount": amount, "currency": str(), "frequency": str()} if is_json_number(amount):
            return True
        case _:
            return False
