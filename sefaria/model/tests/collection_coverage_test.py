# -*- coding: utf-8 -*-

"""
Guards the model test suite against silently going dark.

Every module in sefaria/model/tests that defines tests must match a
`python_files` pattern in the repo-root pytest.ini, otherwise pytest never
collects it and CI reports nothing for it.

This file deliberately imports only the standard library, so it does not
depend on the Django/Mongo setup that the rest of the suite needs.
"""

import configparser
import fnmatch
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
MODEL_TESTS_DIR = Path(__file__).resolve().parent
TEST_DEFINITION = re.compile(r"^(?:def test_|class Test)", re.MULTILINE)


def _python_files_patterns():
    parser = configparser.ConfigParser(interpolation=None)
    parser.read(REPO_ROOT / "pytest.ini", encoding="utf-8")
    raw = parser.get("pytest", "python_files")
    return [line.strip() for line in raw.splitlines() if line.strip()]


def _modules_defining_tests():
    for path in sorted(MODEL_TESTS_DIR.glob("*.py")):
        if path.name == "__init__.py":
            continue
        if TEST_DEFINITION.search(path.read_text(encoding="utf-8")):
            yield path.relative_to(REPO_ROOT).as_posix()


def test_every_model_test_module_is_collected():
    patterns = _python_files_patterns()
    uncollected = [
        rel for rel in _modules_defining_tests()
        if not any(fnmatch.fnmatch(rel, pattern) for pattern in patterns)
    ]
    assert uncollected == [], (
        "test modules missing from pytest.ini python_files: " + ", ".join(uncollected)
    )
