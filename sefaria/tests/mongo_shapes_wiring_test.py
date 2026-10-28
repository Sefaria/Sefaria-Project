import json
import os

import pytest

from sefaria import conftest as sc

NODE = "a/b_test.py::t"


@pytest.fixture
def shapes_env(tmp_path, monkeypatch):
    monkeypatch.setattr(sc, "_SHAPES_FILE", str(tmp_path / "_shapes.json"))
    monkeypatch.setattr(sc, "_loaded_shapes", None)
    monkeypatch.setattr(sc, "_written_shapes", {})
    monkeypatch.setattr(sc, "_SHAPES_MODE", "check")
    return tmp_path


def _recorded(tmp_path, shapes):
    (tmp_path / "_shapes.json").write_text(json.dumps({"format": 1, "shapes": shapes, "schema": {}}))


def test_check_without_shapes_file_fails_with_fix_line(shapes_env):
    with pytest.raises(pytest.fail.Exception) as e:
        sc._verify_shapes(NODE, {"topics": {"slug"}}, set(), False)
    assert f"rerecord_fixtures.py --only '{NODE}'" in str(e.value)


def test_check_observed_subset_passes(shapes_env):
    _recorded(shapes_env, {NODE: {"topics": ["slug", "titles"]}})
    sc._verify_shapes(NODE, {"topics": {"slug"}}, set(), False)


def test_check_new_field_is_drift(shapes_env):
    _recorded(shapes_env, {NODE: {"topics": ["slug"]}})
    with pytest.raises(pytest.fail.Exception) as e:
        sc._verify_shapes(NODE, {"topics": {"slug", "titles"}}, set(), False)
    assert "FIXTURE DRIFT" in str(e.value) and "titles" in str(e.value)


def test_check_missing_nodeid_entry_fails(shapes_env):
    _recorded(shapes_env, {"other": {}})
    with pytest.raises(pytest.fail.Exception) as e:
        sc._verify_shapes(NODE, {}, set(), False)
    assert f"--only '{NODE}'" in str(e.value)


def test_check_flag_fails_unless_needs_corpus(shapes_env):
    _recorded(shapes_env, {NODE: {}})
    with pytest.raises(pytest.fail.Exception) as e:
        sc._verify_shapes(NODE, {}, {"hint:idx"}, False)
    assert "hint:idx" in str(e.value)
    sc._verify_shapes(NODE, {}, {"hint:idx"}, True)


def test_check_empty_entry_is_valid(shapes_env):
    _recorded(shapes_env, {NODE: {}})
    sc._verify_shapes(NODE, {}, set(), False)


def test_write_stores_entries_and_flush_merges(shapes_env):
    _recorded(shapes_env, {"kept": {"c": ["x"]}, NODE: {"old": ["f"]}})
    sc._SHAPES_MODE = "write"
    sc._verify_shapes(NODE, {"topics": {"slug", "titles"}}, set(), False)
    sc._verify_shapes("empty::node", {}, set(), False)
    sc._flush_shapes()
    text = (shapes_env / "_shapes.json").read_text()
    data = json.loads(text)
    assert data["format"] == 1 and data["schema"]
    assert data["shapes"] == {"kept": {"c": ["x"]}, NODE: {"topics": ["slug", "titles"]}, "empty::node": {}}
    assert text == json.dumps(data, indent=1, sort_keys=True) + "\n"


def test_off_mode_never_checks(shapes_env):
    sc._SHAPES_MODE = "off"
    sc._verify_shapes(NODE, {"topics": {"x"}}, {"hint:i"}, False)
    assert not os.path.exists(sc._SHAPES_FILE) and sc._written_shapes == {}


def test_write_skips_failed_tests(shapes_env):
    sc._SHAPES_MODE = "write"
    sc._verify_shapes(NODE, {"topics": {"slug"}}, set(), False, passed=False)
    sc._verify_shapes("ok::node", {"topics": {"slug"}}, set(), False, passed=True)
    assert list(sc._written_shapes) == ["ok::node"]


@pytest.mark.parametrize("text", ["{not json", '["a list"]', '{"shapes": []}'])
def test_check_corrupt_shapes_file_fails_with_fix_line(shapes_env, monkeypatch, text):
    (shapes_env / "_shapes.json").write_text(text)
    with pytest.raises(pytest.fail.Exception) as e:
        sc._verify_shapes(NODE, {}, set(), False)
    assert "not valid shapes JSON" in str(e.value) and "rerecord_fixtures.py" in str(e.value)


def test_flush_recovers_from_corrupt_shapes_file(shapes_env):
    (shapes_env / "_shapes.json").write_text("{not json")
    sc._SHAPES_MODE = "write"
    sc._verify_shapes(NODE, {"topics": {"slug"}}, set(), False)
    with pytest.warns(UserWarning, match="not valid JSON"):
        sc._flush_shapes()
    assert json.loads((shapes_env / "_shapes.json").read_text())["shapes"] == {NODE: {"topics": ["slug"]}}


def test_unknown_shapes_mode_is_a_usage_error():
    with pytest.raises(pytest.UsageError, match="SEFARIA_FIXTURE_SHAPES"):
        sc._validate_session_env({"SEFARIA_FIXTURE_SHAPES": "wrte"})
    sc._validate_session_env({})
    for mode in ("check", "write", "off"):
        sc._validate_session_env({"SEFARIA_FIXTURE_SHAPES": mode})


def test_incomplete_ok_refused_in_ci_at_session_start():
    with pytest.raises(pytest.UsageError, match="INCOMPLETE_OK"):
        sc._validate_session_env({"SEFARIA_MOCK_MONGO_INCOMPLETE_OK": "1", "CI": "true"})
    sc._validate_session_env({"SEFARIA_MOCK_MONGO_INCOMPLETE_OK": "1"})
