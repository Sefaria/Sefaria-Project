"""
Unit tests for webhooks/adapters/classy_webhook.py.

Signatures are generated FRESH on every run with svix's own signer and the current time.
Replaying a recorded signature would fail the library's 5-minute timestamp tolerance; the
body is the durable artifact, the signature is always regenerated.

The fixture's envelope shape is an assumption until a real GoFundMe Pro delivery is captured
(spec §12 item 1) — replace the fixture with the redacted capture and re-run these tests.
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from svix.webhooks import Webhook

from sefaria.donors.types import DonationReceivedFromClassy, NormalizedEmailAddress, PersonAsIdentifiedByClassy
from webhooks.adapters import classy_webhook
from webhooks.adapters.classy_webhook import parse_classy_transaction_payload, verify_classy_request_signature
from webhooks.webhook_source_adapter import (
    MalformedWebhookPayload,
    ReasonWebhookEventWasIgnored,
    SignatureRejected,
    SignatureVerified,
    WebhookEventIgnored,
    WebhookSecretNotConfigured,
)

TEST_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "classy_transaction_created.json").read_text())
PARSE_HEADERS = {"svix-id": "msg_parse"}   # parsing never verifies, so no signature is needed
ALL_CLASSY_TRANSACTION_STATUSES = ["test", "canceled", "incomplete", "success", "refunded",
                                   "cb_lost", "cb_initiated", "voided", "pending", "failed"]


def signed_headers(body: bytes, message_id="msg_2Kx", signed_at=None, secret=TEST_SECRET):
    signed_at = signed_at or datetime.now(tz=timezone.utc)
    signature = Webhook(secret).sign(message_id, signed_at, body.decode())
    # Title-case on purpose: Django delivers headers that way, and verification must not care.
    return {"Svix-Id": message_id, "Svix-Timestamp": str(int(signed_at.timestamp())), "Svix-Signature": signature}


def payload_with(**transaction_overrides):
    return {**FIXTURE, "data": {**FIXTURE["data"], **transaction_overrides}}


def body_of(payload) -> bytes:
    return json.dumps(payload).encode()


@pytest.fixture(autouse=True)
def classy_secret(monkeypatch):
    monkeypatch.setattr(classy_webhook, "CLASSY_WEBHOOK_SECRET", TEST_SECRET)


# ============================================================================
# Signature verification
# ============================================================================

class TestVerifyClassyRequestSignature:

    def test_accepts_a_freshly_signed_body(self):
        """A body signed with our secret just now verifies."""
        body = body_of(FIXTURE)
        assert verify_classy_request_signature(body, signed_headers(body)) == SignatureVerified()

    def test_rejects_a_tampered_body(self):
        """Changing the donation amount after signing breaks the signature."""
        body = body_of(FIXTURE)
        headers = signed_headers(body)
        # Built from the fixture's own amount, so the tampering can't silently become a no-op
        # (which would make this test pass for the wrong reason) when the fixture changes.
        tampered_body = body_of(payload_with(donation_gross_amount=FIXTURE["data"]["donation_gross_amount"] * 10))
        assert tampered_body != body
        assert verify_classy_request_signature(tampered_body, headers) == SignatureRejected()

    def test_rejects_an_expired_signature(self):
        """A delivery signed more than 5 minutes ago is refused (replay protection)."""
        body = body_of(FIXTURE)
        stale = signed_headers(body, signed_at=datetime.now(tz=timezone.utc) - timedelta(minutes=10))
        assert verify_classy_request_signature(body, stale) == SignatureRejected()

    def test_rejects_missing_signature_headers(self):
        """No Svix headers at all is a rejection, not a crash."""
        assert verify_classy_request_signature(body_of(FIXTURE), {}) == SignatureRejected()

    def test_rejects_a_body_signed_with_another_secret(self):
        """Someone else's Svix endpoint secret does not verify against ours."""
        body = body_of(FIXTURE)
        other = signed_headers(body, secret="whsec_" + "A" * 32)
        assert verify_classy_request_signature(body, other) == SignatureRejected()

    @pytest.mark.parametrize("unset", [None, ""])
    def test_an_unset_secret_reports_not_configured(self, monkeypatch, unset):
        """Fail closed: an unset secret must never read as an empty secret that anything matches."""
        monkeypatch.setattr(classy_webhook, "CLASSY_WEBHOOK_SECRET", unset)
        body = body_of(FIXTURE)
        assert verify_classy_request_signature(body, signed_headers(body)) == WebhookSecretNotConfigured("CLASSY_WEBHOOK_SECRET")


# ============================================================================
# Payload parsing
# ============================================================================

class TestParseClassyTransactionPayload:

    def test_a_successful_donation_becomes_an_event(self):
        """The fixture's success transaction becomes DonationReceivedFromClassy with svix-id as its event id."""
        body = body_of(FIXTURE)
        event = parse_classy_transaction_payload(body, {"svix-id": "msg_2Kx"})
        assert event == DonationReceivedFromClassy(
            event_id_assigned_by_source="msg_2Kx",
            occurred_at_according_to_source=datetime(2026, 10, 23, 3, 20, 35, tzinfo=timezone.utc),
            person=PersonAsIdentifiedByClassy(
                classy_supporter_id=5827, email_address=NormalizedEmailAddress("donor@example.org")),
            classy_transaction_id=9876543,
        )

    def test_sensitive_fields_never_reach_the_event(self):
        """Card, address, name, phone and payment-processor data appear nowhere in what we keep."""
        body = body_of(FIXTURE)
        event = parse_classy_transaction_payload(body, PARSE_HEADERS)
        kept = repr(event)
        # Values from the fixture, which is a real GoFundMe Pro delivery with placeholder
        # personal details (Stripe's test card, a 555 phone number, a public landmark's address).
        for sensitive in ("4242", "203012", "Touro", "Maimonides", "555-5555", "pi_0000"):
            assert sensitive not in kept

    @pytest.mark.parametrize("status", ALL_CLASSY_TRANSACTION_STATUSES)
    def test_only_success_counts_as_a_donation(self, status):
        """Of all 10 GoFundMe Pro statuses, only `success` means money arrived (so `test` never counts)."""
        body = body_of(payload_with(status=status))
        result = parse_classy_transaction_payload(body, PARSE_HEADERS)
        if status == "success":
            assert isinstance(result, DonationReceivedFromClassy)
        else:
            assert result == WebhookEventIgnored(ReasonWebhookEventWasIgnored.NOT_A_SUCCESSFUL_NONZERO_DONATION)

    @pytest.mark.parametrize("amount", [0, 0.0, -5])
    def test_a_zero_or_negative_amount_is_ignored(self, amount):
        """A $0 'success' is not a donation."""
        body = body_of(payload_with(donation_gross_amount=amount))
        assert parse_classy_transaction_payload(body, PARSE_HEADERS) == WebhookEventIgnored(
            ReasonWebhookEventWasIgnored.NOT_A_SUCCESSFUL_NONZERO_DONATION)

    def test_transaction_updated_is_handled_like_created(self):
        """A pending transaction that later succeeds arrives as transaction.updated."""
        payload = {**FIXTURE, "eventType": "transaction.updated"}
        body = body_of(payload)
        assert isinstance(parse_classy_transaction_payload(body, PARSE_HEADERS), DonationReceivedFromClassy)

    def test_without_member_email_address_the_person_has_no_address(self):
        """The task falls back to the supporter lookup in this case."""
        data = {k: v for k, v in FIXTURE["data"].items() if k != "member_email_address"}
        body = body_of({**FIXTURE, "data": data})
        event = parse_classy_transaction_payload(body, PARSE_HEADERS)
        assert event.person.email_address is None

    def test_other_event_types_are_ignored(self):
        """Subscribing to more events in the portal must not cause errors or retries."""
        body = body_of({"eventType": "campaign.updated", "data": {}})
        assert parse_classy_transaction_payload(body, PARSE_HEADERS) == WebhookEventIgnored(
            ReasonWebhookEventWasIgnored.UNHANDLED_EVENT_TYPE)

    @pytest.mark.parametrize("body", [
        b"not json",
        b"[]",
        json.dumps({"data": {}}).encode(),
        json.dumps({"eventType": "transaction.created", "data": "nope"}).encode(),
        body_of(payload_with(supporter_id=None)),
        body_of(payload_with(supporter_id=True)),
        body_of(payload_with(donation_gross_amount=True)),
        body_of(payload_with(updated_at="yesterday")),
    ])
    def test_malformed_bodies_are_reported_as_malformed(self, body):
        """Anything we can't read as the contract is a 400, never a crash or a silent accept."""
        assert parse_classy_transaction_payload(body, {"svix-id": "msg_x"}) == MalformedWebhookPayload()

    def test_webhook_id_is_used_when_svix_id_is_absent(self):
        """The Standard Webhooks spelling of the id header is accepted too."""
        body = body_of(FIXTURE)
        event = parse_classy_transaction_payload(body, {"Webhook-Id": "msg_std"})
        assert event.event_id_assigned_by_source == "msg_std"

    def test_a_successful_donation_without_any_id_header_is_malformed(self):
        """Without the svix id there is no idempotency key, so the delivery is rejected."""
        assert parse_classy_transaction_payload(body_of(FIXTURE), {}) == MalformedWebhookPayload()
