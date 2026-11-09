"""Unit tests for pure-logic functions in reindex_orchestrator.
Uses importlib to exec_module so heavy imports (kubernetes, django) are never triggered
— they live inside main() only."""

import importlib.util
import itertools
import pathlib
import sys
import types

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
    env_from_secret_names = [ef["secretRef"]["name"] for ef in container["envFrom"] if "secretRef" in ef]
    assert "elastic-admin-secret" in env_from_secret_names

    env_from_configmap_names = [ef["configMapRef"]["name"] for ef in container["envFrom"] if "configMapRef" in ef]
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


def test_main_rebuilds_entities_after_the_text_sheet_cutover():
    """Ordering is the point: entities run only after text/sheet are durably swapped.

    Static check on main()'s call order, because main() itself imports kubernetes and
    django and cannot be exercised here (see this module's docstring). Guards the gap
    where the CronJob was repointed from index_all() -- the sole caller of
    index_entities() -- to the orchestrator, which never invoked it.
    """
    import ast
    import pathlib as _pathlib

    src = _pathlib.Path("scripts/scheduled/reindex_orchestrator.py").read_text()
    fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "main")
    called = [n.func.id for n in ast.walk(fn) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)]

    assert "run_reindex_entities" in called, (
        "orchestrator main() must rebuild the entity indices; without it topic/book/"
        "category aliases go stale silently while the job still exits 0"
    )
    assert called.index("run_reindex_finalize_all") < called.index("run_reindex_entities"), (
        "entities must run AFTER the text/sheet alias swap, so an entity failure costs "
        "a re-run of entity indexing rather than the whole reindex"
    )


def test_main_cleans_failed_reindex_targets_on_failed_barrier_and_timeout():
    """Static check because main() imports django/kubernetes at runtime.

    The failure branches must clean up the target index created by init before exiting,
    while still leaving the alias unchanged.
    """
    import ast
    import pathlib as _pathlib

    src = _pathlib.Path("scripts/scheduled/reindex_orchestrator.py").read_text()
    fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "main")
    branches = {
        compare.comparators[0].value: node
        for node in ast.walk(fn)
        if isinstance(node, ast.If)
        for compare in [node.test]
        if (
            isinstance(compare, ast.Compare)
            and isinstance(compare.left, ast.Name)
            and compare.left.id == "barrier_state"
            and isinstance(compare.comparators[0], ast.Constant)
        )
    }
    for state in ("failed", "timeout"):
        branch_calls = [
            n.func.id for n in ast.walk(branches[state]) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
        ]
        branch_attr_calls = [
            n.func.attr
            for n in ast.walk(branches[state])
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
        ]
        assert "cleanup_after_init_failure" in branch_calls
        assert "exit" in branch_attr_calls


def test_build_shard_job_manifest_marks_pods_unsafe_to_evict():
    """Shard pods must survive cluster-autoscaler scale-down.

    Observed on the dev cluster 2026-08-31: the orchestrator pod was killed by
    `ScaleDown / deleting pod for node scale down` after 30 minutes, restarting
    the link walk from zero and consuming one of only two attempts. Shards run
    even longer than the orchestrator and hold no checkpoint, so an eviction
    discards the whole shard's work. Cauldrons run on the `preemptable` node
    pool where consolidation is routine.
    """
    spec.loader.exec_module(orch)
    manifest = orch.build_shard_job_manifest(
        name="test-job",
        namespace="default",
        image="my-image:latest",
        shard_count=4,
        command=["python", "run.py"],
        resources={"requests": {"memory": "8Gi"}, "limits": {"memory": "12Gi"}},
    )
    annotations = manifest["spec"]["template"]["metadata"]["annotations"]
    assert annotations["cluster-autoscaler.kubernetes.io/safe-to-evict"] == "false"


def test_build_shard_job_manifest_hardens_shard_pod_identity():
    """Shard pods have zero Kube-API access - this must be explicit in the manifest,
    not merely emergent from omitting a field (SEC-004)."""
    spec.loader.exec_module(orch)
    manifest = orch.build_shard_job_manifest(
        name="test-job",
        namespace="default",
        image="my-image:latest",
        shard_count=4,
        command=["python", "run.py"],
        resources={"requests": {"memory": "8Gi"}, "limits": {"memory": "12Gi"}},
    )
    pod_spec = manifest["spec"]["template"]["spec"]
    assert pod_spec["serviceAccountName"] == "default"
    assert pod_spec["automountServiceAccountToken"] is False
    container = pod_spec["containers"][0]
    assert container["securityContext"]["allowPrivilegeEscalation"] is False


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
    statuses = iter(
        [
            _FakeJobStatus(succeeded=6, failed=0, completed_indexes="0-5"),
            _FakeJobStatus(succeeded=8, failed=0, completed_indexes="0-7"),
        ]
    )
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

    statuses = iter(
        [
            _FakeJobStatus(succeeded=5, failed=3, conditions=[_FailedCondition()], completed_indexes="0-4"),
        ]
    )
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


def test_parse_shard_resources_returns_none_when_unset(monkeypatch):
    spec.loader.exec_module(orch)
    monkeypatch.delenv("SHARD_RESOURCES", raising=False)
    assert orch.parse_shard_resources() is None


def test_parse_shard_resources_rejects_empty_dict(monkeypatch):
    """json.loads("{}") is falsy but not None - a bare `is None` check would let this
    through and launch shard pods with no memory limit at all."""
    spec.loader.exec_module(orch)
    monkeypatch.setenv("SHARD_RESOURCES", "{}")
    with pytest.raises(RuntimeError, match="malformed"):
        orch.parse_shard_resources()


def test_parse_shard_resources_rejects_missing_memory_keys(monkeypatch):
    spec.loader.exec_module(orch)
    monkeypatch.setenv("SHARD_RESOURCES", '{"requests": {"cpu": "1"}, "limits": {"cpu": "2"}}')
    with pytest.raises(RuntimeError, match="malformed"):
        orch.parse_shard_resources()


def test_parse_shard_resources_accepts_valid_shape(monkeypatch):
    spec.loader.exec_module(orch)
    monkeypatch.setenv(
        "SHARD_RESOURCES",
        '{"requests": {"memory": "4Gi"}, "limits": {"memory": "8Gi"}}',
    )
    result = orch.parse_shard_resources()
    assert result == {"requests": {"memory": "4Gi"}, "limits": {"memory": "8Gi"}}


class _FakeIndexClient:
    def __init__(self, live_alias_pairs=()):
        self.live_alias_pairs = set(live_alias_pairs)

    def exists_alias(self, index, name):
        return (index, name) in self.live_alias_pairs


_GIB = 1024**3


class _FakeEsClient:
    """Stands in for search.es_client: canned _cluster/health and _cat/allocation responses."""

    def __init__(self, health, allocation):
        self.cluster = types.SimpleNamespace(health=lambda: health)
        self.cat = types.SimpleNamespace(allocation=lambda **kwargs: allocation)
        self.options_calls = []

    def options(self, **kwargs):
        # elasticsearch-py 8 returns a client copy with per-request options; the disk guard
        # uses it for a short timeout and no retries.
        self.options_calls.append(kwargs)
        return self


class _FakeSearchModule:
    def __init__(self, names_by_type, live_alias_pairs=(), health=None, allocation=None):
        self.names_by_type = names_by_type
        self.index_client = _FakeIndexClient(live_alias_pairs)
        healthy_allocation = [{"node": "es-data-0", "disk.avail": str(100 * _GIB), "disk.percent": "30"}]
        self.es_client = _FakeEsClient(
            health if health is not None else {"status": "green"},
            allocation if allocation is not None else healthy_allocation,
        )
        self.deleted = []

    def get_new_and_current_index_names(self, type, debug=False):
        return self.names_by_type[type]

    def _assert_not_shared_index(self, alias, type):
        if alias in ("text", "sheet", "topic", "book", "category"):
            raise ValueError("shared alias")

    def clear_index(self, index_name):
        self.deleted.append(index_name)


def test_cleanup_failed_reindex_targets_deletes_only_unaliased_targets(monkeypatch):
    spec.loader.exec_module(orch)
    search = _FakeSearchModule(
        {
            "text": {
                "new": "sefariastaging_text-a",
                "current": "sefariastaging_text-b",
                "alias": "sefariastaging_text",
            },
            "sheet": {
                "new": "sefariastaging_sheet-a",
                "current": "sefariastaging_sheet-b",
                "alias": "sefariastaging_sheet",
            },
        }
    )

    deleted = orch.cleanup_failed_reindex_targets(
        index_types=("text", "sheet"),
        search_module=search,
        log_fn=lambda level, msg: None,
    )

    assert deleted == ["sefariastaging_text-a", "sefariastaging_sheet-a"]
    assert search.deleted == deleted


def test_cleanup_failed_reindex_targets_never_deletes_live_alias_target():
    spec.loader.exec_module(orch)
    search = _FakeSearchModule(
        {
            "text": {
                "new": "sefariastaging_text-a",
                "current": "sefariastaging_text-b",
                "alias": "sefariastaging_text",
            },
        },
        live_alias_pairs={("sefariastaging_text-a", "sefariastaging_text")},
    )
    logged = []

    deleted = orch.cleanup_failed_reindex_targets(
        index_types=("text",),
        search_module=search,
        log_fn=lambda level, msg: logged.append((level, msg)),
    )

    assert deleted == []
    assert search.deleted == []
    assert any("live alias" in msg for level, msg in logged)


def test_cleanup_failed_reindex_targets_never_deletes_shared_text_or_sheet_aliases():
    spec.loader.exec_module(orch)
    search = _FakeSearchModule(
        {
            "text": {"new": "text", "current": "text-b", "alias": "text"},
            "sheet": {"new": "sheet", "current": "sheet-b", "alias": "sheet"},
        }
    )

    deleted = orch.cleanup_failed_reindex_targets(
        index_types=("text", "sheet"),
        search_module=search,
        log_fn=lambda level, msg: None,
    )

    assert deleted == []
    assert search.deleted == []


def _fake_sefaria_search(monkeypatch, search):
    """
    Replace sefaria.search for orch.main(). The orchestrator does `import sefaria.search as ...`, which
    reads the `search` attribute of the already-imported `sefaria` package before sys.modules, so
    once any earlier test has imported the real module, patching sys.modules alone isn't enough.
    """
    import sefaria

    monkeypatch.setitem(sys.modules, "sefaria.search", search)
    monkeypatch.setattr(sefaria, "search", search, raising=False)


def test_main_cleans_partial_init_failure_without_deleting_current(monkeypatch):
    spec.loader.exec_module(orch)

    class FakeApiException(Exception):
        def __init__(self, status, reason=""):
            super().__init__(status)
            self.status = status
            self.reason = reason

    class FakeBatch:
        def delete_namespaced_job(self, name, namespace, propagation_policy=None):
            raise FakeApiException(404, "not found")

    class FakeVersionApi:
        def get_code(self):
            return types.SimpleNamespace(git_version="v1.28.0")

    search = _FakeSearchModule(
        {
            "text": {
                "new": "sefariastaging_text-target",
                "current": "sefariastaging_text-current",
                "alias": "sefariastaging_text",
            },
            "sheet": {
                "new": "sefariastaging_sheet-current",
                "current": "sefariastaging_sheet-current",
                "alias": "sefariastaging_sheet",
            },
        },
        live_alias_pairs={("sefariastaging_sheet-current", "sefariastaging_sheet")},
    )
    pipeline = types.ModuleType("scripts.scheduled.reindex_pipeline")
    pipeline.REINDEX_TYPES = ("text", "sheet")
    pipeline.run_reindex_entities = lambda debug=False: None
    pipeline.run_reindex_finalize_all = lambda **kwargs: None

    def raise_after_text_target_created(debug=False):
        raise RuntimeError("sheet init failed")

    pipeline.run_reindex_init_all = raise_after_text_target_created

    monkeypatch.setitem(sys.modules, "django", types.SimpleNamespace(setup=lambda: None))
    monkeypatch.setitem(
        sys.modules,
        "kubernetes",
        types.SimpleNamespace(
            client=types.SimpleNamespace(
                BatchV1Api=lambda: FakeBatch(),
                VersionApi=lambda: FakeVersionApi(),
                exceptions=types.SimpleNamespace(ApiException=FakeApiException),
            ),
            config=types.SimpleNamespace(load_incluster_config=lambda: None),
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "sefaria.pagesheetrank",
        types.SimpleNamespace(update_pagesheetrank=lambda: None),
    )
    monkeypatch.setitem(sys.modules, "scripts.scheduled.reindex_pipeline", pipeline)
    _fake_sefaria_search(monkeypatch, search)
    monkeypatch.setenv("K8S_NAMESPACE", "default")
    monkeypatch.setenv("SHARD_JOB_IMAGE", "sefaria:test")
    monkeypatch.setenv("SHARD_RESOURCES", '{"requests": {"memory": "4Gi"}, "limits": {"memory": "8Gi"}}')

    with pytest.raises(RuntimeError, match="sheet init failed"):
        orch.main()

    assert search.deleted == ["sefariastaging_text-target"]
    assert "sefariastaging_text-current" not in search.deleted
    assert "sefariastaging_sheet-current" not in search.deleted


def _mock_main_services(monkeypatch, search, batch, finalize):
    class FakeApiException(Exception):
        def __init__(self, status, reason=""):
            super().__init__(status)
            self.status = status
            self.reason = reason

    class FakeVersionApi:
        def get_code(self):
            return types.SimpleNamespace(git_version="v1.28.0")

    pipeline = types.ModuleType("scripts.scheduled.reindex_pipeline")
    pipeline.REINDEX_TYPES = ("text", "sheet")
    pipeline.run_reindex_init_all = lambda debug=False: None
    pipeline.run_reindex_finalize_all = finalize
    pipeline.run_reindex_entities = lambda debug=False: None

    monkeypatch.setitem(sys.modules, "django", types.SimpleNamespace(setup=lambda: None))
    monkeypatch.setitem(
        sys.modules,
        "kubernetes",
        types.SimpleNamespace(
            client=types.SimpleNamespace(
                BatchV1Api=lambda: batch,
                VersionApi=lambda: FakeVersionApi(),
                exceptions=types.SimpleNamespace(ApiException=FakeApiException),
            ),
            config=types.SimpleNamespace(load_incluster_config=lambda: None),
        ),
    )
    monkeypatch.setitem(sys.modules, "sefaria.pagesheetrank", types.SimpleNamespace(update_pagesheetrank=lambda: None))
    monkeypatch.setitem(sys.modules, "scripts.scheduled.reindex_pipeline", pipeline)
    _fake_sefaria_search(monkeypatch, search)
    monkeypatch.setenv("K8S_NAMESPACE", "default")
    monkeypatch.setenv("SHARD_JOB_IMAGE", "sefaria:test")
    monkeypatch.setenv("SHARD_RESOURCES", '{"requests": {"memory": "4Gi"}, "limits": {"memory": "8Gi"}}')
    return FakeApiException


def test_main_preserves_live_text_when_sheet_finalize_fails(monkeypatch):
    spec.loader.exec_module(orch)
    events = []

    class FakeBatch:
        def delete_namespaced_job(self, name, namespace, propagation_policy=None):
            events.append(("delete_job", propagation_policy))
            raise fake_api_exception(404)

        def create_namespaced_job(self, namespace, manifest):
            events.append(("create_job",))

    search = _FakeSearchModule(
        {
            "text": {"new": "text-target", "current": "text-old", "alias": "isolated-text"},
            "sheet": {"new": "sheet-target", "current": "sheet-old", "alias": "isolated-sheet"},
        }
    )

    def finalize(**kwargs):
        # Text's alias has moved to its target before sheet finalization raises.
        search.names_by_type["text"] = {
            "new": "text-old",
            "current": "text-target",
            "alias": "isolated-text",
        }
        search.index_client.live_alias_pairs.add(("text-target", "isolated-text"))
        raise RuntimeError("sheet finalize failed")

    batch = FakeBatch()
    fake_api_exception = _mock_main_services(monkeypatch, search, batch, finalize)
    monkeypatch.setattr(orch, "run_barrier_loop", lambda **kwargs: ("complete", []))

    with pytest.raises(RuntimeError, match="sheet finalize failed"):
        orch.main()

    assert "text-target" not in search.deleted
    assert "sheet-target" in search.deleted
    assert events == [("delete_job", "Background"), ("create_job",), ("delete_job", "Foreground")]


@pytest.mark.parametrize("job_stopped", [False, True])
def test_main_timeout_cleans_only_after_confirmed_job_stop(monkeypatch, job_stopped):
    spec.loader.exec_module(orch)
    events = []

    class FakeBatch:
        def delete_namespaced_job(self, name, namespace, propagation_policy=None):
            events.append(("delete_job", propagation_policy))
            raise fake_api_exception(404)

        def create_namespaced_job(self, namespace, manifest):
            events.append(("create_job",))

    class FakeSearch(_FakeSearchModule):
        def clear_index(self, index_name):
            events.append(("clear_index", index_name))
            super().clear_index(index_name)

    search = FakeSearch(
        {
            "text": {"new": "text-target", "current": "text-old", "alias": "isolated-text"},
            "sheet": {"new": "sheet-target", "current": "sheet-old", "alias": "isolated-sheet"},
        }
    )
    batch = FakeBatch()
    fake_api_exception = _mock_main_services(monkeypatch, search, batch, lambda **kwargs: None)
    monkeypatch.setattr(orch, "run_barrier_loop", lambda **kwargs: ("timeout", [0]))

    def stop_job(*args, **kwargs):
        events.append(("stop_job", kwargs.get("propagation_policy")))
        return True if kwargs.get("propagation_policy") == "Background" else job_stopped

    monkeypatch.setattr(orch, "delete_stale_shard_job", stop_job)

    with pytest.raises(SystemExit):
        orch.main()

    assert ("stop_job", "Foreground") in events
    assert search.deleted == (["text-target", "sheet-target"] if job_stopped else [])
    if job_stopped:
        assert events.index(("stop_job", "Foreground")) < events.index(("clear_index", "text-target"))


class _FakeApiException(Exception):
    def __init__(self, status):
        super().__init__(status)
        self.status = status


class _FakeBatch:
    """Records calls; raises per-method from a script of outcomes."""

    def __init__(self, delete_outcome=None, status_outcomes=()):
        self.calls = []
        self._delete_outcome = delete_outcome
        self._status_outcomes = list(status_outcomes)

    def delete_namespaced_job(self, name, namespace, propagation_policy=None):
        self.calls.append("delete")
        if self._delete_outcome is not None:
            raise self._delete_outcome

    def read_namespaced_job_status(self, name, namespace):
        self.calls.append("read_status")
        outcome = self._status_outcomes.pop(0)
        if outcome is not None:
            raise outcome

    def read_namespaced_job(self, name, namespace):
        raise AssertionError("read_namespaced_job needs `get` on jobs, which the orchestrator Role does not grant")


def test_delete_stale_shard_job_returns_true_when_no_prior_job():
    spec.loader.exec_module(orch)
    batch = _FakeBatch(delete_outcome=_FakeApiException(404))
    logged = []
    assert (
        orch.delete_stale_shard_job(batch, "j", "ns", _FakeApiException, sleep_fn=lambda s: None, log_fn=logged.append)
        is True
    )
    assert batch.calls == ["delete"]
    assert "No stale shard job to delete" in logged[0]


def test_delete_stale_shard_job_polls_status_until_gone():
    """Regression: after a successful delete, the poll must use the granted jobs/status verb."""
    spec.loader.exec_module(orch)
    batch = _FakeBatch(status_outcomes=[None, None, _FakeApiException(404)])
    assert orch.delete_stale_shard_job(batch, "j", "ns", _FakeApiException, sleep_fn=lambda s: None) is True
    assert batch.calls == ["delete", "read_status", "read_status", "read_status"]


def test_delete_stale_shard_job_gives_up_without_raising():
    spec.loader.exec_module(orch)
    batch = _FakeBatch(status_outcomes=[None] * 3)
    logged = []
    result = orch.delete_stale_shard_job(
        batch, "j", "ns", _FakeApiException, attempts=3, sleep_fn=lambda s: None, log_fn=logged.append
    )
    assert result is False
    assert "did not confirm" in logged[0]


def test_delete_stale_shard_job_propagates_forbidden():
    spec.loader.exec_module(orch)
    batch = _FakeBatch(status_outcomes=[_FakeApiException(403)])
    with pytest.raises(_FakeApiException):
        orch.delete_stale_shard_job(batch, "j", "ns", _FakeApiException, sleep_fn=lambda s: None)


def test_orchestrator_only_reads_jobs_through_granted_rbac_verbs():
    """The Role grants `get` on jobs/status only; a bare jobs read 403s in-cluster."""
    import re as _re

    src = pathlib.Path("scripts/scheduled/reindex_orchestrator.py").read_text()
    code = "\n".join(line for line in src.splitlines() if not line.lstrip().startswith("#"))
    assert not _re.search(r"\.read_namespaced_job\(", code)
    rbac = pathlib.Path("helm-chart/sefaria/templates/rbac/reindex-orchestrator-rbac.yaml").read_text()
    assert '"jobs/status"' in rbac


def _data_node_row(node="es-data-0", avail=50 * _GIB, percent=40):
    return {"node": node, "shards": "10", "disk.avail": str(avail), "disk.percent": str(percent)}


def test_preflight_passes_when_green_and_every_data_node_has_headroom():
    spec.loader.exec_module(orch)
    problems = orch.check_reindex_preflight(
        {"status": "green"},
        [_data_node_row("es-0"), _data_node_row("es-1")],
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert problems == []


def test_preflight_flags_non_green_cluster_status():
    spec.loader.exec_module(orch)
    for status in ("yellow", "red"):
        problems = orch.check_reindex_preflight(
            {"status": status},
            [_data_node_row()],
            min_free_bytes=20 * _GIB,
            max_disk_percent=75,
        )
        assert len(problems) == 1
        assert status in problems[0]


def test_preflight_flags_missing_cluster_status():
    spec.loader.exec_module(orch)
    problems = orch.check_reindex_preflight(
        {},
        [_data_node_row()],
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert len(problems) == 1
    assert "status" in problems[0]


def test_preflight_flags_node_below_minimum_free_bytes():
    spec.loader.exec_module(orch)
    problems = orch.check_reindex_preflight(
        {"status": "green"},
        [_data_node_row("es-0", avail=5 * _GIB), _data_node_row("es-1")],
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert len(problems) == 1
    assert "es-0" in problems[0]
    assert "free" in problems[0]


def test_preflight_flags_node_above_maximum_disk_percent():
    spec.loader.exec_module(orch)
    problems = orch.check_reindex_preflight(
        {"status": "green"},
        [_data_node_row("es-1", percent=91)],
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert len(problems) == 1
    assert "es-1" in problems[0]
    assert "91" in problems[0]


def test_preflight_threshold_boundaries_pass():
    """Exactly min free bytes and exactly max percent are still acceptable."""
    spec.loader.exec_module(orch)
    problems = orch.check_reindex_preflight(
        {"status": "green"},
        [_data_node_row(avail=20 * _GIB, percent=75)],
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert problems == []


def test_preflight_ignores_unassigned_and_nodeless_rows():
    spec.loader.exec_module(orch)
    rows = [
        {"node": "UNASSIGNED", "shards": "3", "disk.avail": None, "disk.percent": None},
        {"node": None, "shards": "0", "disk.avail": None, "disk.percent": None},
        _data_node_row(),
    ]
    problems = orch.check_reindex_preflight(
        {"status": "green"},
        rows,
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert problems == []


@pytest.mark.parametrize("rows", [None, [], [{"node": "UNASSIGNED", "shards": "3"}], [{"node": None}]])
def test_preflight_fails_closed_when_no_data_node_is_reported(rows):
    spec.loader.exec_module(orch)
    problems = orch.check_reindex_preflight(
        {"status": "green"},
        rows,
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert len(problems) == 1
    assert "no data nodes" in problems[0]


def test_preflight_accepts_string_numbers_and_reports_null_disk_values():
    """ES _cat returns strings with bytes=b. A data node whose disk numbers are null cannot
    prove headroom, so it is a problem rather than a silent pass."""
    spec.loader.exec_module(orch)
    ok = orch.check_reindex_preflight(
        {"status": "green"},
        [{"node": "es-0", "disk.avail": "21474836480", "disk.percent": "74"}],
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert ok == []

    unknown = orch.check_reindex_preflight(
        {"status": "green"},
        [{"node": "es-1", "disk.avail": None, "disk.percent": None}],
        min_free_bytes=20 * _GIB,
        max_disk_percent=75,
    )
    assert len(unknown) == 1
    assert "es-1" in unknown[0]


def test_main_preflight_failure_raises_before_any_job_or_index_change(monkeypatch):
    spec.loader.exec_module(orch)
    events = []

    class FakeBatch:
        def delete_namespaced_job(self, name, namespace, propagation_policy=None):
            events.append("delete_job")
            raise fake_api_exception(404)

        def create_namespaced_job(self, namespace, manifest):
            events.append("create_job")

    search = _FakeSearchModule(
        {
            "text": {"new": "text-target", "current": "text-old", "alias": "isolated-text"},
            "sheet": {"new": "sheet-target", "current": "sheet-old", "alias": "isolated-sheet"},
        },
        health={"status": "red"},
    )
    batch = FakeBatch()
    fake_api_exception = _mock_main_services(monkeypatch, search, batch, lambda **kwargs: None)
    pipeline = sys.modules["scripts.scheduled.reindex_pipeline"]
    monkeypatch.setattr(pipeline, "run_reindex_init_all", lambda debug=False: events.append("init"))
    monkeypatch.setenv("REINDEX_PREFLIGHT_SKIP", "")

    with pytest.raises(RuntimeError, match="pre-flight"):
        orch.main()

    assert events == []
    assert search.deleted == []


def test_main_preflight_skip_env_lets_reindex_proceed(monkeypatch):
    spec.loader.exec_module(orch)
    events = []

    class FakeBatch:
        def delete_namespaced_job(self, name, namespace, propagation_policy=None):
            raise fake_api_exception(404)

        def create_namespaced_job(self, namespace, manifest):
            events.append("create_job")

    search = _FakeSearchModule(
        {
            "text": {"new": "text-target", "current": "text-old", "alias": "isolated-text"},
            "sheet": {"new": "sheet-target", "current": "sheet-old", "alias": "isolated-sheet"},
        },
        health={"status": "red"},
    )
    batch = FakeBatch()
    fake_api_exception = _mock_main_services(monkeypatch, search, batch, lambda **kwargs: None)
    pipeline = sys.modules["scripts.scheduled.reindex_pipeline"]
    monkeypatch.setattr(pipeline, "run_reindex_init_all", lambda debug=False: events.append("init"))
    monkeypatch.setattr(orch, "run_barrier_loop", lambda **kwargs: ("complete", []))
    monkeypatch.setenv("REINDEX_PREFLIGHT_SKIP", "true")

    orch.main()

    assert events == ["init", "create_job"]


# --- in-flight disk abort ---------------------------------------------------------------


def _alloc(node, percent):
    return {"node": node, "disk.percent": str(percent), "disk.avail": "1000"}


def test_disk_abort_reasons_names_nodes_at_or_over_the_limit():
    spec.loader.exec_module(orch)
    rows = [_alloc("es-0", 40), _alloc("es-1", 85), _alloc("es-2", 91), {"node": "UNASSIGNED"}]
    reasons = orch.disk_abort_reasons(rows, max_disk_percent=85)
    assert len(reasons) == 2
    assert "es-1" in reasons[0] and "es-2" in reasons[1]


def test_disk_abort_reasons_ignores_unknown_numbers():
    # A missing number must not abort a multi-hour build; the pre-flight already refuses unknowns.
    spec.loader.exec_module(orch)
    rows = [{"node": "es-0", "disk.percent": None}, _alloc("es-1", 40)]
    assert orch.disk_abort_reasons(rows, max_disk_percent=85) == []


def test_run_barrier_loop_aborts_when_disk_check_reports_a_problem():
    spec.loader.exec_module(orch)
    statuses = iter(
        [
            _FakeJobStatus(succeeded=0, failed=0, completed_indexes=None),
            _FakeJobStatus(succeeded=2, failed=0, completed_indexes="0-1"),
        ]
    )
    checks = iter([[], ["node es-2 disk is 88% full"]])
    logs = []
    state, incomplete = orch.run_barrier_loop(
        read_job_status=lambda: next(statuses),
        shard_count=8,
        timeout_seconds=99999,
        sleep_fn=lambda s: None,
        now_fn=itertools.count().__next__,
        log_fn=logs.append,
        check_abort=lambda: next(checks),
    )
    assert state == "aborted"
    assert incomplete == [2, 3, 4, 5, 6, 7]
    assert any("es-2" in line for line in logs)


def test_run_barrier_loop_keeps_waiting_when_disk_check_errors():
    # ES briefly unreachable is not a reason to throw away the build; the shard deadline still bounds it.
    spec.loader.exec_module(orch)
    statuses = iter(
        [
            _FakeJobStatus(succeeded=0, failed=0, completed_indexes=None),
            _FakeJobStatus(succeeded=8, failed=0, completed_indexes="0-7"),
        ]
    )

    def flaky():
        raise ConnectionError("refused")

    state, _ = orch.run_barrier_loop(
        read_job_status=lambda: next(statuses),
        shard_count=8,
        timeout_seconds=99999,
        sleep_fn=lambda s: None,
        now_fn=itertools.count().__next__,
        log_fn=lambda msg: None,
        check_abort=flaky,
    )
    assert state == "complete"


@pytest.mark.parametrize("raw", ["nan", "inf", "-inf", "101", "0", "-5", "abc", ""])
def test_parse_abort_disk_percent_rejects_values_that_disable_the_guard(raw):
    spec.loader.exec_module(orch)
    with pytest.raises(ValueError):
        orch.parse_abort_disk_percent(raw)


def test_parse_abort_disk_percent_accepts_a_real_percentage():
    spec.loader.exec_module(orch)
    assert orch.parse_abort_disk_percent("85") == 85.0
    assert orch.parse_abort_disk_percent(" 92.5 ") == 92.5


def test_disk_abort_reasons_raises_when_no_node_reports_numbers():
    # No usable number on any node is a failed observation, not an all-clear.
    spec.loader.exec_module(orch)
    with pytest.raises(ValueError):
        orch.disk_abort_reasons([{"node": "es-0", "disk.percent": None}, {"node": "UNASSIGNED"}], 85)
    with pytest.raises(ValueError):
        orch.disk_abort_reasons([], 85)


def test_run_barrier_loop_aborts_when_disk_checks_keep_failing_past_the_grace_period():
    spec.loader.exec_module(orch)
    statuses = iter([_FakeJobStatus(succeeded=0, failed=0, completed_indexes=None)] * 5)
    clock = iter([0.0, 0.0, 100.0, 100.0, 400.0, 400.0, 700.0, 700.0, 701.0])

    def always_fails():
        raise ConnectionError("refused")

    logs = []
    state, incomplete = orch.run_barrier_loop(
        read_job_status=lambda: next(statuses),
        shard_count=8,
        timeout_seconds=99999,
        sleep_fn=lambda s: None,
        now_fn=clock.__next__,
        log_fn=logs.append,
        check_abort=always_fails,
        abort_check_grace_seconds=600,
    )
    assert state == "aborted"
    assert incomplete == list(range(8))
    assert any("no successful disk check" in line for line in logs)


# --- per-node freshness (DiskGuard) -------------------------------------------------------


def test_disk_abort_reasons_treats_nan_and_out_of_range_as_missing():
    spec.loader.exec_module(orch)
    rows = [{"node": "es-0", "disk.percent": "NaN"}, {"node": "es-1", "disk.percent": "150"}]
    with pytest.raises(ValueError):
        orch.disk_abort_reasons(rows, 85)


def test_disk_guard_aborts_when_one_node_stays_unobserved_past_grace():
    # Two healthy nodes must not hide a third that stopped reporting.
    spec.loader.exec_module(orch)
    clock = iter([0.0, 300.0, 601.0])
    guard = orch.DiskGuard(
        max_disk_percent=85, grace_seconds=600, now_fn=clock.__next__, expected_nodes=["es-0", "es-1", "es-2"]
    )
    partial = [_alloc("es-0", 40), _alloc("es-1", 41), {"node": "es-2", "disk.percent": None}]
    assert guard.check(partial) == []
    reasons = guard.check(partial)
    assert len(reasons) == 1 and "es-2" in reasons[0]


def test_disk_guard_tolerates_a_short_gap_and_watches_nodes_that_vanish():
    spec.loader.exec_module(orch)
    clock = iter([0.0, 100.0, 200.0, 900.0])
    guard = orch.DiskGuard(max_disk_percent=85, grace_seconds=600, now_fn=clock.__next__)
    full = [_alloc("es-0", 40), _alloc("es-1", 41)]
    assert guard.check(full) == []  # learns es-0, es-1 at t=100
    assert guard.check([_alloc("es-0", 42)]) == []  # es-1 missing for 100 s: fine
    reasons = guard.check([_alloc("es-0", 43)])  # es-1 missing since t=100: 800 s
    assert len(reasons) == 1 and "es-1" in reasons[0]


def test_disk_guard_reports_threshold_breaches():
    spec.loader.exec_module(orch)
    guard = orch.DiskGuard(max_disk_percent=85, grace_seconds=600, now_fn=itertools.count().__next__)
    reasons = guard.check([_alloc("es-0", 40), _alloc("es-1", 90)])
    assert len(reasons) == 1 and "es-1" in reasons[0] and "90%" in reasons[0]
