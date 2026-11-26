"""The official ``mcp`` Python SDK client against our server (PLAN §2.10, §5.3).

The SDK's client speaks real streamable HTTP over httpx, so the server runs behind a real HTTP socket:
a threaded ``wsgiref`` server whose WSGI app calls ``McpServer.handle_http``, the same entry point the
Django view calls. No Django settings and no network beyond 127.0.0.1: execute-request's upstream
session is a recording fake.

Bumping the pinned ``mcp`` test dependency is how a change in the MCP specification is detected: if the
SDK's newest protocol version is not in ``SUPPORTED_PROTOCOL_VERSIONS``, this test fails.
"""

import json
import threading
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

import anyio
import mcp.types
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.version import SUPPORTED_PROTOCOL_VERSIONS as SDK_VERSIONS

from devportal.mcp.server import SUPPORTED_PROTOCOL_VERSIONS, McpServer
from devportal.tests.pure.mcp_fakes import FakeResponse, RecordingSessionFactory

STATUS_TEXT = {
    200: "OK",
    202: "Accepted",
    204: "No Content",
    400: "Bad Request",
    405: "Method Not Allowed",
    413: "Payload Too Large",
    415: "Unsupported Media Type",
}


class _ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class _QuietHandler(WSGIRequestHandler):
    def log_message(self, *_args):
        pass


def wsgi_app(server: McpServer):
    def app(environ, start_response):
        headers = {k[5:].replace("_", "-"): v for k, v in environ.items() if k.startswith("HTTP_")}
        if environ.get("CONTENT_TYPE"):
            headers["Content-Type"] = environ["CONTENT_TYPE"]
        length = int(environ.get("CONTENT_LENGTH") or 0)
        body = environ["wsgi.input"].read(length) if length else b""
        resp = server.handle_http(environ["REQUEST_METHOD"], headers, body, environ.get("REMOTE_ADDR"))
        start_response(f"{resp.status} {STATUS_TEXT.get(resp.status, 'Status')}", list(resp.headers.items()))
        return [resp.body]

    return app


@pytest.fixture
def upstream():
    return RecordingSessionFactory(FakeResponse(body=json.dumps({"books": ["Genesis"]}).encode()))


@pytest.fixture
def mcp_url(upstream):
    httpd = make_server(
        "127.0.0.1",
        0,
        wsgi_app(McpServer(session_factory=upstream)),
        server_class=_ThreadingWSGIServer,
        handler_class=_QuietHandler,
    )
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/mcp"
    httpd.shutdown()
    httpd.server_close()


def test_sdk_versions_are_supported():
    assert mcp.types.LATEST_PROTOCOL_VERSION in SUPPORTED_PROTOCOL_VERSIONS
    assert set(SDK_VERSIONS) <= set(SUPPORTED_PROTOCOL_VERSIONS)


def test_sdk_client_initializes_lists_and_calls_every_tool(mcp_url, upstream):
    async def scenario():
        async with (
            streamablehttp_client(mcp_url) as (read, write, get_session_id),
            ClientSession(read, write) as session,
        ):
            init = await session.initialize()
            assert init.protocolVersion == mcp.types.LATEST_PROTOCOL_VERSION
            assert init.serverInfo.name == "org.sefaria/developers"
            assert init.capabilities.tools is not None
            assert get_session_id() is None  # stateless: no Mcp-Session-Id

            await session.send_ping()

            listed = await session.list_tools()
            assert [t.name for t in listed.tools] == [
                "list-endpoints",
                "get-endpoint",
                "search-endpoints",
                "execute-request",
            ]

            results = {
                "list-endpoints": await session.call_tool("list-endpoints", {}),
                "get-endpoint": await session.call_tool(
                    "get-endpoint", {"path": "/api/v3/texts/{tref}", "method": "GET"}
                ),
                "search-endpoints": await session.call_tool("search-endpoints", {"pattern": "calendar"}),
                "execute-request": await session.call_tool(
                    "execute-request",
                    {"harRequest": {"method": "GET", "url": "https://www.sefaria.org/api/index/titles"}},
                ),
            }
            rejected = await session.call_tool(
                "execute-request",
                {"harRequest": {"method": "GET", "url": "https://169.254.169.254/latest/meta-data/"}},
            )
            return results, rejected

    results, rejected = anyio.run(scenario)

    for name, result in results.items():
        assert result.isError is False, name
        assert result.content[0].type == "text"
    assert "/api/calendars" in json.loads(results["list-endpoints"].content[0].text)["paths"]
    assert json.loads(results["get-endpoint"].content[0].text)["operationId"] == "get-v3-texts"
    assert "get-calendars" in {
        r["operationId"] for r in json.loads(results["search-endpoints"].content[0].text)["results"]
    }
    executed = json.loads(results["execute-request"].content[0].text)
    assert executed["status"] == 200
    assert json.loads(executed["body"]) == {"books": ["Genesis"]}

    assert rejected.isError is True
    assert [r["url"] for r in upstream.requests] == ["https://www.sefaria.org/api/index/titles"]
