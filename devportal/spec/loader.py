"""Loading `docs/openAPI.json` once per process (PLAN.md §2.7). No Django import."""

from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SPEC_PATH = REPO_ROOT / "docs" / "openAPI.json"

_lock = threading.Lock()
_cache: dict[Path, object] = {}


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_spec(path: Path | str | None = None):
    """The `Spec` for `path` (default `docs/openAPI.json`), parsed once per process and path."""
    from devportal.spec.spec import Spec  # local: spec.py imports this module

    resolved = Path(path or DEFAULT_SPEC_PATH).resolve()
    with _lock:
        spec = _cache.get(resolved)
        if spec is None:
            raw = resolved.read_bytes()
            spec = Spec(json.loads(raw.decode("utf-8")), sha=sha256_hex(raw), source=resolved)
            _cache[resolved] = spec
        return spec


def clear_cache() -> None:
    """Forget every loaded spec (tests, and a long-lived process after a deploy swapped the file)."""
    with _lock:
        _cache.clear()
