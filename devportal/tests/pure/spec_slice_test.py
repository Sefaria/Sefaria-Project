"""The per-path slice of devportal.spec equals the `# OpenAPI definition` block of live's endpoint `.md`
page (research/reference/data/get-v3-texts.live.md), and is well formed for every operation."""

import json
import re
from pathlib import Path

import pytest

from devportal.spec import Spec, load_spec

REPO = Path(__file__).resolve().parents[3]
LIVE_MD = REPO / "docs" / "dev-portal" / "research" / "reference" / "data" / "get-v3-texts.live.md"
FENCE = re.compile(r"\n# OpenAPI definition\n\n```json\n(?P<json>.*)\n```\s*$", re.DOTALL)


@pytest.fixture(scope="module")
def spec():
    return load_spec()


@pytest.fixture(scope="module")
def live_block():
    match = FENCE.search(LIVE_MD.read_text(encoding="utf-8"))
    assert match, "no OpenAPI definition block in get-v3-texts.live.md"
    return match.group("json")


def test_get_v3_texts_slice_equals_live(spec, live_block):
    assert spec.slice_for_operation("get-v3-texts") == json.loads(live_block)


def test_get_v3_texts_slice_text_equals_live_byte_for_byte(spec, live_block):
    # Not only the same data: the same key order and formatting, so the .md export can embed it as is.
    assert spec.slice_json("get-v3-texts") == live_block


def test_slice_shape(spec):
    sl = spec.slice_for_operation("get-v3-texts")
    assert list(sl) == ["openapi", "info", "servers", "tags", "paths", "components"]
    assert sl["tags"] == [{"name": "Text", "description": "Operations related to retrieving texts"}]
    # Transitive: `ref` is reached only through v3TextsJson; spec order is kept.
    assert list(sl["components"]["schemas"]) == [
        "ref",
        "v3TextsJson",
        "v3AvailableVersionsTextJson",
        "v3TextVersionsJSON",
    ]


def _refs(node):
    if isinstance(node, dict):
        if isinstance(node.get("$ref"), str):
            yield node["$ref"]
        for v in node.values():
            yield from _refs(v)
    elif isinstance(node, list):
        for v in node:
            yield from _refs(v)


def test_every_slice_is_closed_and_minimal(spec):
    for op in spec.operations():
        sl = spec.slice_for_operation(op.operation_id)
        assert list(sl["paths"]) == [op.path]
        assert [t["name"] for t in sl["tags"]] == list(op.tags)
        components = sl.get("components", {})
        # Closed: every reference resolves inside the slice.
        for ref in _refs(sl):
            section, name = ref.split("/")[2:4]
            assert name in components.get(section, {}), (op.operation_id, ref)
        # Minimal: every component is referenced from the slice.
        referenced = {tuple(ref.split("/")[2:4]) for ref in _refs(sl)}
        for section, entries in components.items():
            for name in entries:
                assert (section, name) in referenced, (op.operation_id, section, name)
        assert len(spec.slice_sha(op.operation_id)) == 64


def test_slice_sha_changes_only_with_the_slice(spec):
    doc = json.loads(json.dumps(spec.document))
    doc["paths"]["/api/texts/{tref}"]["get"]["summary"] = "Changed"
    changed = Spec(doc)
    assert changed.slice_sha("get-v1-texts") != spec.slice_sha("get-v1-texts")
    assert changed.slice_sha("get-v3-texts") == spec.slice_sha("get-v3-texts")


def test_unknown_operation_raises(spec):
    with pytest.raises(KeyError):
        spec.slice_for_operation("nope")


def test_security_schemes_and_undeclared_tags_are_included():
    doc = {
        "openapi": "3.0.2",
        "info": {"title": "t", "version": "1"},
        "tags": [{"name": "A", "description": "a"}],
        "paths": {"/x": {"get": {"operationId": "x", "tags": ["B"], "security": [{"key": []}], "responses": {}}}},
        "components": {"securitySchemes": {"key": {"type": "apiKey"}, "other": {"type": "http"}}},
    }
    sl = Spec(doc).slice_for_operation("x")
    assert sl["tags"] == [{"name": "B"}]
    assert sl["components"] == {"securitySchemes": {"key": {"type": "apiKey"}}}
