import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import rerecord_fixtures as rr

NODEID = "sefaria/tests/foo_test.py::test_a"
OTHER = "sefaria/tests/bar_test.py::test_b[x]"
HEADERS = ("HTTP/2 200\r\nlast-modified: Mon, 19 Oct 2026 04:00:00 GMT\r\n"
           'ETag: "abc123"\r\ncontent-length: 5\r\n\r\n')


class Fake:
    """Fake subprocess.run: records every call, answers curl and git, succeeds otherwise."""

    def __init__(self, verify_rc=0, record_rc=0):
        self.calls = []
        self.verify_rc = verify_rc
        self.record_rc = record_rc
        self.stamp_seen = None

    def __call__(self, cmd, **kw):
        self.calls.append((list(cmd), kw))
        out = ""
        rc = 0
        if cmd[0] == "curl":
            out = HEADERS
        elif cmd[:2] == ["git", "rev-parse"]:
            out = "deadbeef\n"
        elif cmd[:2] == ["git", "diff"]:
            out = " sefaria/tests/fixtures/mongo/x.json | 2 +-\n 1 file changed\n"
        elif "check_fixtures.py" in " ".join(cmd):
            rc = self.verify_rc
        elif "pytest" in cmd and kw.get("env", {}).get("SEFARIA_FIXTURE_SHAPES") == "check":
            rc = self.verify_rc
        elif "pytest" in cmd and "SEFARIA_RECORD_MONGO" in kw.get("env", {}):
            rc = self.record_rc
        if any("export_mongo_fixtures.py" in c for c in cmd) and "--source-stamp-json" in cmd:
            with open(cmd[cmd.index("--source-stamp-json") + 1]) as fh:
                self.stamp_seen = json.load(fh)
        return subprocess.CompletedProcess(cmd, rc, stdout=out, stderr="")

    def find(self, needle):
        return [c for c in self.calls if any(needle in str(part) for part in c[0])]


def run_main(tmp_path, argv, fake=None, populated=True, collected=None):
    fake = fake or Fake()
    out = tmp_path / "out"
    rc = rr.main(["--output-dir", str(out)] + argv, runner=fake,
                 probe=lambda host, port: 5000 if populated else 0,
                 collect=lambda: set(collected or {NODEID, OTHER}))
    return rc, fake, out


@pytest.fixture(autouse=True)
def committed(tmp_path, monkeypatch):
    d = tmp_path / "committed"
    d.mkdir()
    (d / "keep.json").write_text("{}")
    (d / "_manifest.json").write_text("{}")
    monkeypatch.setattr(rr, "COMMITTED_DIR", str(d))
    monkeypatch.setattr(rr, "report_size", lambda directory: print("fixtures total 123 bytes"))
    return d


def test_plan_files_from_only_nodeids():
    assert rr.test_files_for([NODEID, OTHER, NODEID + "[p]"]) == [
        "sefaria/tests/bar_test.py", "sefaria/tests/foo_test.py"]


def test_restore_excludes_nothing(tmp_path):
    rc, fake, _ = run_main(tmp_path, ["--restore", "force"])
    restore = fake.find("restore-test-mongo.sh")[0]
    env = restore[1]["env"]
    assert env["RESTORE_EXCLUDE"] == ""
    assert env["CONTAINER"] == "sefaria-fixtures-mongo"
    assert env["PORT"] == "27018"
    assert env["WORK"].endswith("sefaria-test-mongo")


def test_populated_mongo_is_reused(tmp_path):
    rc, fake, _ = run_main(tmp_path, [], populated=True)
    assert not fake.find("restore-test-mongo.sh")


def test_empty_mongo_triggers_restore_on_auto(tmp_path):
    rc, fake, _ = run_main(tmp_path, [], populated=False)
    assert fake.find("restore-test-mongo.sh")


def test_restore_never_with_empty_mongo_fails(tmp_path):
    rc, fake, _ = run_main(tmp_path, ["--restore", "never"], populated=False)
    assert rc != 0
    assert not fake.find("restore-test-mongo.sh")
    assert not fake.find("export_mongo_fixtures.py")


def test_mongo_host_option_is_gone(tmp_path):
    # --mongo-host was only half wired (restore and recording ignored it); the source is always loopback
    with pytest.raises(SystemExit) as exc:
        run_main(tmp_path, ["--mongo-host", "db.example.com"])
    assert exc.value.code == 2


def test_order_of_steps(tmp_path):
    rc, fake, _ = run_main(tmp_path, ["--only", NODEID])
    steps = []
    for cmd, kw in fake.calls:
        env = kw.get("env", {})
        joined = " ".join(map(str, cmd))
        if "SEFARIA_RECORD_MONGO" in env:
            steps.append("record")
        elif "export_mongo_fixtures.py" in joined and "--manifest-only" not in cmd:
            steps.append("export")
        elif env.get("SEFARIA_FIXTURE_SHAPES") == "write":
            steps.append("shapes")
        elif env.get("SEFARIA_FIXTURE_SHAPES") == "check":
            steps.append("verify-shapes")
        elif "check_fixtures.py" in joined:
            steps.append("check")
    assert steps == ["record", "export", "shapes", "verify-shapes", "check"]
    assert rc == 0


def test_only_scopes_record_export_and_shapes(tmp_path):
    rc, fake, out = run_main(tmp_path, ["--only", NODEID])
    record = fake.find("SEFARIA_RECORD_MONGO") or [c for c in fake.calls if "SEFARIA_RECORD_MONGO" in c[1].get("env", {})]
    assert NODEID in record[0][0]
    export = fake.find("export_mongo_fixtures.py")[0][0]
    assert "sefaria/tests/foo_test.py" in export and "sefaria/tests/bar_test.py" not in export
    shapes = [c for c in fake.calls if c[1].get("env", {}).get("SEFARIA_FIXTURE_SHAPES") == "write"][0]
    assert NODEID in shapes[0]
    env = shapes[1]["env"]
    assert env["SEFARIA_MOCK_MONGO"] == "1" and env["LOCAL_TEST_MONGO_PORT"] == "27099"
    assert env["SEFARIA_MONGO_FIXTURE_DIR"] == str(out)


def test_full_run_uses_ci_selection(tmp_path):
    rc, fake, _ = run_main(tmp_path, [])
    shapes = [c for c in fake.calls if c[1].get("env", {}).get("SEFARIA_FIXTURE_SHAPES") == "write"][0][0]
    assert shapes[shapes.index("-m", 3) + 1] == rr.SELECTION
    assert "./sefaria" in shapes
    export = fake.find("export_mongo_fixtures.py")[0][0]
    assert "sefaria/tests/foo_test.py" in export and "sefaria/tests/bar_test.py" in export


def test_nonzero_exit_when_verify_fails(tmp_path):
    rc, fake, _ = run_main(tmp_path, [], fake=Fake(verify_rc=1))
    assert rc == 1


def test_pytest_failure_during_recording_is_not_fatal(tmp_path):
    rc, fake, _ = run_main(tmp_path, [], fake=Fake(record_rc=1))
    assert rc == 0
    assert fake.find("export_mongo_fixtures.py")


def test_committed_files_untouched_with_output_dir(tmp_path, committed):
    before = {p.name: p.read_bytes() for p in committed.iterdir()}
    rc, fake, out = run_main(tmp_path, [])
    assert {p.name: p.read_bytes() for p in committed.iterdir()} == before
    assert (out / "keep.json").exists()
    for cmd, kw in fake.calls:
        if "export_mongo_fixtures.py" in " ".join(cmd):
            assert str(committed) not in cmd
            assert cmd[cmd.index("--output-dir") + 1] == str(out)
    check = fake.find("check_fixtures.py")[0][0]
    assert check[check.index("--fixture-dir") + 1] == str(out)


def test_dump_stamp_parsed_from_headers():
    fake = Fake()
    stamp = rr.dump_stamp(runner=fake)
    assert stamp["last_modified"] == "Mon, 19 Oct 2026 04:00:00 GMT"
    assert stamp["etag"] == '"abc123"'
    assert stamp["dump_url"].endswith("dump_small.tar.gz")
    assert stamp["git_sha"] == "deadbeef"
    assert stamp["recorded_at"]


def test_dump_stamp_soft_fails():
    def boom(cmd, **kw):
        raise OSError("no curl")
    stamp = rr.dump_stamp(runner=boom)
    assert stamp["last_modified"] is None and stamp["etag"] is None
    assert set(stamp) == {"dump_url", "last_modified", "etag", "recorded_at", "git_sha"}


def test_stamp_written_to_manifest_source(tmp_path):
    rc, fake, out = run_main(tmp_path, [])
    assert fake.stamp_seen["etag"] == '"abc123"'
    assert set(fake.stamp_seen) == {"dump_url", "last_modified", "etag", "recorded_at", "git_sha"}
    manifest_calls = [c[0] for c in fake.calls if "--manifest-only" in c[0]]
    assert manifest_calls and "--source-stamp-json" in manifest_calls[0]


def test_prints_diff_stat_and_size_check(tmp_path, capsys):
    rc, fake, out = run_main(tmp_path, [])
    text = capsys.readouterr().out
    assert any(c[0][:2] == ["git", "diff"] for c in fake.calls)
    assert "1 file changed" in text
    assert "fixtures total" in text


def test_prune_deletes_orphans(tmp_path, committed):
    (committed / "gone_test.py__test_old.json").write_text("{}")
    rc, fake, out = run_main(tmp_path, ["--prune"])
    assert not (out / "gone_test.py__test_old.json").exists()
    assert (committed / "gone_test.py__test_old.json").exists()


def test_no_prune_keeps_orphans(tmp_path, committed):
    (committed / "gone_test.py__test_old.json").write_text("{}")
    rc, fake, out = run_main(tmp_path, [])
    assert (out / "gone_test.py__test_old.json").exists()


def test_help_documents_flags_and_teardown(capsys):
    with pytest.raises(SystemExit) as exc:
        rr.main(["--help"])
    assert exc.value.code == 0
    text = capsys.readouterr().out
    for flag in ("--only", "--mongo-port", "--restore", "--output-dir", "--prune"):
        assert flag in text
    assert "docker rm -f sefaria-fixtures-mongo" in text


def test_prune_drops_orphan_shape_entries(tmp_path, committed):
    shapes = {"format": 1, "schema": {}, "shapes": {NODEID: {}, "gone_test.py::test_old": {"c": ["f"]}}}
    (committed / "_shapes.json").write_text(json.dumps(shapes))
    rc, fake, out = run_main(tmp_path, ["--prune"])
    assert list(json.loads((out / "_shapes.json").read_text())["shapes"]) == [NODEID]
    assert "gone_test.py::test_old" in json.loads((committed / "_shapes.json").read_text())["shapes"]


def test_no_prune_keeps_orphan_shape_entries(tmp_path, committed):
    (committed / "_shapes.json").write_text(json.dumps({"format": 1, "schema": {}, "shapes": {"gone::t": {}}}))
    rc, fake, out = run_main(tmp_path, [])
    assert "gone::t" in json.loads((out / "_shapes.json").read_text())["shapes"]
