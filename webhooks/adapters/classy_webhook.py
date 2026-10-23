"""
GoFundMe Pro (Classy) transaction webhooks, delivered by Svix.

Signatures are checked by svix_signature.py, with the standard library only (that module
explains why the svix package isn't used).

Only allowlisted transaction fields are ever copied out of the payload. The real payload
carries account numbers, card details, billing addresses, phone numbers and browser info;
none of them are stored or logged.
"""

import json
import time
from collections.abc import Mapping

from django.conf import settings

from sefaria.donors.types import DonationReceivedFromClassy, NormalizedEmailAddress, PersonAsIdentifiedByClassy
from webhooks.adapters.svix_signature import is_valid_svix_signature
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
    parse_timestamp_assuming_utc,
)

# Read once at import with a None default, so an older local_settings.py without the name
# still boots and the endpoint simply answers 503 (see views.py).
CLASSY_WEBHOOK_SECRET = getattr(settings, "CLASSY_WEBHOOK_SECRET", None)

# Everything the decision and email resolution need — and nothing else.
ALLOWLISTED_TRANSACTION_FIELDS = ("id", "supporter_id", "status", "donation_gross_amount", "updated_at", "member_email_address")


def pick_allowlisted_transaction_fields(transaction: Mapping) -> dict:
    return {name: transaction[name] for name in ALLOWLISTED_TRANSACTION_FIELDS if name in transaction}


def verify_classy_request_signature(raw_body: bytes, headers: Mapping[str, str]) -> SignatureCheckResult:
    if not CLASSY_WEBHOOK_SECRET:
        return WebhookSecretNotConfigured("CLASSY_WEBHOOK_SECRET")
    if not is_valid_svix_signature(CLASSY_WEBHOOK_SECRET, raw_body, headers, now=time.time()):
        return SignatureRejected()
    return SignatureVerified()


def parse_classy_transaction_payload(raw_body: bytes, headers: Mapping[str, str]) -> ParsedWebhookEvent:
    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return MalformedWebhookPayload()
    match payload:
        case {"eventType": "transaction.created" | "transaction.updated", "data": dict() as transaction}:
            return _donation_event_from_transaction(pick_allowlisted_transaction_fields(transaction), _svix_message_id(headers))
        case {"eventType": "transaction.created" | "transaction.updated"}:
            # A transaction event whose `data` isn't an object is a broken payload (400), not
            # an unrelated event type to ignore (200).
            return MalformedWebhookPayload()
        case {"eventType": str()}:
            return WebhookEventIgnored(ReasonWebhookEventWasIgnored.UNHANDLED_EVENT_TYPE)
        case _:
            return MalformedWebhookPayload()


def _donation_event_from_transaction(transaction: dict, message_id: str | None) -> ParsedWebhookEvent:
    match transaction:
        case {"status": str() as status, "donation_gross_amount": amount} if is_json_number(amount):
            # `not amount > 0` rather than `amount <= 0`, so a NaN amount is ignored too.
            if status != "success" or not amount > 0:
                return WebhookEventIgnored(ReasonWebhookEventWasIgnored.NOT_A_SUCCESSFUL_NONZERO_DONATION)
            return _donation_event_from_successful_transaction(transaction, message_id)
        case _:
            return MalformedWebhookPayload()


def _donation_event_from_successful_transaction(transaction: dict, message_id: str | None) -> ParsedWebhookEvent:
    match transaction:
        case {"id": transaction_id, "supporter_id": supporter_id, "updated_at": updated_at} \
                if is_json_integer(transaction_id) and is_json_integer(supporter_id) and message_id:
            # `message_id` is required: without the svix id there is no idempotency key for the event.
            occurred_at = parse_timestamp_assuming_utc(updated_at)
            if occurred_at is None:
                return MalformedWebhookPayload()
            return DonationReceivedFromClassy(
                # svix-id is reused only for retries of the same message, so it names one occurrence.
                event_id_assigned_by_source=message_id,
                occurred_at_according_to_source=occurred_at,
                person=PersonAsIdentifiedByClassy(
                    classy_supporter_id=supporter_id,
                    email_address=NormalizedEmailAddress.parse(transaction.get("member_email_address")),
                ),
                classy_transaction_id=transaction_id,
            )
        case _:
            # Money arrived but we can't identify the transaction or the person: that is a
            # broken payload (400), not an event to ignore (200).
            return MalformedWebhookPayload()


def _svix_message_id(headers: Mapping[str, str]) -> str | None:
    # Svix sends svix-id; the Standard Webhooks spelling webhook-id is accepted too, since
    # which one GoFundMe Pro sends is still to be confirmed (spec §12 item 2).
    lowercased = lowercase_header_names(headers)
    return lowercased.get("svix-id") or lowercased.get("webhook-id")
