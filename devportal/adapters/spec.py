"""A minimal read-only view of `docs/openAPI.json` for the import, the navigation and the seeding hook.

The full spec layer (`devportal.spec`, overlay merge, per-path slices) belongs to another
workstream; this module only needs the operation index and a stable hash. Pure Python.
"""

import hashlib
import json
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = REPO_ROOT / "docs" / "openAPI.json"
HTTP_METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")


def normalize_numbers(value):
    """Integral floats become ints, so `100` and `100.0` hash alike (see SOURCE.json)."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: normalize_numbers(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize_numbers(v) for v in value]
    return value


def normalized_sha256(data):
    """sha256 of a parsed JSON document, canonicalized (sorted keys, normalized numbers)."""
    canonical = json.dumps(normalize_numbers(data), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def load_spec(path=None):
    return json.loads(Path(path or SPEC_PATH).read_text(encoding="utf-8"))


def spec_sha(path=None):
    return normalized_sha256(load_spec(path))


def _index(spec):
    ops = {}
    for api_path, item in (spec.get("paths") or {}).items():
        for method, op in item.items():
            if method not in HTTP_METHODS or not isinstance(op, dict):
                continue
            op_id = op.get("operationId")
            if not op_id:
                continue
            tags = op.get("tags") or []
            ops[op_id] = {
                "operation_id": op_id,
                "method": method,
                "path": api_path,
                # ReadMe falls back to the path item's summary when the operation has none.
                "summary": op.get("summary") or item.get("summary") or "",
                "tag": tags[0] if tags else "",
                "deprecated": bool(op.get("deprecated", False)),
            }
    return ops


@lru_cache(maxsize=4)
def _cached_index(path_str, mtime):  # noqa: ARG001 - mtime is part of the cache key
    return _index(load_spec(path_str))


def operation_index(path=None):
    """`{operationId: {"method", "path", "summary", "tag", "deprecated"}}`."""
    p = Path(path or SPEC_PATH)
    return _cached_index(str(p), p.stat().st_mtime)
