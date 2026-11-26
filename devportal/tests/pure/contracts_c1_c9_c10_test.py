"""Contracts C1, C9 and C10 are well formed and agree with the settings modules. No Django."""

import ast
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACTS = REPO_ROOT / "devportal" / "contracts"


def _load(name):
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


def _literal_devportal_assignments(path):
    """Module-level `DEVPORTAL_* = <literal>` assignments of a settings file, without importing it."""
    found = {}
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name.startswith("DEVPORTAL_"):
                try:
                    found[name] = ast.literal_eval(node.value)
                except ValueError:
                    found[name] = ast.unparse(node.value)  # computed, e.g. from the environment
    return found


SETTINGS = _load("settings.json")["settings"]


def test_c1_settings_match_sefaria_settings():
    declared = _literal_devportal_assignments(REPO_ROOT / "sefaria" / "settings.py")
    assert declared == {s["name"]: s["default"] for s in SETTINGS}


def test_c1_settings_match_standalone_settings():
    standalone = _literal_devportal_assignments(REPO_ROOT / "devportal" / "dev" / "settings_standalone.py")
    for setting in SETTINGS:
        assert setting["name"] in standalone, setting["name"]
        value = standalone[setting["name"]]
        if not (isinstance(value, str) and "os.environ" in value):
            assert value == setting["default"], setting["name"]


def test_c9_routes_are_well_formed():
    routes = _load("C9_urls.json")["routes"]
    ids = [r["id"] for r in routes]
    assert len(ids) == len(set(ids)), "duplicate route ids"
    for route in routes:
        assert route["patterns"] and all(isinstance(p, str) for p in route["patterns"]), route["id"]
        assert route["methods"], route["id"]
        assert isinstance(route["status"], int), route["id"]
        if 300 <= route["status"] < 400:
            assert route.get("target"), f"{route['id']} redirects without a target"
        for pattern in route["patterns"]:
            if pattern.startswith("/api/"):
                assert route["id"] == "powered-by-api", f"{route['id']}: no portal endpoint under /api/"


def test_c9_parity_examples_have_locations_for_redirects():
    for case in _load("C9_urls.json")["parity_examples"]["cases"]:
        assert (300 <= case["status"] < 400) == ("location" in case), case


def _policy(csp, **values):
    parts = []
    for directive in csp["directives"]:
        parts.append(" ".join(source.format(**values) for source in directive))
    return "; ".join(parts)


@pytest.fixture(scope="module")
def security():
    return _load("security.json")


def test_c10_csp_assembles_to_the_expected_default(security):
    api_origin = next(s["default"] for s in SETTINGS if s["name"] == "DEVPORTAL_API_ORIGIN")
    policy = _policy(security["csp"], nonce="{nonce}", api_origin=api_origin)
    assert policy == security["csp"]["expected_default"]


def test_c10_csp_never_allows_inline_or_eval_scripts(security):
    directives = {d[0]: d[1:] for d in security["csp"]["directives"]}
    assert "'unsafe-inline'" not in directives["script-src"]
    assert "'unsafe-eval'" not in directives["script-src"]
    assert directives["style-src"] == ["'self'"]
    assert directives["default-src"] == ["'none'"]


def test_c10_htmlblock_frame_never_runs_scripts(security):
    frame = security["htmlblock_frame"]
    assert "allow-scripts" not in frame["csp"]
    assert "allow-scripts" not in frame["iframe_sandbox"]
    assert frame["csp"].startswith(f"sandbox {frame['iframe_sandbox']};")
    assert frame["iframe_src_prefix"] in security["sanitizer"]["iframe_src_allowed_prefixes"]


def test_c10_try_it_fetch_options(security):
    assert security["try_it"]["fetch_options"] == {
        "credentials": "omit",
        "mode": "cors",
        "cache": "no-store",
        "referrerPolicy": "no-referrer",
    }


def test_c10_sanitizer_forbids_what_it_must(security):
    sanitizer = security["sanitizer"]
    assert not set(sanitizer["tags"]) & set(sanitizer["forbidden_tags"])
    allowed_attributes = set(sanitizer["generic_attributes"]).union(*sanitizer["attributes"].values())
    assert "style" not in allowed_attributes
    assert not any(a.startswith("on") for a in allowed_attributes)
    assert set(sanitizer["url_schemes"]) == {"http", "https", "mailto"}
