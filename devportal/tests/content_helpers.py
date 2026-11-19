"""Shared helpers for the content tests (import, publish, images, seeding). Not a test module."""

import io
import json
import shutil
from pathlib import Path

import pytest

from devportal.services.seed import SOURCE_DIR, Importer

REPO_ROOT = Path(__file__).resolve().parents[2]
LIVE_MACHINE = REPO_ROOT / "docs" / "dev-portal" / "research" / "site" / "machine"


@pytest.fixture
def source(tmp_path):
    """A writable copy of the vendored snapshot."""
    dest = tmp_path / "migration_source"
    shutil.copytree(SOURCE_DIR, dest, ignore=shutil.ignore_patterns("__pycache__"))
    return dest


def run_import(source_dir=SOURCE_DIR, **kwargs):
    kwargs.setdefault("sync_spec", False)
    return Importer(source_dir, **kwargs).run()


@pytest.fixture
def imported(db, source):  # noqa: ARG001 - `db` enables database access
    report = run_import(source)
    return source, report


def live_sidebar(name):
    return json.loads((LIVE_MACHINE / f"sidebar-{name}.json").read_text(encoding="utf-8"))


def png_bytes(color=(200, 30, 30), size=(3, 2), fmt="PNG"):
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return buf.getvalue()


SAFE_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>'
HOSTILE_SVG = (
    b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script>'
    b'<image href="https://evil.example/x.png"/></svg>'
)


class FakeStorage:
    name = "fake"
    base = "https://storage.example/bucket/"

    def __init__(self):
        self.files = {}

    def url_for(self, name):
        return self.base + name

    def save(self, name, data, content_type):
        self.files[name] = (data, content_type)
        return self.url_for(name)

    def exists(self, name):
        return name in self.files

    def owns_url(self, url):
        return url.startswith(self.base + "developers/")


def fake_fetch(calls):
    """A fetch that serves a valid image for any URL, by extension, and records each call."""

    def fetch(url):
        calls.append(url)
        lower = url.lower()
        if lower.endswith(".svg"):
            return SAFE_SVG
        if lower.endswith((".jpg", ".jpeg")):
            return png_bytes(fmt="JPEG")
        return png_bytes()

    return fetch
