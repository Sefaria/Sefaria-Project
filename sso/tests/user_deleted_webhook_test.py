import hashlib
import hmac
import json
import sys
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import requests
from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, override_settings

sys._called_from_test = True

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.model.user_profile import UserProfile
from sefaria.utils.user import delete_user_account
from sso import tasks
from sso.user_deleted_webhook import build_user_deleted_body, queue_user_deleted_webhooks, sign_body

SECRET = "test-webhook-secret"
URLS = ["https://social.example.test/api/v1/internal/user-deleted", "https://other.example.test/hook"]


def _expected_signature(body: str) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()


@patch("sefaria.utils.user.CrmMediator", MagicMock())
@patch("sefaria.settings.CELERY_ENABLED", True)
class DeleteUserAccountQueuesWebhookTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("socialdelete")
        self.uid = self.user.id
        purge_test_profiles(self.uid)
        UserProfile(id=self.uid).save()

    def tearDown(self):
        purge_test_profiles(self.uid)

    @override_settings(USER_DELETED_WEBHOOK_URLS=URLS, USER_DELETED_WEBHOOK_SECRET=SECRET)
    def test_queues_exactly_one_task_per_url_with_a_correct_signature(self):
        with patch.object(tasks.send_user_deleted_webhook, "apply_async") as apply_async:
            self.assertTrue(delete_user_account(self.uid, confirm=False))

        self.assertFalse(User.objects.filter(id=self.uid).exists())
        self.assertEqual(apply_async.call_count, len(URLS))
        queued = [call.kwargs["args"] for call in apply_async.call_args_list]
        self.assertEqual([url for url, _body in queued], URLS)
        bodies = {body for _url, body in queued}
        self.assertEqual(len(bodies), 1, "every URL gets the same event, byte for byte")
        body = bodies.pop()
        payload = json.loads(body)
        self.assertEqual(payload["event"], "user.deleted")
        self.assertEqual(payload["user_id"], self.uid)
        self.assertTrue(payload["id"])
        self.assertTrue(payload["occurred_at"].endswith("Z"))
        self.assertNotIn(
            SECRET, json.dumps(apply_async.call_args_list, default=str), "secret must not go to the broker"
        )

        # The worker signs the queued body; the receiver's check must pass.
        with patch("sso.tasks.requests.post", return_value=MagicMock(status_code=204)) as post:
            tasks.send_user_deleted_webhook(*queued[0])
        sent_headers = post.call_args.kwargs["headers"]
        self.assertEqual(post.call_args.kwargs["data"], body.encode())
        self.assertEqual(sent_headers["X-Sefaria-Signature"], _expected_signature(body))
        self.assertEqual(sent_headers["X-Sefaria-Event-Id"], payload["id"])

    @override_settings(USER_DELETED_WEBHOOK_URLS=[], USER_DELETED_WEBHOOK_SECRET=SECRET)
    def test_no_task_when_no_urls(self):
        with patch.object(tasks.send_user_deleted_webhook, "apply_async") as apply_async:
            self.assertTrue(delete_user_account(self.uid, confirm=False))
        apply_async.assert_not_called()

    @override_settings(USER_DELETED_WEBHOOK_URLS=URLS, USER_DELETED_WEBHOOK_SECRET=SECRET)
    def test_broker_failure_does_not_block_the_delete(self):
        with patch.object(tasks.send_user_deleted_webhook, "apply_async", side_effect=ConnectionError("down")):
            self.assertTrue(delete_user_account(self.uid, confirm=False))
        self.assertFalse(User.objects.filter(id=self.uid).exists())


@override_settings(USER_DELETED_WEBHOOK_URLS=URLS, USER_DELETED_WEBHOOK_SECRET=None)
class QueueWithoutSecretTest(SimpleTestCase):
    def test_nothing_queued_without_a_secret(self):
        with patch.object(tasks.send_user_deleted_webhook, "apply_async") as apply_async:
            self.assertEqual(queue_user_deleted_webhooks(7), 0)
        apply_async.assert_not_called()


class BodyAndSignatureTest(SimpleTestCase):
    def test_body_is_compact_sorted_json(self):
        body = build_user_deleted_body(
            42, occurred_at=datetime(2026, 11, 23, 1, 2, 3, tzinfo=UTC), event_id="00000000-0000-4000-8000-000000000000"
        )
        self.assertEqual(
            body,
            '{"event":"user.deleted","id":"00000000-0000-4000-8000-000000000000",'
            '"occurred_at":"2026-11-23T01:02:03Z","user_id":42}',
        )

    def test_sign_body_known_vector(self):
        # Receivers can check their implementation against this vector.
        body = b'{"event":"user.deleted","id":"x","occurred_at":"2026-11-23T01:02:03Z","user_id":42}'
        expected = "sha256=5a26b7ac2ff4e75aeec9a4dfa56aab52601ce60bb5435b0b44ac82515678a165"
        self.assertEqual(sign_body("secret", body), expected)


@override_settings(USER_DELETED_WEBHOOK_SECRET=SECRET)
class SendTaskRetryTest(SimpleTestCase):
    """
    Runs the task body as a worker would (a pushed request with called_directly=False), without
    Task.apply, which needs a result backend.
    """

    body = build_user_deleted_body(5)
    task = tasks.send_user_deleted_webhook

    def _run_as_worker(self, retries=0):
        self.task.push_request(retries=retries, called_directly=False)
        try:
            return self.task.run(URLS[0], self.body)
        finally:
            self.task.pop_request()

    def test_server_error_retries(self):
        with (
            patch.object(self.task, "retry", side_effect=RuntimeError("retry")) as retry,
            patch("sso.tasks.requests.post", return_value=MagicMock(status_code=503)),
            self.assertRaises(RuntimeError),
        ):
            self._run_as_worker()
        retry.assert_called_once()
        self.assertEqual(retry.call_args.kwargs["countdown"], 30)

    def test_network_error_retries(self):
        with (
            patch.object(self.task, "retry", side_effect=RuntimeError("retry")) as retry,
            patch("sso.tasks.requests.post", side_effect=requests.ConnectionError()),
            self.assertRaises(RuntimeError),
        ):
            self._run_as_worker()
        retry.assert_called_once()

    def test_client_error_does_not_retry(self):
        with (
            patch.object(self.task, "retry") as retry,
            patch("sso.tasks.requests.post", return_value=MagicMock(status_code=401)),
        ):
            self._run_as_worker()
        retry.assert_not_called()

    def test_gives_up_quietly_after_max_retries(self):
        with (
            patch.object(self.task, "retry") as retry,
            patch("sso.tasks.requests.post", return_value=MagicMock(status_code=500)) as post,
        ):
            self._run_as_worker(retries=tasks.MAX_RETRIES)
        post.assert_called_once()
        retry.assert_not_called()

    def test_request_has_timeouts(self):
        with patch("sso.tasks.requests.post", return_value=MagicMock(status_code=200)) as post:
            self._run_as_worker()
        self.assertEqual(post.call_args.kwargs["timeout"], tasks.REQUEST_TIMEOUT)

    def test_called_directly_never_raises(self):
        with patch("sso.tasks.requests.post", side_effect=requests.Timeout()):
            self.task(URLS[0], self.body)
