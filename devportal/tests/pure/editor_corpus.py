"""Locates (and, when needed, builds) the editor's TypeScript outputs for the pure cross-language tests.

`devportal-ui/scripts/roundtrip-corpus.ts` writes them to `.devportal-run/editor-roundtrip/` (CI runs
`npm run roundtrip-corpus` before the pure pytest). When they are missing and devportal-ui's dependencies are
installed, they are built here; without Node or the dependencies the tests are skipped locally and fail in CI.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
UI = REPO_ROOT / "devportal-ui"
OUT = REPO_ROOT / ".devportal-run" / "editor-roundtrip"
SOURCE = REPO_ROOT / "devportal" / "migration_source"
CONTRACTS = REPO_ROOT / "devportal" / "contracts"


def _sources_newer_than(manifest):
    built = manifest.stat().st_mtime
    inputs = [*(UI / "src" / "editor").rglob("*.ts"), UI / "scripts" / "roundtrip-corpus.ts"]
    return any(p.stat().st_mtime > built for p in inputs)


def outputs():
    """The output directory, built if missing or older than the editor sources."""
    manifest = OUT / "manifest.json"
    if manifest.exists() and not _sources_newer_than(manifest):
        return OUT
    node = shutil.which("node")
    if node is None or not (UI / "node_modules").is_dir():
        message = "the editor's outputs are missing: run `npm run roundtrip-corpus` in devportal-ui"
        if os.environ.get("CI"):
            pytest.fail(message)
        pytest.skip(message)
    subprocess.run([node, "scripts/roundtrip-corpus.ts", str(OUT)], cwd=UI, check=True, timeout=600)  # noqa: S603
    return OUT


def manifest():
    return json.loads((outputs() / "manifest.json").read_text(encoding="utf-8"))


def source_files():
    return sorted(str(p.relative_to(SOURCE)) for p in SOURCE.rglob("*.md"))
