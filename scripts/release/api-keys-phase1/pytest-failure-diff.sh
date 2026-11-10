#!/usr/bin/env bash
# pytest-failure-diff.sh: the test ids that fail in run B and not in run A (the evidence for a PyTest override: the
# branch fails nothing that the base did not already fail).
#
#   pytest-failure-diff.sh [--repo OWNER/NAME] A B
#
# A and B are each one of:
#   - a JUnit XML file (a <testcase> with a <failure> or <error> fails),
#   - a plain file with one failing test id per line ('#' lines and blank lines are ignored; a file that says nothing at
#     all is refused, write '# none failed' for "no failures"),
#   - a GitHub Actions run id (digits): the failed test ids come from the PyTest job's log (`gh run view ID --log`), from
#     the `FAILED path::test - reason` / `ERROR path::test` lines of pytest's short summary. continuous.yaml's PyTest job
#     prints the cluster pod's pytest output (`pytest -v ...`) in its "Get Logs From Cluster" step. The run must have
#     finished, and the log must contain pytest's final summary line, otherwise it is refused.
# Ids are compared in one form, so a JUnit id (a.b.test_x.Class.test) matches a pytest id (a/b/test_x.py::Class::test).
#
# Prints the ids failing in B and not in A (as written in B). Exit 0 only when there are none; 1 when there are; 2 on
# unusable input (unreadable, empty or unrecognised file, no gh or no log, a log of a crashed run): "could not read" is
# never "no new failures".
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${APIKEYS_RELEASE_PYTHON3:-python3}"
REPO="${GH_REPO:-Sefaria/Sefaria-Project}"

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    -h | --help) usage 0 ;;
    -*) echo "pytest-failure-diff: unknown option $1" >&2; exit 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
[[ ${#ARGS[@]} -eq 2 ]] || { echo "pytest-failure-diff: needs exactly two arguments, A and B" >&2; usage 2 >&2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# resolve SOURCE OUTFILE: a path to a local file holding SOURCE (a file as it is, a run id fetched from GitHub).
resolve() {
  local src="$1" out="$2"
  if [[ -f "$src" ]]; then
    cp "$src" "$out"
  elif [[ "$src" =~ ^[0-9]+$ ]]; then
    command -v gh >/dev/null 2>&1 || { echo "pytest-failure-diff: gh is needed to read run $src" >&2; return 2; }
    gh run view "$src" --repo "$REPO" --log >"$out" 2>"$out.err" || {
      echo "pytest-failure-diff: gh run view $src failed: $(head -c 300 "$out.err" | tr '\n' ' ')" >&2
      return 2
    }
  else
    echo "pytest-failure-diff: '$src' is not a file or a run id" >&2
    return 2
  fi
}

resolve "${ARGS[0]}" "$TMP/a" || exit 2
resolve "${ARGS[1]}" "$TMP/b" || exit 2
"$PYTHON" -I "$HERE/pytest_failures.py" diff "$TMP/a" "$TMP/b"
