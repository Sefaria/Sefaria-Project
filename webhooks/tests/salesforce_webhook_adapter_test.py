"""
Unit tests for webhooks/adapters/salesforce_webhook.py — our own payload contract.
"""

import copy
import json
from datetime import datetime, timezone

import pytest

from sefaria.donors.types import NormalizedEmailAddress, PersonAsIdentifiedBySalesforce, UserBecameDonorAccordingToSalesforce
from webhooks.adapters import salesforce_webhook
from webhooks.adapters.salesforce_webhook import parse_salesforce_payload, verify_salesforce_request_secret
from webhooks.webhook_source_adapter import (
    MalformedWebhookPayload,
    ReasonWebhookEventWasIgnored,
    SignatureRejected,
    SignatureVerified,
    WebhookEventIgnored,
    WebhookSecretNotConfigured,
)

TEST_SECRET = "test-salesforce-webhook-secret-0123456789"

VALID_PAYLOAD = {
    "source": "salesforce",
    "eventType": "UserBecameDonor",
    "sourceEventId": "0035e00000AbCdEAAZ:UserBecameDonor:2026-10-22T14:03:11.000Z",
    "occurredAt": "2026-10-22T00:00:00Z",
    "person": {"email": "Donor@Example.org", "salesforceContactId": "0035e00000AbCdEAAZ", "classySupporterId": 5827},
    "donation": {"amount": 36.00, "currency": "USD", "frequency": "one-time"},
}


def body_of(payload) -> bytes:
    return json.dumps(payload).encode()


def _container_at(payload, path):
    """The dict holding the last key of `path` (mutates the payload it is given)."""
    container = payload
    for key in path[:-1]:
        container = container[key]
    return container


def payload_without(*path):
    payload = copy.deepcopy(VALID_PAYLOAD)
    del _container_at(payload, path)[path[-1]]
    return payload


def payload_with(path, value):
    payload = copy.deepcopy(VALID_PAYLOAD)
    _container_at(payload, path)[path[-1]] = value
    return payload


@pytest.fixture(autouse=True)
def salesforce_secret(monkeypatch):
    monkeypatch.setattr(salesforce_webhook, "SALESFORCE_WEBHOOK_SECRET", TEST_SECRET)


# ============================================================================
# Shared-secret verification
# ============================================================================

class TestVerifySalesforceRequestSecret:

    def test_accepts_the_configured_secret(self):
        """The header carries the secret from the Salesforce Named Credential."""
        assert verify_salesforce_request_secret(b"{}", {"X-Sefaria-Webhook-Secret": TEST_SECRET}) == SignatureVerified()

    def test_header_name_is_case_insensitive(self):
        """Proxies and clients may change header case."""
        assert verify_salesforce_request_secret(b"{}", {"x-sefaria-webhook-secret": TEST_SECRET}) == SignatureVerified()

    @pytest.mark.parametrize("headers", [{}, {"X-Sefaria-Webhook-Secret": ""}, {"X-Sefaria-Webhook-Secret": "wrong"}])
    def test_rejects_a_missing_empty_or_wrong_secret(self, headers):
        """Anything but the exact secret is a 401."""
        assert verify_salesforce_request_secret(b"{}", headers) == SignatureRejected()

    @pytest.mark.parametrize("unset", [None, ""])
    def test_unset_secret_plus_empty_header_is_not_configured(self, monkeypatch, unset):
        """hmac.compare_digest('', '') is True, so an unset secret must fail closed BEFORE any comparison."""
        monkeypatch.setattr(salesforce_webhook, "SALESFORCE_WEBHOOK_SECRET", unset)
        assert verify_salesforce_request_secret(b"{}", {"X-Sefaria-Webhook-Secret": ""}) == WebhookSecretNotConfigured("SALESFORCE_WEBHOOK_SECRET")


# ============================================================================
# Payload contract
# ============================================================================

class TestParseSalesforcePayload:

    def test_a_valid_payload_becomes_an_event(self):
        """Every contract field lands where the domain expects it; the email is normalized."""
        assert parse_salesforce_payload(body_of(VALID_PAYLOAD), {}) == UserBecameDonorAccordingToSalesforce(
            event_id_assigned_by_source="0035e00000AbCdEAAZ:UserBecameDonor:2026-10-22T14:03:11.000Z",
            occurred_at_according_to_source=datetime(2026, 10, 22, tzinfo=timezone.utc),
            person=PersonAsIdentifiedBySalesforce(
                email_address=NormalizedEmailAddress("donor@example.org"),
                salesforce_contact_id="0035e00000AbCdEAAZ",
                classy_supporter_id=5827,
            ),
        )

    @pytest.mark.parametrize("optional_path", [("donation",), ("person", "classySupporterId")])
    def test_nullable_fields_may_be_null(self, optional_path):
        """donation and classySupporterId are nullable in the contract."""
        assert isinstance(parse_salesforce_payload(body_of(payload_with(optional_path, None)), {}), UserBecameDonorAccordingToSalesforce)

    def test_an_unknown_event_type_is_ignored(self):
        """New Flows can ship in Salesforce before Sefaria supports them, without errors or retries."""
        assert parse_salesforce_payload(body_of(payload_with(("eventType",), "UserBecameNonDonor")), {}) == WebhookEventIgnored(
            ReasonWebhookEventWasIgnored.UNHANDLED_EVENT_TYPE)

    @pytest.mark.parametrize("payload", [
        payload_with(("source",), "classy"),
        payload_without("source"),
        payload_without("eventType"),
        payload_without("sourceEventId"),
        payload_with(("sourceEventId",), ""),
        payload_without("occurredAt"),
        payload_with(("occurredAt",), "2026-10-22T00:00:00"),   # no offset: our contract requires one
        payload_with(("occurredAt",), "last tuesday"),
        payload_without("person"),
        payload_without("person", "email"),
        payload_with(("person", "email"), "not-an-address"),
        payload_without("person", "salesforceContactId"),
        payload_with(("person", "classySupporterId"), "5827"),
        payload_with(("person", "classySupporterId"), True),
        payload_with(("donation",), {"amount": True, "currency": "USD", "frequency": "one-time"}),
        payload_with(("donation",), {"amount": "36", "currency": "USD", "frequency": "one-time"}),
        payload_with(("donation",), {"amount": 36}),
    ])
    def test_contract_violations_are_malformed(self, payload):
        """A Flow pointed at the wrong endpoint or sending the wrong shape gets a clear 400."""
        assert parse_salesforce_payload(body_of(payload), {}) == MalformedWebhookPayload()

    @pytest.mark.parametrize("body", [b"not json", b"[]", b"null"])
    def test_unreadable_bodies_are_malformed(self, body):
        """Non-JSON or non-object bodies never crash the parser."""
        assert parse_salesforce_payload(body, {}) == MalformedWebhookPayload()
