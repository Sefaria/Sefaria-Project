"""devportal.spec.mcp_provider: the MCP tools on top of the spec layer and the overlay (PLAN.md §2.10)."""

import json

import pytest

from devportal.mcp.provider import OpenAPIFileProvider
from devportal.mcp.tools import Tools
from devportal.spec import Overlay, load_spec
from devportal.spec.mcp_provider import SpecEndpointProvider


@pytest.fixture(scope="module")
def provider():
    return SpecEndpointProvider()


def _call(tools, name, arguments):
    result = tools.call(name, arguments)
    assert result["isError"] is False, result
    return json.loads(result["content"][0]["text"])


def test_lists_the_same_61_operations_as_the_spec(provider):
    ops = provider.operations()
    assert len(ops) == 61
    assert [(o.operation_id, o.method, o.path) for o in ops] == [
        (o.operation_id, o.method.upper(), o.path) for o in load_spec().operations()
    ]


def test_equals_the_default_provider_without_overlay(provider):
    default = OpenAPIFileProvider()
    assert provider.operations() == default.operations()
    assert provider.servers() == default.servers()
    assert provider.security_schemes() == default.security_schemes()
    sample = {"$ref": "#/components/schemas/v3TextsJson"}
    assert provider.dereference(sample) == default.dereference(sample)


def test_list_endpoints_tool_lists_every_operation(provider):
    data = _call(Tools(provider), "list-endpoints", {})
    listed = {e["operationId"] for entries in data["paths"].values() for e in entries}
    assert listed == set(load_spec().operation_ids())
    assert len(listed) == 61


def test_overlay_reaches_the_tools():
    calls = []

    def loader():
        calls.append(1)
        return {
            "get-v3-texts": Overlay(title_override="Texts", description_override_md="Overlay text"),
            "get-calendars": {"title_override": "Calendar"},
        }

    provider = SpecEndpointProvider(overlay_loader=loader)
    by_id = {o.operation_id: o for o in provider.operations()}
    assert by_id["get-v3-texts"].title == "Texts"
    assert by_id["get-v3-texts"].description == "Overlay text"
    assert by_id["get-calendars"].title == "Calendar"
    assert by_id["get-versions"].title == "Versions"
    assert calls  # read on each call, so a publish shows up without a restart
