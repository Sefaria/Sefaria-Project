#!/usr/bin/env python3
""""No test left behind" checker for pytest CI selection.

Why this exists
----------------
master's CI ran ONE pytest invocation against a live Mongo:
`pytest -m "not deep and not failing" ./sefaria ./sso ./reader ./powered_by`

This branch replaces that with several jobs in `.github/workflows/continuous.yaml`,
each selecting a marker expression and a set of paths, against a mocked Mongo. A
test the baseline invocation would have collected but that no job collects today
runs *nowhere* -- it silently stopped being CI-gated. That's the "left behind"
case this script exists to catch. The no-Mongo job in particular is an explicit
file allowlist, so any unmarked test living outside it is exactly the kind of gap
this tool is built to surface.

Method: parse the workflow YAML for every step that invokes `python -m pytest`,
run `--collect-only` for each job's argv (with that job's env layered over the
current environment) and for the baseline invocation, then diff nodeid sets.
Collection itself runs in a real pytest subprocess -- no import of Django or
Sefaria happens in this process, so `--help` and the YAML-parsing tests work
without either.
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEFAULT_BASELINE_EXPR = "not deep and not failing"
DEFAULT_BASELINE_PATHS = ["./sefaria", "./sso", "./reader", "./powered_by"]


class CollectionError(Exception):
    """Raised when a pytest --collect-only subprocess exits with an unexpected code."""

    def __init__(self, label, returncode, stdout, stderr):
        self.label = label
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        super().__init__(f"collection failed for {label!r} (exit {returncode})")


def find_root(start=None):
    """Walk up from `start` (default: this file's directory) looking for pytest.ini."""
    path = os.path.abspath(start or os.path.dirname(__file__))
    while True:
        if os.path.exists(os.path.join(path, "pytest.ini")):
            return path
        parent = os.path.dirname(path)
        if parent == path:
            raise RuntimeError("could not find pytest.ini by walking up from " + (start or __file__))
        path = parent


def _pytest_run_commands(job):
    """Yield (step_env, run_text) for every step in `job` whose `run` invokes
    `python -m pytest`. `job` is the raw YAML dict for one job."""
    for step in job.get("steps", []) or []:
        run = step.get("run")
        if not run or "pytest" not in run or "-m pytest" not in run.replace("python3", "python"):
            continue
        if "python -m pytest" not in run and "python3 -m pytest" not in run:
            continue
        yield step.get("env") or {}, run


def extract_pytest_jobs(workflow, exclude_jobs=()):
    """Parse a loaded workflow YAML dict. Returns {job_id: {"env": {...}, "argv": [...]}}
    for every job that has a `python -m pytest` step, skipping ids in `exclude_jobs`."""
    jobs = {}
    for job_id, job in (workflow.get("jobs") or {}).items():
        if job_id in exclude_jobs:
            continue
        job_env = job.get("env") or {}
        for step_env, run_text in _pytest_run_commands(job):
            merged_env = {**job_env, **step_env}
            tokens = shlex.split(run_text)
            # Drop everything up to and including "pytest" (handles "python -m pytest",
            # "python3 -m pytest", leading shell noise is not expected in this workflow).
            if "pytest" in tokens:
                idx = tokens.index("pytest")
                argv = tokens[idx + 1:]
            else:
                argv = tokens
            jobs[job_id] = {"env": merged_env, "argv": argv}
            break  # one pytest step per job in this workflow; first one wins
    return jobs


def load_workflow(path):
    import yaml  # deferred: keep --help free of non-stdlib imports

    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


NODEID_SUMMARY_MARKERS = (
    "warnings summary",
    "short test summary",
    "no tests ran",
    "deselected",
    "error",
    "====",
)


def parse_nodeids(stdout):
    """Extract test nodeids from `pytest --collect-only -q` stdout.

    `-q --collect-only` output is one nodeid per line for real tests, followed by
    a blank line and a summary line like "12 tests collected in 0.34s" or a
    warnings summary block. We keep lines that contain '::', are not indented
    (summary/traceback continuation lines are), and do not look like a summary
    line themselves.
    """
    nodeids = set()
    for line in stdout.splitlines():
        if not line or line[0] in (" ", "\t"):
            continue
        if "::" not in line:
            continue
        lowered = line.lower()
        if "tests collected" in lowered or "test collected" in lowered:
            continue
        if any(marker in lowered for marker in ("warnings summary", "short test summary")):
            continue
        nodeids.add(line.strip())
    return nodeids


def collect(argv, env, root):
    """Run `pytest --collect-only -q` with `argv` (marker expr + paths, no -q/-v/
    --collect-only of its own) and `env` layered over os.environ, cwd=`root`.
    Returns the set of collected nodeids. Raises CollectionError on any exit
    code other than 0 (tests collected) or 5 (no tests collected)."""
    filtered = [a for a in argv if a not in ("-q", "-v", "--collect-only")]
    cmd = [sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:randomly"] + filtered
    full_env = dict(os.environ)
    full_env.update({k: str(v) for k, v in env.items()})
    proc = subprocess.run(
        cmd, cwd=root, env=full_env, capture_output=True, text=True, timeout=1800,
    )
    if proc.returncode not in (0, 5):
        raise CollectionError(" ".join(cmd), proc.returncode, proc.stdout, proc.stderr)
    return parse_nodeids(proc.stdout)


def _tail(text, n=4000):
    return text[-n:] if text else text


def parse_env_kv(pairs):
    env = {}
    for item in pairs or []:
        if "=" not in item:
            raise argparse.ArgumentTypeError(f"--baseline-env expects KEY=VAL, got {item!r}")
        key, val = item.split("=", 1)
        env[key] = val
    return env


def load_allowlist(path):
    with open(path, "r", encoding="utf-8") as fh:
        entries = json.load(fh)
    return entries


def build_parser():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--workflow", default=os.path.join(".github", "workflows", "continuous.yaml"),
        help="path to the workflow YAML, relative to --root unless absolute.",
    )
    ap.add_argument(
        "--root", default=None,
        help="repo root (directory containing pytest.ini). Default: walk up from this script.",
    )
    ap.add_argument(
        "--exclude-job", action="append", default=[],
        help="job id to ignore even if it runs pytest. Repeatable.",
    )
    ap.add_argument("--baseline-expr", default=DEFAULT_BASELINE_EXPR)
    ap.add_argument(
        "--baseline-paths", nargs="+", default=None,
        help=f"default: {DEFAULT_BASELINE_PATHS}",
    )
    ap.add_argument(
        "--baseline-env", action="append", default=None,
        help="KEY=VAL, repeatable. Default: env of the first pytest job found in the workflow.",
    )
    ap.add_argument(
        "--allow", default=None,
        help="JSON file: list of {\"nodeid\": ..., \"reason\": ...} entries to subtract from missing.",
    )
    ap.add_argument("--json", action="store_true", help="machine-readable output instead of text summary.")
    return ap


def main(argv=None):
    ap = build_parser()
    args = ap.parse_args(argv)

    root = args.root or find_root()
    workflow_path = args.workflow if os.path.isabs(args.workflow) else os.path.join(root, args.workflow)

    workflow = load_workflow(workflow_path)
    jobs = extract_pytest_jobs(workflow, exclude_jobs=set(args.exclude_job))

    if not jobs:
        print(f"No pytest jobs found in {workflow_path}", file=sys.stderr)
        return 2

    baseline_paths = args.baseline_paths if args.baseline_paths is not None else DEFAULT_BASELINE_PATHS
    if args.baseline_env is not None:
        baseline_env = parse_env_kv(args.baseline_env)
    else:
        first_job = next(iter(jobs.values()))
        baseline_env = dict(first_job["env"])

    job_nodeids = {}
    for job_id, spec in jobs.items():
        try:
            job_nodeids[job_id] = collect(spec["argv"], spec["env"], root)
        except CollectionError as exc:
            print(f"Collection failed for job {job_id!r} (exit {exc.returncode})", file=sys.stderr)
            print("--- stdout tail ---", file=sys.stderr)
            print(_tail(exc.stdout), file=sys.stderr)
            print("--- stderr tail ---", file=sys.stderr)
            print(_tail(exc.stderr), file=sys.stderr)
            return 2

    baseline_argv = ["-m", args.baseline_expr] + list(baseline_paths)
    try:
        baseline_nodeids = collect(baseline_argv, baseline_env, root)
    except CollectionError as exc:
        print(f"Collection failed for baseline (exit {exc.returncode})", file=sys.stderr)
        print("--- stdout tail ---", file=sys.stderr)
        print(_tail(exc.stdout), file=sys.stderr)
        print("--- stderr tail ---", file=sys.stderr)
        print(_tail(exc.stderr), file=sys.stderr)
        return 2

    union = set()
    for nodeids in job_nodeids.values():
        union |= nodeids
    missing = baseline_nodeids - union

    allowed_entries = []
    stale_entries = []
    if args.allow:
        allow_path = args.allow if os.path.isabs(args.allow) else os.path.join(root, args.allow)
        for entry in load_allowlist(allow_path):
            nodeid = entry.get("nodeid")
            if nodeid in baseline_nodeids:
                allowed_entries.append(entry)
            else:
                stale_entries.append(entry)
        allowed_ids = {e["nodeid"] for e in allowed_entries}
        missing -= allowed_ids

    if args.json:
        result = {
            "baseline": len(baseline_nodeids),
            "jobs": {job_id: len(ids) for job_id, ids in job_nodeids.items()},
            "union": len(union),
            "missing": sorted(missing),
            "allowed": allowed_entries,
            "stale_allow_entries": stale_entries,
        }
        print(json.dumps(result, indent=2))
    else:
        print(f"baseline: {len(baseline_nodeids)} tests")
        for job_id, ids in sorted(job_nodeids.items()):
            print(f"  job {job_id}: {len(ids)} tests")
        print(f"union: {len(union)} tests")
        print(f"missing: {len(missing)} tests")
        for nodeid in sorted(missing):
            print(f"  {nodeid}")
        if allowed_entries:
            print(f"allowed (subtracted from missing): {len(allowed_entries)}")
            for entry in allowed_entries:
                print(f"  {entry.get('nodeid')}: {entry.get('reason')}")
        if stale_entries:
            print(f"WARNING: stale allow-list entries (no longer in baseline): {len(stale_entries)}", file=sys.stderr)
            for entry in stale_entries:
                print(f"  {entry.get('nodeid')}: {entry.get('reason')}", file=sys.stderr)

    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
