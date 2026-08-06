import pytest

from sefaria.model.linker.linker_entity_recognizer import LinkerEntityRecognizer
from sefaria.system.exceptions import InputError


class MockResponse:
    ok = True
    status_code = 200
    text = "<html>not json</html>"
    headers = {"content-type": "text/html"}

    def json(self):
        raise __import__("requests").exceptions.JSONDecodeError("Expecting value", self.text, 0)


def test_recognizer_non_json_response_raises_input_error():
    with pytest.raises(InputError) as e:
        LinkerEntityRecognizer._parse_api_response(MockResponse(), "recognize-entities")
    assert "returned non-JSON" in str(e.value)
    assert "text/html" in str(e.value)
