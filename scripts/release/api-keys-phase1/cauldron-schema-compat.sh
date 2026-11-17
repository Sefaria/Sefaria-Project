#!/usr/bin/env bash
# cauldron-schema-compat.sh: does a cauldron running code WITHOUT phase 1 (no auth service, older powered_by models)
# still work against the shared dev database sefaria_auth, which has carried the phase 1 schema since 2026-10-22?
# This is the dev-cluster view of what prod's old pods see while preprod's promotion migrates the shared database.
#
#   cauldron-schema-compat.sh --context gke_development-205018_us-east1-b_cluster-1 brb natlang ...
#
# Per cauldron (all read-only, except one write that is rolled back):
#   1. no auth-service Deployment; the web pod's database is sefaria_auth; which powered_by migrations the code knows
#      and which the database has applied
#   2. the old code's own powered_by models: count and read every row's columns (SELECT of the old column list)
#   3. the old code creates a Project with its own fields inside a transaction that is rolled back (the new columns
#      need database defaults for this; NOTIFY from a rolled-back transaction is never delivered)
#   4. HTTP: home, /login, /settings/account logged out, a text API call, the Powered by listing API
#   5. the web pod's log for the last 48 hours: database errors naming phase 1 tables or columns, reported only as
#      counts per error class and table (a log line can hold request URLs or row values, so none is printed)
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CTX=""
CAULDRONS=()
while (($#)); do
  case "$1" in
    --context) CTX="$2"; shift 2 ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
    -*) die "unknown argument: $1" ;;
    *) CAULDRONS+=("$1"); shift ;;
  esac
done
((${#CAULDRONS[@]})) || die "name at least one cauldron"
need kubectl curl
check_context staging "$CTX"
NS=default
FAILS=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILS=$((FAILS + 1)); }
info() { printf 'INFO  %s\n' "$*"; }

read -r -d '' PY <<'PYEOF' || true
import json
from django.apps import apps
from django.db import connection, transaction
from django.db.migrations.loader import MigrationLoader
out = {}
c = connection.cursor()
c.execute("SELECT current_database()"); out["db"] = c.fetchone()[0]
loader = MigrationLoader(connection)
out["code_migrations"] = sorted(n for (a, n) in loader.disk_migrations if a == "powered_by")
out["db_migrations"] = sorted(n for (a, n) in loader.applied_migrations if a == "powered_by")
cfg = apps.get_app_config("powered_by")
models = {}
for m in cfg.get_models():
    try:
        n = m.objects.count()
        rows = list(m.objects.all().values()[:200])
        models[m.__name__] = {"rows": n, "read": len(rows), "table": m._meta.db_table, "columns": len(m._meta.concrete_fields)}
    except Exception as e:
        models[m.__name__] = {"error": "%s: %s" % (type(e).__name__, str(e)[:300])}
out["models"] = models
class Rollback(Exception):
    pass
try:
    Project = cfg.get_model("Project")
    kw = {}
    for f in Project._meta.concrete_fields:
        if f.primary_key or f.has_default() or f.null or getattr(f, "auto_now", False) or getattr(f, "auto_now_add", False):
            continue
        if f.choices:
            kw[f.name] = f.choices[0][0]
        elif f.get_internal_type() in ("CharField", "TextField", "SlugField", "URLField"):
            kw[f.name] = "schema-compat-check" if f.get_internal_type() != "URLField" else "https://example.com/schema-compat"
        elif f.get_internal_type() == "EmailField":
            kw[f.name] = "schema-compat@example.com"
        elif f.get_internal_type() == "BooleanField":
            kw[f.name] = False
    try:
        with transaction.atomic():
            p = Project.objects.create(**kw)
            out["write"] = "created id %s with the old code's fields, rolled back" % p.pk
            raise Rollback()
    except Rollback:
        pass
except Exception as e:
    out["write_error"] = "%s: %s" % (type(e).__name__, str(e)[:400])
print("COMPAT=" + json.dumps(out))
PYEOF

for name in "${CAULDRONS[@]}"; do
  [[ "$name" =~ ^[a-z0-9-]+$ && "$name" != sefariastaging ]] || die "bad cauldron name: $name"
  step "$name"
  if dep_err="$(kc -n "$NS" get deploy "$name-auth-service" -o name 2>&1)"; then
    fail "$name runs an auth service (this check is for cauldrons without one)"
    continue
  elif ! grep -q "NotFound" <<<"$dep_err"; then
    fail "$name: could not tell whether an auth service runs: $dep_err"
    continue
  fi
  pod="$(web_pods "$NS" "$name" | awk -F'\t' '$2 == "Running" {print $1; exit}')"
  img="$(web_pods "$NS" "$name" | awk -F'\t' '$2 == "Running" {print $3; exit}')"
  [[ -n "$pod" ]] || { fail "$name: no Running web pod"; continue; }
  info "pod $pod, image ${img##*/}, no auth-service Deployment"

  json="$(kc -n "$NS" exec -i "$pod" -c web -- python manage.py shell <<<"$PY" 2>/dev/null | sed -n 's/^COMPAT=//p' | tail -n 1 || true)"
  [[ -n "$json" ]] || { fail "$name: the Django check printed nothing"; continue; }
  py_fails=0
  "$PYTHON" - "$name" "$json" <<'PY' || py_fails=$?
import json, sys
name, d = sys.argv[1], json.loads(sys.argv[2])
fails = 0
def ok(m): print("PASS  " + m)
def bad(m):
    global fails
    fails += 1
    print("FAIL  " + m)
(ok if d["db"] == "sefaria_auth" else bad)(f"{name}: database {d['db']}")
code, db = d["code_migrations"], d["db_migrations"]
unknown = [m for m in db if m not in code]
print(f"INFO  {name}: code knows powered_by up to {code[-1] if code else 'none'}; database has up to {db[-1] if db else 'none'}; "
      f"{len(unknown)} applied migration(s) this code does not know: {', '.join(unknown) or '-'}")
# The boundary under test: code WITHOUT phase 1 on a database WITH it.
if any(m in code for m in ("0003_developer_settings", "0010_seed_mcp_tier")):
    bad(f"{name}: this code already has the phase 1 migrations, so it does not test old code on the new schema")
if "0010_seed_mcp_tier" not in db:
    bad(f"{name}: the database lacks the phase 1 migrations, so there is nothing to test against")
for m, r in d["models"].items():
    if "error" in r:
        bad(f"{name}: {m}: {r['error']}")
    else:
        ok(f"{name}: {m} ({r['table']}, {r['columns']} columns in this code): {r['rows']} rows, read {r['read']}")
if "write" in d:
    ok(f"{name}: Project insert with the old code's fields: {d['write']}")
else:
    bad(f"{name}: Project insert with the old code's fields: {d.get('write_error', 'not run')}")
sys.exit(min(fails, 100))
PY
  FAILS=$((FAILS + py_fails))

  base="https://www.$name.cauldron.sefaria.org"
  for path in / /login /api/texts/Genesis.1 "/api/powered-by" ; do
    code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 90 "$base$path" || true)"
    case "$path:$code" in
      /api/powered-by:404) info "$name: GET $path 404 (no such endpoint in this code)" ;;
      *:200) pass "$name: GET $path 200" ;;
      *) fail "$name: GET $path $code" ;;
    esac
  done
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 90 "$base/settings/account" || true)"
  [[ "$code" == 302 ]] && pass "$name: /settings/account logged out redirects (302)" || fail "$name: /settings/account logged out answered $code"

  # stderr is dropped and nothing of the log is ever printed: a partial read can hold URLs or row values.
  if logs="$(kc -n "$NS" logs "$pod" -c web --since=48h 2>/dev/null)"; then :; else
    rc=$?
    fail "$name: could not read the web log (kubectl exit $rc; run kubectl logs by hand to see why)"
    continue
  fi
  # Counts only: a matching line can carry a request URL or a row's values, so no line is ever printed.
  summary="$(printf '%s\n' "$logs" \
    | grep -E "ProgrammingError|IntegrityError|UndefinedColumn|UndefinedTable|does not exist|violates (foreign key|check|not-null)" \
    | grep -E "powered_by_[a-z_]+|api_project|api_tier" \
    | grep -oE "(ProgrammingError|IntegrityError|UndefinedColumn|UndefinedTable)|(powered_by_[a-z_]+|api_project|api_tier[a-z_]*)" \
    | paste -sd' ' - | tr ' ' '\n' | awk 'NF' | sort | uniq -c | awk '{printf "%s x%s, ", $2, $1}' || true)"
  if [[ -z "$summary" ]]; then
    pass "$name: no database errors about phase 1 tables in the web log (last 48 h)"
  else
    fail "$name: database errors in the web log (last 48 h), by error class and table: ${summary%, }"
  fi
done
echo
((FAILS == 0)) && echo "schema compat: all checks passed" || { echo "schema compat: $FAILS check(s) FAILED"; exit 1; }
