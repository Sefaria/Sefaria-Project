"""Drift and parity steps in .github/workflows/continuous.yaml (PR #3709 review, E14/E18/E23)."""
import os
import shlex

import pytest, yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "continuous.yaml")
FIXTURE_STEP_NAME = "Fixtures were not rewritten by the tests"
FIXTURE_DIFF = "git diff --exit-code -- sefaria/tests/fixtures/mongo"  # the old step: blind to new files
MOCKED_JOBS = ["pytest-no-mongo-job", "pytest-job", "pytest-linker-job"]


@pytest.fixture(scope="module")
def wf():
    with open(WORKFLOW) as fh:
        return yaml.safe_load(fh)


@pytest.fixture(scope="module")
def wf_text():
    with open(WORKFLOW) as fh:
        return fh.read()


def _steps(wf, job):
    return wf["jobs"][job]["steps"]


def _runs(wf, job):
    return [s.get("run", "") for s in _steps(wf, job)]


def _run_line(wf, job):
    """The pytest command of a job, with its `>` folded scalar joined into one string."""
    return next(s["run"] for s in _steps(wf, job) if "python -m pytest" in s.get("run", ""))


@pytest.mark.parametrize("job", MOCKED_JOBS)
def test_fixture_diff_is_last_step(wf, job):
    last = _steps(wf, job)[-1]
    assert last.get("name") == FIXTURE_STEP_NAME, (job, last)
    assert "git status --porcelain -- sefaria/tests/fixtures/mongo" in last["run"], (job, last)
    assert FIXTURE_DIFF not in last["run"], job


def test_corpus_job_has_no_fixture_diff_step(wf):
    assert all("sefaria/tests/fixtures/mongo" not in r for r in _runs(wf, "pytest-corpus-job"))


def test_no_mongo_job_runs_fixture_checker(wf):
    runs = _runs(wf, "pytest-no-mongo-job")
    assert "python scripts/pytest_minimal_dataset/check_fixtures.py" in runs


def test_no_mongo_job_checker_follows_run_and_precedes_parity(wf):
    runs = _runs(wf, "pytest-no-mongo-job")
    checker = next(i for i, r in enumerate(runs) if "check_fixtures.py" in r)
    assert next(i for i, r in enumerate(runs) if "python -m pytest" in r) < checker
    assert checker < next(i for i, r in enumerate(runs) if "ci_parity.py" in r)


def test_no_mongo_job_has_single_parity_step(wf):
    steps = [s for s in _steps(wf, "pytest-no-mongo-job") if "ci_parity.py" in s.get("run", "")]
    assert len(steps) == 1, steps


def test_parity_step_uses_baseline_ref_on_pull_request(wf):
    run = next(s["run"] for s in _steps(wf, "pytest-no-mongo-job") if "ci_parity.py" in s.get("run", ""))
    assert 'if [ "${{ github.event_name }}" = "pull_request" ]; then' in run
    assert 'git fetch --no-tags --depth=1 origin "$BASE_REF"' in run
    assert "ARGS+=(--baseline-ref FETCH_HEAD)" in run
    assert run.rstrip().endswith('python scripts/test_impact/ci_parity.py "${ARGS[@]}"')


def test_parity_step_is_after_pytest_and_before_fixture_diff(wf):
    runs = _runs(wf, "pytest-no-mongo-job")
    pytest_i = next(i for i, r in enumerate(runs) if "python -m pytest" in r)
    parity_i = next(i for i, r in enumerate(runs) if "ci_parity.py" in r)
    assert pytest_i < parity_i < len(runs) - 1


def test_no_mongo_run_line_passes_directories(wf):
    argv = shlex.split(_run_line(wf, "pytest-no-mongo-job").replace("\n", " "))
    assert "scripts/test_impact" in argv
    assert "scripts/pytest_minimal_dataset" in argv
    for path in ("scripts/test_impact/test_ci_parity.py",
                 "scripts/pytest_minimal_dataset/test_export_mongo_fixtures.py",
                 "scripts/pytest_minimal_dataset/test_generate_minimal_dataset.py"):
        assert path not in argv, path


def test_no_mongo_run_line_keeps_paths_and_marker(wf):
    argv = shlex.split(_run_line(wf, "pytest-no-mongo-job").replace("\n", " "))
    for path in ("./sefaria", "./sso", "./reader", "./powered_by", "./semantic_search"):
        assert path in argv, path
    assert ("not deep and not failing and not needs_mongo and not needs_linker and not needs_corpus"
            in argv)


def test_no_stale_pytest_ini_comment_above_run_step(wf_text):
    assert "pytest.ini's python_files does not list scripts/" not in wf_text


def test_parity_step_gets_base_ref_through_env_not_inline(wf):
    step = next(s for s in _steps(wf, "pytest-no-mongo-job") if "ci_parity.py" in s.get("run", ""))
    assert step["env"] == {"BASE_REF": "${{ github.base_ref }}"}
    assert "github.base_ref" not in step["run"]  # expression injection: a branch name must not become shell


@pytest.fixture
def fixture_repo(tmp_path):
    import subprocess
    git = lambda *a: subprocess.run(["git", *a], cwd=tmp_path, check=True, capture_output=True)
    git("init", "-q")
    git("config", "user.email", "t@example.com")
    git("config", "user.name", "t")
    (tmp_path / "sefaria/tests/fixtures/mongo").mkdir(parents=True)
    (tmp_path / "sefaria/tests/fixtures/mongo/a.json").write_text("{}")
    git("add", "-A")
    git("commit", "-qm", "init")
    return tmp_path


def _drift_step_rc(wf, repo):
    import subprocess
    run = next(s for s in _steps(wf, "pytest-job") if s.get("name") == FIXTURE_STEP_NAME)["run"]
    return subprocess.run(["bash", "-e", "-c", run], cwd=repo, capture_output=True, text=True)


def test_drift_step_passes_on_clean_tree(wf, fixture_repo):
    assert _drift_step_rc(wf, fixture_repo).returncode == 0


def test_drift_step_catches_modified_fixture(wf, fixture_repo):
    (fixture_repo / "sefaria/tests/fixtures/mongo/a.json").write_text('{"x": 1}')
    r = _drift_step_rc(wf, fixture_repo)
    assert r.returncode == 1 and "a.json" in r.stdout


def test_drift_step_catches_untracked_fixture(wf, fixture_repo):
    (fixture_repo / "sefaria/tests/fixtures/mongo/new_test.json").write_text("{}")
    r = _drift_step_rc(wf, fixture_repo)
    assert r.returncode == 1 and "new_test.json" in r.stdout
