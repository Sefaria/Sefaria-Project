import pytest
import requests

from sefaria.model.linker import linker_entity_recognizer as ner_module
from sefaria.model.linker.linker_entity_recognizer import LinkerEntityRecognizer
from sefaria.system.exceptions import InputError


class _FakeResponse:
    ok = True
    status_code = 200
    headers = {"content-type": "application/json"}
    text = '{"entities": []}'

    def json(self):
        return {"entities": []}


def _record_post(monkeypatch, result):
    recorded = {}

    def fake_post(url, json=None, timeout=None):
        recorded["url"] = url
        recorded["timeout"] = timeout
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(ner_module.requests, "post", fake_post)
    return recorded


def test_recognize_request_bounds_the_call(monkeypatch):
    recorded = _record_post(monkeypatch, _FakeResponse())
    LinkerEntityRecognizer("he")._recognize_entities_api_request("Genesis 1:1")

    assert recorded["url"].endswith("/recognize-entities")
    assert recorded["timeout"] == (
        ner_module.NER_CONNECT_TIMEOUT_SECONDS,
        ner_module.NER_READ_TIMEOUT_SECONDS,
    )


def test_bulk_recognize_request_bounds_the_call(monkeypatch):
    recorded = _record_post(monkeypatch, _FakeResponse())
    LinkerEntityRecognizer("en")._bulk_recognize_entities_api_request(["Genesis 1:1", "Exodus 2:2"])

    assert recorded["url"].endswith("/bulk-recognize-entities")
    assert recorded["timeout"] == (
        ner_module.NER_CONNECT_TIMEOUT_SECONDS,
        ner_module.NER_READ_TIMEOUT_SECONDS,
    )


def test_timeout_is_below_the_task_soft_time_limit():
    from sefaria.helper.linker.tasks import find_refs_api_task

    assert ner_module.NER_CONNECT_TIMEOUT_SECONDS + ner_module.NER_READ_TIMEOUT_SECONDS < 60
    assert find_refs_api_task.soft_time_limit == 60


@pytest.mark.parametrize(
    "error,expected",
    [
        (requests.exceptions.ReadTimeout("read timed out"), "did not answer"),
        (requests.exceptions.ConnectionError("connection refused"), "failed"),
    ],
)
def test_stalled_server_fails_the_call(monkeypatch, error, expected):
    _record_post(monkeypatch, error)

    with pytest.raises(InputError) as excinfo:
        LinkerEntityRecognizer("he")._recognize_entities_api_request("Genesis 1:1")

    message = str(excinfo.value)
    assert expected in message
    assert "recognize-entities" in message
