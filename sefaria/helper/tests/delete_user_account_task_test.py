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
        patch.object(tasks, "logger") as logger,
        pytest.raises(RuntimeError),
    ):
        _run_task(tasks.DELETE_USER_MAX_RETRIES)
    retry.assert_not_called()
    assert logger.error.call_args.args[0] == "delete_user_account_task:failed"


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


# ---------------------------------------------------------------------------
# Worker loss and resuming an interrupted deletion
# ---------------------------------------------------------------------------


def test_task_is_redelivered_when_its_worker_dies():
    # acks_late alone still acks the message when the child process is killed;
    # reject_on_worker_lost puts it back on the queue so the deletion resumes.
    task = tasks.delete_user_account_task
    assert task.acks_late is True
    assert task.reject_on_worker_lost is True


def _matches(doc, query):
    for key, want in query.items():
        have = doc.get(key)
        if isinstance(have, list) and not isinstance(want, list):
            if want not in have:
                return False
        elif have != want:
            return False
    return True


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def distinct(self, field):
        return sorted({d[field] for d in self.docs if field in d})


class FakeCollection:
    """Just enough of a pymongo collection for delete_user_account()."""

    def __init__(self, docs=None):
        self.docs = [dict(d) for d in (docs or [])]

    def find(self, query, projection=None):
        return FakeCursor([d for d in self.docs if _matches(d, query)])

    def delete_many(self, query):
        self.docs = [d for d in self.docs if not _matches(d, query)]

    def delete_one(self, query):
        for i, d in enumerate(self.docs):
            if _matches(d, query):
                del self.docs[i]
                return

    def update_many(self, query, update):
        for d in self.docs:
            if _matches(d, query):
                for field, value in update.get("$pull", {}).items():
                    d[field] = [v for v in d.get(field, []) if v != value]

    def find_one_and_update(self, query, update, upsert=False, return_document=None):
        doc = next((d for d in self.docs if _matches(d, query)), None)
        if doc is None and upsert:
            doc = dict(query, **update.get("$setOnInsert", {}))
            self.docs.append(doc)
        for field, spec in update.get("$addToSet", {}).items():
            existing = doc.setdefault(field, [])
            existing.extend(v for v in spec["$each"] if v not in existing)
        return doc


class FakeDB:
    def __init__(self, **collections):
        self._collections = {name: FakeCollection(docs) for name, docs in collections.items()}

    def __getattr__(self, name):
        return self._collections.setdefault(name, FakeCollection())


class WorkerDied(Exception):
    pass


def _deletion_env(fake_db):
    """Patch everything delete_user_account() touches outside Mongo. Returns the mocks."""
    user_rows = {42}
    User = MagicMock()
    User.objects.filter.side_effect = lambda id: MagicMock(
        exists=lambda: id in user_rows, delete=lambda: user_rows.discard(id)
    )
    queue_sheets_sync = MagicMock()
    patches = [
        patch.object(user_utils, "db", fake_db),
        patch.object(user_utils, "User", User),
        patch.object(user_utils.model, "UserProfile"),
        patch.object(user_utils, "CrmMediator"),
        patch("sefaria.settings.SEARCH_INDEX_ON_SAVE", True),
        patch("sefaria.search.queue_sheets_sync", queue_sheets_sync),
    ]
    return patches, user_rows, queue_sheets_sync


def _run_with(patches, func):
    from contextlib import ExitStack

    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        return func()


def test_rerun_after_worker_death_still_queues_deleted_sheets_for_search():
    fake_db = FakeDB(
        sheets=[{"id": 1, "owner": 42}, {"id": 2, "owner": 42}, {"id": 3, "owner": 7, "likes": [42]}],
        profiles=[{"id": 42}, {"id": 42}],
    )
    patches, user_rows, queue_sheets_sync = _deletion_env(fake_db)

    # First run dies right after the sheets are deleted, before search cleanup is queued.
    queue_sheets_sync.side_effect = WorkerDied()
    with pytest.raises(WorkerDied):
        _run_with(patches, lambda: user_utils.delete_user_account(42, confirm=False))
    assert fake_db.sheets.find({"owner": 42}).distinct("id") == []
    assert 42 in user_rows, "the login must survive an interrupted run so the retry can finish"

    # The redelivered run finds no sheets in Mongo but still queues the ones it deleted.
    queue_sheets_sync.side_effect = None
    assert _run_with(patches, lambda: user_utils.delete_user_account(42, confirm=False)) is True
    assert sorted(queue_sheets_sync.call_args.args[0]) == [1, 2]
    assert 42 not in user_rows
    assert fake_db.profiles.docs == []
    assert fake_db.sheets.docs == [{"id": 3, "owner": 7, "likes": []}]
    assert fake_db.user_deletions.docs == [], "the saved ids are dropped once the user is gone"


def test_rerun_after_user_row_deleted_is_a_noop():
    fake_db = FakeDB(sheets=[{"id": 1, "owner": 42}])
    patches, user_rows, queue_sheets_sync = _deletion_env(fake_db)
    _run_with(patches, lambda: user_utils.delete_user_account(42, confirm=False))
    queue_sheets_sync.reset_mock()
    assert _run_with(patches, lambda: user_utils.delete_user_account(42, confirm=False)) is True
    queue_sheets_sync.assert_not_called()
