#!/usr/bin/env python3
"""Failing test ids from a JUnit XML file, a plain list (one id per line) or the log of a GitHub Actions PyTest job,
for pytest-failure-diff.sh (standard library only).

  pytest_failures.py list SOURCE [--kind junit|plain|gh-log]   prints the failing test ids of SOURCE, one per line
  pytest_failures.py diff A B                                  prints the ids failing in B and not in A

Exit codes: 0 fine (diff: none new), 1 (diff only) there are new failures, 2 the input is unusable. "Could not read" is
never "no failures": an empty or unrecognised file, XML without test cases, a log without pytest's final summary line
all exit 2.
"""

import re
import sys
import xml.etree.ElementTree as ET


class Unusable(Exception):
    pass


def canonical(test_id):
    """pytest ids (path/to/test_x.py::Class::test[param]) and JUnit ids (path.to.test_x.Class.test[param]) compare equal:
    both become dotted, with the parameter part kept as it is."""
    test_id = test_id.strip()
    base, bracket, param = test_id.partition("[")
    base = base.replace("::", ".").replace("/", ".")
    base = re.sub(r"\.py(?=\.|$)", "", base)
    return base + bracket + param


def from_junit(text):
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise Unusable("not readable as JUnit XML: %s" % error)
    cases = list(root.iter("testcase"))
    if not cases:
        raise Unusable("the JUnit XML has no test cases")
    failing = []
    for case in cases:
        if case.find("failure") is not None or case.find("error") is not None:
            classname, name = case.get("classname", ""), case.get("name", "")
            failing.append("%s.%s" % (classname, name) if classname else name)
    return failing


def from_plain(text):
    if not text.strip():
        raise Unusable("the file is empty (an empty list must say so with a comment line, e.g. '# none failed')")
    return [line.strip() for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")]


# `gh run view --log` lines: <job>\t<step>\t<timestamp> <text>
_GH_LINE = re.compile(r"^(?P<job>[^\t]*)\t(?P<step>[^\t]*)\t(?:\d{4}-\d\d-\d\dT[\d:.]+Z ?)?(?P<text>.*)$")
_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
_SUMMARY_FAILED = re.compile(r"^(?:FAILED|ERROR) (?P<id>\S.*?)(?: - .*)?$")
# pytest's last line: "===== 3 failed, 2000 passed, 5 skipped in 612.34s (0:10:12) =====" (also "no tests ran", "in 0.1s")
_FINAL = re.compile(r"^=+ .*\bin [0-9.]+s\b.* =+$|^=+ no tests ran .*=+$")


def from_gh_log(text, job_match="PyTest"):
    seen_job = False
    final = False
    failing = []
    for raw in text.splitlines():
        match = _GH_LINE.match(_ANSI.sub("", raw))
        if not match or job_match.lower() not in match.group("job").lower():
            continue
        seen_job = True
        line = match.group("text").rstrip()
        if _FINAL.match(line):
            final = True
        found = _SUMMARY_FAILED.match(line)
        if found and ("::" in found.group("id") or found.group("id").endswith(".py")):
            failing.append(found.group("id"))
    if not seen_job:
        raise Unusable("the log has no lines of a job named like '%s' (did the job run? is it still running?)" % job_match)
    if not final:
        raise Unusable(
            "the %s job log has no pytest final summary line ('=== N passed, M failed in Ts ==='): the run crashed, "
            "timed out or its output was cut, so its failures are unknown" % job_match
        )
    return failing


def detect(text):
    head = text.lstrip()[:200]
    if head.startswith("<?xml") or head.startswith("<testsuite"):
        return "junit"
    if "\t" in text.split("\n", 1)[0] and _GH_LINE.match(text.split("\n", 1)[0]):
        return "gh-log"
    return "plain"


def load(path, kind=None):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            text = handle.read()
    except OSError as error:
        raise Unusable("cannot read %s: %s" % (path, error))
    kind = kind or detect(text)
    parse = {"junit": from_junit, "plain": from_plain, "gh-log": from_gh_log}[kind]
    return parse(text)


def main(argv):
    if len(argv) >= 3 and argv[1] == "list":
        kind = argv[argv.index("--kind") + 1] if "--kind" in argv else None
        try:
            for test_id in sorted(set(load(argv[2], kind))):
                print(test_id)
        except Unusable as error:
            print("pytest-failure-diff: %s: %s" % (argv[2], error), file=sys.stderr)
            return 2
        return 0
    if len(argv) == 4 and argv[1] == "diff":
        try:
            a, b = load(argv[2]), load(argv[3])
        except Unusable as error:
            print("pytest-failure-diff: %s" % error, file=sys.stderr)
            return 2
        known = {canonical(t) for t in a}
        new = []
        for test_id in b:
            if canonical(test_id) not in known and test_id not in new:
                new.append(test_id)
        for test_id in sorted(new):
            print(test_id)
        print(
            "pytest-failure-diff: %d failing in A, %d failing in B, %d failing in B and not in A"
            % (len({canonical(t) for t in a}), len({canonical(t) for t in b}), len(new)),
            file=sys.stderr,
        )
        return 1 if new else 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
