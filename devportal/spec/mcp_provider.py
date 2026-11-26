"""An ``EndpointProvider`` for the MCP server built on the spec layer and the overlay (PLAN.md §2.10).

It replaces ``devportal.mcp.provider.OpenAPIFileProvider``: the same operations, in the same order, with
the merged title and description of §2.7 when an overlay is given. No Django import: the overlay comes from
``overlay_loader``, a callable returning ``{operationId: Overlay | mapping}``. The Django side supplies
``devportal.views.reference.published_overlays``, which reads the published endpoint revisions.

    from devportal.spec.mcp_provider import SpecEndpointProvider
    from devportal.views.reference import published_overlays
    MCPServer(provider=SpecEndpointProvider(overlay_loader=published_overlays))
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from devportal.mcp.provider import Operation as MCPOperation
from devportal.spec.loader import load_spec
from devportal.spec.overlay import Overlay, merge
from devportal.spec.spec import Spec

OverlayLoader = Callable[[], Mapping[str, Any]]


class SpecEndpointProvider:
    """Implements ``devportal.mcp.provider.EndpointProvider``."""

    def __init__(self, spec: Spec | None = None, *, overlay_loader: OverlayLoader | None = None):
        self._spec = spec
        self._overlay_loader = overlay_loader

    @property
    def spec(self) -> Spec:
        if self._spec is None:
            self._spec = load_spec()
        return self._spec

    def _overlays(self) -> dict[str, Overlay]:
        if self._overlay_loader is None:
            return {}
        out = {}
        for op_id, value in (self._overlay_loader() or {}).items():
            out[op_id] = value if isinstance(value, Overlay) else Overlay.from_mapping(value)
        return out

    def operations(self) -> Sequence[MCPOperation]:
        overlays = self._overlays()
        result = []
        for op in self.spec.operations():
            merged = merge(op, overlays.get(op.operation_id))
            result.append(
                MCPOperation(
                    operation_id=op.operation_id,
                    method=op.method.upper(),
                    path=op.path,
                    tags=op.tags,
                    deprecated=merged.deprecated,
                    title=merged.title,
                    description=merged.description_md,
                    parameters=op.parameters,
                    request_body=op.request_body,
                    responses=op.responses,
                    security=op.security,
                )
            )
        return tuple(result)

    def servers(self) -> list[dict[str, Any]]:
        return list(self.spec.document.get("servers", []))

    def security_schemes(self) -> dict[str, Any]:
        return dict(self.spec.document.get("components", {}).get("securitySchemes", {}))

    def dereference(self, node: Any) -> Any:
        return self.spec.dereference(node)
