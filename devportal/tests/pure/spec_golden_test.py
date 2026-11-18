"""The golden operations.json (PLAN.md §2.5): the Python spec layer reproduces it exactly. Vitest asserts the
same file from the TypeScript side."""

import json
from pathlib import Path

from devportal.contracts import regenerate
from devportal.spec import load_spec

GOLDEN = Path(__file__).resolve().parents[2] / "contracts" / "golden" / "operations.json"


def test_python_side_reproduces_the_golden():
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert golden["operations"] == load_spec().operations_golden()["operations"]


def test_golden_file_is_exactly_what_regenerate_writes():
    assert regenerate.run(["operations"], check=True) == [], (
        "golden/operations.json is stale: review the spec change, then run "
        "`python -m devportal.contracts.regenerate operations`"
    )


def test_golden_content():
    ops = json.loads(GOLDEN.read_text(encoding="utf-8"))["operations"]
    assert len(ops) == 61
    assert all(set(o) == {"operationId", "method", "path", "tag", "deprecated", "title", "description"} for o in ops)
    assert sorted(o["operationId"] for o in ops if o["deprecated"]) == ["get-topic-slug", "get-v1-texts"]
    by_id = {o["operationId"]: o for o in ops}
    assert by_id["post-find-refs"]["method"] == "post"
    assert by_id["get-v3-texts"]["title"] == "Texts (v3)"


def test_regenerate_cli_check_and_list(capsys):
    assert regenerate.main(["operations", "--check"]) == 0
    assert regenerate.main(["--list"]) == 0
    assert "operations" in capsys.readouterr().out
