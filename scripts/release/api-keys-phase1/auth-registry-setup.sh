#!/usr/bin/env bash
# auth-registry-setup.sh: everything the auth service needs in Postgres for one env, in order, checked at each step.
#
#   auth-registry-setup.sh --env staging|preprod|prod --context CTX                  # read-only: report what is there
#   auth-registry-setup.sh --env ... --context CTX --seed-tiers                      # + create missing tiers (idempotent)
#   auth-registry-setup.sh --env ... --context CTX --create-reader OUT_DIR KMS_KEY  # + reader role and SOPS Secret file
#
# Who fills what (nothing here is needed while authService.enabled is false):
#   1. Schema: Django's own migrations, run by every web pod at start (staging) or by premigrate.sh (preprod/prod).
#      This script only checks that powered_by ends at 0010_seed_mcp_tier, and stops if it does not.
#   2. Tiers (developer, partner, internal, mcp) and their semantic meter limits: seeded by migrations 0006 and 0010.
#      Step 2 lists them. --seed-tiers re-runs the same seed function (get_or_create: an existing row, including a
#      customised limit, is never changed), for a database restored from a dump taken before the migrations.
#   3. The auth service's read-only role and its DSN Secret: auth-service/scripts/provision-cluster-registry.sh.
#      Step 3 runs its --verify. --create-reader runs its create mode, which writes an encrypted Secret file into
#      OUT_DIR (your infrastructure checkout) for a PR there; the password is never printed.
#   4. Keys for the Library Assistant and MCP (sfr_ keys on the mcp/internal tier) are not made here: they are made in
#      developer settings or the Django admin by their owners, before enforce on /api/knn-search.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
REPO_ROOT="$(cd "$RELEASE_DIR/../../.." && pwd)"

ENV="" CTX="" SEED=0 CREATE=0 OUT_DIR="" KMS=""
while (($#)); do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --seed-tiers) SEED=1; shift ;;
    --create-reader) CREATE=1; OUT_DIR="${2:?--create-reader OUT_DIR KMS_KEY}"; KMS="${3:?--create-reader OUT_DIR KMS_KEY}"; shift 3 ;;
    -h | --help) sed -n '2,22p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
need kubectl
check_context "$ENV" "$CTX"
NS="$(env_namespace "$ENV")"
DB="$(env_db "$ENV")"
if ((SEED || CREATE)) && [[ "$ENV" != staging ]]; then confirm_env "$ENV"; fi

POD="$(web_pods "$NS" "$(env_hr "$ENV")" | awk -F'\t' '$2 == "Running" {print $1; exit}')"
[[ -n "$POD" ]] || die "no Running web pod (app=web-$(env_hr "$ENV")) in $NS"
echo "auth registry setup for $ENV on $CTX (database $DB, web pod $NS/$POD)"

step "1. schema: powered_by migrations"
got_db="$(web_current_database "$NS" "$POD")"
[[ "$got_db" == "$DB" ]] || die "$POD uses database '$got_db', expected $DB"
last="$(kc -n "$NS" exec "$POD" -c web -- python manage.py showmigrations powered_by 2>/dev/null | awk '/\[X\]/ {m=$2} END {print m}')"
pending="$(kc -n "$NS" exec "$POD" -c web -- python manage.py showmigrations powered_by 2>/dev/null | grep -c '\[ \]' || true)"
echo "last applied: ${last:-none}; pending: $pending"
if [[ "$last" != 0010_seed_mcp_tier || "$pending" != 0 ]]; then
  die "the phase 1 schema is not in place on $DB. Staging: restart the web Rollout (its pods run migrate). Preprod/prod: premigrate.sh. Then run this again."
fi

step "2. tiers"
read -r -d '' PY <<'PYEOF' || true
import os
from django.apps import apps
from powered_by.models import ApiTier
if os.environ.get("SEED") == "1":
    import importlib
    m = importlib.import_module("powered_by.migrations.0006_api_project_schema")
    m.seed_api_tiers(apps)
for t in ApiTier.objects.order_by("id"):
    limits = ", ".join("%s %s/month" % (l.meter, l.monthly_per_project) for l in t.meter_limits.order_by("meter"))
    print("TIER %s | %s | %s/min | %s" % (t.id, t.name, t.per_minute_per_project, limits or "no meter limits"))
PYEOF
tiers="$(kc -n "$NS" exec -i "$POD" -c web -- env SEED="$SEED" python manage.py shell <<<"$PY" 2>/dev/null | grep '^TIER ' | sed 's/^TIER //' || true)"
printf '  %s\n' "${tiers:-none}"
for t in developer partner internal mcp; do
  line="$(grep "^$t |" <<<"$tiers" || true)"
  [[ -n "$line" ]] || die "tier '$t' is missing: run again with --seed-tiers"
  # The auth service reads a missing semantic limit as no monthly limit, so each tier must have one.
  grep -q "semantic [0-9]*/month" <<<"$line" || die "tier '$t' has no semantic meter limit: run again with --seed-tiers"
done
echo "all four tiers present, each with a semantic meter limit"

step "3. auth service reader role and Secret"
PROV="$REPO_ROOT/auth-service/scripts/provision-cluster-registry.sh"
[[ -x "$PROV" ]] || die "$PROV not found (run from a checkout that has the auth service)"
secret_ns="$NS"
if ((CREATE)); then
  CTX="$CTX" DB="$DB" SECRET_NS="$secret_ns" OUT_DIR="$OUT_DIR" KMS="$KMS" "$PROV"
fi
role_exists="$(pg_ro "$DB" -tAc "SELECT count(*) FROM pg_roles WHERE rolname = '$READER_ROLE'")" \
  || die "could not query pg_roles on $PG_NS/$PG_POD"
if [[ "$role_exists" == 0 ]]; then
  echo "reader role $READER_ROLE: absent. Needed only before authService.enabled: true in $ENV; create it with --create-reader OUT_DIR KMS_KEY"
elif CTX="$CTX" DB="$DB" SECRET_NS="$secret_ns" "$PROV" --verify; then
  echo "reader role $READER_ROLE: verified"
else
  die "reader role $READER_ROLE exists but failed verification (grants, read-only sessions or the loader's queries): fix it before enabling the auth service"
fi
kc -n "$secret_ns" get secret auth-service-registry -o name >/dev/null 2>&1 \
  && echo "Secret $secret_ns/auth-service-registry: present (its DSN must name $DB; check before enabling)" \
  || echo "Secret $secret_ns/auth-service-registry: absent (comes from the infrastructure PR with the file --create-reader writes)"
