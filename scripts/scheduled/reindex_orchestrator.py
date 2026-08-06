#!/usr/bin/env python
"""Reindex orchestrator: init -> Indexed Job (N shards) -> finalize.
Runs as the weekly CronJob. Holds no ES/Mongo connection during the shard phase."""
import json
import os
import sys
import time
import logging

logger = logging.getLogger(__name__)

MONGO_POD_ANTI_AFFINITY = {
    "podAntiAffinity": {
        "requiredDuringSchedulingIgnoredDuringExecution": [
            {
                "labelSelector": {
                    "matchExpressions": [
                        {"key": "app", "operator": "In", "values": ["mongo"]}
                    ]
                },
                "topologyKey": "kubernetes.io.hostname",
            }
        ]
    }
}

SHARD_ENV_KEYS = (
    "SEARCH_HOST",
    "SEARCH_PORT",
    "SEARCH_PATH",
    "SEARCH_SSL_ENABLE",
    "REDIS_HOST",
    "NODEJS_HOST",
    "VARNISH_HOST",
)


def job_terminal_state(status, completions, backoff_exhausted=False):
    """Returns 'complete', 'failed', or None (still running).
    Pure function — no I/O, no imports beyond builtins.
    """
    if status.get("succeeded", 0) >= completions:
        return "complete"
    if backoff_exhausted:
        return "failed"
    return None


def parse_kubernetes_version(version_str):
    """Return (major, minor) ints from a gitVersion or semver string."""
    try:
        cleaned = version_str.lstrip("v")
        parts = cleaned.split(".")
        return int(parts[0]), int(parts[1])
    except (ValueError, IndexError) as exc:
        raise RuntimeError(
            f"Could not parse Kubernetes version {version_str!r}; cannot verify Indexed Job support"
        ) from exc


def verify_indexed_job_support(version_api):
    """Fail fast when the cluster cannot run Indexed Jobs with per-index backoff."""
    code = version_api.get_code()
    git_version = getattr(code, "git_version", None) or getattr(code, "gitVersion", "")
    major, minor = parse_kubernetes_version(git_version)
    if (major, minor) < (1, 28):
        raise RuntimeError(
            f"Kubernetes {git_version} does not support backoffLimitPerIndex/maxFailedIndexes "
            f"(requires >= 1.28); refusing to start reindex"
        )


def build_shard_env_from(
    elastic_admin_secret=None,
    local_settings_ref_secret=None,
    local_settings_configmap=None,
    local_settings_secret=None,
):
    """Build deduplicated envFrom entries for shard pods."""
    env_from = []
    seen = set()

    def add(entry):
        key = json.dumps(entry, sort_keys=True)
        if key not in seen:
            seen.add(key)
            env_from.append(entry)

    if elastic_admin_secret:
        add({"secretRef": {"name": elastic_admin_secret}})
    if local_settings_ref_secret:
        add({"secretRef": {"name": local_settings_ref_secret, "optional": True}})
    if local_settings_configmap:
        add({"configMapRef": {"name": local_settings_configmap}})
    if local_settings_secret and local_settings_secret != local_settings_ref_secret:
        add({"secretRef": {"name": local_settings_secret, "optional": True}})
    return env_from


def build_shard_job_manifest(
    name, namespace, image, shard_count, command,
    env=None, env_from=None, volumes=None, volume_mounts=None, resources=None, affinity=None,
    active_deadline_seconds=None,
):
    """Build a batch/v1 Indexed Job manifest as a plain dict.
    Pure function — no I/O, no imports beyond builtins.
    """
    if resources is None:
        raise ValueError(
            "shard resources are required; set SHARD_RESOURCES / Helm shardResources"
        )
    container = {
        "name": "reindex-shard",
        "image": image,
        "command": command,
        "env": (env or []) + [{"name": "SHARD_COUNT", "value": str(shard_count)}],
        "resources": resources,
    }
    if env_from:
        container["envFrom"] = env_from
    if volume_mounts:
        container["volumeMounts"] = volume_mounts

    pod_spec = {
        "restartPolicy": "Never",
        "containers": [container],
    }
    if volumes:
        pod_spec["volumes"] = volumes
    if affinity:
        pod_spec["affinity"] = affinity

    spec = {
        "completionMode": "Indexed",
        "completions": shard_count,
        "parallelism": shard_count,
        "backoffLimitPerIndex": 2,
        "maxFailedIndexes": 0,
        "ttlSecondsAfterFinished": 86400,
        "template": {
            "spec": pod_spec,
        },
    }
    if active_deadline_seconds is not None:
        # Bounds a wedged shard - observed on a live cluster spinning at ~500m CPU with zero
        # bulk writes and zero log output for hours with no crash. Without this the shard Job
        # (and the orchestrator's barrier behind it) waits forever.
        spec["activeDeadlineSeconds"] = active_deadline_seconds

    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {"name": name, "namespace": namespace},
        "spec": spec,
    }


def parse_completed_indexes(completed_indexes_str):
    """Parse a Kubernetes Indexed Job status.completedIndexes range string (e.g. '0,2-4,7')
    into a set of ints. Pure function — no I/O, no imports beyond builtins."""
    result = set()
    if not completed_indexes_str:
        return result
    for part in completed_indexes_str.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-", 1)
            result.update(range(int(lo), int(hi) + 1))
        else:
            result.add(int(part))
    return result


def incomplete_shard_indexes(completed_indexes_str, shard_count):
    """Which shard indexes (0..shard_count-1) have not completed, for naming the stuck
    shard(s) in barrier-timeout/failure logs. Pure function."""
    completed = parse_completed_indexes(completed_indexes_str)
    return sorted(set(range(shard_count)) - completed)


def run_barrier_loop(
    read_job_status, shard_count, timeout_seconds,
    poll_interval_seconds=60, sleep_fn=time.sleep, now_fn=time.monotonic, log_fn=None,
):
    """Poll the shard Job until it reaches a terminal state or the barrier timeout elapses.

    `read_job_status` is a zero-arg callable returning the Job's `.status` object (as
    returned by `BatchV1Api.read_namespaced_job_status(...).status`).

    Returns (state, incomplete_indexes) where state is one of 'complete', 'failed', 'timeout'.
    This loop used to be an unbounded `while True`, which meant a wedged shard (no crash, no
    log output, doc count frozen) held the barrier - and therefore the CronJob's
    concurrencyPolicy: Forbid slot - forever. The timeout here is a backstop behind the shard
    Job's own activeDeadlineSeconds, so even if that somehow doesn't fire, this loop still
    gives up, logs which shards never finished, and returns without ever claiming success.
    """
    log = log_fn or (lambda msg: logger.info(msg))
    start = now_fn()
    deadline = start + timeout_seconds
    while True:
        st = read_job_status()
        status = {"succeeded": st.succeeded or 0, "failed": st.failed or 0}
        backoff_exhausted = bool(getattr(st, "conditions", None)) and any(
            c.type == "Failed" and c.status == "True" for c in st.conditions
        )
        state = job_terminal_state(status, shard_count, backoff_exhausted)
        completed_indexes_str = (
            getattr(st, "completed_indexes", None) or getattr(st, "completedIndexes", None)
        )
        incomplete = incomplete_shard_indexes(completed_indexes_str, shard_count)
        elapsed = now_fn() - start
        log(
            f"barrier: {status['succeeded']}/{shard_count} shards succeeded, "
            f"{status['failed']} failed, incomplete={incomplete}, elapsed={elapsed:.0f}s"
        )
        if state == "complete":
            return "complete", []
        if state == "failed":
            return "failed", incomplete
        if now_fn() >= deadline:
            return "timeout", incomplete
        sleep_fn(poll_interval_seconds)


def parse_shard_resources():
    """Parse SHARD_RESOURCES JSON env var into a Kubernetes resources dict."""
    raw = os.environ.get("SHARD_RESOURCES")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Could not parse SHARD_RESOURCES: {e}") from e


def main():
    # Heavy imports are lazy so unit tests can exec_module without these packages
    import django
    django.setup()
    from datetime import datetime
    from kubernetes import client, config
    from sefaria.pagesheetrank import update_pagesheetrank
    from scripts.scheduled.reindex_pipeline import (
        run_reindex_finalize_all,
        run_reindex_init_all,
    )

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    sheet_catch_up_timestamp = datetime.now().isoformat()
    logger.info(f"Captured sheet catch-up timestamp at orchestrator start - timestamp: {sheet_catch_up_timestamp}")

    config.load_incluster_config()
    namespace = os.environ["K8S_NAMESPACE"]
    shard_count = int(os.environ.get("SHARD_COUNT", "8"))
    image = os.environ["SHARD_JOB_IMAGE"]
    job_name = os.environ.get("SHARD_JOB_NAME", "reindex-shard")
    debug = os.environ.get("REINDEX_DEBUG", "").lower() in ("1", "true", "yes")
    # Shards that completed took ~2-3h; 6h is generous but bounded, so a wedged shard
    # (observed spinning with zero progress and zero logs for hours) is force-terminated
    # instead of running forever.
    shard_active_deadline_seconds = int(os.environ.get("SHARD_ACTIVE_DEADLINE_SECONDS", "21600"))
    # Comfortably longer than shard_active_deadline_seconds so the shard Job's own deadline
    # fires first; this is only a backstop in case that somehow doesn't happen.
    barrier_timeout_seconds = int(os.environ.get("REINDEX_BARRIER_TIMEOUT_SECONDS", "25200"))
    command = [
        "bash", "-c",
        "mkdir -p /log && touch /log/sefaria_book_errors.log && pip install numpy && "
        "/app/run /app/scripts/scheduled/reindex_elasticsearch_cronjob.py --mode shard --type text",
    ]
    if debug:
        command[-1] += " --debug"

    shard_env = []
    for key in SHARD_ENV_KEYS:
        val = os.environ.get(key)
        if val is not None:
            shard_env.append({"name": key, "value": val})

    shard_env_from = build_shard_env_from(
        elastic_admin_secret=os.environ.get("ELASTIC_ADMIN_SECRET"),
        local_settings_ref_secret=os.environ.get("LOCAL_SETTINGS_REF_SECRET"),
        local_settings_configmap=os.environ.get("LOCAL_SETTINGS_CONFIGMAP"),
        local_settings_secret=os.environ.get("LOCAL_SETTINGS_SECRET"),
    )

    local_settings_file_configmap = os.environ.get("LOCAL_SETTINGS_FILE_CONFIGMAP")
    shard_volumes = []
    shard_volume_mounts = []
    if local_settings_file_configmap:
        shard_volumes = [
            {
                "name": "local-settings",
                "configMap": {
                    "name": local_settings_file_configmap,
                    "items": [{"key": "local_settings.py", "path": "local_settings.py"}],
                },
            }
        ]
        shard_volume_mounts = [
            {
                "name": "local-settings",
                "mountPath": "/app/sefaria/local_settings.py",
                "subPath": "local_settings.py",
                "readOnly": True,
            }
        ]

    batch = client.BatchV1Api()
    version_api = client.VersionApi()

    try:
        verify_indexed_job_support(version_api)
    except RuntimeError as e:
        logger.error(str(e))
        sys.exit(1)

    resources = parse_shard_resources()
    if resources is None:
        raise RuntimeError(
            "SHARD_RESOURCES env var is not set; cannot launch shard jobs (set via Helm shardResources)"
        )

    manifest = build_shard_job_manifest(
        job_name, namespace, image, shard_count, command,
        env=shard_env,
        env_from=shard_env_from or None,
        volumes=shard_volumes or None,
        volume_mounts=shard_volume_mounts or None,
        resources=resources,
        affinity=MONGO_POD_ANTI_AFFINITY,
        active_deadline_seconds=shard_active_deadline_seconds,
    )

    # Delete stale job before init so a failed prior run does not block recreate
    try:
        batch.delete_namespaced_job(job_name, namespace, propagation_policy="Background")
        time.sleep(10)
    except client.exceptions.ApiException as exc:
        if exc.status != 404:
            logger.error(f"Failed to delete stale shard job - status: {exc.status}, reason: {exc.reason}")
            sys.exit(1)

    logger.info("Orchestrator: running init (pagesheetrank + create indexes)")
    update_pagesheetrank()
    run_reindex_init_all(debug=debug)

    try:
        batch.create_namespaced_job(namespace, manifest)
    except client.exceptions.ApiException as exc:
        logger.error(
            f"Failed to create Indexed Job after init - status: {exc.status}, reason: {exc.reason}. "
            "ES indexes were initialized; manual cleanup may be required."
        )
        sys.exit(1)

    logger.info(
        f"Orchestrator: created Indexed Job {job_name} with {shard_count} shards, "
        f"activeDeadlineSeconds={shard_active_deadline_seconds}, "
        f"barrier_timeout={barrier_timeout_seconds}s"
    )

    barrier_state, incomplete = run_barrier_loop(
        read_job_status=lambda: batch.read_namespaced_job_status(job_name, namespace).status,
        shard_count=shard_count,
        timeout_seconds=barrier_timeout_seconds,
        log_fn=lambda msg: logger.info(f"Orchestrator: {msg}"),
    )
    if barrier_state == "failed":
        logger.error(
            f"Orchestrator: shard job failed; incomplete shard indexes: {incomplete}; "
            "NOT finalizing (alias unchanged)"
        )
        sys.exit(1)
    if barrier_state == "timeout":
        logger.error(
            f"Orchestrator: barrier timed out after {barrier_timeout_seconds}s; shard "
            f"indexes still incomplete: {incomplete}; NOT finalizing (alias unchanged)"
        )
        sys.exit(1)

    logger.info("Orchestrator: all shards complete; finalizing")
    run_reindex_finalize_all(
        debug=debug,
        sheet_catch_up_timestamp=sheet_catch_up_timestamp,
        clear_queue=True,
    )
    logger.info("Orchestrator: reindex complete")


if __name__ == "__main__":
    main()

