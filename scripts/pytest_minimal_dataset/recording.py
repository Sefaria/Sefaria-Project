"""Shared helper for running the Mongo-usage recorder pass (owns: scripts/pytest_minimal_dataset/).

Builds the environment and command for a pytest run that records Mongo traffic
against a local mongod. Used by the generator's rerun path and by the recording
entry points, so both start the recorder the same way.
"""
import os
import subprocess
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Mock-mode switches that must never leak into a recording run.
STRIP = ("SEFARIA_MOCK_MONGO", "SEFARIA_MOCK_MONGO_INCOMPLETE_OK", "SEFARIA_FIXTURE_SHAPES")


def recording_env(port, db_name, base_env=None):
    env = dict(os.environ if base_env is None else base_env)
    for key in STRIP:
        env.pop(key, None)
    env.update({
        "SEFARIA_TEST_MONGO": "1",
        "SEFARIA_RECORD_MONGO": "1",
        "LOCAL_TEST_MONGO_PORT": str(port),
        "LOCAL_TEST_DB_NAME": db_name,
    })
    return env


def recording_command(targets, marker_expr=None):
    cmd = [sys.executable, "-m", "pytest", "-q", "--no-header", "-p", "no:cacheprovider"]
    if marker_expr:
        cmd += ["-m", marker_expr]
    return cmd + list(targets)


def run_recording(targets, port=27018, db_name="sefaria", marker_expr=None, runner=subprocess.run):
    return runner(recording_command(targets, marker_expr), cwd=REPO_ROOT,
                  env=recording_env(port, db_name)).returncode
