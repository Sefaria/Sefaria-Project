#!/usr/bin/env bash
# powered-by-names.sh: the public Powered by listing by id and name, so a before/after comparison catches a project
# swapped for another (equal counts would hide that). Read-only; public data only.
#
#   powered-by-names.sh --base-url https://www.sefariastaging.org --record before.json     # before the merge
#   powered-by-names.sh --base-url https://www.sefariastaging.org --compare before.json    # after: PASS or the diff
set -euo pipefail
BASE="" RECORD="" COMPARE=""
while (($#)); do
  case "$1" in
    --base-url) BASE="${2%/}"; shift 2 ;;
    --record) RECORD="$2"; shift 2 ;;
    --compare) COMPARE="$2"; shift 2 ;;
    -h | --help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$BASE" ]] || { sed -n '2,7p' "$0" >&2; exit 2; }
[[ -n "$RECORD" && -z "$COMPARE" || -z "$RECORD" && -n "$COMPARE" ]] || { echo "give exactly one of --record and --compare" >&2; exit 2; }
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
curl -fsS --max-time 60 "$BASE/api/powered-by" >"$tmp"
python3 - "$tmp" "$RECORD" "$COMPARE" <<'PY'
import json, sys
now = {str(p["id"]): p["project_name"] for p in json.load(open(sys.argv[1]))["projects"]}
record, compare = sys.argv[2], sys.argv[3]
if record:
    json.dump(now, open(record, "w"), indent=1, sort_keys=True)
    print(f"recorded {len(now)} listed projects to {record}")
    sys.exit(0)
before = json.load(open(compare))
gone = sorted(set(before) - set(now), key=int)
new = sorted(set(now) - set(before), key=int)
print(f"before {len(before)}, now {len(now)}")
for i in gone: print(f"  no longer listed: {i} {before[i]}")
for i in new: print(f"  newly listed:     {i} {now[i]}")
renamed = sorted((i for i in set(before) & set(now) if before[i] != now[i]), key=int)
for i in renamed: print(f"  renamed:          {i} {before[i]!r} -> {now[i]!r}")
if gone or renamed:
    print("FAIL  listed projects disappeared or changed name: get the product owner's sign-off on each"); sys.exit(1)
print("PASS  every project listed before is still listed" + (" (new ones above are additions)" if new else ""))
PY
