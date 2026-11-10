"""Gates in the workflow files that keep a PR from publishing a chart and keep untested code from merging."""

from pathlib import Path

import yaml

WORKFLOWS = Path(__file__).resolve().parents[3] / ".github" / "workflows"


def load(name):
    return yaml.safe_load((WORKFLOWS / name).read_text())


def test_helm_chart_job_publishes_only_on_push():
    helm = load("helm.yaml")
    condition = " ".join(str(helm["jobs"]["chart"]["if"]).split())
    assert "github.event_name == 'push'" in condition
    # The repository condition the job had before must still be there.
    assert "github.repository == 'sefaria/sefaria-project'" in condition


def test_helm_workflow_runs_on_pull_requests():
    # PyYAML reads the bare key `on` as the boolean True.
    triggers = load("helm.yaml").get("on", load("helm.yaml").get(True))
    assert "pull_request" in triggers
    assert {"helm-chart/**", "envs/**", ".github/workflows/helm.yaml"} <= set(triggers["pull_request"]["paths"])
    assert "push" in triggers  # the push trigger stays


def test_helm_lint_job_runs_the_new_chart_tests():
    steps = " ".join(str(step.get("run", "")) for step in load("helm.yaml")["jobs"]["lint"]["steps"])
    for script in ("gunicorn_conf_test.sh", "nginx_conf_test.sh", "render_diff_vs_base.sh", "auth_service_render_test.py"):
        assert script in steps, script


def test_branch_protection_needs_jest_and_auth_service_tests():
    jobs = load("continuous.yaml")["jobs"]
    needs = jobs["continuous-branch-protection"]["needs"]
    for job_id in ("jest-tests", "auth-service-tests"):
        assert job_id in jobs, f"{job_id} is not a job in continuous.yaml"
        assert job_id in needs


def test_branch_protection_script_requires_both_to_succeed():
    script = next(
        step["run"] for step in load("continuous.yaml")["jobs"]["continuous-branch-protection"]["steps"] if "run" in step
    )
    for job_id in ("jest-tests", "auth-service-tests"):
        assert f'needs.{job_id}.result }}}}" != "success"' in script
