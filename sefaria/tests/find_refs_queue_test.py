import importlib
import json
from unittest.mock import patch

import pytest
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


def test_find_refs_api_enqueues_on_find_refs_queue_with_expiry():
    from sefaria import views
    post_data = {'text': {'title': 'title', 'body': 'body'}, 'version_preferences_by_corpus': {}}
    request = RequestFactory().post('/api/find-refs', data=json.dumps(post_data), content_type='application/json')
    with patch("sefaria.helper.linker.tasks.find_refs_api_task") as task:
        task.apply_async.return_value.id = "task-id"
        response = views.find_refs_api(request)

    assert response.status_code == 202
    kwargs = task.apply_async.call_args.kwargs
    assert kwargs["queue"] == celery_config.CeleryQueue.FIND_REFS.value
    assert kwargs["expires"] == views.FIND_REFS_TASK_EXPIRES_SECONDS
