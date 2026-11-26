"""Where the pure Markdown tests find the developer-docs source files.

Order: `$DEVPORTAL_MIGRATION_SOURCE`, the vendored snapshot `devportal/migration_source/`, then a local clone at
`/home/user/sefaria/developer-docs`. Tests that need the source skip when none exists.
"""

import os
import pathlib

import pytest

REPO = pathlib.Path(__file__).resolve().parents[3]
CANDIDATES = [
    os.environ.get("DEVPORTAL_MIGRATION_SOURCE"),
    str(REPO / "devportal" / "migration_source"),
    "/home/user/sefaria/developer-docs",
]
CONTENT_TREES = ("docs", "reference", "custom_pages")


def source_root():
    for candidate in CANDIDATES:
        if candidate and all((pathlib.Path(candidate) / tree).is_dir() for tree in CONTENT_TREES):
            return pathlib.Path(candidate)
    return None


def require_source_root():
    root = source_root()
    if root is None:
        pytest.skip("developer-docs source not found (set DEVPORTAL_MIGRATION_SOURCE)")
    return root


def source_files(root):
    """The content files of the source: every .md and .html under docs/, reference/ and custom_pages/."""
    files = []
    for tree in CONTENT_TREES:
        files += [p for p in (root / tree).rglob("*") if p.is_file() and p.suffix in (".md", ".html")]
    return sorted(files)
