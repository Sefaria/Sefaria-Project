import http.client
from unittest.mock import MagicMock

import pytest

from sefaria.system.varnish import common


class _FakeConnection:
    """Capture the request that purge_url builds instead of opening a socket."""

    last_request = None

    def __init__(self, host, port):
        self.host = host
        self.port = port

    def request(self, method, target, body, headers):
        _FakeConnection.last_request = {"method": method, "target": target, "headers": headers}

    def getresponse(self):
        response = MagicMock()
        response.status = 200
        return response


@pytest.fixture
def fake_connection(monkeypatch):
    _FakeConnection.last_request = None
    monkeypatch.setattr(common, "HTTPConnection", _FakeConnection)
    return _FakeConnection


def test_purge_url_encodes_space_in_path(fake_connection):
    common.purge_url("http://www.sefaria.org/api/links/bare/Horayot/Shulchan Arukh")
    assert _FakeConnection.last_request["method"] == "PURGE"
    assert _FakeConnection.last_request["target"] == "/api/links/bare/Horayot/Shulchan%20Arukh"


def test_purge_url_preserves_punctuation_and_query(fake_connection):
    common.purge_url("http://www.sefaria.org/api/counts/links/Bavli/Mishneh Torah, Sabbath?with_text=1")
    assert _FakeConnection.last_request["target"] == "/api/counts/links/Bavli/Mishneh%20Torah,%20Sabbath?with_text=1"


def test_purge_url_does_not_double_encode_existing_encoding(fake_connection):
    common.purge_url("http://www.sefaria.org/api/texts/Genesis/1/en/The%20Koren%20Jerusalem%20Bible")
    assert _FakeConnection.last_request["target"] == "/api/texts/Genesis/1/en/The%20Koren%20Jerusalem%20Bible"


def test_http_client_rejects_raw_space_in_request_target():
    # Why the purge failed before: http.client refuses a request target that holds a space.
    connection = http.client.HTTPConnection("www.sefaria.org")
    with pytest.raises(http.client.InvalidURL):
        connection.putrequest("PURGE", "/api/links/bare/Horayot/Shulchan Arukh")
