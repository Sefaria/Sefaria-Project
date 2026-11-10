#!/usr/bin/env bash
# test-pytest-failure-diff.sh: pytest-failure-diff.sh on small fixtures (JUnit XML, plain lists, and run ids through a
# fake `gh`). Needs only bash and python3; no cluster, no network.
#   tests/test-pytest-failure-diff.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL="$HERE/../pytest-failure-diff.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
fail=0
ok() { echo "ok: $*"; }
bad() { echo "FAIL: $*"; fail=1; }

# expect CODE PATTERN LABEL ARGS...: exit code and a pattern in the combined output; $T/out holds the output.
expect() {
  local want="$1" pattern="$2" label="$3" rc=0
  shift 3
  PATH="$T/bin:$PATH" "$TOOL" "$@" >"$T/out" 2>&1 || rc=$?
  if [[ "$rc" == "$want" ]] && grep -qE "$pattern" "$T/out"; then ok "$label"; else bad "$label (exit $rc, wanted $want and /$pattern/)"; sed 's/^/    /' "$T/out"; fi
}
# absent PATTERN LABEL: the last run's output does not contain PATTERN.
absent() { if grep -qE "$1" "$T/out"; then bad "$2 (found /$1/)"; sed 's/^/    /' "$T/out"; else ok "$2"; fi; }

cat >"$T/a.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="4">
  <testcase classname="sefaria.tests.test_a.TestA" name="test_old_failure"><failure message="boom">x</failure></testcase>
  <testcase classname="sefaria.tests.test_a.TestA" name="test_fine"/>
  <testcase classname="reader.tests.test_b" name="test_error"><error message="setup">x</error></testcase>
  <testcase classname="reader.tests.test_b" name="test_skipped"><skipped message="s"/></testcase>
</testsuite></testsuites>
XML
cat >"$T/b.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<testsuites><testsuite name="pytest" tests="4">
  <testcase classname="sefaria.tests.test_a.TestA" name="test_old_failure"><failure message="boom">x</failure></testcase>
  <testcase classname="reader.tests.test_b" name="test_error"><error message="setup">x</error></testcase>
  <testcase classname="powered_by.tests.test_c.TestC" name="test_new[a-b]"><failure message="new">x</failure></testcase>
  <testcase classname="sefaria.tests.test_a.TestA" name="test_fine"/>
</testsuite></testsuites>
XML
printf '%s\n' '# the base' 'sefaria/tests/test_a.py::TestA::test_old_failure' '' 'reader/tests/test_b.py::test_error' >"$T/a.txt"
printf '%s\n' 'sefaria/tests/test_a.py::TestA::test_old_failure' 'powered_by/tests/test_c.py::TestC::test_new[a-b]' 'sefaria/tests/test_z.py::test_other' >"$T/b.txt"
printf '# none failed\n' >"$T/none.txt"
: >"$T/empty.txt"
printf '<testsuites><testsuite name="pytest" tests="0"></testsuite></testsuites>\n' >"$T/nocases.xml"
printf '<testsuites><testsuite' >"$T/broken.xml"

expect 1 'powered_by.tests.test_c.TestC.test_new\[a-b\]' "JUnit A and B: the new failure is printed" "$T/a.xml" "$T/b.xml"
absent 'test_old_failure|test_error' "JUnit: failures that A already had are not printed"
expect 0 '0 failing in B and not in A' "JUnit: the same file against itself has no new failure" "$T/b.xml" "$T/b.xml"
expect 0 '0 failing in B and not in A' "JUnit: fewer failures in B than in A are fine" "$T/b.xml" "$T/a.xml"
expect 1 'powered_by/tests/test_c.py::TestC::test_new\[a-b\]' "plain files: the new failures are printed as written in B" "$T/a.txt" "$T/b.txt"
grep -q 'sefaria/tests/test_z.py::test_other' "$T/out" && ok "plain files: every id in B and not in A is printed" || bad "plain files: test_z missing"
expect 1 'powered_by/tests/test_c.py::TestC::test_new\[a-b\]' "a JUnit A and a plain B are compared in one id form (the old failure is not new)" "$T/a.xml" "$T/b.txt"
absent 'test_old_failure' "mixed: a JUnit id equals the pytest id of the same test"
expect 0 '0 failing in B and not in A' "a plain B that says none failed" "$T/a.txt" "$T/none.txt"

# Unusable input is exit 2, never "no new failures".
expect 2 'cannot read|not a file or a run id' "a missing file is refused" "$T/a.txt" "$T/missing.txt"
expect 2 'is empty' "an empty plain file is refused" "$T/a.txt" "$T/empty.txt"
expect 2 'no test cases' "JUnit XML without test cases is refused" "$T/a.xml" "$T/nocases.xml"
expect 2 'not readable as JUnit XML' "broken XML is refused" "$T/a.xml" "$T/broken.xml"
expect 2 'exactly two arguments' "one argument is refused" "$T/a.txt"
expect 2 'unknown option' "an unknown option is refused" --nope "$T/a.txt" "$T/b.txt"

# Run ids, through a fake gh that prints a log like `gh run view ID --log` (job, step, timestamp, text).
mkdir -p "$T/bin"
cat >"$T/bin/gh" <<'FAKE'
#!/usr/bin/env bash
[ "$1 $2" = "run view" ] || { echo "fake gh: unexpected: $*" >&2; exit 9; }
f="$FAKE_GH_DIR/$3.log"
[ -f "$f" ] || { echo "HTTP 404: Not Found" >&2; exit 1; }
cat "$f"
FAKE
chmod +x "$T/bin/gh"
export FAKE_GH_DIR="$T/runs"
mkdir -p "$FAKE_GH_DIR"
line() { printf 'Continuous Testing: PyTest\tGet Logs From Cluster and propogate test result\t2026-11-10T10:00:%02d.1234567Z %s\n' "$1" "$2"; }
{
  line 1 'sefaria/tests/test_a.py::TestA::test_old_failure FAILED                          [ 10%]'
  line 2 '=========================== short test summary info ============================'
  line 3 'FAILED sefaria/tests/test_a.py::TestA::test_old_failure - AssertionError: boom'
  line 4 'ERROR reader/tests/test_b.py::test_error - RuntimeError: setup'
  line 5 '=========== 1 failed, 1 error, 2000 passed, 5 skipped in 612.34s (0:10:12) ==========='
  printf 'Continuous Testing: Jest\tRun Jest Tests\t2026-11-10T10:00:09.0Z FAILED not/a/pytest/line.js::nope\n'
} >"$FAKE_GH_DIR/1001.log"
{
  line 2 '=========================== short test summary info ============================'
  line 3 'FAILED sefaria/tests/test_a.py::TestA::test_old_failure - AssertionError: boom'
  line 4 'FAILED powered_by/tests/test_c.py::TestC::test_new[a-b] - assert 1 == 2'
  line 5 '=========== 2 failed, 2001 passed in 600.00s (0:10:00) ==========='
  printf 'Continuous Testing: Jest\tRun Jest Tests\t2026-11-10T10:00:09.0Z FAILED other/jest.js::x\n'
} >"$FAKE_GH_DIR/1002.log"
{
  line 2 'FAILED sefaria/tests/test_a.py::TestA::test_old_failure - AssertionError: boom'
  line 3 '(no pod logs available)'
} >"$FAKE_GH_DIR/1003.log"
printf 'Continuous Testing: Jest\tRun Jest Tests\t2026-11-10T10:00:09.0Z =========== 10 passed in 3.00s ===========\n' >"$FAKE_GH_DIR/1004.log"
{ line 2 '=========== 3000 passed, 5 skipped in 600.00s (0:10:00) ==========='; } >"$FAKE_GH_DIR/1005.log"

expect 1 'powered_by/tests/test_c.py::TestC::test_new\[a-b\]' "run ids: the new failure of B's PyTest job is printed" 1001 1002
absent 'jest|test_old_failure' "run ids: only the PyTest job's summary lines count, and old failures are not printed"
expect 0 '0 failing in B and not in A' "run ids: the same run against itself" 1002 1002
expect 0 '0 failing in B and not in A' "run ids: a clean run B has no new failure" 1001 1005
expect 1 'powered_by.tests.test_c.TestC.test_new\[a-b\]' "a run id A and a JUnit B mix (the old failure is not new)" 1001 "$T/b.xml"
absent 'test_old_failure' "run id and JUnit: the same test has one id"
expect 1 'powered_by/tests/test_c.py::TestC::test_new\[a-b\]' "a JUnit A and a run id B mix" "$T/a.xml" 1002
expect 2 'no pytest final summary' "a run whose PyTest log has no final summary (crashed or cut) is refused, not read as clean" 1001 1003
expect 2 'no lines of a job named like' "a run without a PyTest job is refused" 1001 1004
expect 2 'gh run view 9999 failed' "a run gh cannot read is refused" 1001 9999
exit "$fail"
