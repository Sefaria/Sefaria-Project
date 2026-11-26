"""Focused tests for the bounded timeout on the linker's GPU NER HTTP calls.

A stalled GPU NER server must fail the calling task promptly. Without a timeout, the
find-refs task blocks until Celery's 60s soft time limit kills it.
"""

import pytest
import requests

from sefaria.helper.linker.tasks import find_refs_api_task
from sefaria.model.linker.linker_entity_recognizer import (
    GPU_SERVER_REQUEST_TIMEOUT_SECONDS,
    LinkerEntityRecognizer,
)
from sefaria.system.exceptions import InputError


def _recognizer_without_normalizer() -> LinkerEntityRecognizer:
    # Skip __init__ so the test does not need the spacy normalizer. The methods under
    # test only read self._lang.
    ner = LinkerEntityRecognizer.__new__(LinkerEntityRecognizer)
    ner._lang = "en"
    return ner


def test_ner_api_request_passes_a_timeout(monkeypatch):
    ner = _recognizer_without_normalizer()
    captured = {}

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["timeout"] = timeout
        raise requests.exceptions.Timeout("simulated stall")

    monkeypatch.setattr(requests, "post", fake_post)

    with pytest.raises(InputError):
        ner._recognize_entities_api_request("Genesis 1:1")
    assert captured["url"].endswith("/recognize-entities")
    assert captured["timeout"] == GPU_SERVER_REQUEST_TIMEOUT_SECONDS

    with pytest.raises(InputError):
        ner._bulk_recognize_entities_api_request(["Genesis 1:1"])
    assert captured["url"].endswith("/bulk-recognize-entities")
    assert captured["timeout"] == GPU_SERVER_REQUEST_TIMEOUT_SECONDS


def test_ner_timeout_is_below_find_refs_soft_limit():
    assert find_refs_api_task.soft_time_limit > GPU_SERVER_REQUEST_TIMEOUT_SECONDS
