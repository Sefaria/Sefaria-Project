"""
Inbound webhook endpoints. One function, receive_webhook, serves every source: each source
contributes an adapter, and everything after parsing is shared.

Order matters: the sender is verified BEFORE the body is parsed, so unauthenticated input
never reaches a parser.
"""

from collections.abc import Mapping
from typing import assert_never

import structlog
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from sefaria.donors.types import DonationReceivedFromClassy, EventIndicatingPersonIsDonor, UserBecameDonorAccordingToSalesforce
from webhooks.adapters.classy_webhook import parse_classy_transaction_payload, verify_classy_request_signature
from webhooks.adapters.salesforce_webhook import parse_salesforce_payload, verify_salesforce_request_secret
from webhooks.dispatcher import EventCouldNotBeEnqueued, enqueue_event_for_processing
from webhooks.webhook_source_adapter import (
    MalformedWebhookPayload,
    SignatureRejected,
    WebhookEventIgnored,
    WebhookSecretNotConfigured,
    WebhookSource,
    WebhookSourceAdapter,
)

logger = structlog.get_logger(__name__)

CLASSY_WEBHOOK_ADAPTER = WebhookSourceAdapter(
    webhook_source=WebhookSource.CLASSY,
    verify_request_signature=verify_classy_request_signature,
    parse_verified_payload=parse_classy_transaction_payload,
)
SALESFORCE_WEBHOOK_ADAPTER = WebhookSourceAdapter(
    webhook_source=WebhookSource.SALESFORCE,
    verify_request_signature=verify_salesforce_request_secret,
    parse_verified_payload=parse_salesforce_payload,
)


# csrf_exempt: webhook senders have no CSRF token, and they are authenticated by the signature
# check in receive_webhook instead. strapi_cache_invalidate (sefaria/views.py) is csrf_exempt
# for the same reason.
@csrf_exempt
@require_POST
def receive_classy_webhook(request) -> HttpResponse:
    return receive_webhook(CLASSY_WEBHOOK_ADAPTER, request.body, request.headers)


@csrf_exempt
@require_POST
def receive_salesforce_webhook(request) -> HttpResponse:
    return receive_webhook(SALESFORCE_WEBHOOK_ADAPTER, request.body, request.headers)


def receive_webhook(
    adapter: WebhookSourceAdapter, raw_body: bytes, headers: Mapping[str, str]
) -> HttpResponse:
    # Logs carry only the source, event id, outcome and reason — never the body, headers,
    # secrets or email addresses.
    webhook_source = adapter.webhook_source.value
    # One try for both steps is still verify-then-parse: when verification raises, the parser
    # never runs. Every refusal and its status code is answered here, in one place.
    try:
        adapter.verify_request_signature(raw_body, headers)
        parsed_event = adapter.parse_verified_payload(raw_body, headers)
    except WebhookSecretNotConfigured as error:
        logger.warning(
            "webhook_secret_not_configured",
            webhook_source=webhook_source,
            setting_name=error.setting_name,
        )
        return JsonResponse(
            {"error": f"{webhook_source}_webhook_not_configured"}, status=503
        )
    except SignatureRejected:
        logger.warning("webhook_signature_rejected", webhook_source=webhook_source)
        return JsonResponse({"error": "invalid_signature"}, status=401)
    except MalformedWebhookPayload:
        logger.warning("webhook_payload_malformed", webhook_source=webhook_source)
        return JsonResponse({"error": "malformed_payload"}, status=400)

    match parsed_event:
        case WebhookEventIgnored(reason=reason):
            logger.info(
                "webhook_event_ignored",
                webhook_source=webhook_source,
                reason=reason.value,
            )
            return JsonResponse(
                {"status": "ignored", "reason": reason.value}, status=200
            )
        case (
            DonationReceivedFromClassy()
            | UserBecameDonorAccordingToSalesforce() as event
        ):
            return _accept_event(webhook_source, event)
        case unreachable:
            assert_never(unreachable)


def _accept_event(
    webhook_source: str, event: EventIndicatingPersonIsDonor
) -> HttpResponse:
    try:
        processing_mode = enqueue_event_for_processing(event)
    except EventCouldNotBeEnqueued:
        # The dispatcher has already logged donor_event_enqueue_failed with the event id.
        return JsonResponse({"error": "enqueue_failed"}, status=503)
    logger.info(
        "webhook_event_accepted",
        webhook_source=webhook_source,
        event_id_assigned_by_source=event.event_id_assigned_by_source,
        processing_mode=processing_mode.value,
    )
    # processing_mode is sent only after verification and reveals nothing sensitive.
    # e2e-tests/tests/strapi-donor-webhook-flow.spec.js reads it to know whether processing
    # was queued or inline.
    return JsonResponse(
        {"status": "accepted", "processing_mode": processing_mode.value}, status=202
    )
