"""Unit tests for pure-logic functions in reindex_orchestrator.
Uses importlib to exec_module so heavy imports (kubernetes, django) are never triggered
— they live inside main() only."""
import importlib.util
import pathlib


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
    """Ensure the function still works without optional params (backward compat)."""
    spec.loader.exec_module(orch)
    manifest = orch.build_shard_job_manifest(
        name="test-job",
        namespace="default",
        image="my-image:latest",
        shard_count=4,
        command=["python", "run.py"],
    )
    assert manifest["apiVersion"] == "batch/v1"
    container = manifest["spec"]["template"]["spec"]["containers"][0]
    env_names = [e["name"] for e in container["env"]]
    assert "SHARD_COUNT" in env_names
    # No envFrom/volumes when not passed
    assert "envFrom" not in container
    assert "volumes" not in manifest["spec"]["template"]["spec"]
