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

PYTEST_JOB_IDS = ["pytest-no-mongo-job", "pytest-job", "pytest-linker-job", "pytest-corpus-job"]

def test_no_linker_impact_gate(wf):
    assert "check-linker" + "-impact" not in wf["jobs"]
    assert wf["jobs"]["pytest-linker-job"]["needs"] == ["check-python-files"]

def test_sibling_pytest_jobs_share_one_if(wf):
    conds = {jid: wf["jobs"][jid]["if"] for jid in PYTEST_JOB_IDS}
    assert len(set(conds.values())) == 1, conds

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
        assert '[ "${{ needs.%s.result }}" != "success" ]' % jid in script, jid
    assert "skipped" not in script
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


def _run_restore(tmp_path, **env):
    """Run restore-test-mongo.sh with fake docker/curl; returns (proc, logged docker argument lines)."""
    import io, subprocess, tarfile
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "docker.log"
    (bin_dir / "docker").write_text(f'#!/bin/bash\necho "$@" >> {log}\n[ "$1" = exec ] && echo 1\nexit 0\n')
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        pass
    (tmp_path / "empty.tgz").write_bytes(buf.getvalue())
    (bin_dir / "curl").write_text(f'#!/bin/bash\ncat {tmp_path / "empty.tgz"}\n')
    (bin_dir / "df").write_text("#!/bin/bash\nexit 0\n")  # /mnt exists only on the runner
    for name in ("docker", "curl", "df"):
        (bin_dir / name).chmod(0o755)
    proc = subprocess.run(["bash", os.path.join(ROOT, "build", "ci", "restore-test-mongo.sh")], capture_output=True, text=True,
                          env={**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "WORK": str(tmp_path / "work"), **env})
    return proc, log.read_text().splitlines() if log.exists() else []


def test_restore_defaults_keep_four_parallel_collections_and_no_mongod_args(tmp_path):
    proc, calls = _run_restore(tmp_path)
    assert proc.returncode == 0, proc.stderr
    start = next(c for c in calls if c.startswith("run -d"))
    assert start.endswith("mongo:4.4")
    assert "--numParallelCollections 4 " in next(c for c in calls if "mongorestore" in c)


def test_restore_accepts_mongod_args_and_parallelism(tmp_path):
    proc, calls = _run_restore(tmp_path, MONGOD_ARGS="--wiredTigerCacheSizeGB 1", RESTORE_PARALLEL="1")
    assert proc.returncode == 0, proc.stderr
    assert next(c for c in calls if c.startswith("run -d")).endswith("mongo:4.4 --wiredTigerCacheSizeGB 1")
    assert "--numParallelCollections 1 " in next(c for c in calls if "mongorestore" in c)


@pytest.mark.parametrize("bad", ["0", "x", "-1", "2 3"])
def test_restore_rejects_bad_parallelism(tmp_path, bad):
    proc, calls = _run_restore(tmp_path, RESTORE_PARALLEL=bad)
    assert proc.returncode == 2 and "RESTORE_PARALLEL" in proc.stderr and calls == []
