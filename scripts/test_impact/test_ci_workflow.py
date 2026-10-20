"""Guards on .github/workflows/continuous.yaml and its notifier (PR #3709 review findings)."""
import os, re
import pytest, yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "continuous.yaml")
NOTIFY = os.path.join(ROOT, "build", "notify", "notifyEnd.js")

@pytest.fixture(scope="module")
def wf():
    with open(WORKFLOW) as fh:
        return yaml.safe_load(fh)

@pytest.fixture(scope="module")
def wf_text():
    return open(WORKFLOW).read()

def pytest_jobs(wf):
    return {k: v for k, v in wf["jobs"].items() if k.startswith("pytest-")}

def _regex(pattern):  # micromatch-lite: ** crosses dirs (and may match zero), * does not
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i): out += "(?:.*/)?"; i += 3
        elif pattern.startswith("**", i): out += ".*"; i += 2
        elif pattern[i] == "*": out += "[^/]*"; i += 1
        else: out += re.escape(pattern[i]); i += 1
    return re.compile("^" + out + "$")

def _filter(wf):
    step = next(s for s in wf["jobs"]["check-python-files"]["steps"] if s.get("id") == "check-python-files")
    rules = yaml.safe_load(step["with"]["filters"])["python_files_changed"]
    return {kind: pats for rule in rules for kind, pats in rule.items()}

def test_no_linker_impact_gate(wf):
    assert "check-linker" + "-impact" not in wf["jobs"]
    assert wf["jobs"]["pytest-linker-job"]["needs"] == ["check-python-files"]

@pytest.mark.parametrize("path", ["pytest.ini", "build/ci/prepare-pytest-runner.sh",
    "build/ci/restore-test-mongo.sh", "sefaria/tests/fixtures/mongo/_base.json", "scripts/test_impact/ci_parity.py"])
def test_python_files_filter_covers_runner_inputs(wf, path):
    assert any(_regex(p).match(path) for pats in _filter(wf).values() for p in pats), path

def test_filter_counts_deletions(wf):
    kinds = [k for k in _filter(wf) if "deleted" in k.split("|")]
    assert kinds and any(_regex(p).match("sefaria/gone.py") for p in _filter(wf)[kinds[0]])

def test_every_pytest_job_in_notify_keys(wf):
    keys = open(NOTIFY).read()
    for job in pytest_jobs(wf).values():
        assert '"%s"' % job["name"] in keys, job["name"]

def test_notify_has_no_skip_exception():
    assert "skip" + "IsOk" not in open(NOTIFY).read()

def test_branch_protection_checks_every_pytest_job(wf):
    bp = wf["jobs"]["continuous-branch-protection"]
    script = bp["steps"][0]["run"]
    for jid in pytest_jobs(wf):
        assert jid in bp["needs"], jid
        assert "needs.%s.result" % jid in script, jid
    assert "check-linker" + "-impact" not in script

def test_no_continue_on_error_in_pytest_jobs(wf):
    for jid, job in pytest_jobs(wf).items():
        assert "continue-on-error" not in job, jid
        assert all("continue-on-error" not in s for s in job["steps"]), jid

def test_incomplete_ok_never_set(wf_text):
    assert "SEFARIA_MOCK_MONGO_INCOMPLETE_OK" not in wf_text
    assert not re.search(r"SEFARIA_FIXTURE_SHAPES:\s*\"?off", wf_text)

def test_mock_jobs_use_closed_port(wf):
    for jid, job in pytest_jobs(wf).items():
        env = job["env"]
        if jid == "pytest-corpus-job":
            assert "SEFARIA_MOCK_MONGO" not in env and env["LOCAL_TEST_MONGO_PORT"] == "27017"
        else:
            assert env["SEFARIA_MOCK_MONGO"] == "1" and env["LOCAL_TEST_MONGO_PORT"] == "27099", jid

def test_no_parallel_flags(wf_text):
    assert " -n " not in wf_text and "xdist" not in wf_text
    assert "xdist" not in open(os.path.join(ROOT, "requirements.txt")).read()

def test_requirements_pin_mongomock():
    assert re.search(r"^mongomock==\d", open(os.path.join(ROOT, "requirements.txt")).read(), re.M)

def test_restore_script_is_strict():
    assert "set -euo pipefail" in open(os.path.join(ROOT, "build", "ci", "restore-test-mongo.sh")).read()

def test_scripts_parse():
    import subprocess
    for name in ("restore-test-mongo.sh", "prepare-pytest-runner.sh"):
        subprocess.run(["bash", "-n", os.path.join(ROOT, "build", "ci", name)], check=True)
