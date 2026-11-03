"""Template checks for third-party script tags on the shared layout and the talmudic page.

Scripts loaded from a CDN are pinned to an exact version and carry a Subresource
Integrity hash, so the browser refuses a file that does not match the pinned bytes.
These checks read the template source only; they do not need Django or a database.
"""
import re
from pathlib import Path

import pytest

TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "templates"
CHECKED_TEMPLATES = ["base.html", "talmudic_relationships.html"]
CDN_HOSTS = ("unpkg.com/", "cdnjs.cloudflare.com/", "code.jquery.com/", "ajax.googleapis.com/")

SCRIPT_TAG = re.compile(r"<script\b[^>]*>", re.IGNORECASE)
SRC_ATTR = re.compile(r'\bsrc="([^"]+)"')
INTEGRITY_ATTR = re.compile(r'\bintegrity="([^"]*)"')
CROSSORIGIN_ATTR = re.compile(r'\bcrossorigin="([^"]*)"')
EXACT_UNPKG_VERSION = re.compile(r"unpkg\.com/[^/@\s]+@\d+\.\d+\.\d+/")
EXACT_CDNJS_VERSION = re.compile(r"cdnjs\.cloudflare\.com/ajax/libs/[^/\s]+/\d+\.\d+\.\d+/")


def _cdn_script_tags(template_name):
    source = (TEMPLATES_DIR / template_name).read_text(encoding="utf-8")
    tags = []
    for tag in SCRIPT_TAG.findall(source):
        src = SRC_ATTR.search(tag)
        if src and any(host in src.group(1) for host in CDN_HOSTS):
            tags.append(tag)
    return tags


@pytest.mark.parametrize("template_name", CHECKED_TEMPLATES)
def test_cdn_script_tags_have_integrity_and_crossorigin(template_name):
    tags = _cdn_script_tags(template_name)
    assert tags, f"expected CDN script tags in {template_name}"
    for tag in tags:
        integrity = INTEGRITY_ATTR.search(tag)
        assert integrity and "sha384-" in integrity.group(1), f"missing SRI hash: {tag}"
        assert CROSSORIGIN_ATTR.search(tag), f"missing crossorigin attribute: {tag}"


@pytest.mark.parametrize("template_name", CHECKED_TEMPLATES)
def test_cdn_script_tags_use_https(template_name):
    source = (TEMPLATES_DIR / template_name).read_text(encoding="utf-8")
    for tag in SCRIPT_TAG.findall(source):
        src = SRC_ATTR.search(tag)
        if src:
            assert not src.group(1).startswith("http://"), f"insecure script source: {tag}"


def test_base_react_is_pinned_to_exact_version():
    tags = _cdn_script_tags("base.html")
    react_tags = [tag for tag in tags if "unpkg.com/react" in tag]
    assert len(react_tags) == 2, "expected react and react-dom from unpkg"
    for tag in react_tags:
        assert EXACT_UNPKG_VERSION.search(tag), f"react is not pinned to an exact version: {tag}"
        assert "16.14.0/" in tag, f"unexpected react version: {tag}"


def test_base_cdnjs_libraries_are_pinned_to_exact_versions():
    tags = _cdn_script_tags("base.html")
    cdnjs_tags = [tag for tag in tags if "cdnjs.cloudflare.com/" in tag]
    assert len(cdnjs_tags) == 2, "expected jquery and jquery-ui from cdnjs"
    for tag in cdnjs_tags:
        assert EXACT_CDNJS_VERSION.search(tag), f"cdnjs library is not pinned: {tag}"


def test_base_webfont_loader_is_pinned_to_exact_version():
    tags = _cdn_script_tags("base.html")
    webfont_tags = [tag for tag in tags if "ajax.googleapis.com/" in tag]
    assert len(webfont_tags) == 1, "expected the webfont loader from ajax.googleapis.com"
    assert re.search(r"/webfont/\d+\.\d+\.\d+/", webfont_tags[0]), f"webfont is not pinned: {webfont_tags[0]}"
