"""JSON-RPC 2.0 over MCP streamable HTTP, in its simplest allowed form (PLAN §2.10).

One POST carries one JSON-RPC message and gets one ``application/json`` answer. Notifications and
client responses get 202 with no body. No sessions, no server-sent events, no batches. ``GET`` without
``Accept: text/event-stream`` returns live's 48-byte notice; with it, 405.

``McpServer.handle_http`` is the single entry point that every adapter (the Django view, the test HTTP
server) calls, so they cannot behave differently. It never sees cookies, users or sessions.

No Django import here.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from devportal.mcp import execute as execute_mod
from devportal.mcp.provider import EndpointProvider, OpenAPIFileProvider
from devportal.mcp.ratelimit import FixedWindowRateLimiter, InMemoryCache
from devportal.mcp.tools import TOOL_NAMES, Tools, error_result, tool_definitions

logger = logging.getLogger(__name__)

# The one place to update when the MCP specification changes. Newest first; the first is offered to a
# client that asks for a version not in the list.
SUPPORTED_PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]

SERVER_INFO = {"name": "org.sefaria/developers", "title": "Sefaria", "version": "1.0"}
INSTRUCTIONS = (
    "Explore the Sefaria API reference: list-endpoints or search-endpoints to find an operation, get-endpoint for"
    " its parameters and responses, and execute-request to call it on https://www.sefaria.org."
)

GET_NOTICE = b"This URL can only be accessed with a MCP client."  # live's body, 48 bytes, text/html
MAX_REQUEST_BYTES = 256 * 1024

# JSON-RPC error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

ALLOWED_METHODS = "GET, POST, OPTIONS"
CORS_HEADERS = {"Access-Control-Allow-Origin": "*"}
PREFLIGHT_HEADERS = {
    **CORS_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Max-Age": "86400",
}


@dataclass
class HttpResponse:
    status: int
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""


# --- the non-POST verbs, as pure functions ----------------------------------------------------------


def handle_get(accept: str | None) -> HttpResponse:
    """``GET /mcp``: the notice for a browser; 405 for a client that wants an SSE stream (we offer none)."""
    if "text/event-stream" in (accept or "").lower():
        return HttpResponse(405, {**CORS_HEADERS, "Allow": ALLOWED_METHODS, "Vary": "Accept"})
    return HttpResponse(200, {**CORS_HEADERS, "Content-Type": "text/html", "Vary": "Accept"}, GET_NOTICE)


def handle_options() -> HttpResponse:
    return HttpResponse(204, dict(PREFLIGHT_HEADERS))


def method_not_allowed() -> HttpResponse:
    return HttpResponse(405, {**CORS_HEADERS, "Allow": ALLOWED_METHODS})


def _json_response(status: int, payload: Any) -> HttpResponse:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return HttpResponse(status, {**CORS_HEADERS, "Content-Type": "application/json"}, body)


def _error(id_: Any, code: int, message: str, data: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": id_, "error": err}


def _valid_id(value: Any) -> bool:
    return isinstance(value, str) or (isinstance(value, int) and not isinstance(value, bool))


def negotiate_version(requested: Any) -> str:
    return requested if requested in SUPPORTED_PROTOCOL_VERSIONS else LATEST_PROTOCOL_VERSION


class _InvalidParams(Exception):
    pass


class McpServer:
    def __init__(
        self,
        provider: EndpointProvider | None = None,
        *,
        ratelimiter: FixedWindowRateLimiter | None = None,
        api_origin: str = execute_mod.DEFAULT_API_ORIGIN,
        session_factory: Callable[[], Any] = execute_mod.default_session_factory,
    ):
        self.tools = Tools(provider or OpenAPIFileProvider(), api_origin=api_origin, session_factory=session_factory)
        self.ratelimiter = ratelimiter or FixedWindowRateLimiter(InMemoryCache())

    # --- HTTP ---------------------------------------------------------------------------------------

    def handle_http(
        self,
        method: str,
        headers: Mapping[str, str],
        body: bytes,
        client_ip: str | None,
    ) -> HttpResponse:
        h = {k.lower(): v for k, v in headers.items()}
        method = method.upper()
        if method in ("GET", "HEAD"):
            resp = handle_get(h.get("accept"))
            if method == "HEAD":
                resp.body = b""
            return resp
        if method == "OPTIONS":
            return handle_options()
        if method != "POST":
            return method_not_allowed()
        return self.handle_post(h, body, client_ip)

    def handle_post(self, headers: Mapping[str, str], body: bytes, client_ip: str | None) -> HttpResponse:
        h = {k.lower(): v for k, v in headers.items()}
        if len(body) > MAX_REQUEST_BYTES:
            return _json_response(413, _error(None, INVALID_REQUEST, "Request body too large"))
        content_type = h.get("content-type", "").split(";")[0].strip().lower()
        if content_type != "application/json":
            return _json_response(415, _error(None, INVALID_REQUEST, "Content-Type must be application/json"))
        version = h.get("mcp-protocol-version")
        if version is not None and version not in SUPPORTED_PROTOCOL_VERSIONS:
            supported = ", ".join(SUPPORTED_PROTOCOL_VERSIONS)
            return _json_response(
                400,
                _error(None, INVALID_REQUEST, f"Unsupported MCP-Protocol-Version: {version}. Supported: {supported}"),
            )
        try:
            message = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return _json_response(400, _error(None, PARSE_ERROR, "Parse error"))
        status, payload = self.handle_message(message, client_ip)
        if payload is None:
            return HttpResponse(status, dict(CORS_HEADERS))
        return _json_response(status, payload)

    # --- JSON-RPC -----------------------------------------------------------------------------------

    def handle_message(self, message: Any, client_ip: str | None) -> tuple[int, dict[str, Any] | None]:
        """Return (HTTP status, JSON-RPC response or None for 202)."""
        if isinstance(message, list):
            return 400, _error(None, INVALID_REQUEST, "Batch requests are not supported")
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return 400, _error(None, INVALID_REQUEST, "Invalid Request")
        if "method" not in message:
            if ("result" in message or "error" in message) and "id" in message:
                return 202, None  # a response from the client; we never ask for one, so drop it
            return 400, _error(None, INVALID_REQUEST, "Invalid Request")
        method = message["method"]
        if not isinstance(method, str):
            return 400, _error(None, INVALID_REQUEST, "Invalid Request")
        if "id" not in message:
            return 202, None  # a notification (notifications/initialized, notifications/cancelled, ...)
        id_ = message["id"]
        if not _valid_id(id_):
            return 400, _error(None, INVALID_REQUEST, "Invalid Request: id must be a string or an integer")
        params = message.get("params", {})
        if params is None:
            params = {}
        if not isinstance(params, dict):
            return 200, _error(id_, INVALID_PARAMS, "params must be an object")
        handler = {
            "initialize": self._initialize,
            "ping": self._ping,
            "tools/list": self._tools_list,
            "tools/call": self._tools_call,
        }.get(method)
        if handler is None:
            return 200, _error(id_, METHOD_NOT_FOUND, f"Method not found: {method}")
        try:
            result = handler(params, client_ip)
        except _InvalidParams as e:
            return 200, _error(id_, INVALID_PARAMS, str(e))
        except Exception:
            logger.exception("MCP %s failed", method)
            return 200, _error(id_, INTERNAL_ERROR, "Internal error")
        return 200, {"jsonrpc": "2.0", "id": id_, "result": result}

    def _initialize(self, params: dict[str, Any], _client_ip) -> dict[str, Any]:
        requested = params.get("protocolVersion")
        if not isinstance(requested, str):
            msg = "initialize requires a protocolVersion string"
            raise _InvalidParams(msg)
        return {
            "protocolVersion": negotiate_version(requested),
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": dict(SERVER_INFO),
            "instructions": INSTRUCTIONS,
        }

    def _ping(self, _params, _client_ip) -> dict[str, Any]:
        return {}

    def _tools_list(self, _params, _client_ip) -> dict[str, Any]:
        return {"tools": tool_definitions()}

    def _tools_call(self, params: dict[str, Any], client_ip) -> dict[str, Any]:
        name = params.get("name")
        if not isinstance(name, str) or name not in TOOL_NAMES:
            msg = f"Unknown tool: {name}"
            raise _InvalidParams(msg)
        arguments = params.get("arguments", {})
        if arguments is None:
            arguments = {}
        if not isinstance(arguments, dict):
            msg = "arguments must be an object"
            raise _InvalidParams(msg)
        decision = self.ratelimiter.check_tool_call(name, client_ip)
        if not decision.allowed:
            return error_result(f"Rate limit exceeded for {name}. Retry after {decision.retry_after} seconds.")
        return self.tools.call(name, arguments)
