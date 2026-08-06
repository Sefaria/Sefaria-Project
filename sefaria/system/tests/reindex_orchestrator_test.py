"""Unit tests for pure-logic functions in reindex_orchestrator.
Uses importlib to exec_module so heavy imports (kubernetes, django) are never triggered
— they live inside main() only."""
import importlib.util
import pathlib

import pytest


spec = importlib.util.spec_from_file_location(
    "reindex_orchestrator",
    pathlib.Path("scripts/scheduled/reindex_orchestrator.py"),
)
orch = importlib.util.module_from_spec(spec)


def test_job_terminal_state():
    spec.loader.exec_module(orch)
    assert orch.job_terminal_state({"succeeded": 8, "failed": 0}, completions=8) == "complete"
    assert orch.job_terminal_state({"succeeded": 3, "failed": 1}, completions=8) is None
    assert orch.job_terminal_state({"succeeded": 5, "failed": 3}, completions=8, backoff_exhausted=True) == "failed"


def test_build_shard_job_manifest():
    spec.loader.exec_module(orch)

    env_list = [
        {"name": "SEARCH_HOST", "value": "es-host"},
        {"name": "SEARCH_PORT", "value": "9200"},
    ]
    env_from_list = [
        {"secretRef": {"name": "elastic-admin-secret"}},
        {"secretRef": {"name": "local-settings-ref", "optional": True}},
        {"configMapRef": {"name": "local-settings-staging"}},
        {"secretRef": {"name": "local-settings-secrets-staging", "optional": True}},
    ]
    volumes = [
        {
            "name": "local-settings",
            "configMap": {
                "name": "local-settings-file-staging",
                "items": [{"key": "local_settings.py", "path": "local_settings.py"}],
            },
        }
    ]
    volume_mounts = [
        {
            "name": "local-settings",
            "mountPath": "/app/sefaria/local_settings.py",
            "subPath": "local_settings.py",
            "readOnly": True,
        }
    ]

    manifest = orch.build_shard_job_manifest(
        name="test-job",
        namespace="default",
        image="my-image:latest",
        shard_count=4,
        command=["python", "run.py"],
        env=env_list,
        env_from=env_from_list,
        volumes=volumes,
        volume_mounts=volume_mounts,
        resources={"requests": {"memory": "8Gi"}, "limits": {"memory": "12Gi"}},
    )

    assert manifest["apiVersion"] == "batch/v1"
    assert manifest["kind"] == "Job"
    assert manifest["spec"]["completionMode"] == "Indexed"
    assert manifest["spec"]["completions"] == 4
    assert manifest["spec"]["parallelism"] == 4
    assert manifest["spec"]["backoffLimitPerIndex"] == 2
    assert manifest["spec"]["maxFailedIndexes"] == 0

    container = manifest["spec"]["template"]["spec"]["containers"][0]

    # SHARD_COUNT env var appended after the passed env list
    env_names = [e["name"] for e in container["env"]]
    assert "SHARD_COUNT" in env_names
    shard_count_val = next(e["value"] for e in container["env"] if e["name"] == "SHARD_COUNT")
    assert shard_count_val == "4"

    # Passed env vars are present
    assert "SEARCH_HOST" in env_names
    assert "SEARCH_PORT" in env_names

    # envFrom is propagated
    assert "envFrom" in container
    env_from_secret_names = [
        ef["secretRef"]["name"]
        for ef in container["envFrom"]
        if "secretRef" in ef
    ]
    assert "elastic-admin-secret" in env_from_secret_names

    env_from_configmap_names = [
        ef["configMapRef"]["name"]
        for ef in container["envFrom"]
        if "configMapRef" in ef
    ]
    assert "local-settings-staging" in env_from_configmap_names

    # volumes are propagated to pod spec
    pod_spec = manifest["spec"]["template"]["spec"]
    assert "volumes" in pod_spec
    volume_names = [v["name"] for v in pod_spec["volumes"]]
    assert "local-settings" in volume_names

    # volumeMounts are propagated to container
    assert "volumeMounts" in container
    mount_paths = [vm["mountPath"] for vm in container["volumeMounts"]]
    assert "/app/sefaria/local_settings.py" in mount_paths


def test_build_shard_job_manifest_minimal():
    """Ensure the function still works with only required params."""
    spec.loader.exec_module(orch)
    manifest = orch.build_shard_job_manifest(
        name="test-job",
        namespace="default",
        image="my-image:latest",
        shard_count=4,
        command=["python", "run.py"],
        resources={"requests": {"memory": "8Gi"}, "limits": {"memory": "12Gi"}},
    )
    assert manifest["apiVersion"] == "batch/v1"
    container = manifest["spec"]["template"]["spec"]["containers"][0]
    env_names = [e["name"] for e in container["env"]]
    assert "SHARD_COUNT" in env_names
    # No envFrom/volumes when not passed
    assert "envFrom" not in container
    assert "volumes" not in manifest["spec"]["template"]["spec"]


def test_build_shard_job_manifest_fails_without_resources():
    spec.loader.exec_module(orch)
    with pytest.raises(ValueError):
        orch.build_shard_job_manifest(
            name="test-job",
            namespace="default",
            image="my-image:latest",
            shard_count=4,
            command=["python", "run.py"],
            resources=None,
        )


def test_build_shard_env_from_deduplicates_identical_secret_refs():
    spec.loader.exec_module(orch)
    env_from = orch.build_shard_env_from(
        elastic_admin_secret="elastic-admin",
        local_settings_ref_secret="local-settings-secrets-production",
        local_settings_configmap="local-settings-production",
        local_settings_secret="local-settings-secrets-production",
    )
    secret_names = [e["secretRef"]["name"] for e in env_from if "secretRef" in e]
    assert secret_names.count("local-settings-secrets-production") == 1


def test_build_shard_job_manifest_includes_affinity():
    spec.loader.exec_module(orch)
    manifest = orch.build_shard_job_manifest(
        name="test-job",
        namespace="default",
        image="my-image:latest",
        shard_count=2,
        command=["python", "run.py"],
        resources={"requests": {"memory": "8Gi"}, "limits": {"memory": "12Gi"}},
        affinity=orch.MONGO_POD_ANTI_AFFINITY,
    )
    pod_spec = manifest["spec"]["template"]["spec"]
    assert pod_spec["affinity"] == orch.MONGO_POD_ANTI_AFFINITY


def test_verify_indexed_job_support_requires_128():
    spec.loader.exec_module(orch)

    class FakeCode:
        git_version = "v1.27.0"

    class FakeVersionApi:
        def get_code(self):
            return FakeCode()

    with pytest.raises(RuntimeError, match="1.28"):
        orch.verify_indexed_job_support(FakeVersionApi())


def test_verify_indexed_job_support_allows_128():
    spec.loader.exec_module(orch)

    class FakeCode:
        git_version = "v1.28.3"

    class FakeVersionApi:
        def get_code(self):
            return FakeCode()

    orch.verify_indexed_job_support(FakeVersionApi())


def test_parse_kubernetes_version_empty_string():
    spec.loader.exec_module(orch)
    with pytest.raises(RuntimeError):
        orch.parse_kubernetes_version("")


def test_parse_kubernetes_version_gke():
    spec.loader.exec_module(orch)
    assert orch.parse_kubernetes_version("v1.35.5-gke.1057002") == (1, 35)


def test_build_shard_job_manifest_includes_active_deadline_seconds():
    spec.loader.exec_module(orch)
    manifest = orch.build_shard_job_manifest(
        name="test-job",
        namespace="default",
        image="my-image:latest",
        shard_count=4,
        command=["python", "run.py"],
        resources={"requests": {"memory": "8Gi"}, "limits": {"memory": "12Gi"}},
        active_deadline_seconds=21600,
    )
    assert manifest["spec"]["activeDeadlineSeconds"] == 21600


def test_build_shard_job_manifest_omits_active_deadline_seconds_when_not_set():
    """No activeDeadlineSeconds key at all when the caller doesn't pass one - the shard Job
    manifest should not silently invent a value that wasn't configured."""
    spec.loader.exec_module(orch)
    manifest = orch.build_shard_job_manifest(
        name="test-job",
        namespace="default",
        image="my-image:latest",
        shard_count=4,
        command=["python", "run.py"],
        resources={"requests": {"memory": "8Gi"}, "limits": {"memory": "12Gi"}},
    )
    assert "activeDeadlineSeconds" not in manifest["spec"]


def test_parse_completed_indexes():
    spec.loader.exec_module(orch)
    assert orch.parse_completed_indexes(None) == set()
    assert orch.parse_completed_indexes("") == set()
    assert orch.parse_completed_indexes("0") == {0}
    assert orch.parse_completed_indexes("0,2-4,7") == {0, 2, 3, 4, 7}


def test_incomplete_shard_indexes():
    spec.loader.exec_module(orch)
    assert orch.incomplete_shard_indexes("0,1,2,3,4,5,6,7", 8) == []
    assert orch.incomplete_shard_indexes("0,1,2,3", 8) == [4, 5, 6, 7]
    assert orch.incomplete_shard_indexes(None, 8) == [0, 1, 2, 3, 4, 5, 6, 7]


class _FakeJobStatus:
    def __init__(self, succeeded=0, failed=0, conditions=None, completed_indexes=None):
        self.succeeded = succeeded
        self.failed = failed
        self.conditions = conditions
        self.completed_indexes = completed_indexes


def test_run_barrier_loop_returns_complete_when_all_shards_succeed():
    spec.loader.exec_module(orch)
    statuses = iter([
        _FakeJobStatus(succeeded=6, failed=0, completed_indexes="0-5"),
        _FakeJobStatus(succeeded=8, failed=0, completed_indexes="0-7"),
    ])
    sleeps = []
    state, incomplete = orch.run_barrier_loop(
        read_job_status=lambda: next(statuses),
        shard_count=8,
        timeout_seconds=99999,
        sleep_fn=lambda s: sleeps.append(s),
        now_fn=iter([0.0, 1.0, 2.0, 3.0]).__next__,
        log_fn=lambda msg: None,
    )
    assert state == "complete"
    assert incomplete == []
    assert sleeps == [60]


def test_run_barrier_loop_returns_failed_on_backoff_exhaustion():
    spec.loader.exec_module(orch)

    class _FailedCondition:
        type = "Failed"
        status = "True"

    statuses = iter([
        _FakeJobStatus(succeeded=5, failed=3, conditions=[_FailedCondition()], completed_indexes="0-4"),
    ])
    state, incomplete = orch.run_barrier_loop(
        read_job_status=lambda: next(statuses),
        shard_count=8,
        timeout_seconds=99999,
        sleep_fn=lambda s: None,
        now_fn=iter([0.0, 1.0]).__next__,
        log_fn=lambda msg: None,
    )
    assert state == "failed"
    assert incomplete == [5, 6, 7]


def test_run_barrier_loop_gives_up_once_timeout_elapses_and_never_returns_complete():
    """The barrier must not wait forever. Time is patched (now_fn) so the timeout fires
    instantly regardless of wall-clock; the loop must give up and signal failure rather
    than block or silently report success."""
    spec.loader.exec_module(orch)

    # Job never reaches a terminal state - always short of shard_count successes.
    def stuck_status():
        return _FakeJobStatus(succeeded=6, failed=0, completed_indexes="0-5")

    # now_fn: start at 0, then jump straight past the deadline on the very next call so
    # the loop gives up after exactly one poll.
    now_values = iter([0.0, 1000.0, 1000.0])
    sleeps = []
    state, incomplete = orch.run_barrier_loop(
        read_job_status=stuck_status,
        shard_count=8,
        timeout_seconds=100,
        sleep_fn=lambda s: sleeps.append(s),
        now_fn=lambda: next(now_values),
        log_fn=lambda msg: None,
    )
    assert state == "timeout"
    assert state != "complete"
    assert incomplete == [6, 7]
    # Gave up without ever sleeping again past the deadline check
    assert sleeps == []
