"""list-endpoints, get-endpoint and search-endpoints over docs/openAPI.json (PLAN §2.7, §2.10)."""

import json
from pathlib import Path

import pytest

from devportal.mcp.provider import HTTP_METHODS, OpenAPIFileProvider
from devportal.mcp.tools import Tools

REPO = Path(__file__).resolve().parents[3]
SPEC = json.loads((REPO / "docs" / "openAPI.json").read_text(encoding="utf-8"))


def _spec_operations():
    for path, item in SPEC["paths"].items():
        for method in HTTP_METHODS:
            if method in item:
                yield path, method.upper(), item[method], item


@pytest.fixture(scope="module")
def tools():
    return Tools(OpenAPIFileProvider())


def _call(tools, name, arguments):
    result = tools.call(name, arguments)
    return result, (json.loads(result["content"][0]["text"]) if not result["isError"] else None)


def test_every_spec_operation_is_listed(tools):
    result, data = _call(tools, "list-endpoints", {})
    assert result["isError"] is False
    listed = {(path, e["method"], e["operationId"]) for path, entries in data["paths"].items() for e in entries}
    expected = {(path, method, op["operationId"]) for path, method, op, _ in _spec_operations()}
    assert expected == listed
    assert len(expected) == 61
    assert data["servers"] == ["https://www.sefaria.org"]
    assert list(data["paths"]) == list(SPEC["paths"])  # spec order


def test_titles_and_descriptions_follow_the_rules():
    provider = OpenAPIFileProvider()
    by_id = {op.operation_id: op for op in provider.operations()}
    for _path, _method, op, item in _spec_operations():
        ours = by_id[op["operationId"]]
        assert ours.title == (op.get("summary") or item.get("summary") or "")
        assert ours.description == (op.get("description") or "")
        assert ours.deprecated is bool(op.get("deprecated", False))
    assert by_id["get-bulktext"].title == "Bulk Text"  # path summary fallback
    assert by_id["get-v3-texts"].title == "Texts (v3)"  # operation summary wins over "v3 Texts"


def test_parameters_merge_path_and_operation_levels():
    provider = OpenAPIFileProvider()
    by_id = {op.operation_id: op for op in provider.operations()}
    for _path, _method, op, item in _spec_operations():
        expected = {}
        for p in item.get("parameters", []) + op.get("parameters", []):
            p = provider.dereference(p)
            expected[(p["name"], p["in"])] = p
        got = {(p["name"], p["in"]): p for p in map(provider.dereference, by_id[op["operationId"]].parameters)}
        assert got == expected


def test_operation_parameter_overrides_path_parameter_and_overlay_wins():
    spec = {
        "openapi": "3.1.0",
        "servers": [{"url": "https://www.sefaria.org"}],
        "paths": {
            "/api/x/{a}": {
                "summary": "Path summary",
                "parameters": [{"name": "a", "in": "path", "description": "path-level"}],
                "get": {
                    "operationId": "get-x",
                    "description": "Op description",
                    "parameters": [{"name": "a", "in": "path", "description": "op-level"}],
                },
            },
        },
    }
    op = OpenAPIFileProvider(spec).operations()[0]
    assert op.title == "Path summary"
    assert [p["description"] for p in op.parameters] == ["op-level"]
    over = OpenAPIFileProvider(spec, overlay={"get-x": {"title": "Overlay", "description": "Overlay text"}})
    assert (over.operations()[0].title, over.operations()[0].description) == ("Overlay", "Overlay text")


def test_dereference_survives_cycles():
    spec = {"paths": {}, "components": {"schemas": {"A": {"properties": {"b": {"$ref": "#/components/schemas/A"}}}}}}
    out = OpenAPIFileProvider(spec).dereference({"$ref": "#/components/schemas/A"})
    assert out == {"properties": {"b": {"$ref": "#/components/schemas/A"}}}


def test_get_endpoint(tools):
    result, data = _call(tools, "get-endpoint", {"path": "/api/v3/texts/{tref}", "method": "get"})
    assert not result["isError"]
    assert data["operationId"] == "get-v3-texts"
    assert data["method"] == "GET"
    assert data["servers"] == [{"url": "https://www.sefaria.org", "description": ""}]
    assert "$ref" not in json.dumps(data["parameters"])
    assert {p["name"] for p in data["parameters"]} >= {"tref", "version"}
    # A concrete path resolves to its template.
    _, data2 = _call(tools, "get-endpoint", {"path": "/api/v3/texts/Genesis%201:1", "method": "GET"})
    assert data2["operationId"] == "get-v3-texts"
    _, post = _call(tools, "get-endpoint", {"path": "/api/find-refs", "method": "POST"})
    assert "requestBody" in post


@pytest.mark.parametrize(
    "arguments",
    [
        {"path": "/api/nope", "method": "GET"},
        {"path": "/api/index", "method": "DELETE"},
        {"path": "/api/index"},
        {"method": "GET"},
        {"path": 3, "method": "GET"},
    ],
)
def test_get_endpoint_errors(tools, arguments):
    result, _ = _call(tools, "get-endpoint", arguments)
    assert result["isError"] is True


def test_search_endpoints(tools):
    _, data = _call(tools, "search-endpoints", {"pattern": "LEXICON"})
    ids = {r["operationId"] for r in data["results"]}
    assert {"get-words", "get-lexicon-entry", "get-words-completion"} <= ids
    assert data["count"] == len(data["results"])
    _, by_param = _call(tools, "search-endpoints", {"pattern": "versionTitle"})
    assert "get-v3-texts" in {r["operationId"] for r in by_param["results"]}
    _, none = _call(tools, "search-endpoints", {"pattern": "zzz-no-such-thing-zzz"})
    assert none["results"] == []
    # The pattern is literal text, not a regular expression.
    _, regex = _call(tools, "search-endpoints", {"pattern": "(a+)+$"})
    assert regex["results"] == []


@pytest.mark.parametrize("arguments", [{}, {"pattern": ""}, {"pattern": "x" * 201}, {"pattern": ["x"]}])
def test_search_endpoints_errors(tools, arguments):
    result, _ = _call(tools, "search-endpoints", arguments)
    assert result["isError"] is True
