#!/usr/bin/env python3
"""
One command to re-record the Mongo test fixtures (owns: scripts/pytest_minimal_dataset/).

Steps, in order: make sure a loopback Mongo holds the full public dump (reuse one
on --mongo-port, or restore it into a throwaway container), record the Mongo
traffic of the needs_mongo tests, export the fixtures, stamp the manifest with the
dump's Last-Modified/ETag, write the recorded query shapes (_shapes.json) under the
mocked Mongo, then verify: the same mocked selection in shape-check mode plus
check_fixtures.py. Finally it prints `git diff --stat` and the fixture size.

With --output-dir other than the committed fixtures, the committed files are copied
there first and every step reads and writes that directory only.
Exit 0: verified; 1: a step or the verification failed; 2: refused or no Mongo.
Teardown of the restore container: docker rm -f sefaria-fixtures-mongo
"""
import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
sys.path.insert(0, SCRIPT_DIR)
import recording  # noqa: E402

COMMITTED_DIR = os.path.join(ROOT, "sefaria", "tests", "fixtures", "mongo")
DUMP_URL = "https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz"
SELECTION = "needs_mongo and not needs_corpus and not deep and not failing"
PATHS = ["./sefaria", "./sso", "./reader", "./powered_by"]
MOCK_ENV = {"SEFARIA_MOCK_MONGO": "1", "SEFARIA_TEST_MONGO": "1", "LOCAL_TEST_MONGO_PORT": "27099"}
CONTAINER = "sefaria-fixtures-mongo"
WORK = os.path.expanduser("~/.cache/sefaria-test-mongo")
MONGO_HOST = "127.0.0.1"  # the recording and export steps only ever talk to loopback
MIN_INDEX_DOCS = 1000
MAX_TOTAL = 20 * 1024 * 1024


def default_probe(host, port):
    """Number of docs in sefaria.index on the Mongo at host:port, 0 when unreachable."""
    import pymongo
    try:
        client = pymongo.MongoClient(host, port, serverSelectionTimeoutMS=3000)
        return client["sefaria"].index.estimated_document_count()
    except Exception:
        return 0


def default_collect():
    import check_fixtures
    sys.path.insert(0, os.path.join(ROOT, "scripts", "test_impact"))
    import ci_parity
    return ci_parity.collect(["-m", SELECTION] + PATHS, check_fixtures.COLLECT_ENV, ROOT)


def test_files_for(nodeids):
    return sorted({nid.split("::")[0] for nid in nodeids})


def ensure_mongo(host, port, restore, runner, probe):
    """Reuse a populated loopback Mongo or restore the dump. Returns True when Mongo is usable."""
    populated = probe(host, port) > MIN_INDEX_DOCS
    if restore == "never":
        if not populated:
            print(f"--restore never, but no populated Mongo on {host}:{port}", file=sys.stderr)
        return populated
    if populated and restore == "auto":
        print(f"reusing the Mongo on {host}:{port}")
        return True
    env = dict(os.environ, PORT=str(port), WORK=WORK, CONTAINER=CONTAINER, RESTORE_EXCLUDE="")
    runner(["docker", "rm", "-f", CONTAINER], env=env)
    rc = runner(["bash", os.path.join(ROOT, "build", "ci", "restore-test-mongo.sh")], cwd=ROOT, env=env).returncode
    if rc != 0:
        print(f"restore-test-mongo.sh failed with exit {rc}", file=sys.stderr)
    return rc == 0


def dump_stamp(runner=subprocess.run):
    """Complete manifest `source` stamp. The dump headers are read with curl -sI; a failure leaves nulls."""
    stamp = {"dump_url": DUMP_URL, "last_modified": None, "etag": None,
             "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "git_sha": None}
    try:
        headers = runner(["curl", "-sIL", "--max-time", "30", DUMP_URL], capture_output=True, text=True).stdout or ""
        for line in headers.splitlines():
            name, _, value = line.partition(":")
            name = name.strip().lower()
            if name == "last-modified":
                stamp["last_modified"] = value.strip()
            elif name == "etag":
                stamp["etag"] = value.strip()
    except Exception:
        pass
    try:
        sha = runner(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        stamp["git_sha"] = sha or None
    except Exception:
        pass
    return stamp


def record(only, port, runner):
    """Record Mongo traffic. A pytest failure is fine as long as the exporter finds artifacts."""
    rc = recording.run_recording(list(only) or PATHS, port, marker_expr=SELECTION, runner=runner)
    if rc != 0:
        print(f"note: recording pytest exited {rc}; continuing with the artifacts it produced", file=sys.stderr)
    return rc


def export(files, port, output_dir, stamp_path, runner):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, "export_mongo_fixtures.py"), *files,
           "--output-dir", output_dir, "--port", str(port), "--source-stamp-json", stamp_path]
    return runner(cmd, cwd=ROOT).returncode


def write_manifest(output_dir, stamp_path, runner):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, "export_mongo_fixtures.py"), "--manifest-only",
           "--output-dir", output_dir, "--source-stamp-json", stamp_path]
    return runner(cmd, cwd=ROOT).returncode


def shapes_run(mode, only, output_dir, runner):
    env = dict(os.environ, **MOCK_ENV, SEFARIA_FIXTURE_SHAPES=mode, SEFARIA_MONGO_FIXTURE_DIR=output_dir)
    cmd = [sys.executable, "-m", "pytest", "-q", "--no-header", "-p", "no:cacheprovider",
           "-m", SELECTION, *(list(only) or PATHS)]
    return runner(cmd, cwd=ROOT, env=env).returncode


def orphans(collected, output_dir):
    import check_fixtures
    findings, _ = check_fixtures.check(collected, output_dir)
    return sorted(subject.split(" (")[0] for kind, subject, _ in findings if kind == "orphan")


def prune_shapes(collected, output_dir):
    """Drop _shapes.json entries of tests that are no longer collected. Returns the removed node ids."""
    path = os.path.join(output_dir, "_shapes.json")
    if not os.path.isfile(path):
        return []
    with open(path) as fh:
        payload = json.load(fh)
    shapes = payload.get("shapes", {})
    gone = sorted(set(shapes) - set(collected))
    if gone:
        payload["shapes"] = {nid: v for nid, v in shapes.items() if nid in set(collected)}
        with open(path, "w") as fh:
            json.dump(payload, fh, indent=1, sort_keys=True)
            fh.write("\n")
    return gone


def verify(output_dir, runner):
    ok = True
    rc = shapes_run("check", (), output_dir, runner)  # whole selection: every fixture must pass its shapes
    if rc != 0:
        print(f"shape check failed (pytest exit {rc})", file=sys.stderr)
        ok = False
    rc = runner([sys.executable, os.path.join(SCRIPT_DIR, "check_fixtures.py"), "--fixture-dir", output_dir],
                cwd=ROOT).returncode
    if rc != 0:
        print(f"check_fixtures.py failed (exit {rc})", file=sys.stderr)
        ok = False
    return ok


def report_size(directory):
    total = sum(os.path.getsize(os.path.join(directory, n)) for n in os.listdir(directory)
                if os.path.isfile(os.path.join(directory, n)))
    print(f"fixtures total {total} bytes of {MAX_TOTAL} ({100 * total / MAX_TOTAL:.1f}%)")


def report(output_dir, runner):
    if os.path.abspath(output_dir) == os.path.abspath(COMMITTED_DIR):
        cmd = ["git", "diff", "--stat", "--", output_dir]
    else:
        cmd = ["git", "diff", "--no-index", "--stat", "--", COMMITTED_DIR, output_dir]
    proc = runner(cmd, cwd=ROOT, capture_output=True, text=True)
    print(f"git diff --stat -- {output_dir}")
    print(proc.stdout or "(no changes)")
    report_size(output_dir)


def build_parser():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="+", metavar="NODEID", default=[],
                        help="re-record just these test node ids (default: every needs_mongo test in the CI selection)")
    parser.add_argument("--mongo-port", type=int, default=27018, help="port of the loopback source Mongo (default 27018)")
    parser.add_argument("--restore", choices=("auto", "never", "force"), default="auto",
                        help="auto: reuse a Mongo on the port holding more than 1000 index docs, else restore the dump "
                             "into container sefaria-fixtures-mongo; never: fail unless one is there; force: always restore")
    parser.add_argument("--output-dir", default=COMMITTED_DIR,
                        help="fixture directory to write (default: the committed sefaria/tests/fixtures/mongo); "
                             "another directory gets a copy of the committed fixtures first and the committed files stay untouched")
    parser.add_argument("--prune", action="store_true", help="delete fixtures of tests that no longer exist (orphans)")
    return parser


def main(argv=None, runner=subprocess.run, probe=default_probe, collect=default_collect):
    args = build_parser().parse_args(argv)
    output_dir = os.path.abspath(args.output_dir)
    if output_dir != os.path.abspath(COMMITTED_DIR):
        shutil.copytree(COMMITTED_DIR, output_dir, dirs_exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    if not ensure_mongo(MONGO_HOST, args.mongo_port, args.restore, runner, probe):
        return 2
    stamp_fd, stamp_path = tempfile.mkstemp(suffix=".json", prefix="fixture-stamp-")
    try:
        with os.fdopen(stamp_fd, "w") as fh:
            json.dump(dump_stamp(runner), fh)
        record(args.only, args.mongo_port, runner)
        files = test_files_for(args.only) if args.only else None
        collected = None
        if files is None or args.prune:
            collected = collect()
        if files is None:
            files = test_files_for(collected)
        if export(files, args.mongo_port, output_dir, stamp_path, runner) != 0:
            print("export failed", file=sys.stderr)
            return 1
        if args.prune:
            for name in orphans(collected, output_dir):
                os.remove(os.path.join(output_dir, name))
                print(f"pruned {name}")
            for nid in prune_shapes(collected, output_dir):
                print(f"pruned shape entry {nid}")
        if write_manifest(output_dir, stamp_path, runner) != 0:
            print("manifest rewrite failed", file=sys.stderr)
            return 1
        if shapes_run("write", args.only, output_dir, runner) != 0:
            print("writing shapes failed", file=sys.stderr)
            return 1
        ok = verify(output_dir, runner)
        report(output_dir, runner)
        return 0 if ok else 1
    finally:
        os.remove(stamp_path)


if __name__ == "__main__":
    sys.exit(main())
