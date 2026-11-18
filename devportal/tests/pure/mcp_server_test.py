"""JSON-RPC and streamable-HTTP semantics of the hand-written server (PLAN §2.10, S-7)."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from devportal.mcp import server as srv
from devportal.mcp.server import GET_NOTICE, SUPPORTED_PROTOCOL_VERSIONS, McpServer
from devportal.tests.pure.mcp_fakes import RecordingSessionFactory

REPO = Path(__file__).resolve().parents[3]
JSON = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}


@pytest.fixture
def server():
    return McpServer(session_factory=RecordingSessionFactory())


def post(server, payload, headers=JSON, ip="127.0.0.1"):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    resp = server.handle_http("POST", headers, body, ip)
    return resp, (json.loads(resp.body) if resp.body else None)


def rpc(method, params=None, id_=1):
    msg = {"jsonrpc": "2.0", "id": id_, "method": method}
    if params is not None:
        msg["params"] = params
    return msg


def test_supported_versions_include_the_required_ones():
    assert {"2025-06-18", "2025-03-26", "2024-11-05"} <= set(SUPPORTED_PROTOCOL_VERSIONS)
    assert SUPPORTED_PROTOCOL_VERSIONS[0] == srv.LATEST_PROTOCOL_VERSION


@pytest.mark.parametrize("version", SUPPORTED_PROTOCOL_VERSIONS)
def test_initialize_echoes_a_supported_version(server, version):
    resp, data = post(
        server,
        rpc(
            "initialize", {"protocolVersion": version, "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}
        ),
    )
    assert resp.status == 200
    assert resp.headers["Content-Type"] == "application/json"
    result = data["result"]
    assert result["protocolVersion"] == version
    assert result["capabilities"] == {"tools": {"listChanged": False}}
    assert result["serverInfo"]["name"] == "org.sefaria/developers"
    assert "Mcp-Session-Id" not in resp.headers


def test_initialize_offers_latest_for_unknown_version(server):
    _, data = post(server, rpc("initialize", {"protocolVersion": "1999-01-01"}))
    assert data["result"]["protocolVersion"] == srv.LATEST_PROTOCOL_VERSION


def test_initialize_without_version_is_invalid_params(server):
    _, data = post(server, rpc("initialize", {}))
    assert data["error"]["code"] == srv.INVALID_PARAMS


def test_ping(server):
    _, data = post(server, rpc("ping", id_="abc"))
    assert data == {"jsonrpc": "2.0", "id": "abc", "result": {}}


@pytest.mark.parametrize(
    "message",
    [
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}},
        {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "execute-request"}},  # a notification never runs
        {"jsonrpc": "2.0", "id": 7, "result": {}},
        {"jsonrpc": "2.0", "id": 7, "error": {"code": 1, "message": "x"}},
    ],
)
def test_notifications_and_responses_get_202_without_body(server, message):
    resp, data = post(server, message)
    assert resp.status == 202
    assert resp.body == b""
    assert data is None
    assert not server.tools.session_factory.called


@pytest.mark.parametrize(
    ("payload", "status", "code"),
    [
        (b"{not json", 400, srv.PARSE_ERROR),
        (b"\xff\xfe", 400, srv.PARSE_ERROR),
        ([rpc("ping", id_=1), rpc("ping", id_=2)], 400, srv.INVALID_REQUEST),
        ([], 400, srv.INVALID_REQUEST),
        ("ping", 400, srv.INVALID_REQUEST),
        ({"id": 1, "method": "ping"}, 400, srv.INVALID_REQUEST),
        ({"jsonrpc": "1.0", "id": 1, "method": "ping"}, 400, srv.INVALID_REQUEST),
        ({"jsonrpc": "2.0", "id": 1, "method": 5}, 400, srv.INVALID_REQUEST),
        ({"jsonrpc": "2.0", "id": None, "method": "ping"}, 400, srv.INVALID_REQUEST),
        ({"jsonrpc": "2.0", "id": True, "method": "ping"}, 400, srv.INVALID_REQUEST),
        ({"jsonrpc": "2.0", "id": 1.5, "method": "ping"}, 400, srv.INVALID_REQUEST),
        ({"jsonrpc": "2.0", "id": 1}, 400, srv.INVALID_REQUEST),
        (rpc("resources/list"), 200, srv.METHOD_NOT_FOUND),
        (rpc("ping", ["positional"]), 200, srv.INVALID_PARAMS),
        (rpc("tools/call", {"name": "nope"}), 200, srv.INVALID_PARAMS),
        (rpc("tools/call", {}), 200, srv.INVALID_PARAMS),
        (rpc("tools/call", {"name": "list-endpoints", "arguments": []}), 200, srv.INVALID_PARAMS),
    ],
)
def test_jsonrpc_errors(server, payload, status, code):
    resp, data = post(server, payload)
    assert resp.status == status
    assert data["jsonrpc"] == "2.0"
    assert data["error"]["code"] == code
    assert "result" not in data


def test_error_echoes_request_id(server):
    _, data = post(server, rpc("nope", id_="req-9"))
    assert data["id"] == "req-9"


def test_tools_list_and_call(server):
    _, data = post(server, rpc("tools/list", {}))
    assert [t["name"] for t in data["result"]["tools"]] == [
        "list-endpoints",
        "get-endpoint",
        "search-endpoints",
        "execute-request",
    ]
    _, data = post(server, rpc("tools/call", {"name": "list-endpoints", "arguments": {}}))
    assert data["result"]["isError"] is False
    assert data["result"]["content"][0]["type"] == "text"
    assert "/api/v3/texts/{tref}" in json.loads(data["result"]["content"][0]["text"])["paths"]


def test_unexpected_tool_failure_is_internal_error(server, monkeypatch):
    def broken(_args):
        msg = "boom"
        raise RuntimeError(msg)

    monkeypatch.setattr(server.tools, "list_endpoints", broken)
    _, data = post(server, rpc("tools/call", {"name": "list-endpoints"}))
    assert data["error"] == {"code": srv.INTERNAL_ERROR, "message": "Internal error"}


def test_wrong_content_type_is_415(server):
    resp, data = post(server, rpc("ping"), headers={"Content-Type": "text/plain"})
    assert resp.status == 415
    assert data["error"]["code"] == srv.INVALID_REQUEST


def test_unsupported_protocol_version_header_is_400(server):
    resp, _ = post(server, rpc("ping"), headers={**JSON, "MCP-Protocol-Version": "1999-01-01"})
    assert resp.status == 400
    resp, _ = post(server, rpc("ping"), headers={**JSON, "mcp-protocol-version": "2025-06-18"})
    assert resp.status == 200


def test_oversized_post_is_413(server):
    resp, _ = post(server, b" " * (srv.MAX_REQUEST_BYTES + 1))
    assert resp.status == 413


def test_get_without_sse_returns_live_notice(server):
    resp = server.handle_http("GET", {"Accept": "text/html"}, b"", "1.1.1.1")
    assert resp.status == 200
    assert resp.body == b"This URL can only be accessed with a MCP client."
    assert len(GET_NOTICE) == 48
    assert resp.headers["Content-Type"] == "text/html"
    assert resp.headers["Access-Control-Allow-Origin"] == "*"
    assert srv.handle_get(None).body == GET_NOTICE


def test_get_with_sse_is_405(server):
    resp = server.handle_http("GET", {"accept": "application/json, text/event-stream"}, b"", "1.1.1.1")
    assert resp.status == 405
    assert resp.body == b""
    assert "POST" in resp.headers["Allow"]


def test_head_options_and_other_verbs(server):
    head = server.handle_http("HEAD", {}, b"", None)
    assert (head.status, head.body) == (200, b"")
    options = server.handle_http("OPTIONS", {"Origin": "https://example.com"}, b"", None)
    assert options.status == 204
    assert options.headers["Access-Control-Allow-Origin"] == "*"
    assert "POST" in options.headers["Access-Control-Allow-Methods"]
    assert "Mcp-Protocol-Version" in options.headers["Access-Control-Allow-Headers"]
    for verb in ("DELETE", "PUT", "PATCH"):
        assert server.handle_http(verb, {}, b"", None).status == 405


@pytest.mark.parametrize(
    "message",
    [
        rpc("initialize", {"protocolVersion": "2025-06-18"}),
        rpc("tools/list"),
        rpc("tools/call", {"name": "search-endpoints", "arguments": {"pattern": "topic"}}),
    ],
)
def test_staff_cookie_changes_nothing(message):
    """S-7: the same request with and without a staff session cookie gives the same bytes."""
    plain, _ = post(McpServer(), message)
    with_cookie, _ = post(McpServer(), message, headers={**JSON, "Cookie": "sessionid=staff-session; csrftoken=abc"})
    assert (plain.status, plain.headers, plain.body) == (with_cookie.status, with_cookie.headers, with_cookie.body)
    assert "Set-Cookie" not in with_cookie.headers


def test_core_imports_no_django():
    code = (
        "import sys, devportal.mcp.server, devportal.mcp.django_view;"
        "bad = [m for m in sys.modules if m == 'django' or m.startswith('django.')];"
        "assert not bad, bad"
    )
    subprocess.run([sys.executable, "-c", code], cwd=REPO, check=True)
