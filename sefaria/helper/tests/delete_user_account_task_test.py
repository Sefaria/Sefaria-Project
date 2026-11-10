"""Admin user deletion runs as a Celery task, and the task is safe to re-run."""

from unittest.mock import MagicMock, patch

import pytest
from celery.exceptions import Retry
from django.test import RequestFactory

from sefaria.helper.users import tasks
from sefaria.utils import user as user_utils

# ---------------------------------------------------------------------------
# delete_user_account guards
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("uid", [None, 0])
def test_delete_user_account_refuses_missing_uid(uid):
    with patch.object(user_utils, "db") as db, pytest.raises(ValueError):
        user_utils.delete_user_account(uid, confirm=False)
    db.sheets.delete_many.assert_not_called()


def test_delete_user_account_is_noop_when_user_already_gone():
    with (
        patch.object(user_utils, "db") as db,
        patch.object(user_utils, "User") as User,
        patch.object(user_utils.model, "UserProfile") as UserProfile,
    ):
        User.objects.filter.return_value.exists.return_value = False
        assert user_utils.delete_user_account(42, confirm=False) is True
    UserProfile.assert_not_called()
    assert db.method_calls == []


# ---------------------------------------------------------------------------
# Task retries
# ---------------------------------------------------------------------------


def _run_task(retries):
    task = tasks.delete_user_account_task
    task.push_request(retries=retries)
    try:
        return task.run(7)
    finally:
        task.pop_request()


def test_task_returns_result_on_success():
    with patch("sefaria.utils.user.delete_user_account") as delete:
        assert _run_task(0) == {"uid": 7, "deleted": True}
    delete.assert_called_once_with(7, confirm=False)


def test_task_retries_with_backoff():
    with (
        patch("sefaria.utils.user.delete_user_account", side_effect=RuntimeError("mongo down")),
        patch.object(tasks.delete_user_account_task, "retry", side_effect=Retry()) as retry,
        pytest.raises(Retry),
    ):
        _run_task(1)
    assert retry.call_args.kwargs["countdown"] == 120


def test_task_reports_after_last_retry():
    with (
        patch("sefaria.utils.user.delete_user_account", side_effect=RuntimeError("mongo down")),
        patch.object(tasks.delete_user_account_task, "retry") as retry,
        patch.object(tasks.sentry_sdk, "capture_exception") as capture,
        pytest.raises(RuntimeError),
    ):
        _run_task(tasks.DELETE_USER_MAX_RETRIES)
    retry.assert_not_called()
    capture.assert_called_once()


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


def test_queue_uses_celery_when_enabled():
    with (
        patch.object(tasks, "CELERY_ENABLED", True),
        patch.object(tasks.delete_user_account_task, "apply_async") as apply_async,
    ):
        result = tasks.queue_user_account_deletion(7)
    apply_async.assert_called_once_with(args=[7], queue=tasks.CeleryQueue.TASKS.value)
    assert result is apply_async.return_value


def test_queue_runs_inline_without_celery():
    with patch.object(tasks, "CELERY_ENABLED", False), patch("sefaria.utils.user.delete_user_account") as delete:
        assert tasks.queue_user_account_deletion(7) is None
    delete.assert_called_once_with(7, confirm=False)


# ---------------------------------------------------------------------------
# Admin view
# ---------------------------------------------------------------------------


def _post(email):
    from sefaria import views

    request = RequestFactory().post("/admin/delete/user-account", {"email": email, "password": "pw"})
    request.user = MagicMock(is_active=True, is_staff=True, id=1)
    return views.delete_user_by_email(request)


def _mock_users(User, matching_ids):
    User.objects.get.return_value.check_password.return_value = True
    User.objects.filter.return_value.values_list.return_value = matching_ids


def test_view_queues_deletion_and_returns_202():
    with (
        patch("django.contrib.auth.models.User") as User,
        patch("sefaria.helper.users.tasks.queue_user_account_deletion") as queue,
    ):
        _mock_users(User, [99])
        queue.return_value = MagicMock(id="task-1")
        response = _post("someone@example.com")
    queue.assert_called_once_with(99)
    assert response.status_code == 202
    assert b"task-1" in response.content


def test_view_rejects_unknown_email_without_deleting():
    with (
        patch("django.contrib.auth.models.User") as User,
        patch("sefaria.helper.users.tasks.queue_user_account_deletion") as queue,
    ):
        _mock_users(User, [])
        response = _post("nobody@example.com")
    queue.assert_not_called()
    assert b"no user with email" in response.content


def test_view_rejects_ambiguous_email():
    with (
        patch("django.contrib.auth.models.User") as User,
        patch("sefaria.helper.users.tasks.queue_user_account_deletion") as queue,
    ):
        _mock_users(User, [3, 4])
        response = _post("dup@example.com")
    queue.assert_not_called()
    assert b"more than one user" in response.content
