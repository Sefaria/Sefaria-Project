#!/usr/bin/env bash
# listing-count.sh: how many Powered by projects are listed publicly now, and how many the merge hides.
#
#   listing-count.sh --env staging|preprod|prod --context C [--record FILE] [--repo DIR]
#   listing-count.sh --dsn postgresql://... [--record FILE] [--repo DIR]      (a local or port-forwarded database)
#
# Read-only (runs listing-count.sql in a read-only session). Prints the counts and the hidden rows (id and project name,
# both public). --record writes them as JSON; staging-smoke.sh --listing-record FILE compares the live listing with it
# after the merge. Get the product owner's sign-off on the hidden rows before the promotion.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ENV="" CTX="" DSN="" RECORD="" REPO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --dsn) DSN="$2"; shift 2 ;;
    --record) RECORD="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done
need "$PYTHON"
REPO="${REPO:-$(git -C "$RELEASE_DIR" rev-parse --show-toplevel)}"
TAB="$(printf '\t')"

# The explicit refusals of master's 0003_request_not_to_publish (used only where that migration has not run).
migration="$REPO/powered_by/migrations/0003_request_not_to_publish.py"
[[ -f "$migration" ]] || die "$migration not found (pass --repo with a checkout that has master's powered_by)"
REFUSALS="$("$PYTHON" "$RELEASE_PY" listing-refusals "$migration")"

if [[ -n "$DSN" ]]; then
  need psql
  out="$(PGOPTIONS="-c default_transaction_read_only=on" psql -X -q -v ON_ERROR_STOP=1 -At -F "$TAB" -v refusals="$REFUSALS" "$DSN" <"$RELEASE_DIR/listing-count.sql")"
  # Never echo or record a password from the DSN.
  where="$("$PYTHON" - "$DSN" <<'PY'
import re, sys
from urllib.parse import urlsplit, urlunsplit
dsn = sys.argv[1]
if "://" in dsn:
    u = urlsplit(dsn)
    host = u.hostname or ""
    netloc = (f"{u.username}@" if u.username else "") + host + (f":{u.port}" if u.port else "")
    print(urlunsplit((u.scheme, netloc, u.path, "", "")))
else:
    print(re.sub(r"password\s*=\s*('[^']*'|\S+)", "password=***", dsn))
PY
)"
else
  need kubectl
  check_context "$ENV" "$CTX"
  DB="$(env_db "$ENV")"
  out="$(pg_ro "$DB" -At -F "$TAB" -v refusals="$REFUSALS" <"$RELEASE_DIR/listing-count.sql")"
  where="$ENV ($DB on $CTX)"
fi

summary="$(grep "^summary$TAB" <<<"$out" || true)"
[[ -n "$summary" ]] || die "no summary line from listing-count.sql: $out"
IFS="$TAB" read -r _ mode listed hidden after <<<"$summary"
echo "Powered by listing on $where (schema: $mode)"
echo "  listed now:          $listed"
echo "  hidden by the merge: $hidden"
echo "  listed after merge:  $after"
grep "^hidden$TAB" <<<"$out" | while IFS="$TAB" read -r _ id name; do echo "    hidden: id $id  $name"; done || true

if [[ -n "$RECORD" ]]; then
  "$PYTHON" - "$RECORD" "$mode" "$listed" "$hidden" "$after" "$where" <<'PY'
import json, sys, datetime
path, mode, listed, hidden, after, where = sys.argv[1:]
json.dump({"where": where, "schema": mode, "listed_now": int(listed), "hidden_after_merge": int(hidden),
           "listed_after_merge": int(after), "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat()},
          open(path, "w"), indent=2)
PY
  echo "recorded in $RECORD"
fi
