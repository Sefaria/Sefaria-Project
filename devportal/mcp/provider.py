"""Where the MCP tools get their API data from.

The tools never read the spec themselves. They ask an ``EndpointProvider``. The default one,
``OpenAPIFileProvider``, reads ``docs/openAPI.json`` directly with the rules of PLAN §2.7:

- title = ``operation.summary``, falling back to the path item's ``summary``;
- description = ``operation.description`` only;
- parameters = the path item's parameters merged with the operation's (the operation wins on the same
  ``name`` + ``in``).

An optional overlay (``operationId`` -> ``{"title": ..., "description": ...}``) gives the merged view of
§2.7. When ``devportal.spec`` lands, a provider built on its operation index and the published overlay
replaces this one; nothing else in ``devportal.mcp`` changes.

No Django import here.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Any, Protocol

HTTP_METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SPEC_PATH = REPO_ROOT / "docs" / "openAPI.json"


@dataclass(frozen=True)
class Operation:
    operation_id: str
    method: str  # upper case
    path: str  # the spec's path template, e.g. /api/v3/texts/{tref}
    tags: tuple[str, ...]
    deprecated: bool
    title: str
    description: str
    parameters: tuple[Mapping[str, Any], ...] = ()
    request_body: Mapping[str, Any] | None = None
    responses: Mapping[str, Any] = field(default_factory=dict)
    security: Sequence[Any] | None = None


class EndpointProvider(Protocol):
    """What the tools need. Keep it this small so another implementation is cheap."""

    def operations(self) -> Sequence[Operation]:
        """Every operation, in spec order."""

    def servers(self) -> list[dict[str, Any]]:
        """The spec's ``servers``."""

    def security_schemes(self) -> dict[str, Any]:
        """``components.securitySchemes`` (may be empty)."""

    def dereference(self, node: Any) -> Any:
        """``node`` with every local ``$ref`` replaced by its target (cycles left as ``$ref``)."""


class OpenAPIFileProvider:
    """Reads an OpenAPI 3 JSON file once and serves it through the provider interface."""

    def __init__(self, spec: Mapping[str, Any] | None = None, *, path: Path | str = DEFAULT_SPEC_PATH, overlay=None):
        self._spec_arg = spec
        self._path = Path(path)
        self._overlay: Mapping[str, Mapping[str, Any]] = overlay or {}

    @cached_property
    def spec(self) -> Mapping[str, Any]:
        if self._spec_arg is not None:
            return self._spec_arg
        with self._path.open(encoding="utf-8") as f:
            return json.load(f)

    @cached_property
    def _operations(self) -> tuple[Operation, ...]:
        ops = []
        for path, item in self.spec.get("paths", {}).items():
            path_params = item.get("parameters", [])
            for method in HTTP_METHODS:
                op = item.get(method)
                if not isinstance(op, Mapping):
                    continue
                op_id = op.get("operationId") or f"{method}-{path}"
                over = self._overlay.get(op_id, {})
                title = over.get("title") or op.get("summary") or item.get("summary") or ""
                description = over.get("description") or op.get("description") or ""
                ops.append(
                    Operation(
                        operation_id=op_id,
                        method=method.upper(),
                        path=path,
                        tags=tuple(op.get("tags", ())),
                        deprecated=bool(op.get("deprecated", False)),
                        title=title,
                        description=description,
                        parameters=tuple(self._merge_params(path_params, op.get("parameters", []))),
                        request_body=op.get("requestBody"),
                        responses=op.get("responses", {}),
                        security=op.get("security", self.spec.get("security")),
                    ),
                )
        return tuple(ops)

    def _merge_params(self, path_params, op_params):
        merged: dict[tuple[str, str], Any] = {}
        for p in list(path_params) + list(op_params):
            resolved = self.dereference(p)
            merged[(resolved.get("name", ""), resolved.get("in", ""))] = p
        return merged.values()

    def operations(self) -> Sequence[Operation]:
        return self._operations

    def servers(self) -> list[dict[str, Any]]:
        return list(self.spec.get("servers", []))

    def security_schemes(self) -> dict[str, Any]:
        return dict(self.spec.get("components", {}).get("securitySchemes", {}))

    def _lookup(self, ref: str) -> Any:
        node: Any = self.spec
        for part in ref[2:].split("/"):
            part = part.replace("~1", "/").replace("~0", "~")
            if not isinstance(node, Mapping) or part not in node:
                return None
            node = node[part]
        return node

    def dereference(self, node: Any, _stack: tuple[str, ...] = ()) -> Any:
        if isinstance(node, Mapping):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/"):
                target = self._lookup(ref)
                if target is None or ref in _stack:
                    return dict(node)
                return self.dereference(target, (*_stack, ref))
            return {k: self.dereference(v, _stack) for k, v in node.items()}
        if isinstance(node, list):
            return [self.dereference(v, _stack) for v in node]
        return node
