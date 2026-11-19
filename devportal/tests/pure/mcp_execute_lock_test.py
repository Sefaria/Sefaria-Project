"""execute-request's lock (PLAN §2.10 rules 1-5, §5.3, S-5, S-6).

Every hostile request is rejected before any network call: the injected session factory is never called
and ``requests`` itself is booby-trapped so a stray real call would fail the test.
"""

import http.server
import json
import re
import threading
from pathlib import Path

import pytest
import requests

from devportal.mcp import execute as ex
from devportal.mcp.provider import OpenAPIFileProvider
from devportal.mcp.tools import Tools
from devportal.tests.pure.mcp_fakes import FakeResponse, RecordingSessionFactory

OPS = OpenAPIFileProvider().operations()
API = "https://www.sefaria.org"


@pytest.fixture(autouse=True)
def no_real_network(monkeypatch, request):
    if "local_server" in request.fixturenames:
        return

    def boom(*_args, **_kwargs):
        msg = "a real HTTP request was attempted"
        raise AssertionError(msg)

    monkeypatch.setattr(requests.Session, "request", boom)
    monkeypatch.setattr(requests.Session, "send", boom)


def get(url, **extra):
    return {"method": "GET", "url": url, **extra}


def post_json(text, mime="application/json", url=f"{API}/api/find-refs", **extra):
    return {"method": "POST", "url": url, "postData": {"mimeType": mime, "text": text}, **extra}


HOSTILE = {
    # other hosts and look-alikes
    "other host": get("https://evil.com/api/index"),
    "bare apex": get("https://sefaria.org/api/index"),
    "suffix look-alike": get("https://www.sefaria.org.evil.com/api/index"),
    "trailing dot": get("https://www.sefaria.org./api/index"),
    "hyphen look-alike": get("https://www-sefaria.org/api/index"),
    "missing dot": get("https://wwwsefaria.org/api/index"),
    "other tld": get("https://www.sefaria.org.il/api/index"),
    "subdomain": get("https://api.www.sefaria.org/api/index"),
    "unicode look-alike": get("https://www.sefaría.org/api/index"),
    "punycode look-alike": get("https://www.xn--sefara-iwa.org/api/index"),
    "uppercase look-alike": get("https://WWW.SEFARIA.ORG.EVIL.COM/api/index"),
    # user info
    "user@host": get("https://user@www.sefaria.org/api/index"),
    "user:pass@host": get("https://user:pass@www.sefaria.org/api/index"),
    "host@evil": get("https://www.sefaria.org@evil.com/api/index"),
    "host:443@evil": get("https://www.sefaria.org:443@evil.com/api/index"),
    "backslash @": get("https://evil.com\\@www.sefaria.org/api/index"),
    "fragment @": get("https://evil.com#@www.sefaria.org/api/index"),
    "encoded @ in host": get("https://www.sefaria.org%40evil.com/api/index"),
    # schemes and relative forms
    "plain http": get("http://www.sefaria.org/api/index"),
    "ftp": get("ftp://www.sefaria.org/api/index"),
    "scheme-relative": get("//www.sefaria.org/api/index"),
    "relative path": get("/api/index"),
    "javascript": get("javascript:alert(1)"),
    "file": get("file:///etc/passwd"),
    # ports
    "port 8443": get("https://www.sefaria.org:8443/api/index"),
    "port 80": get("https://www.sefaria.org:80/api/index"),
    "port 0443": get("https://www.sefaria.org:0443/api/index"),
    "empty port": get("https://www.sefaria.org:/api/index"),
    # IP literals, localhost, metadata
    "ipv4 loopback": get("https://127.0.0.1/api/index"),
    "ipv4 decimal": get("https://2130706433/api/index"),
    "ipv4 hex": get("https://0x7f.0.0.1/api/index"),
    "ipv6 loopback": get("https://[::1]/api/index"),
    "ipv6 mapped": get("https://[::ffff:127.0.0.1]/api/index"),
    "localhost": get("https://localhost/api/index"),
    "localhost port": get("https://localhost:8000/api/index"),
    "metadata https": get("https://169.254.169.254/latest/meta-data/"),
    "metadata http": get("http://169.254.169.254/computeMetadata/v1/"),
    "metadata name": get("https://metadata.google.internal/computeMetadata/v1/"),
    # whitespace, control characters, non-ASCII
    "CRLF in url": get(f"{API}/api/index\r\nHost: evil.com"),
    "leading space": get(f" {API}/api/index"),
    "tab": get(f"{API}/api/\tindex"),
    "NUL": get(f"{API}/api/index\x00"),
    "raw space": get(f"{API}/api/v3/texts/Genesis 1:1"),
    "non-ascii path": get(f"{API}/api/v3/texts/בראשית"),
    # dot segments, encoded and not
    "dot dot": get(f"{API}/api/v3/texts/.."),
    "dot": get(f"{API}/api/./index"),
    "encoded dot dot": get(f"{API}/api/index/%2e%2e/%2e%2e/admin"),
    "encoded upper dot dot": get(f"{API}/api/v3/texts/%2E%2E"),
    "mixed dot dot": get(f"{API}/api/v3/texts/.%2e"),
    "double-encoded dot dot": get(f"{API}/api/v3/texts/%252e%252e"),
    "encoded slash dot dot": get(f"{API}/api/v3/texts/a%2f..%2f..%2fadmin"),
    "encoded backslash": get(f"{API}/api/v3/texts/..%5cadmin"),
    "encoded NUL": get(f"{API}/api/v3/texts/a%00"),
    "encoded CRLF in path": get(f"{API}/api/v3/texts/a%0d%0aHost:%20evil"),
    "invalid utf-8": get(f"{API}/api/v3/texts/%ff"),
    "empty segment": get(f"{API}/api//index"),
    "trailing slash": get(f"{API}/api/index/"),
    # paths and methods not in the spec
    "root": get(f"{API}/"),
    "no path": get(API),
    "admin": get(f"{API}/admin/"),
    "unknown api": get(f"{API}/api/nope"),
    "missing param": get(f"{API}/api/v3/texts"),
    "extra segment": get(f"{API}/api/index/titles/extra"),
    "DELETE": {"method": "DELETE", "url": f"{API}/api/index"},
    "POST on GET path": {"method": "POST", "url": f"{API}/api/index"},
    "GET on POST path": get(f"{API}/api/find-refs"),
    "PUT on POST path": {"method": "PUT", "url": f"{API}/api/find-refs"},
    "CONNECT": {"method": "CONNECT", "url": f"{API}/api/index"},
    "method with CRLF": {"method": "GET\r\nX: y", "url": f"{API}/api/index"},
    "method not string": {"method": 1, "url": f"{API}/api/index"},
    # bodies
    "oversized body": post_json(json.dumps({"text": {"body": "x" * (100 * 1024)}})),
    "body on GET": get(f"{API}/api/index", postData={"mimeType": "application/json", "text": "{}"}),
    "form params": {
        "method": "POST",
        "url": f"{API}/api/find-refs",
        "postData": {"mimeType": "application/x-www-form-urlencoded", "params": [{"name": "a", "value": "b"}]},
    },
    "multipart": post_json("{}", mime="multipart/form-data"),
    "text/plain": post_json("{}", mime="text/plain"),
    "invalid json": post_json("{not json"),
    "non-string body": {
        "method": "POST",
        "url": f"{API}/api/find-refs",
        "postData": {"mimeType": "application/json", "text": {}},
    },
    # header and query injection
    "CRLF in Accept": get(f"{API}/api/index", headers=[{"name": "Accept", "value": "application/json\r\nX-Evil: 1"}]),
    "LF in dropped header": get(f"{API}/api/index", headers=[{"name": "X-Other", "value": "a\nb"}]),
    "CRLF in header name": get(f"{API}/api/index", headers=[{"name": "Accept\r\nHost", "value": "evil.com"}]),
    "space in header name": get(f"{API}/api/index", headers=[{"name": "Host name", "value": "x"}]),
    "header not a list": get(f"{API}/api/index", headers={"Accept": "x"}),
    "header without name": get(f"{API}/api/index", headers=[{"value": "x"}]),
    "CRLF in queryString": get(f"{API}/api/index", queryString=[{"name": "a", "value": "1\r\nHost: evil"}]),
    "encoded CRLF in query": get(f"{API}/api/index?a=%0d%0aHost:%20evil"),
    "too many headers": get(f"{API}/api/index", headers=[{"name": "X-A", "value": "1"}] * 51),
    # malformed
    "not an object": "GET https://www.sefaria.org/api/index",
    "missing url": {"method": "GET"},
    "url not a string": {"method": "GET", "url": ["https://www.sefaria.org/api/index"]},
    "too long": get(f"{API}/api/v3/texts/{'a' * 9000}"),
}


@pytest.mark.parametrize("har", list(HOSTILE.values()), ids=list(HOSTILE))
def test_hostile_request_is_rejected_before_any_network_call(har):
    with pytest.raises(ex.RequestRejected):
        ex.prepare(har, OPS)
    sessions = RecordingSessionFactory()
    result = Tools(OpenAPIFileProvider(), session_factory=sessions).call("execute-request", {"harRequest": har})
    assert result["isError"] is True
    assert result["content"][0]["text"].startswith("Request not sent:")
    assert not sessions.called


def test_missing_har_request_is_rejected():
    sessions = RecordingSessionFactory()
    result = Tools(OpenAPIFileProvider(), session_factory=sessions).call("execute-request", {})
    assert result["isError"] is True
    assert not sessions.called


def _run(har, response=None):
    sessions = RecordingSessionFactory(response)
    result = Tools(OpenAPIFileProvider(), session_factory=sessions).call("execute-request", {"harRequest": har})
    return result, sessions


def test_allowed_get_is_rebuilt_and_sent_once_with_safe_options():
    har = get(
        "https://WWW.SEFARIA.ORG:443/api/v3/texts/Genesis%201:1?version=english",
        queryString=[{"name": "version", "value": "english"}, {"name": "fill_in_missing_segments", "value": "1"}],
        headers=[
            {"name": "Accept", "value": "application/json"},
            {"name": "Cookie", "value": "sessionid=staff"},
            {"name": "Authorization", "value": "Bearer secret"},
            {"name": "Host", "value": "evil.com"},
            {"name": "X-Forwarded-For", "value": "1.2.3.4"},
            {"name": "X-Forwarded-Host", "value": "evil.com"},
            {"name": "X-API-Key", "value": "visitor-key"},
            {"name": "Content-Type", "value": "text/html"},
        ],
    )
    result, sessions = _run(har)
    assert result["isError"] is False
    assert len(sessions.requests) == 1
    sent = sessions.requests[0]
    assert sent["method"] == "GET"
    assert sent["url"] == f"{API}/api/v3/texts/Genesis%201:1?version=english&fill_in_missing_segments=1"
    assert sent["allow_redirects"] is False
    assert sent["timeout"] == (3, 10)
    assert sent["stream"] is True
    assert sent["data"] is None
    assert sent["headers"] == {"User-Agent": ex.USER_AGENT, "Accept": "application/json"}
    assert sessions.sessions[0].closed
    data = json.loads(result["content"][0]["text"])
    assert data["status"] == 200
    assert data["truncated"] is False
    assert json.loads(data["body"]) == {"ok": True}


def test_allowed_post_sends_json_body():
    body = json.dumps({"text": {"title": "", "body": "Genesis 1:1"}})
    result, sessions = _run(post_json(body, mime="application/json; charset=utf-8"))
    assert result["isError"] is False
    sent = sessions.requests[0]
    assert sent["method"] == "POST"
    assert sent["url"] == f"{API}/api/find-refs"
    assert sent["data"] == body.encode()
    assert sent["headers"]["Content-Type"] == "application/json"


def test_body_at_the_limit_is_allowed():
    text = json.dumps("x" * (ex.MAX_BODY_BYTES - 2))
    assert len(text.encode()) == ex.MAX_BODY_BYTES
    _, sessions = _run(post_json(text))
    assert len(sessions.requests) == 1


def test_specific_template_wins_and_multi_segment_path_param():
    assert ex.prepare(get(f"{API}/api/index/titles"), OPS).operation_id == "get-index-titles"
    assert ex.prepare(get(f"{API}/api/index/Genesis"), OPS).operation_id == "get-index-by-title"
    assert ex.prepare(get(f"{API}/api/category/Tanakh/Torah"), OPS).operation_id == "get-category"


def test_upstream_redirect_is_not_followed():
    response = FakeResponse(302, {"location": "https://evil.com/steal", "set-cookie": "a=b"}, b"", reason="Found")
    result, sessions = _run(get(f"{API}/api/index"), response)
    assert len(sessions.requests) == 1
    assert sessions.requests[0]["allow_redirects"] is False
    data = json.loads(result["content"][0]["text"])
    assert data["status"] == 302
    assert data["redirectNotFollowed"] is True
    assert data["headers"]["location"] == "https://evil.com/steal"
    assert "set-cookie" not in data["headers"]


def test_response_is_capped_at_one_megabyte():
    response = FakeResponse(body=b"a" * (ex.MAX_RESPONSE_BYTES * 3))
    result, _ = _run(get(f"{API}/api/index"), response)
    data = json.loads(result["content"][0]["text"])
    assert data["truncated"] is True
    assert len(data["body"]) == ex.MAX_RESPONSE_BYTES
    assert response.read_bytes <= ex.MAX_RESPONSE_BYTES + 65536
    assert response.closed


def test_upstream_failure_is_a_tool_error():
    class Failing:
        def request(self, *_a, **_k):
            raise requests.ConnectTimeout

        def close(self):
            pass

    result = Tools(OpenAPIFileProvider(), session_factory=Failing).call(
        "execute-request", {"harRequest": get(f"{API}/api/index")}
    )
    assert result["isError"] is True
    assert "ConnectTimeout" in result["content"][0]["text"]


def test_default_session_keeps_no_cookies_and_ignores_the_environment():
    session = ex.default_session_factory()
    assert session.trust_env is False
    assert tuple(session.cookies._policy.allowed_domains()) == ()
    assert dict(session.headers) == {}


# --- the real requests stack against a local server (send() directly; prepare() refuses localhost) --


class _Handler(http.server.BaseHTTPRequestHandler):
    seen: list = []

    def log_message(self, *_args):
        pass

    def do_GET(self):  # noqa: N802
        type(self).seen.append((self.path, dict(self.headers)))
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/target")
            self.send_header("Set-Cookie", "tracker=1; Path=/")
            self.end_headers()
        elif self.path == "/big":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            for _ in range(3):
                self.wfile.write(b"b" * ex.MAX_RESPONSE_BYTES)
        else:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", "tracker=2; Path=/")
            self.end_headers()
            self.wfile.write(b'{"ok": true}')


@pytest.fixture
def local_server():
    _Handler.seen = []
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def _prepared(url):
    return ex.PreparedRequest("GET", url, {"User-Agent": ex.USER_AGENT}, None, "x", "/x")


def test_real_stack_does_not_follow_redirects_or_keep_cookies(local_server):
    shared = ex.default_session_factory()
    shared.close = lambda: None  # reuse one session across calls to prove its jar stays empty
    result = ex.send(_prepared(f"{local_server}/redirect"), lambda: shared)
    assert result["status"] == 302
    assert result["redirectNotFollowed"] is True
    ex.send(_prepared(f"{local_server}/plain"), lambda: shared)
    ex.send(_prepared(f"{local_server}/plain"), lambda: shared)
    assert [p for p, _ in _Handler.seen] == ["/redirect", "/plain", "/plain"]
    assert all("Cookie" not in h for _, h in _Handler.seen)
    assert len(shared.cookies) == 0
    assert _Handler.seen[0][1]["User-Agent"] == ex.USER_AGENT


def test_real_stack_truncates_at_one_megabyte(local_server):
    result = ex.send(_prepared(f"{local_server}/big"))
    assert result["truncated"] is True
    assert len(result["body"]) == ex.MAX_RESPONSE_BYTES


# --- S-5: the only outbound HTTP call in devportal/mcp is in execute.send ----------------------------------

MCP_DIR = Path(ex.__file__).resolve().parent
HTTP_CLIENT = re.compile(
    r"\b(requests\.(get|post|put|delete|head|patch|request|Session)|urllib\.request|urlopen|httpx|http\.client|aiohttp|socket\.)"
)


def test_no_other_http_client_calls_in_mcp_package():
    offenders = []
    for path in MCP_DIR.rglob("*.py"):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if HTTP_CLIENT.search(line) and not (path.name == "execute.py" and "requests.Session()" in line):
                offenders.append(f"{path.name}:{lineno}: {line.strip()}")
    assert offenders == []
