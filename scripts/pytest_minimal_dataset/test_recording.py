import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import recording


def test_env_turns_on_recorder_and_points_at_port_and_db():
    env = recording.recording_env(27018, "sefaria", base_env={})
    assert env["SEFARIA_TEST_MONGO"] == "1"
    assert env["SEFARIA_RECORD_MONGO"] == "1"
    assert env["LOCAL_TEST_MONGO_PORT"] == "27018"
    assert env["LOCAL_TEST_DB_NAME"] == "sefaria"


def test_inherited_mock_flags_are_removed():
    base = {"SEFARIA_MOCK_MONGO": "1", "SEFARIA_MOCK_MONGO_INCOMPLETE_OK": "1",
            "SEFARIA_FIXTURE_SHAPES": "off", "KEEP_ME": "yes"}
    env = recording.recording_env(27018, "sefaria", base_env=base)
    assert "SEFARIA_MOCK_MONGO" not in env
    assert "SEFARIA_MOCK_MONGO_INCOMPLETE_OK" not in env
    assert "SEFARIA_FIXTURE_SHAPES" not in env
    assert env["KEEP_ME"] == "yes"


def test_command_runs_pytest_under_current_interpreter():
    cmd = recording.recording_command(["sefaria/tests"])
    assert cmd[:3] == [sys.executable, "-m", "pytest"]
    assert cmd[-1] == "sefaria/tests"
    assert "-m" not in cmd[3:]


def test_command_adds_marker_expression_when_given():
    cmd = recording.recording_command(["sefaria/tests"], marker_expr="needs_mongo")
    i = cmd.index("-m", 3)
    assert cmd[i + 1] == "needs_mongo"
    assert cmd[-1] == "sefaria/tests"
