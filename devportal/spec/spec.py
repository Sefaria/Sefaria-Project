"""The operation index and the per-path slice of the OpenAPI document (PLAN.md §2.7). No Django import.

Rules:

- **title** = ``operation.summary``, falling back to the path item's ``summary``;
- **description** = ``operation.description`` only (the path item's description is never used);
- **parameters** = the path item's parameters merged with the operation's, keyed by ``(name, in)``; the
  operation's entry replaces the path item's in place, and the operation's other parameters follow;
- **slice** = ``openapi``, ``info``, ``servers``, only the tags the path's operations use, that path item,
  and every component it references, transitively. Key order and component order follow the spec, so
  ``slice_json`` reproduces the ``# OpenAPI definition`` block of live's ``.md`` pages byte for byte.
"""

from __future__ import annotations

import json
from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Any

from devportal.spec.loader import sha256_hex

HTTP_METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")
_SLICE_TOP_KEYS = ("openapi", "info", "servers", "security")


class SpecError(ValueError):
    """The OpenAPI document breaks an assumption of the portal (for example a duplicate operationId)."""


@dataclass(frozen=True)
class Operation:
    operation_id: str
    method: str  # lower case, as the spec spells it
    path: str  # the path template, e.g. /api/v3/texts/{tref}
    tags: tuple[str, ...]
    deprecated: bool
    title: str
    description: str
    parameters: tuple[Mapping[str, Any], ...] = ()
    request_body: Mapping[str, Any] | None = None
    responses: Mapping[str, Any] = field(default_factory=dict)
    security: Any = None
    path_summary: str = ""

    @property
    def tag(self) -> str:
        """The tag the sidebar groups the operation under: its first tag, or "" when it has none."""
        return self.tags[0] if self.tags else ""

    def golden_entry(self) -> dict[str, Any]:
        """The operation's entry in the golden ``devportal/contracts/golden/operations.json``."""
        return {
            "operationId": self.operation_id,
            "method": self.method,
            "path": self.path,
            "tag": self.tag,
            "deprecated": self.deprecated,
            "title": self.title,
            "description": self.description,
        }


def _iter_refs(node: Any) -> Iterator[str]:
    if isinstance(node, Mapping):
        ref = node.get("$ref")
        if isinstance(ref, str):
            yield ref
        for value in node.values():
            yield from _iter_refs(value)
    elif isinstance(node, list):
        for value in node:
            yield from _iter_refs(value)


def _unescape(part: str) -> str:
    return part.replace("~1", "/").replace("~0", "~")


class Spec:
    """One parsed OpenAPI 3 document. Build it with ``devportal.spec.load_spec()`` to share it per process."""

    def __init__(self, document: Mapping[str, Any], *, sha: str | None = None, source: Path | None = None):
        self.document = document
        self.sha = sha or sha256_hex(json.dumps(document, sort_keys=True).encode("utf-8"))
        self.source = source

    # -- operations ------------------------------------------------------------------------------

    @cached_property
    def _operations(self) -> tuple[Operation, ...]:
        ops: list[Operation] = []
        seen: set[str] = set()
        for path, item in self.document.get("paths", {}).items():
            if not isinstance(item, Mapping):
                continue
            for method in HTTP_METHODS:
                op = item.get(method)
                if not isinstance(op, Mapping):
                    continue
                op_id = op.get("operationId")
                if not op_id:
                    raise SpecError(f"{method.upper()} {path} has no operationId")
                if op_id in seen:
                    raise SpecError(f"duplicate operationId {op_id!r}")
                seen.add(op_id)
                ops.append(
                    Operation(
                        operation_id=op_id,
                        method=method,
                        path=path,
                        tags=tuple(op.get("tags") or ()),
                        deprecated=bool(op.get("deprecated", False)),
                        title=op.get("summary") or item.get("summary") or "",
                        description=op.get("description") or "",
                        parameters=self.merge_parameters(item.get("parameters") or [], op.get("parameters") or []),
                        request_body=op.get("requestBody"),
                        responses=op.get("responses") or {},
                        security=op.get("security", self.document.get("security")),
                        path_summary=item.get("summary") or "",
                    )
                )
        return tuple(ops)

    @cached_property
    def _by_id(self) -> dict[str, Operation]:
        return {op.operation_id: op for op in self._operations}

    def operations(self) -> tuple[Operation, ...]:
        """Every operation, in spec order (paths in document order, methods in ``HTTP_METHODS`` order)."""
        return self._operations

    def operation(self, operation_id: str) -> Operation | None:
        return self._by_id.get(operation_id)

    def operation_ids(self) -> list[str]:
        return [op.operation_id for op in self._operations]

    def merge_parameters(self, path_params, op_params) -> tuple[Mapping[str, Any], ...]:
        """Path-item parameters merged with the operation's; the operation wins on the same ``(name, in)``."""
        merged: dict[tuple[str, str], Mapping[str, Any]] = {}
        for param in [*path_params, *op_params]:
            resolved = self.dereference(param)
            key = (resolved.get("name", ""), resolved.get("in", ""))
            merged[key] = param
        return tuple(merged.values())

    # -- tags ------------------------------------------------------------------------------------

    def tag_names(self) -> list[str]:
        """Tags in the order the document declares them, then any used but undeclared, in first-use order."""
        names = [t.get("name") for t in self.document.get("tags", []) if t.get("name")]
        for op in self._operations:
            for tag in op.tags:
                if tag not in names:
                    names.append(tag)
        return names

    def tag_description(self, name: str) -> str:
        for tag in self.document.get("tags", []):
            if tag.get("name") == name:
                return tag.get("description") or ""
        return ""

    # -- references ------------------------------------------------------------------------------

    def resolve_pointer(self, ref: str) -> Any:
        if not ref.startswith("#/"):
            return None
        node: Any = self.document
        for part in ref[2:].split("/"):
            part = _unescape(part)
            if not isinstance(node, Mapping) or part not in node:
                return None
            node = node[part]
        return node

    def dereference(self, node: Any, _stack: tuple[str, ...] = ()) -> Any:
        """``node`` with every local ``$ref`` replaced by its target; a cyclic reference is left as ``$ref``."""
        if isinstance(node, Mapping):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/"):
                target = self.resolve_pointer(ref)
                if target is None or ref in _stack:
                    return dict(node)
                return self.dereference(target, (*_stack, ref))
            return {k: self.dereference(v, _stack) for k, v in node.items()}
        if isinstance(node, list):
            return [self.dereference(v, _stack) for v in node]
        return node

    # -- the slice -------------------------------------------------------------------------------

    def _referenced_components(self, root: Any) -> set[tuple[str, str]]:
        """``(section, name)`` of every component ``root`` references, transitively."""
        found: set[tuple[str, str]] = set()
        pending = list(_iter_refs(root))
        while pending:
            ref = pending.pop()
            if not ref.startswith("#/components/"):
                continue
            parts = [_unescape(p) for p in ref[len("#/components/") :].split("/")]
            if len(parts) < 2:
                continue
            key = (parts[0], parts[1])
            if key in found:
                continue
            target = self.document.get("components", {}).get(key[0], {}).get(key[1])
            if target is None:
                continue
            found.add(key)
            pending.extend(_iter_refs(target))
        return found

    def slice_for_path(self, path: str) -> dict[str, Any]:
        """The spec pruned to one path (PLAN.md §2.7). Raises ``KeyError`` for an unknown path."""
        item = self.document["paths"][path]
        doc = self.document
        out: dict[str, Any] = {k: doc[k] for k in _SLICE_TOP_KEYS if k in doc}

        used_tags: list[str] = []
        security_names: set[str] = set()
        for method in HTTP_METHODS:
            op = item.get(method)
            if not isinstance(op, Mapping):
                continue
            for tag in op.get("tags") or ():
                if tag not in used_tags:
                    used_tags.append(tag)
            for requirement in op.get("security", doc.get("security")) or ():
                security_names.update(requirement)
        declared = [t for t in doc.get("tags", []) if t.get("name") in used_tags]
        declared_names = {t.get("name") for t in declared}
        tags = declared + [{"name": t} for t in used_tags if t not in declared_names]
        if tags:
            out["tags"] = tags

        out["paths"] = {path: item}

        wanted = self._referenced_components(item)
        wanted.update(("securitySchemes", name) for name in security_names)
        components: dict[str, dict[str, Any]] = {}
        for section, entries in doc.get("components", {}).items():
            if not isinstance(entries, Mapping):
                continue
            picked = {name: value for name, value in entries.items() if (section, name) in wanted}
            if picked:
                components[section] = picked
        if components:
            out["components"] = components
        return out

    def slice_for_operation(self, operation_id: str) -> dict[str, Any]:
        op = self._by_id[operation_id]
        return self.slice_for_path(op.path)

    @staticmethod
    def dump_slice(slice_: Mapping[str, Any]) -> str:
        """The slice as live prints it in an endpoint's ``.md`` page: two-space indent, UTF-8 unescaped."""
        return json.dumps(slice_, indent=2, ensure_ascii=False)

    def slice_json(self, operation_id: str) -> str:
        return self.dump_slice(self.slice_for_operation(operation_id))

    def slice_sha(self, operation_id: str) -> str:
        """``Page.spec_slice_sha``: SHA-256 of ``slice_json``."""
        return sha256_hex(self.slice_json(operation_id).encode("utf-8"))

    # -- goldens ---------------------------------------------------------------------------------

    def operations_golden(self) -> dict[str, Any]:
        """The content of ``devportal/contracts/golden/operations.json``."""
        return {"operations": [op.golden_entry() for op in self._operations]}
