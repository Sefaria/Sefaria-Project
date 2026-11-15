#!/usr/bin/env bash
# listing-count.sh: how many Powered by projects are listed publicly now, and how many the merge hides.
#
#   listing-count.sh --env staging|preprod|prod --context C --listing before|after [--record FILE] [--repo DIR]
#   listing-count.sh --dsn postgresql://... --listing before|after [--record FILE] [--repo DIR]   (a local or port-forwarded database)
#
# --listing says which code serves the public listing NOW (required; the schema cannot tell): before = master's code (the
# merge or promotion has not happened for this env; this includes prod after preprod migrated the shared database), after =
# phase 1's code. With before, "hidden" is what the promotion will hide; with after it is 0.
#
# Read-only (runs listing-count.sql in a read-only session). Prints the counts and the hidden rows (id and project name,
# both public). --record writes them as JSON; staging-smoke.sh --listing-record FILE compares the live listing with it
# after the merge. Get the product owner's sign-off on the hidden rows before the promotion.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ENV="" CTX="" DSN="" RECORD="" REPO="" LISTING=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --dsn) DSN="$2"; shift 2 ;;
    --record) RECORD="$2"; shift 2 ;;
    --listing) LISTING="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done
[[ "$LISTING" == before || "$LISTING" == after ]] || die "--listing before|after is required: say which code serves the public listing now (before = master's, after = phase 1's)"
need "$PYTHON"
REPO="${REPO:-$(git -C "$RELEASE_DIR" rev-parse --show-toplevel)}"
TAB="$(printf '\t')"

# The explicit refusals of master's 0003_request_not_to_publish (used only where that migration has not run).
migration="$REPO/powered_by/migrations/0003_request_not_to_publish.py"
[[ -f "$migration" ]] || die "$migration not found (pass --repo with a checkout that has master's powered_by)"
REFUSALS="$("$PYTHON" "$RELEASE_PY" listing-refusals "$migration")"

if [[ -n "$DSN" ]]; then
  need psql
  out="$(PGOPTIONS="-c default_transaction_read_only=on" psql -X -q -v ON_ERROR_STOP=1 -At -F "$TAB" -v refusals="$REFUSALS" -v behavior="$LISTING" "$DSN" <"$RELEASE_DIR/listing-count.sql")"
  # Never echo or record a password from the DSN.
  where="$("$PYTHON" - "$DSN" <<'PY'
import re, sys
from urllib.parse import urlsplit
dsn = sys.argv[1]
if "://" in dsn:
    u = urlsplit(dsn)
    host = u.hostname or ""
    netloc = (f"{u.username}@" if u.username else "") + host + (f":{u.port}" if u.port else "")
    print(f"{u.scheme}://{netloc}{u.path}")
else:
    print(re.sub(r"password\s*=\s*('[^']*'|\S+)", "password=***", dsn))
PY
)"
else
  need kubectl
  check_context "$ENV" "$CTX"
  DB="$(env_db "$ENV")"
  out="$(pg_ro "$DB" -At -F "$TAB" -v refusals="$REFUSALS" -v behavior="$LISTING" <"$RELEASE_DIR/listing-count.sql")"
  where="$ENV ($DB on $CTX)"
fi

if grep -q "^error$TAB" <<<"$out"; then die "$(grep "^error$TAB" <<<"$out" | cut -f2-)"; fi
summary="$(grep "^summary$TAB" <<<"$out" || true)"
[[ -n "$summary" ]] || die "no summary line from listing-count.sql: $out"
IFS="$TAB" read -r _ mode listed hidden after <<<"$summary"
echo "Powered by listing on $where (code serving the listing: $LISTING; $mode)"
echo "  listed now:          $listed"
echo "  hidden by the merge: $hidden"
echo "  listed after merge:  $after"
grep "^hidden$TAB" <<<"$out" | while IFS="$TAB" read -r _ id name; do echo "    hidden: id $id  $name"; done || true

if [[ -n "$RECORD" ]]; then
  "$PYTHON" - "$RECORD" "$mode" "$listed" "$hidden" "$after" "$where" "$LISTING" <<'PY'
import json, sys, datetime
path, mode, listed, hidden, after, where, listing = sys.argv[1:]
json.dump({"where": where, "listing": listing, "schema": mode, "listed_now": int(listed), "hidden_after_merge": int(hidden),
           "listed_after_merge": int(after), "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat()},
          open(path, "w"), indent=2)
PY
  echo "recorded in $RECORD"
fi
