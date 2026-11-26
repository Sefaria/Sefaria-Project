"""tools/list equals live's captured surface: names, titles and input schemas byte for byte (PLAN §2.10, I-9)."""

import json
from pathlib import Path

import pytest

from devportal.mcp.server import McpServer
from devportal.mcp.tools import EXECUTE_LOCK_SENTENCE, TOOL_DEFINITIONS

REPO = Path(__file__).resolve().parents[3]
CAPTURED = REPO / "docs" / "dev-portal" / "research" / "site" / "machine" / "mcp-tools-list.json"


def _captured_tools():
    return json.loads(CAPTURED.read_text(encoding="utf-8"))["result"]["tools"]


def _served_tools():
    server = McpServer()
    resp = server.handle_http(
        "POST",
        {"Content-Type": "application/json"},
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}).encode(),
        "127.0.0.1",
    )
    assert resp.status == 200
    # Parse without sorting, so key order is part of what is compared.
    return json.loads(resp.body)["result"]["tools"]


def _bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


@pytest.mark.parametrize("tools", [TOOL_DEFINITIONS, None], ids=["definitions", "served"])
def test_names_titles_and_schemas_are_byte_identical(tools):
    tools = tools if tools is not None else _served_tools()
    captured = _captured_tools()
    assert [t["name"] for t in tools] == [t["name"] for t in captured]
    for ours, theirs in zip(tools, captured, strict=True):
        assert ours["title"] == theirs["title"]
        assert _bytes(ours["inputSchema"]) == _bytes(theirs["inputSchema"])
        assert list(ours) == ["name", "title", "description", "inputSchema", "annotations"]


def test_descriptions_and_annotations_change_only_per_i9():
    served = {t["name"]: t for t in _served_tools()}
    for theirs in _captured_tools():
        ours = served[theirs["name"]]
        if theirs["name"] == "execute-request":
            assert ours["description"] == theirs["description"] + " " + EXECUTE_LOCK_SENTENCE
            assert EXECUTE_LOCK_SENTENCE.count(". ") == 0 and EXECUTE_LOCK_SENTENCE.endswith(".")  # one sentence
            assert ours["annotations"] == {
                "readOnlyHint": True,
                "destructiveHint": False,
                "openWorldHint": theirs["annotations"]["openWorldHint"],
            }
        else:
            assert ours["description"] == theirs["description"]
            assert ours["annotations"] == theirs["annotations"]


def test_served_definitions_are_copies():
    tools = _served_tools()
    tools[0]["name"] = "changed"
    assert _served_tools()[0]["name"] == "list-endpoints"
