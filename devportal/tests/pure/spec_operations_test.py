"""The operation index of devportal.spec (PLAN.md §2.7): 61 operations, title and description rules,
merged parameters, and the overlay's precedence."""

import json
from pathlib import Path

import pytest

from devportal.spec import HTTP_METHODS, Overlay, Spec, SpecError, load_spec, merge

REPO = Path(__file__).resolve().parents[3]
RAW = json.loads((REPO / "docs" / "openAPI.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def spec():
    return load_spec()


def _raw_operations():
    for path, item in RAW["paths"].items():
        for method in HTTP_METHODS:
            if method in item:
                yield path, method, item[method], item


def test_loaded_once_per_process(spec):
    assert load_spec() is spec
    assert len(spec.sha) == 64


def test_sixty_one_operations_in_spec_order(spec):
    ops = spec.operations()
    assert len(ops) == 61
    assert [(op.path, op.method, op.operation_id) for op in ops] == [
        (path, method, op["operationId"]) for path, method, op, _ in _raw_operations()
    ]
    assert len(set(spec.operation_ids())) == 61
    assert spec.operation("get-v3-texts").path == "/api/v3/texts/{tref}"
    assert spec.operation("nope") is None


def test_title_is_summary_falling_back_to_path_summary(spec):
    fallbacks = 0
    for path, method, raw_op, item in _raw_operations():
        op = spec.operation(raw_op["operationId"])
        if raw_op.get("summary"):
            assert op.title == raw_op["summary"]
        else:
            fallbacks += 1
            assert op.title == item["summary"]
        assert op.title
    assert fallbacks == 28
    # Known values from live's sidebar (research/reference/data/sidebar-tree.txt).
    assert spec.operation("get-v3-texts").title == "Texts (v3)"  # path item summary is "v3 Texts"
    assert spec.operation("get-bulktext").title == "Bulk Text"
    assert spec.operation("get-user-sheets-paginated").title == "User's Sheets (Paginated)"


def test_description_is_operation_description_only(spec):
    for _, _, raw_op, item in _raw_operations():
        op = spec.operation(raw_op["operationId"])
        assert op.description == (raw_op.get("description") or "")
    # The path item of get-v3-texts has its own description, which is never used.
    v3 = spec.operation("get-v3-texts")
    assert v3.description.startswith("The most up-to-date way to retrieve texts from Sefaria via the API")
    assert "right-to-left translation" not in v3.description


def test_tags_and_deprecation(spec):
    assert all(len(op.tags) == 1 and op.tag == op.tags[0] for op in spec.operations())
    assert sorted(op.operation_id for op in spec.operations() if op.deprecated) == ["get-topic-slug", "get-v1-texts"]
    assert spec.tag_names() == [
        "Text",
        "Index",
        "Related",
        "Calendars",
        "Lexicon",
        "Topic",
        "Term",
        "Sheets",
        "Collections",
        "Ref",
        "Misc",
    ]
    assert spec.tag_description("Text") == "Operations related to retrieving texts"


def test_parameters_merge_path_item_and_operation(spec):
    path_level = {"path": 0, "query": 0}
    for _, _, raw_op, item in _raw_operations():
        op = spec.operation(raw_op["operationId"])
        item_params = item.get("parameters", [])
        op_params = raw_op.get("parameters", [])
        for p in item_params:
            path_level[p["in"]] += 1
        keys = [(p["name"], p["in"]) for p in op.parameters]
        assert len(keys) == len(set(keys))
        expected = {(p["name"], p["in"]) for p in item_params + op_params}
        assert set(keys) == expected
        # Operation wins on the same (name, in).
        for p in op_params:
            assert next(q for q in op.parameters if (q["name"], q["in"]) == (p["name"], p["in"])) == p
    assert path_level == {"path": 24, "query": 16}


def test_parameter_overrides(spec):
    raw = RAW["paths"]["/api/texts/{tref}"]
    op = spec.operation("get-v1-texts")
    tref = [p for p in op.parameters if p["name"] == "tref"]
    assert len(tref) == 1
    assert tref[0] == next(p for p in raw["get"]["parameters"] if p["name"] == "tref")
    assert tref[0] != next(p for p in raw["parameters"] if p["name"] == "tref")
    # Every path-level path parameter of get-v3-texts reaches the operation.
    v3 = spec.operation("get-v3-texts")
    assert ("tref", "path") in {(p["name"], p["in"]) for p in v3.parameters}


def test_duplicate_or_missing_operation_id_is_an_error():
    doc = {"paths": {"/a": {"get": {"operationId": "x"}}, "/b": {"get": {"operationId": "x"}}}}
    with pytest.raises(SpecError):
        Spec(doc).operations()
    with pytest.raises(SpecError):
        Spec({"paths": {"/a": {"get": {}}}}).operations()


def test_merge_without_overlay_is_the_spec(spec):
    op = spec.operation("get-v3-texts")
    merged = merge(op)
    assert merged.title == merged.sidebar_label == "Texts (v3)"
    assert merged.description_md == op.description
    assert merged.description_overridden is False
    assert merged.deprecated is False


def test_overlay_precedence(spec):
    op = spec.operation("get-v1-texts")
    merged = merge(op, Overlay(title_override="Old texts", description_override_md="**Use v3.**", body_md="More"))
    assert merged.title == "Old texts"
    assert merged.sidebar_label == "Old texts"  # sidebar label falls back to the merged title
    assert merged.description_md == "**Use v3.**"
    assert merged.description_overridden is True
    assert merged.body_md == "More"
    assert merged.deprecated is True  # from the spec

    labelled = merge(op, Overlay(sidebar_label="v1"))
    assert (labelled.title, labelled.sidebar_label) == ("Texts (v1)", "v1")

    # A whitespace-only description override does not hide the spec's description.
    blank = merge(op, Overlay(description_override_md="  \n"))
    assert blank.description_md == op.description

    # The overlay can mark an operation deprecated; it cannot un-deprecate one.
    assert merge(spec.operation("get-v3-texts"), Overlay(deprecated=True)).deprecated is True
    assert merge(op, Overlay(deprecated=False)).deprecated is True


def test_overlay_from_revision_like_object():
    class Rev:
        title_override = " T "
        sidebar_label = ""
        description_override_md = "D"
        body_md = "B"
        deprecated = False

    assert Overlay.from_revision(Rev()) == Overlay(title_override="T", description_override_md="D", body_md="B")
    assert Overlay.from_revision(None) == Overlay()
