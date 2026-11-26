"""The portal must be importable without MongoDB, Redis or the library (PLAN.md §2.3.1).

Each check runs in a fresh interpreter, because the test process itself may already have
imported the whole Sefaria stack.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# Modules whose presence means the library (and so MongoDB) was dragged in.
FORBIDDEN = ("sefaria.model", "reader", "pymongo")

# Packages that must import no Django at all.
PURE_PACKAGES = ("devportal.markdown", "devportal.spec")

# Not walked: test modules, and the standalone dev settings and URLconf (imported anyway).
SKIP_PREFIXES = ("devportal.tests", "devportal.dev")

DJANGO_PROBE = """
import importlib, json, pkgutil, sys
import django
django.setup()
import devportal.urls  # noqa: F401
failed = {}
import devportal
for info in pkgutil.walk_packages(devportal.__path__, "devportal."):
    if info.name.startswith(SKIP_PREFIXES):
        continue
    try:
        importlib.import_module(info.name)
    except Exception as exc:
        failed[info.name] = f"{type(exc).__name__}: {exc}"
loaded = sorted(m for m in sys.modules if any(m == f or m.startswith(f + ".") for f in FORBIDDEN))
print(json.dumps({"loaded": loaded, "failed": failed}))
"""

PURE_PROBE = """
import importlib, json, pkgutil, sys
try:
    package = importlib.import_module(PACKAGE)
except ModuleNotFoundError as exc:
    if exc.name != PACKAGE:
        raise
    print(json.dumps({"exists": False}))
    sys.exit(0)
for info in pkgutil.walk_packages(package.__path__, PACKAGE + "."):
    importlib.import_module(info.name)
django = sorted(m for m in sys.modules if m == "django" or m.startswith("django."))
print(json.dumps({"exists": True, "django": django[:5]}))
"""


def _run(code, env_extra, tmp_path, package=""):
    env = {k: v for k, v in os.environ.items() if k not in ("DJANGO_SETTINGS_MODULE", "PYTHONPATH")}
    env.update(env_extra)
    env["PYTHONPATH"] = str(REPO_ROOT)
    prelude = f"FORBIDDEN = {FORBIDDEN!r}\nSKIP_PREFIXES = {SKIP_PREFIXES!r}\nPACKAGE = {package!r}\n"
    result = subprocess.run(
        [sys.executable, "-c", prelude + code],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, result.stderr[-4000:]
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_devportal_imports_without_the_library(tmp_path):
    report = _run(
        DJANGO_PROBE,
        {
            "DJANGO_SETTINGS_MODULE": "devportal.dev.settings_standalone",
            "DEVPORTAL_SQLITE_PATH": str(tmp_path / "isolation.sqlite3"),
        },
        tmp_path,
    )
    assert report["failed"] == {}, f"devportal modules failed to import standalone: {report['failed']}"
    assert report["loaded"] == [], f"importing devportal loaded {report['loaded']}; see PLAN.md §2.3.1"


@pytest.mark.parametrize("package", PURE_PACKAGES)
def test_pure_packages_import_no_django(package, tmp_path):
    report = _run(PURE_PROBE, {}, tmp_path, package)
    if not report["exists"]:
        pytest.skip(f"{package} does not exist yet")
    assert report["django"] == [], f"{package} imported Django: {report['django']}"
