#!/usr/bin/env python3
""""No test left behind" checker for pytest CI selection.

Why this exists
----------------
master's CI ran ONE pytest invocation against a live Mongo:
`pytest -m "not deep and not failing" ./sefaria ./sso ./reader ./powered_by`

This branch replaces that with several jobs in `.github/workflows/continuous.yaml`,
each selecting a marker expression and a set of paths. A test the baseline
invocation would have collected but that no job collects runs *nowhere* -- it
silently stopped being CI-gated. That's the "left behind" case this script exists
to catch. The no-Mongo job in particular is an explicit file allowlist, so any
unmarked test living outside it is exactly the kind of gap this tool surfaces.

Method: parse the workflow YAML for every step that invokes `python -m pytest`,
run `--collect-only` for each job's argv (with that job's env layered over the
current environment) and for the baseline invocation, then diff nodeid sets.
A job that runs against a real Mongo (no SEFARIA_MOCK_MONGO=1) is collected with
the baseline env, because its own env points at a database this process lacks.

Baseline: by default it is collected from this checkout. With --baseline-ref REF
it is collected from REF itself (extracted to a temp dir, with this checkout's
Mongo-mock infrastructure overlaid, since master cannot import without a Mongo).
Then a test missing from every job is judged against HEAD: still present at HEAD
means "hidden" and fails the check; gone at HEAD means "removed" and is reported
for information only.

Collection itself runs in a real pytest subprocess -- no import of Django or
Sefaria happens in this process, so `--help` and the YAML-parsing tests work
without either.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEFAULT_BASELINE_EXPR = "not deep and not failing"
DEFAULT_BASELINE_PATHS = ["./sefaria", "./sso", "./reader", "./powered_by"]

# This checkout's Mongo-mock infrastructure, copied over the extracted baseline ref.
BASELINE_OVERLAY_FILES = (
    "sefaria/conftest.py", "sefaria/system/database.py",
    "sefaria/local_settings_pytest.py", "sefaria/local_settings.py",
    "sefaria/tests/mongo_shapes.py", "sefaria/tests/fixture_schema.py",  # imported by sefaria/conftest.py
    "sefaria/tests/fixtures/mongo/_base.json", "sefaria/tests/fixtures/mongo/_shapes.json",
)


class CollectionError(Exception):
    """Raised when a pytest --collect-only subprocess exits with an unexpected code."""

    def __init__(self, label, returncode, stdout, stderr):
        self.label = label
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        super().__init__(f"collection failed for {label!r} (exit {returncode})")


class BaselineRefError(RuntimeError):
    """Raised when --baseline-ref cannot be extracted from git."""


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


def _matrix_entries(job):
    """The `strategy.matrix.include` entries of a job, or [] when it has none."""
    matrix = ((job.get("strategy") or {}).get("matrix")) or {}
    include = matrix.get("include") if isinstance(matrix, dict) else None
    return [e for e in (include or []) if isinstance(e, dict)]


def _expand_matrix(text, entry):
    """Substitute `${{ matrix.key }}` with the entry's value (folded scalars keep their
    inner whitespace, which shlex splits on)."""
    def repl(match):
        return " ".join(str(entry.get(match.group(1), "")).split())
    return re.sub(r"\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}", repl, text)


def extract_pytest_jobs(workflow, exclude_jobs=()):
    """Parse a loaded workflow YAML dict. Returns {job_id: {"env": {...}, "argv": [...]}}
    for every job that has a `python -m pytest` step (first one wins), skipping ids in
    `exclude_jobs`. A job with `strategy.matrix.include` yields one entry per include,
    keyed `job_id[<shard>]` (the entry's `shard` or `name`, else its index), so the union
    of its shards is what parity sees."""
    workflow_env = workflow.get("env") or {}
    jobs = {}
    for job_id, job in (workflow.get("jobs") or {}).items():
        if job_id in exclude_jobs:
            continue
        job_env = job.get("env") or {}
        entries = _matrix_entries(job) or [None]
        for idx, entry in enumerate(entries):
            for step_env, run_text in _pytest_run_commands(job):
                if entry is not None:
                    run_text = _expand_matrix(run_text, entry)
                merged_env = {**workflow_env, **job_env, **step_env}
                tokens = shlex.split(run_text)
                # Drop everything up to and including "pytest" (handles "python -m pytest",
                # "python3 -m pytest", leading shell noise is not expected in this workflow).
                if "pytest" in tokens:
                    argv = tokens[tokens.index("pytest") + 1:]
                else:
                    argv = tokens
                key = job_id if entry is None else "%s[%s]" % (job_id, entry.get("shard") or entry.get("name") or idx)
                jobs[key] = {"env": merged_env, "argv": argv}
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


def materialize_ref(ref, root, dest, overlay=BASELINE_OVERLAY_FILES):
    """Extract `ref` into dest, then copy this checkout's Mongo-mock infrastructure over it, so master's
    own test files and markers are collected under the mock (master cannot import without a Mongo)."""
    git = subprocess.Popen(["git", "archive", ref], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    tar = subprocess.run(["tar", "-x", "-C", dest], stdin=git.stdout)
    git.stdout.close(); err = git.stderr.read().decode(errors="replace"); rc = git.wait()
    if rc != 0 or tar.returncode != 0:
        raise BaselineRefError(f"cannot extract {ref!r}: {err[-400:]} (shallow clone? run: git fetch --no-tags --depth=1 origin <base>)")
    for rel in overlay:
        src = os.path.join(root, rel)
        if os.path.isfile(src):
            os.makedirs(os.path.dirname(os.path.join(dest, rel)), exist_ok=True)
            shutil.copy2(src, os.path.join(dest, rel))


def _collect_baseline(root, ref, baseline_argv, baseline_env):
    """Return (baseline_nodeids, head_nodeids). head_nodeids is None without a ref.

    With a ref, the baseline is collected from a copy of that ref. head_nodeids is every test
    at HEAD (no marker filter) under the same env: a baseline test that is absent from it was
    removed, not left behind."""
    if ref is None:
        return collect(baseline_argv, baseline_env, root), None
    with tempfile.TemporaryDirectory() as tmp:
        materialize_ref(ref, root, tmp)
        baseline = collect(baseline_argv, baseline_env, tmp)
    head = collect(["-m", ""] + list(baseline_argv[2:]), baseline_env, root)
    return baseline, head


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
        "--baseline-ref", default=None,
        help="git ref (e.g. origin/master) to collect the baseline from, with this checkout's "
             "Mongo-mock infrastructure overlaid. Without it the baseline is this checkout.",
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
        baseline_env = dict(next(iter(jobs.values()))["env"])

    job_nodeids = {}
    for job_id, spec in jobs.items():
        # A job that runs against a real Mongo (no SEFARIA_MOCK_MONGO=1) has an env pointing at a
        # database this process does not have. Selection comes from argv; the env only has to let
        # conftest import, so collect it with the baseline env.
        real_mongo = spec["env"].get("SEFARIA_MOCK_MONGO") != "1"
        collect_env = baseline_env if real_mongo else spec["env"]
        try:
            job_nodeids[job_id] = collect(spec["argv"], collect_env, root)
        except CollectionError as exc:
            print(f"Collection failed for job {job_id!r} (exit {exc.returncode})", file=sys.stderr)
            print("--- stdout tail ---", file=sys.stderr)
            print(_tail(exc.stdout), file=sys.stderr)
            print("--- stderr tail ---", file=sys.stderr)
            print(_tail(exc.stderr), file=sys.stderr)
            return 2

    baseline_argv = ["-m", args.baseline_expr] + list(baseline_paths)
    try:
        baseline_nodeids, head_nodeids = _collect_baseline(root, args.baseline_ref, baseline_argv, baseline_env)
    except BaselineRefError as exc:
        print(exc, file=sys.stderr)
        return 2
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

    if head_nodeids is None:
        removed, hidden = set(), set(missing)
    else:
        removed = missing - head_nodeids  # gone from master-to-HEAD: informational
        hidden = missing & head_nodeids  # still at HEAD and run by no job: fails
    failing = hidden

    if args.json:
        result = {
            "baseline": len(baseline_nodeids),
            "jobs": {job_id: len(ids) for job_id, ids in job_nodeids.items()},
            "union": len(union),
            "missing": sorted(missing),
            "removed": sorted(removed),
            "hidden": sorted(hidden),
            "allowed": allowed_entries,
            "stale_allow_entries": stale_entries,
        }
        print(json.dumps(result, indent=2))
    else:
        print(f"baseline: {len(baseline_nodeids)} tests")
        for job_id, ids in sorted(job_nodeids.items()):
            print(f"  job {job_id}: {len(ids)} tests")
        print(f"union: {len(union)} tests")
        if head_nodeids is None:
            print(f"missing: {len(missing)} tests")
            for nodeid in sorted(missing):
                print(f"  {nodeid}")
        else:
            print(f"missing: {len(missing)} tests ({len(removed)} removed, informational; "
                  f"{len(hidden)} hidden, failing)")
            for nodeid in sorted(removed):
                print(f"  removed: {nodeid}")
            for nodeid in sorted(hidden):
                print(f"  hidden: {nodeid}")
        if allowed_entries:
            print(f"allowed (subtracted from missing): {len(allowed_entries)}")
            for entry in allowed_entries:
                print(f"  {entry.get('nodeid')}: {entry.get('reason')}")
        if stale_entries:
            print(f"WARNING: stale allow-list entries (no longer in baseline): {len(stale_entries)}", file=sys.stderr)
            for entry in stale_entries:
                print(f"  {entry.get('nodeid')}: {entry.get('reason')}", file=sys.stderr)

    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
