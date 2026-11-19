"""The editor overlay and the merged view of an operation (PLAN.md §2.7). No Django import.

The overlay is what an endpoint ``Page``'s published ``PageRevision`` adds on top of the spec:
``title_override``, ``sidebar_label`` and ``description_override_md`` (plus ``body_md``, the free Markdown
shown after the description, and the revision's own ``deprecated`` flag). Nothing in it is ever written
back to ``docs/openAPI.json``.

- title = ``title_override`` or the spec title;
- sidebar label = ``sidebar_label`` or that title;
- description = ``description_override_md`` when set, otherwise the spec description.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from devportal.spec.spec import Operation


@dataclass(frozen=True)
class Overlay:
    title_override: str = ""
    sidebar_label: str = ""
    description_override_md: str = ""
    body_md: str = ""
    deprecated: bool = False

    @classmethod
    def from_revision(cls, revision: Any) -> Overlay:
        """From any object with the ``PageRevision`` overlay attributes (``None`` gives the empty overlay)."""
        if revision is None:
            return cls()
        return cls(
            title_override=(getattr(revision, "title_override", "") or "").strip(),
            sidebar_label=(getattr(revision, "sidebar_label", "") or "").strip(),
            description_override_md=getattr(revision, "description_override_md", "") or "",
            body_md=getattr(revision, "body_md", "") or "",
            deprecated=bool(getattr(revision, "deprecated", False)),
        )

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any] | None) -> Overlay:
        data = data or {}
        return cls(
            title_override=(data.get("title_override") or "").strip(),
            sidebar_label=(data.get("sidebar_label") or "").strip(),
            description_override_md=data.get("description_override_md") or "",
            body_md=data.get("body_md") or "",
            deprecated=bool(data.get("deprecated", False)),
        )


EMPTY_OVERLAY = Overlay()


@dataclass(frozen=True)
class MergedOperation:
    operation: Operation
    title: str
    sidebar_label: str
    description_md: str
    description_overridden: bool
    body_md: str
    deprecated: bool

    @property
    def operation_id(self) -> str:
        return self.operation.operation_id


def merge(operation: Operation, overlay: Overlay | None = None) -> MergedOperation:
    overlay = overlay or EMPTY_OVERLAY
    title = overlay.title_override or operation.title
    overridden = bool(overlay.description_override_md.strip())
    return MergedOperation(
        operation=operation,
        title=title,
        sidebar_label=overlay.sidebar_label or title,
        description_md=overlay.description_override_md if overridden else operation.description,
        description_overridden=overridden,
        body_md=overlay.body_md,
        deprecated=operation.deprecated or overlay.deprecated,
    )
