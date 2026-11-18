"""The four MCP tools (PLAN §2.10).

Names, titles and input schemas are copied byte for byte from live's ``tools/list``
(``docs/dev-portal/research/site/machine/mcp-tools-list.json``; ``mcp_tools_list_test`` checks it). The
only change is I-9: ``execute-request``'s description gains one sentence stating the lock, and its
annotations say it only reads.

No Django import here.
"""

from __future__ import annotations

import copy
import json
from collections.abc import Callable, Mapping
from typing import Any
from urllib.parse import unquote

from devportal.mcp import execute as execute_mod
from devportal.mcp.provider import EndpointProvider, Operation

EXECUTE_LOCK_SENTENCE = (
    "Only the documented operations of the Sefaria API at https://www.sefaria.org can be called;"
    " any other host, path, method or body is rejected before a request is sent."
)
MAX_PATTERN_LENGTH = 200

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list-endpoints",
        "title": "List API Endpoints",
        "description": "Lists all API paths and their HTTP methods with summaries, organized by path. Results can be passed directly into 'get-endpoint'.",
        "inputSchema": {"type": "object", "$schema": "https://json-schema.org/draft/2020-12/schema", "properties": {}},
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
    {
        "name": "get-endpoint",
        "title": "Get Endpoint Details",
        "description": "Gets detailed information about a specific API endpoint, including security schemes and servers",
        "inputSchema": {
            "type": "object",
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "properties": {
                "path": {"type": "string", "description": "The API endpoint path (e.g. /api/v1/users)."},
                "method": {"type": "string", "description": "The HTTP method (e.g. GET, POST, PUT, DELETE)."},
            },
            "required": ["path", "method"],
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
    {
        "name": "search-endpoints",
        "title": "Search API Endpoints",
        "description": "Performs a deep search through paths, operations, and parameters to discover relevant API endpoints. Use this tool to find specific API capabilities, required parameters, or data models based on search keywords. Results can be passed directly into 'get-endpoint'.",
        "inputSchema": {
            "type": "object",
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "properties": {"pattern": {"type": "string", "description": "Search pattern (case-insensitive)"}},
            "required": ["pattern"],
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False},
    },
    {
        "name": "execute-request",
        "title": "Execute API Request",
        "description": "Executes an API request with a given HAR request object." + " " + EXECUTE_LOCK_SENTENCE,
        "inputSchema": {
            "type": "object",
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "properties": {
                "harRequest": {
                    "type": "object",
                    "properties": {
                        "method": {"type": "string", "description": "options, get, head, patch, post, put, delete"},
                        "url": {"type": "string", "format": "uri", "description": "full url to call"},
                        "headers": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {"name": {"type": "string"}, "value": {"type": "string"}},
                                "required": ["name", "value"],
                            },
                        },
                        "postData": {
                            "anyOf": [
                                {
                                    "type": "object",
                                    "properties": {
                                        "mimeType": {
                                            "type": "string",
                                            "description": "e.g. application/json, text/plain",
                                        },
                                        "text": {"type": "string", "description": "Raw request body as a string"},
                                    },
                                    "required": ["mimeType", "text"],
                                },
                                {
                                    "type": "object",
                                    "properties": {
                                        "mimeType": {
                                            "type": "string",
                                            "description": "e.g. multipart/form-data, application/x-www-form-urlencoded. Use multipart/form-data for form submissions.",
                                        },
                                        "params": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {"name": {"type": "string"}, "value": {"type": "string"}},
                                                "required": ["name"],
                                            },
                                            "description": "Form parameters. Use this instead of text for multipart/form-data and url-encoded requests.",
                                        },
                                    },
                                    "required": ["mimeType", "params"],
                                },
                            ]
                        },
                        "queryString": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {"name": {"type": "string"}, "value": {"type": "string"}},
                                "required": ["name", "value"],
                            },
                        },
                    },
                    "required": ["method", "url"],
                    "description": "HAR request object",
                }
            },
            "required": ["harRequest"],
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": True},
    },
]


class ToolError(Exception):
    """A tool failed in a way the agent should see (returned as a result with ``isError: true``)."""


def tool_definitions() -> list[dict[str, Any]]:
    return copy.deepcopy(TOOL_DEFINITIONS)


TOOL_NAMES = tuple(t["name"] for t in TOOL_DEFINITIONS)


def _json_text(value: Any) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(value, ensure_ascii=False, indent=2)}], "isError": False}


def error_result(message: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": message}], "isError": True}


def _string_arg(arguments: Mapping[str, Any], name: str) -> str:
    value = arguments.get(name)
    if not isinstance(value, str) or not value.strip():
        msg = f"The '{name}' argument is required and must be a non-empty string."
        raise ToolError(msg)
    return value.strip()


class Tools:
    def __init__(
        self,
        provider: EndpointProvider,
        *,
        api_origin: str = execute_mod.DEFAULT_API_ORIGIN,
        session_factory: Callable[[], Any] = execute_mod.default_session_factory,
    ):
        self.provider = provider
        self.api_origin = api_origin
        self.session_factory = session_factory
        self._search_index: list[tuple[Operation, dict[str, str]]] | None = None

    def call(self, name: str, arguments: Mapping[str, Any]) -> dict[str, Any]:
        handler = {
            "list-endpoints": self.list_endpoints,
            "get-endpoint": self.get_endpoint,
            "search-endpoints": self.search_endpoints,
            "execute-request": self.execute_request,
        }[name]
        try:
            return _json_text(handler(arguments))
        except ToolError as e:
            return error_result(str(e))

    # --- list-endpoints -------------------------------------------------------------------------------

    def _summary(self, op: Operation) -> dict[str, Any]:
        out = {"method": op.method, "summary": op.title, "operationId": op.operation_id, "tags": list(op.tags)}
        if op.deprecated:
            out["deprecated"] = True
        return out

    def list_endpoints(self, _arguments: Mapping[str, Any]) -> dict[str, Any]:
        paths: dict[str, list[dict[str, Any]]] = {}
        for op in self.provider.operations():
            paths.setdefault(op.path, []).append(self._summary(op))
        return {"servers": [s.get("url") for s in self.provider.servers()], "paths": paths}

    # --- get-endpoint ---------------------------------------------------------------------------------

    def _find(self, path: str, method: str) -> Operation:
        ops = self.provider.operations()
        method = method.upper()
        exact = [op for op in ops if op.path == path]
        if not exact:
            # Accept a concrete path too (e.g. /api/v3/texts/Genesis%201:1) by matching it to a template.
            try:
                exact = execute_mod.match_operations(ops, execute_mod.split_path(unquote(path)))
            except execute_mod.RequestRejected:
                exact = []
        if not exact:
            msg = f"No endpoint has the path {path!r}. Use list-endpoints or search-endpoints to find one."
            raise ToolError(msg)
        for op in exact:
            if op.method == method:
                return op
        methods = ", ".join(sorted({op.method for op in exact}))
        msg = f"{method} is not defined for {exact[0].path}. Defined methods: {methods}."
        raise ToolError(msg)

    def get_endpoint(self, arguments: Mapping[str, Any]) -> dict[str, Any]:
        op = self._find(_string_arg(arguments, "path"), _string_arg(arguments, "method"))
        deref = self.provider.dereference
        out: dict[str, Any] = {
            "path": op.path,
            "method": op.method,
            "operationId": op.operation_id,
            "summary": op.title,
            "description": op.description,
            "tags": list(op.tags),
        }
        if op.deprecated:
            out["deprecated"] = True
        out["parameters"] = deref(list(op.parameters))
        if op.request_body is not None:
            out["requestBody"] = deref(op.request_body)
        out["responses"] = deref(dict(op.responses))
        out["servers"] = self.provider.servers()
        out["security"] = list(op.security or [])
        out["securitySchemes"] = self.provider.security_schemes()
        return out

    # --- search-endpoints -----------------------------------------------------------------------------

    def _index(self) -> list[tuple[Operation, dict[str, str]]]:
        if self._search_index is None:
            deref = self.provider.dereference
            index = []
            for op in self.provider.operations():
                params = deref(list(op.parameters))
                fields = {
                    "path": op.path,
                    "method": op.method,
                    "operationId": op.operation_id,
                    "summary": op.title,
                    "description": op.description,
                    "tags": " ".join(op.tags),
                    "parameters": " ".join(
                        f"{p.get('name', '')} {p.get('description', '')}" for p in params if isinstance(p, Mapping)
                    ),
                    "schemas": json.dumps(
                        {"requestBody": deref(op.request_body), "responses": deref(dict(op.responses))},
                        ensure_ascii=False,
                    ),
                }
                index.append((op, {k: v.lower() for k, v in fields.items()}))
            self._search_index = index
        return self._search_index

    def search_endpoints(self, arguments: Mapping[str, Any]) -> dict[str, Any]:
        pattern = _string_arg(arguments, "pattern")
        if len(pattern) > MAX_PATTERN_LENGTH:
            msg = f"The pattern must be at most {MAX_PATTERN_LENGTH} characters."
            raise ToolError(msg)
        needle = pattern.lower()
        results = []
        for op, fields in self._index():
            matched = [name for name, text in fields.items() if needle in text]
            if matched:
                results.append({"path": op.path, **self._summary(op), "matchedIn": matched})
        return {"pattern": pattern, "count": len(results), "results": results}

    # --- execute-request ------------------------------------------------------------------------------

    def execute_request(self, arguments: Mapping[str, Any]) -> dict[str, Any]:
        try:
            return execute_mod.execute(
                arguments.get("harRequest"),
                self.provider.operations(),
                api_origin=self.api_origin,
                session_factory=self.session_factory,
            )
        except (execute_mod.RequestRejected, execute_mod.UpstreamError) as e:
            raise ToolError(f"Request not sent: {e}" if isinstance(e, execute_mod.RequestRejected) else str(e)) from e
