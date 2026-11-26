import importlib
import json
from enum import Enum
from unittest.mock import patch

import kombu
import pytest
import redis
from django.test import RequestFactory

import sefaria.settings
from sefaria.celery_setup import config as celery_config


@pytest.fixture
def reload_celery_config():
    """Reload CeleryQueue under patched CELERY_QUEUES, restoring the real config afterwards."""
    original = sefaria.settings.CELERY_QUEUES

    def _reload(queues: dict):
        sefaria.settings.CELERY_QUEUES = queues
        return importlib.reload(celery_config).CeleryQueue

    yield _reload
    sefaria.settings.CELERY_QUEUES = original
    importlib.reload(celery_config)


def test_find_refs_queue_uses_dedicated_queue_when_configured(reload_celery_config):
    queue = reload_celery_config({"tasks": "prod-tasks", "findRefs": "prod-find-refs"})
    assert queue.FIND_REFS.value == "prod-find-refs"
    assert queue.TASKS.value == "prod-tasks"


def test_find_refs_queue_falls_back_to_tasks_queue(reload_celery_config):
    # Environments without dedicated find-refs workers must keep using the shared queue,
    # otherwise find-refs tasks would land on a queue nobody consumes.
    queue = reload_celery_config({"tasks": "prod-tasks"})
    assert queue.FIND_REFS.value == "prod-tasks"


class _DistinctQueues(Enum):
    # In CI CELERY_QUEUES is empty, so the real FIND_REFS aliases TASKS and can't tell them apart.
    TASKS = "test-tasks"
    LLM = "test-llm"
    FIND_REFS = "test-find-refs"


def test_find_refs_api_enqueues_on_find_refs_queue_with_expiry():
    from sefaria import views

    post_data = {"text": {"title": "title", "body": "body"}, "version_preferences_by_corpus": {}}
    request = RequestFactory().post("/api/find-refs", data=json.dumps(post_data), content_type="application/json")
    with (
        patch("sefaria.helper.linker.tasks.find_refs_api_task") as task,
        patch.object(views, "CeleryQueue", _DistinctQueues),
    ):
        task.apply_async.return_value.id = "task-id"
        response = views.find_refs_api(request)

    assert response.status_code == 202
    kwargs = task.apply_async.call_args.kwargs
    assert kwargs["queue"] == "test-find-refs"
    assert kwargs["expires"] == views.FIND_REFS_TASK_EXPIRES_SECONDS


@pytest.mark.parametrize(
    "broker_error",
    [
        # A demoted master refuses the write and a loading master refuses the task; both mean
        # the broker did not accept it, at the connection and at the channel level.
        redis.exceptions.ConnectionError("The previous master is now a slave"),
        redis.exceptions.BusyLoadingError("Redis is loading the dataset in memory"),
        kombu.exceptions.OperationalError("The previous master is now a slave"),
    ],
)
def test_find_refs_api_answers_503_when_the_broker_refuses_the_task(broker_error):
    from sefaria import views

    post_data = {"text": {"title": "title", "body": "body"}, "version_preferences_by_corpus": {}}
    request = RequestFactory().post("/api/find-refs", data=json.dumps(post_data), content_type="application/json")
    with patch("sefaria.helper.linker.tasks.find_refs_api_task") as task:
        task.apply_async.side_effect = broker_error
        response = views.find_refs_api(request)

    assert response.status_code == 503
    assert json.loads(response.content) == {"error": "enqueue_failed"}
    assert response["Retry-After"] == str(views.FIND_REFS_BROKER_RETRY_AFTER_SECONDS)


def test_find_refs_api_keeps_its_own_publish_bug_out_of_the_503_answer():
    from sefaria import views

    post_data = {"text": {"title": "title", "body": "body"}, "version_preferences_by_corpus": {}}
    request = RequestFactory().post("/api/find-refs", data=json.dumps(post_data), content_type="application/json")
    with patch("sefaria.helper.linker.tasks.find_refs_api_task") as task:
        task.apply_async.side_effect = TypeError("apply_async() got an unexpected keyword argument")
        with pytest.raises(TypeError):
            views.find_refs_api(request)
