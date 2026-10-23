"""
Tests for the webhook scrub in sefaria/settings_utils.py.

If a webhook view ever raised, Sentry's request context would carry the request headers —
including the shared secret — and possibly the parsed body, which for Classy holds card,
account and billing details. remove_webhook_secrets_and_payloads deletes both.
"""

import sentry_sdk

from sefaria import settings_utils
from sefaria.settings_utils import remove_webhook_secrets_and_payloads

WEBHOOK_URL = "https://www.sefaria.org/api/webhooks/classy"
NON_WEBHOOK_URL = "https://www.sefaria.org/api/texts/Genesis.1"


def event_with_frame_variables(url):
    """An error event shaped like the one the Django integration builds: request context plus one stack frame."""
    return {
        "request": {"url": url, "headers": {"X-Sefaria-Webhook-Secret": "s3cret"}, "data": {"card_number": "4111"}},
        "exception": {"values": [{"stacktrace": {"frames": [
            {"function": "receive_webhook", "vars": {"raw_body": "card details", "presented_secret": "s3cret"}}]}}]},
    }


def first_frame(event):
    return event["exception"]["values"][0]["stacktrace"]["frames"][0]


class TestRemoveWebhookSecretHeaders:

    def test_removes_all_secret_headers_in_any_case(self):
        """Header case varies by proxy, so matching is case-insensitive; other headers stay."""
        event = {"request": {"headers": {
            "X-Sefaria-Webhook-Secret": "s3cret", "svix-signature": "v1,abc", "Webhook-Signature": "v1,def",
            "Content-Type": "application/json"}}}
        assert remove_webhook_secrets_and_payloads(event) == {"request": {"headers": {"Content-Type": "application/json"}}}

    def test_events_without_request_headers_are_untouched(self):
        """Non-request events pass through unchanged."""
        assert remove_webhook_secrets_and_payloads({"exception": {}}) == {"exception": {}}

    def test_headers_in_a_shape_that_cannot_be_filtered_are_dropped(self):
        """A list of pairs could hide the secret header, so it must not pass through."""
        event = {"request": {"url": NON_WEBHOOK_URL, "headers": [["X-Sefaria-Webhook-Secret", "s3cret"]]}}
        assert remove_webhook_secrets_and_payloads(event) == {"request": {"url": NON_WEBHOOK_URL}}

    def test_request_set_to_none_passes_through_unchanged(self):
        """A null request context must not raise inside before_send."""
        assert remove_webhook_secrets_and_payloads({"request": None}) == {"request": None}


class TestRemoveWebhookPayloads:

    def test_webhook_url_event_loses_body_and_query_string_but_keeps_other_keys(self):
        """The body may hold card and address details; unrelated context is still useful for debugging."""
        event = {"request": {
            "url": "https://www.sefaria.org/api/webhooks/classy",
            "method": "POST",
            "data": {"data": {"card_number": "4111"}},
            "query_string": "x=1",
        }}
        assert remove_webhook_secrets_and_payloads(event) == {"request": {
            "url": "https://www.sefaria.org/api/webhooks/classy", "method": "POST"}}

    def test_non_webhook_url_event_keeps_its_data(self):
        """Only webhook requests are scrubbed of bodies; other errors keep their normal context."""
        event = {"request": {"url": "https://www.sefaria.org/api/texts/Genesis.1", "data": {"a": 1}, "query_string": "x=1"}}
        assert remove_webhook_secrets_and_payloads(event) == {"request": {
            "url": "https://www.sefaria.org/api/texts/Genesis.1", "data": {"a": 1}, "query_string": "x=1"}}

    def test_webhook_url_event_loses_stack_frame_local_variables(self):
        """Frame locals hold raw_body, headers and presented_secret, so they must not reach Sentry."""
        event = remove_webhook_secrets_and_payloads(event_with_frame_variables(WEBHOOK_URL))
        assert "vars" not in first_frame(event)
        assert first_frame(event)["function"] == "receive_webhook"

    def test_non_webhook_url_event_keeps_stack_frame_local_variables(self):
        """Local variables stay on for the rest of the site, where they help debugging."""
        event = remove_webhook_secrets_and_payloads(event_with_frame_variables(NON_WEBHOOK_URL))
        assert first_frame(event)["vars"] == {"raw_body": "card details", "presented_secret": "s3cret"}

    def test_url_is_matched_on_its_path_not_anywhere_in_the_string(self):
        """A page that merely mentions the webhook path in its query string keeps its body."""
        event = {"request": {"url": NON_WEBHOOK_URL + "?next=/api/webhooks/", "data": {"a": 1}}}
        assert "data" in remove_webhook_secrets_and_payloads(event)["request"]

    def test_a_url_that_is_not_a_string_is_scrubbed_without_raising(self):
        """Unrecognizable means unsafe: the body goes, and the hook doesn't raise (Sentry would drop the event)."""
        event = {"request": {"url": [WEBHOOK_URL], "data": {"card_number": "4111"}, "query_string": "x=1"}}
        assert remove_webhook_secrets_and_payloads(event) == {"request": {"url": [WEBHOOK_URL]}}

    def test_an_event_without_a_url_keeps_its_data(self):
        """Background events have no request URL; that alone must not strip their debugging context."""
        event = event_with_frame_variables(None)
        assert first_frame(remove_webhook_secrets_and_payloads(event))["vars"] == {"raw_body": "card details", "presented_secret": "s3cret"}


class TestSentryInitWiring:
    """init_sentry must install the scrub on BOTH error events and transaction events."""

    def captured_init_arguments(self, monkeypatch):
        captured = {}
        monkeypatch.setattr(sentry_sdk, "init", lambda **arguments: captured.update(arguments))
        monkeypatch.setattr(settings_utils.remoteConfigCache, "get", lambda key: None)
        settings_utils.init_sentry("https://public@example.invalid/1", "code-version", "test")
        return captured

    def test_before_send_scrubs_a_webhook_event_with_exception_info(self, monkeypatch):
        """The path that inspects exc_info before returning the event."""
        before_send = self.captured_init_arguments(monkeypatch)["before_send"]
        event = event_with_frame_variables(WEBHOOK_URL)
        scrubbed = before_send(event, {"exc_info": (RuntimeError, RuntimeError("boom"), None)})
        assert "data" not in scrubbed["request"] and "headers" in scrubbed["request"]
        assert "x-sefaria-webhook-secret" not in {name.lower() for name in scrubbed["request"]["headers"]}
        assert "vars" not in first_frame(scrubbed)

    def test_before_send_scrubs_a_webhook_event_without_exception_info(self, monkeypatch):
        """The path taken when the hint carries no exc_info."""
        before_send = self.captured_init_arguments(monkeypatch)["before_send"]
        scrubbed = before_send(event_with_frame_variables(WEBHOOK_URL), {})
        assert "data" not in scrubbed["request"]
        assert "vars" not in first_frame(scrubbed)

    def test_before_send_transaction_scrubs_a_webhook_event(self, monkeypatch):
        """Transaction events skip before_send but carry the same request headers."""
        before_send_transaction = self.captured_init_arguments(monkeypatch)["before_send_transaction"]
        event = {"request": {"url": WEBHOOK_URL, "headers": {"svix-signature": "v1,abc"}, "data": {"a": 1}}}
        assert before_send_transaction(event, {}) == {"request": {"url": WEBHOOK_URL, "headers": {}}}


class TestRemoveDonorTaskPayloads:

    def test_the_task_name_matches_the_registered_task(self):
        """settings_utils can't import the task (settings load before apps), so the name is copied; a rename must fail here, not silently stop the scrubbing."""
        from webhooks.tasks import process_event_indicating_person_is_donor_task
        assert settings_utils.DONOR_TASK_NAME == process_event_indicating_person_is_donor_task.name

    def test_donor_failure_without_http_request_loses_arguments_and_all_locals(self):
        event = event_with_frame_variables(NON_WEBHOOK_URL)
        event.pop("request")
        frames = event["exception"]["values"][0]["stacktrace"]["frames"]
        frames.append({"function": "request", "vars": {"client_secret": "oauth-secret"}})
        event["extra"] = {"celery-job": {
            "task_name": settings_utils.DONOR_TASK_NAME,
            "args": [{"email": "donor@example.com"}],
            "kwargs": {"serialized_event": {"email": "donor@example.com"}},
        }, "diagnostic": "keep"}
        scrubbed = remove_webhook_secrets_and_payloads(event)
        assert scrubbed["extra"] == {
            "celery-job": {"task_name": settings_utils.DONOR_TASK_NAME}, "diagnostic": "keep"}
        assert all("vars" not in frame for frame in frames)
        assert frames[1]["function"] == "request"

    def test_donor_transaction_without_celery_job_loses_locals(self):
        event = event_with_frame_variables(NON_WEBHOOK_URL)
        event.pop("request")
        event["transaction"] = settings_utils.DONOR_TASK_NAME
        assert "vars" not in first_frame(remove_webhook_secrets_and_payloads(event))

    def test_unrelated_task_keeps_arguments_and_locals(self):
        event = event_with_frame_variables(NON_WEBHOOK_URL)
        event["extra"] = {"celery-job": {"task_name": "other.task", "args": [1], "kwargs": {}}}
        scrubbed = remove_webhook_secrets_and_payloads(event)
        assert scrubbed["extra"]["celery-job"]["args"] == [1]
        assert "vars" in first_frame(scrubbed)
