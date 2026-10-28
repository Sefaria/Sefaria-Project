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

PYTEST_JOB_IDS = ["pytest-no-mongo-job", "pytest-job", "pytest-linker-job", "pytest-corpus-shards"]
CORPUS_SHARDS = "pytest-corpus-shards"
CORPUS_AGGREGATE = "pytest-corpus-job"  # the required check, "Continuous Testing: PyTest (corpus)"

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
    for jid, job in pytest_jobs(wf).items():
        if jid == CORPUS_SHARDS:  # reported through the aggregate job, whose name is the key
            continue
        assert '"%s"' % job["name"] in keys, job["name"]

def test_notify_has_no_skip_exception():
    assert "skip" + "IsOk" not in open(NOTIFY).read()

def test_branch_protection_checks_every_pytest_job(wf):
    bp = wf["jobs"]["continuous-branch-protection"]
    script = bp["steps"][0]["run"]
    for jid in pytest_jobs(wf):
        gate = CORPUS_AGGREGATE if jid == CORPUS_SHARDS else jid  # shards are gated via the aggregate
        assert gate in bp["needs"], jid
        assert '[ "${{ needs.%s.result }}" != "success" ]' % gate in script, jid
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
        if jid == CORPUS_AGGREGATE:  # runs no pytest, only aggregates the shards
            continue
        env = job["env"]
        if jid == CORPUS_SHARDS:
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


def test_corpus_aggregate_keeps_required_check_name(wf):
    assert wf["jobs"][CORPUS_AGGREGATE]["name"] == "Continuous Testing: PyTest (corpus)"
    assert "Continuous Testing: PyTest (corpus)" in open(NOTIFY).read()

def test_corpus_aggregate_fails_unless_every_shard_succeeds(wf):
    job = wf["jobs"][CORPUS_AGGREGATE]
    assert CORPUS_SHARDS in job["needs"] and "check-python-files" in job["needs"]
    assert "always()" in job["if"]  # runs (and fails) even when a shard failed or was cancelled
    assert wf["jobs"]["ending-notification"]["needs"].count(CORPUS_AGGREGATE) == 1
    script = "\n".join(s.get("run", "") for s in job["steps"])
    assert '[ "${{ needs.%s.result }}" != "success" ]' % CORPUS_SHARDS in script and "exit 1" in script

def test_corpus_aggregate_runs_under_the_same_conditions_as_the_shards(wf):
    norm = lambda c: " ".join(c.replace("always() &&", "").split())
    assert norm(wf["jobs"][CORPUS_AGGREGATE]["if"]) == norm(wf["jobs"][CORPUS_SHARDS]["if"])

def test_corpus_shards_are_a_matrix_that_does_not_cancel_siblings(wf):
    job = wf["jobs"][CORPUS_SHARDS]
    assert job["strategy"]["fail-fast"] is False
    names = [e["shard"] for e in job["strategy"]["matrix"]["include"]]
    assert len(names) >= 2 and len(set(names)) == len(names)
    assert "${{ matrix.shard }}" in job["name"]

def test_corpus_catch_all_shard_ignores_exactly_the_files_other_shards_own(wf):
    include = wf["jobs"][CORPUS_SHARDS]["strategy"]["matrix"]["include"]
    owned = {p for e in include if not e["ignore"] for p in e["paths"].split()}
    catch_all = [e for e in include if e["ignore"]]
    assert len(catch_all) == 1
    assert {a[len("--ignore="):] for a in catch_all[0]["ignore"].split()} == owned
    for path in owned:
        assert os.path.exists(os.path.join(ROOT, path)), path

def test_corpus_shards_each_restore_their_own_mongo_and_select_needs_corpus(wf):
    runs = [s.get("run", "") for s in wf["jobs"][CORPUS_SHARDS]["steps"]]
    assert any("restore-test-mongo.sh" in r for r in runs)
    pytest_run = next(r for r in runs if "python -m pytest" in r)
    assert 'needs_corpus and not deep and not failing' in pytest_run
    assert "${{ matrix.paths }}" in pytest_run and "${{ matrix.ignore }}" in pytest_run
