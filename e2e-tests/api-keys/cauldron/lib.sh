# shellcheck shell=bash
# shellcheck disable=SC2034  # sourced library: its variables are used by run.sh and fixture-free.sh
# Shared helpers for the cauldron runner. Sourced, never run.
# Every cluster call goes through kc, which pins the dev context and the default namespace and
# refuses any verb that is not read-only (exec and port-forward are limited further below).

KCTX=gke_development-205018_us-east1-b_cluster-1
NS=default
# The target cauldron is named once. The defaults keep the shared apikeys-pipeline cauldron; the names below
# follow helm-chart/sefaria (service auth-service-<env>, deploy <env>-auth-service, labels app=web-<env>,
# app=nginx-<env>, deployEnv=<env>, HelmRelease <env>).
CAULDRON=${APIKEYS_CAULDRON:-apikeys-pipeline}
APIKEYS_PR=${APIKEYS_PR:-3798}
[[ $CAULDRON =~ ^[a-z0-9-]+$ ]] || { printf 'STOP: APIKEYS_CAULDRON=%s is not a cauldron name\n' "$CAULDRON" >&2; exit 1; }
HOST=www.$CAULDRON.cauldron.sefaria.org
BASE="https://$HOST"
WEB_SELECTOR=app=web-$CAULDRON
PG_POD=postgres-18-0
AUTH_SVC=svc/auth-service-$CAULDRON
AUTH_DEPLOY=deploy/$CAULDRON-auth-service
NGINX_SELECTOR=app=nginx-$CAULDRON
DEPLOY_ENV_SELECTOR=deployEnv=$CAULDRON
PF_PORT=18081
ID_LO=2098000001
ID_HI=2098000999

CAULDRON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$CAULDRON_DIR/../../.." && pwd)"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2; }
die() { printf 'STOP: %s\n' "$*" >&2; exit 1; }

# Masks key material to 4 characters before anything reaches disk or stdout.
mask() {
  sed -E 's/(key_prefix=)([^ "]{0,4})[^ "]*/\1\2…/g; s/sfr_[A-Za-z0-9_-]+/sfr_…/g;'
}

if [ -n "${APIKEYS_KUBE_CONTEXT:-}" ] && [ "$APIKEYS_KUBE_CONTEXT" != "$KCTX" ]; then
  die "APIKEYS_KUBE_CONTEXT=$APIKEYS_KUBE_CONTEXT; only $KCTX is allowed"
fi
export APIKEYS_KUBE_CONTEXT="$KCTX"

kc() {
  local verb="$1"
  case "$verb" in
    get|describe|logs) ;;
    *) die "cluster verb '$verb' is not allowed through kc" ;;
  esac
  kubectl --context "$KCTX" -n "$NS" "$@"
}

web_pod() {
  kubectl --context "$KCTX" -n "$NS" get pods -l "$WEB_SELECTOR" --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}'
}

# Read-only SQL on sefaria_auth. The session is read-only and the statement must be a SELECT.
kc_psql_ro() {
  local sql="$1"
  printf '%s' "$sql" | grep -Eiq '\b(insert|update|delete|merge|grant|revoke|create|drop|alter|truncate|copy|vacuum|call|do|lock|set|reset|comment|security|refresh)\b' \
    && die "refusing non-SELECT SQL"
  printf '%s' "$sql" | grep -Eiq '^[[:space:]]*(select|with|\\dp)' || die "SQL must start with SELECT, WITH or \\dp"
  kubectl --context "$KCTX" -n "$NS" exec -i "$PG_POD" -- \
    env PGOPTIONS='-c default_transaction_read_only=on' psql -U postgres -d sefaria_auth -X -At -v ON_ERROR_STOP=1 -c "$sql"
}

kc_port_forward() {
  kubectl --context "$KCTX" -n "$NS" port-forward --address 127.0.0.1 "$AUTH_SVC" "$PF_PORT:8080" >/dev/null 2>&1 &
  PF_PID=$!
  for _ in $(seq 1 30); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$PF_PORT/readyz" && return 0; sleep 0.5; done
  return 1
}

# Every line that names the cluster CLI must carry the dev context.
g1_check() {
  local bad
  bad="$(grep -HnE '(^|[^A-Za-z_])kubectl[[:space:]]' "$@" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' | grep -v -- '--context' || true)"
  [ -z "$bad" ] || { printf '%s\n' "$bad" >&2; die "a cluster call above lacks --context"; }
}

UA_TAG="apikeys-e2e-cauldron"
c() {  # curl against the cauldron with the run's user agent; prints "status<TAB>body-file"
  local out; out="$(mktemp "$RUN_DIR/tmp.XXXXXX")"
  local code; code="$(curl -sS -m 30 -o "$out" -D "$out.h" -w '%{http_code}' -A "$UA_TAG/${RUN_ID:-adhoc}" "$@" 2>/dev/null || echo 000)"
  printf '%s\t%s\n' "$code" "$out"
}
