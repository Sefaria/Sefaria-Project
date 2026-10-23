"""
View tests for webhooks/views.py: the whole response table (spec §5.4) through Django's test
Client. The dispatcher is patched, so nothing is queued and no profile is touched.

Requires the services a full request needs: resolving any URL imports reader.views, which
imports sefaria.model (Mongo), and the middleware stack may also use the configured cache or
Redis. Without them these tests fail on connection errors, not on assertions.
"""

import json
import logging
from datetime import datetime, timezone

import pytest
from django.test import Client
from structlog.testing import capture_logs

from webhooks import views
from webhooks.adapters import classy_webhook, salesforce_webhook
from webhooks.adapters.svix_signature import svix_signature_for
from webhooks.dispatcher import EventCouldNotBeEnqueued, ProcessingMode

CLASSY_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
SALESFORCE_SECRET = "test-salesforce-webhook-secret-0123456789"
DONOR_EMAIL = "secret-donor-address@example.org"
CARD_NUMBER = "4111111111111111"
# Shaped like a Svix secret ("whsec_" + base64 of "wrong-secret-that-must-not-be-logged") so it
# can sign a Classy request too; it is still just a string to the Salesforce header check.
WRONG_SECRET = "whsec_d3Jvbmctc2VjcmV0LXRoYXQtbXVzdC1ub3QtYmUtbG9nZ2Vk"

SALESFORCE_PAYLOAD = {
    "source": "salesforce",
    "eventType": "UserBecameDonor",
    "sourceEventId": "003:UserBecameDonor:2026-10-22T14:03:11.000Z",
    "occurredAt": "2026-10-22T00:00:00Z",
    "person": {"email": DONOR_EMAIL, "salesforceContactId": "003", "classySupporterId": None},
    "donation": None,
}

CLASSY_PAYLOAD = {"eventType": "transaction.created", "data": {
    "id": 1, "supporter_id": 5827, "status": "success", "donation_gross_amount": 18,
    "updated_at": "2026-10-22T14:03:11+0000"}}


@pytest.fixture(autouse=True)
def configured_secrets(monkeypatch):
    monkeypatch.setattr(classy_webhook, "CLASSY_WEBHOOK_SECRET", CLASSY_SECRET)
    monkeypatch.setattr(salesforce_webhook, "SALESFORCE_WEBHOOK_SECRET", SALESFORCE_SECRET)


@pytest.fixture
def enqueued(monkeypatch):
    events = []

    def fake_enqueue(event):
        events.append(event)
        return ProcessingMode.QUEUED

    monkeypatch.setattr(views, "enqueue_event_for_processing", fake_enqueue)
    return events


# enforce_csrf_checks=True on every POST: the Django test Client skips CSRF by default, which
# would hide a removed @csrf_exempt. Real senders never send a CSRF token.
def post_salesforce(payload=SALESFORCE_PAYLOAD, secret=SALESFORCE_SECRET, raw_body=None):
    body = raw_body if raw_body is not None else json.dumps(payload).encode()
    headers = {"X-Sefaria-Webhook-Secret": secret} if secret is not None else {}
    return Client(enforce_csrf_checks=True).post("/api/webhooks/salesforce", data=body, content_type="application/json", headers=headers)


CLASSY_PAYLOAD_WITH_CARD_DETAILS = {"eventType": "transaction.created", "data": {
    **CLASSY_PAYLOAD["data"], "member_email_address": DONOR_EMAIL, "card_number": CARD_NUMBER}}


def post_classy(payload=CLASSY_PAYLOAD, secret=CLASSY_SECRET):
    body = json.dumps(payload).encode()
    timestamp = int(datetime.now(tz=timezone.utc).timestamp())
    headers = {"svix-id": "msg_1", "svix-timestamp": str(timestamp),
               "svix-signature": svix_signature_for(secret, "msg_1", timestamp, body)}
    return Client(enforce_csrf_checks=True).post("/api/webhooks/classy", data=body, content_type="application/json", headers=headers)


# ============================================================================
# The response table
# ============================================================================

class TestResponses:

    def test_accepted_events_answer_202_with_processing_mode(self, enqueued):
        """The body tells the sender (and the e2e test) whether processing was queued or inline."""
        response = post_salesforce()
        assert response.status_code == 202
        assert response.json() == {"status": "accepted", "processing_mode": "queued"}
        assert len(enqueued) == 1

    def test_classy_accepted_through_its_own_route(self, enqueued):
        """The Classy route uses the Svix adapter and reaches the same dispatcher."""
        response = post_classy()
        assert response.status_code == 202
        assert enqueued[0].event_id_assigned_by_source == "msg_1"

    def test_ignored_events_answer_200_with_the_reason(self, enqueued):
        """Whoever debugs a Flow sees why an event wasn't applied, without server logs."""
        response = post_salesforce({**SALESFORCE_PAYLOAD, "eventType": "UserBecameNonDonor"})
        assert response.status_code == 200
        assert response.json() == {"status": "ignored", "reason": "unhandled_event_type"}
        assert enqueued == []

    def test_malformed_payloads_answer_400(self, enqueued):
        """Unreadable bodies are rejected after verification, never enqueued."""
        response = post_salesforce(raw_body=b"not json")
        assert response.status_code == 400
        assert response.json() == {"error": "malformed_payload"}
        assert enqueued == []

    def test_bad_secret_answers_401(self, enqueued):
        """The signature is checked before the body is parsed."""
        response = post_salesforce(secret="wrong", raw_body=b"not json")
        assert response.status_code == 401
        assert response.json() == {"error": "invalid_signature"}
        assert enqueued == []

    @pytest.mark.parametrize("source, post, module, setting", [
        ("salesforce", post_salesforce, salesforce_webhook, "SALESFORCE_WEBHOOK_SECRET"),
        ("classy", post_classy, classy_webhook, "CLASSY_WEBHOOK_SECRET"),
    ])
    def test_unset_secret_answers_503_naming_the_source(self, monkeypatch, enqueued, source, post, module, setting):
        """Fail closed, and let the sender retry until ops sets the secret."""
        monkeypatch.setattr(module, setting, None)
        response = post()
        assert response.status_code == 503
        assert response.json() == {"error": f"{source}_webhook_not_configured"}
        assert enqueued == []

    def test_enqueue_failure_answers_503(self, monkeypatch):
        """Redis down → 503 → sender retries, so nothing is lost."""
        def failing_enqueue(event):
            raise EventCouldNotBeEnqueued()

        monkeypatch.setattr(views, "enqueue_event_for_processing", failing_enqueue)
        response = post_salesforce()
        assert response.status_code == 503
        assert response.json() == {"error": "enqueue_failed"}

    def test_get_is_not_allowed(self):
        """Webhooks are POST only."""
        assert Client().get("/api/webhooks/salesforce").status_code == 405

    def test_trailing_slash_is_accepted(self, enqueued):
        """Senders configured with or without a trailing slash both work."""
        response = Client(enforce_csrf_checks=True).post("/api/webhooks/salesforce/", data=json.dumps(SALESFORCE_PAYLOAD).encode(),
                                 content_type="application/json", headers={"X-Sefaria-Webhook-Secret": SALESFORCE_SECRET})
        assert response.status_code == 202


# ============================================================================
# Logs never carry secrets or email addresses
# ============================================================================

class TestNoSecretsOrEmailsInLogs:

    @pytest.mark.parametrize("post_with_secret, valid_secret, sensitive_values", [
        pytest.param(lambda secret: post_salesforce(secret=secret), SALESFORCE_SECRET, [DONOR_EMAIL], id="salesforce"),
        pytest.param(lambda secret: post_classy(CLASSY_PAYLOAD_WITH_CARD_DETAILS, secret=secret), CLASSY_SECRET,
                     [DONOR_EMAIL, CARD_NUMBER], id="classy"),
    ])
    @pytest.mark.parametrize("presented_secret_is_valid", [True, False])
    def test_nothing_sensitive_reaches_structlog_or_stdlib_logging(
            self, enqueued, caplog, post_with_secret, valid_secret, sensitive_values, presented_secret_is_valid):
        """Every log line from a request, accepted or rejected, is free of the secrets, the card value and the donor's address."""
        caplog.set_level(logging.DEBUG)
        with capture_logs() as structured_logs:
            post_with_secret(valid_secret if presented_secret_is_valid else WRONG_SECRET)
        everything_logged = repr(structured_logs) + caplog.text
        for sensitive_value in [*sensitive_values, SALESFORCE_SECRET, CLASSY_SECRET, WRONG_SECRET]:
            assert sensitive_value not in everything_logged
