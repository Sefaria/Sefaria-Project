"""The vendored snapshot and its spec check, without Django (PLAN.md §7.1)."""

import hashlib
import json
from pathlib import Path

import pytest

from devportal.adapters import markdown as md
from devportal.adapters import spec as spec_adapter

REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = REPO_ROOT / "devportal" / "migration_source"
UPSTREAM_CLONE = Path("/home/user/sefaria/developer-docs")


def test_number_normalization():
    assert spec_adapter.normalized_sha256({"a": 100, "b": [1.0]}) == spec_adapter.normalized_sha256(
        {"b": [1], "a": 100.0},
    )
    assert spec_adapter.normalized_sha256({"a": 1.5}) != spec_adapter.normalized_sha256({"a": 1})


def test_operation_index_has_61_operations():
    ops = spec_adapter.operation_index()
    assert len(ops) == 61
    assert ops["get-v3-texts"]["method"] == "get"
    assert ops["get-bulktext"]["summary"] == "Bulk Text"  # from the path item, as ReadMe shows it
    assert ops["get-v1-texts"]["deprecated"] is True


def test_excluded_spec_equals_docs_openapi_when_parsed():
    """SOURCE.json: the excluded sefaria-api.json was not vendored because docs/openAPI.json is the spec. At the
    snapshot it differed only in `100` vs `100.0`; docs/openAPI.json has moved on since (sc-48262 added
    `with_sheet_links`), so what must hold is that excluding it loses nothing: every operation it has, ours has."""
    info = json.loads((SOURCE_DIR / "SOURCE.json").read_text(encoding="utf-8"))
    excluded = info["excluded"][0]
    upstream = UPSTREAM_CLONE / excluded["path"]
    if not upstream.exists():
        pytest.skip("the developer-docs clone is not available")
    data = upstream.read_bytes()
    if hashlib.sha256(data).hexdigest() != excluded["sha256"]:
        pytest.skip("the developer-docs clone is at another commit than the snapshot")
    ours = (REPO_ROOT / "docs" / "openAPI.json").read_bytes()
    assert hashlib.sha256(ours).digest() != hashlib.sha256(data).digest()  # not byte-identical

    def operations(spec):
        methods = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
        return {(path, m) for path, item in spec["paths"].items() for m in item if m in methods}

    assert operations(json.loads(data)) <= operations(json.loads(ours))


def test_link_rewriting_touches_destinations_only():
    source = (
        "[a](doc:welcome) [b](ref:get-shape#x) [c](page:contact-us) "
        "[d](https://developers.sefaria.org/docs/x) [doc:welcome](https://example.com)\n"
        "<https://developers.sefaria.org/docs/y> https://developers.sefaria.org/docs/z\n"
        '<a href="doc:welcome">x</a> `[e](doc:welcome)`\n\n'
        "[ref]: doc:welcome\n\n```\n[f](doc:welcome)\n```\n"
    )
    new, changes = md.rewrite_markdown_links(source)
    assert new == (
        "[a](/docs/welcome) [b](/reference/get-shape#x) [c](/page/contact-us) "
        "[d](/docs/x) [doc:welcome](https://example.com)\n"
        "<https://developers.sefaria.org/docs/y> https://developers.sefaria.org/docs/z\n"
        '<a href="/docs/welcome">x</a> `[e](doc:welcome)`\n\n'
        "[ref]: /docs/welcome\n\n```\n[f](doc:welcome)\n```\n"
    )
    assert len(changes) == 6


def test_link_and_image_extraction():
    body = '![i](https://x/a.png) [l](/docs/a)\n<Image src="https://x/b.png" />\n```\n[c](/docs/c)\n```\n'
    assert md.link_destinations(body) == ["/docs/a"]
    assert md.image_sources(body) == ["https://x/a.png", "https://x/b.png"]
