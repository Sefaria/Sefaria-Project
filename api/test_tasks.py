"""
Tests for api/tasks.py: copying a new user's learning level from ActiveCampaign.
"""
from types import SimpleNamespace
from unittest.mock import patch

from api import tasks
from api.newsletter_service import NewsletterServiceError, REGISTRATION_PROVIDER_TIMEOUT
from sefaria.celery_setup.config import CeleryQueue


def make_profile(learning_level=None):
    return SimpleNamespace(id=7, email="new@example.com", learning_level=learning_level)


def run_immediately(callback):
    """Stand-in for transaction.on_commit: run the callback as if the commit just happened."""
    callback()


class TestCopyLearningLevelFromAcTask:
    """Tests for the Celery task that runs in the worker"""

    @patch("api.tasks.copy_learning_level_to_new_profile")
    def test_task_copies_for_user(self, mock_copy):
        result = tasks.copy_learning_level_from_ac_task.apply(args=[7])

        assert result.successful()
        mock_copy.assert_called_once_with(7)

    @patch("api.tasks.copy_learning_level_to_new_profile")
    def test_task_first_fail_second_succeeds(self, mock_copy):
        mock_copy.side_effect = [NewsletterServiceError("AC down"), 4]

        result = tasks.copy_learning_level_from_ac_task.apply(args=[7])

        # initial attempt + 1 retry = 2 calls
        assert mock_copy.call_count == 2
        assert result.successful()

    @patch("api.tasks.sentry_sdk.capture_exception")
    @patch("api.tasks.copy_learning_level_to_new_profile")
    def test_task_final_failure_reports_to_sentry(self, mock_copy, mock_capture):
        mock_copy.side_effect = NewsletterServiceError("AC down")

        tasks.copy_learning_level_from_ac_task.apply(args=[7])

        assert mock_copy.call_count == 2
        mock_capture.assert_called_once()


class TestDispatchCopyLearningLevelFromAc:
    """Tests for starting the copy during registration"""

    @patch("api.tasks.copy_learning_level_to_new_profile")
    @patch("api.tasks.copy_learning_level_from_ac_task")
    @patch("api.tasks.is_newsletter_service_configured", return_value=False)
    def test_dispatch_skips_when_ac_not_configured(self, _mock_configured, mock_task, mock_copy):
        for celery_enabled in (True, False):
            with patch("api.tasks.CELERY_ENABLED", celery_enabled):
                tasks.dispatch_copy_learning_level_from_ac(make_profile())

        mock_task.apply_async.assert_not_called()
        mock_copy.assert_not_called()

    @patch("api.tasks.copy_learning_level_to_new_profile")
    @patch("api.tasks.copy_learning_level_from_ac_task")
    @patch("api.tasks.is_newsletter_service_configured", return_value=True)
    def test_dispatch_keeps_existing_level(self, _mock_configured, mock_task, mock_copy):
        """A profile that already has a level (e.g. a seed account) keeps it"""
        for celery_enabled in (True, False):
            with patch("api.tasks.CELERY_ENABLED", celery_enabled):
                tasks.dispatch_copy_learning_level_from_ac(make_profile(learning_level=2))

        mock_task.apply_async.assert_not_called()
        mock_copy.assert_not_called()

    @patch("api.tasks.CELERY_ENABLED", True)
    @patch("api.tasks.copy_learning_level_to_new_profile")
    @patch("api.tasks.copy_learning_level_from_ac_task")
    @patch("api.tasks.is_newsletter_service_configured", return_value=True)
    def test_dispatch_celery_enabled_queues_after_commit(self, _mock_configured, mock_task, mock_copy):
        """With Celery on, nothing talks to AC during registration; the task is queued after the commit"""
        with patch("api.tasks.transaction.on_commit") as mock_on_commit:
            tasks.dispatch_copy_learning_level_from_ac(make_profile())

            # Nothing is queued until the database commit happens
            mock_task.apply_async.assert_not_called()
            mock_on_commit.assert_called_once()
            mock_on_commit.call_args.args[0]()  # the commit happens

        mock_task.apply_async.assert_called_once_with(args=[7], queue=CeleryQueue.TASKS.value)
        mock_copy.assert_not_called()

    @patch("api.tasks.CELERY_ENABLED", True)
    @patch("api.tasks.transaction.on_commit", side_effect=run_immediately)
    @patch("api.tasks.copy_learning_level_from_ac_task")
    @patch("api.tasks.is_newsletter_service_configured", return_value=True)
    def test_dispatch_queue_failure_never_raises(self, _mock_configured, mock_task, _mock_on_commit):
        """If the queue (Redis) is down, registration still succeeds"""
        mock_task.apply_async.side_effect = ConnectionError("redis down")

        tasks.dispatch_copy_learning_level_from_ac(make_profile())

        mock_task.apply_async.assert_called_once()

    @patch("api.tasks.CELERY_ENABLED", False)
    @patch("api.tasks.copy_learning_level_to_new_profile", return_value=4)
    @patch("api.tasks.copy_learning_level_from_ac_task")
    @patch("api.tasks.is_newsletter_service_configured", return_value=True)
    def test_dispatch_celery_disabled_copies_right_away(self, _mock_configured, mock_task, mock_copy):
        profile = make_profile()

        tasks.dispatch_copy_learning_level_from_ac(profile)

        mock_copy.assert_called_once_with(7, timeout=REGISTRATION_PROVIDER_TIMEOUT)
        mock_task.apply_async.assert_not_called()
        # The in-memory profile matches what was saved
        assert profile.learning_level == 4

    @patch("api.tasks.CELERY_ENABLED", False)
    @patch("api.tasks.copy_learning_level_to_new_profile")
    @patch("api.tasks.is_newsletter_service_configured", return_value=True)
    def test_dispatch_celery_disabled_ac_failure_never_raises(self, _mock_configured, mock_copy):
        """If AC is down, registration carries on without a learning level"""
        mock_copy.side_effect = NewsletterServiceError("AC down")
        profile = make_profile()

        tasks.dispatch_copy_learning_level_from_ac(profile)

        assert profile.learning_level is None
