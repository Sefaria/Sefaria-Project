#!/usr/bin/env bash
# enforce-watch-tick.sh: one read-only check of an environment after /api/knn-search moves to enforce.
# Prints facts and a last line "TICK OK" or "TICK ALARM: <reasons>"; exit 0 = OK, 1 = ALARM.
# Never changes anything; never prints a key, token or cookie.
# Ported 2026-11-26 from the staging-only script of 2026-11-18 (run record step G8): environments, GNU or BSD date,
# and gateway denials from Prometheus where Envoy access logs are off (preprod and prod).
# Usage: ENV=staging|preprod|prod enforce-watch-tick.sh [window-minutes, default 5]
#   ALLOW_DENIALS=N  denials the window may hold from your own probes (default 1, this tick's own probe)
set -uo pipefail
ENV=${ENV:-staging}; WIN=${1:-5}; ALLOW=${ALLOW_DENIALS:-1}
case $ENV in
  staging) CTX=gke_development-205018_us-east1-b_cluster-1 NS=default DEP=sefariastaging-auth-service BASE=https://www.sefariastaging.org ENVOY=1 ;;
  preprod) CTX=gke_production-deployment_us-east1-b_cluster-1 NS=preprod DEP=preprod-auth-service BASE=https://www.sefariapreprod.org ENVOY=0 ;;
  prod)    CTX=gke_production-deployment_us-east1-b_cluster-1 NS=default DEP=production-auth-service BASE=https://www.sefaria.org ENVOY=0 ;;
  *) echo "ENV must be staging, preprod or prod" >&2; exit 2 ;;
esac
SINCE=$(date -u -d "-$WIN min" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-"$WIN"M +%Y-%m-%dT%H:%M:%SZ)
kc() { kubectl --context "$CTX" "$@"; }
pq() { kc get --raw "/api/v1/namespaces/monitoring/services/prometheus-kube-prometheus-prometheus:9090/proxy/api/v1/query?query=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1")" 2>/dev/null \
  | python3 -c 'import sys,json
try:
  r=json.load(sys.stdin)["data"]["result"]
  print(" ".join("%s=%.0f" % (x["metric"].get("result","total"), float(x["value"][1])) for x in r) or "none")
except Exception: print("ERROR")'; }
alarms=()
echo "# enforce watch tick $ENV $(date -u +%Y-%m-%dT%H:%M:%SZ) (last $WIN min)"

# 1. Auth service: running, Ready, in enforce.
mode=$(kc get deploy -n "$NS" "$DEP" -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="AUTH_MODE")].value}' 2>/dev/null)
ready=$(kc get deploy -n "$NS" "$DEP" -o jsonpath='{.status.readyReplicas}/{.status.replicas}' 2>/dev/null)
echo "auth-service: AUTH_MODE=$mode ready=$ready"
[ "$mode" = enforce ] || alarms+=("AUTH_MODE is '$mode', not enforce")
r_ok=${ready%/*}; r_all=${ready#*/}
[[ -n "$r_ok" && "$r_ok" != 0 && "$r_ok" == "$r_all" ]] || alarms+=("auth-service not fully ready ($ready)")
errs=0; for P in $(kc get pods -n "$NS" -o name 2>/dev/null | grep "/$DEP-"); do
  e=$(kc logs -n "$NS" "$P" --since-time="$SINCE" 2>/dev/null | grep -cE " (WARN|ERROR) "); errs=$((errs+e)); done
echo "auth-service WARN/ERROR lines: $errs"

# 2. Gateway denials. Staging: Envoy access logs, by user agent (a denial from anyone but our probes is an alarm).
#    Preprod and prod: Envoy access logs are off, so count the auth service's denials in Prometheus.
if [ "$ENVOY" = 1 ]; then
  other=$(kc get pods -n envoy-gateway-system -o name 2>/dev/null | grep 'envoy-envoy-' | while read -r E; do
    kc logs -n envoy-gateway-system "$E" -c envoy --since-time="$SINCE" 2>/dev/null; done | python3 -c '
import sys, json, collections
denied = collections.Counter()
for l in sys.stdin:
    try: j = json.loads(l)
    except Exception: continue
    if "ext_authz" not in (j.get("response_code_details") or ""): continue
    ua = (j.get("user-agent") or "")[:40]
    who = "probe" if ua.startswith(("SefariaR4Replay", "SefariaR5Lifecycle")) else "OTHER"
    denied[(who, j.get("response_code"), (j.get("x-envoy-origin-path") or "").split("?")[0][:40], ua)] += 1
o = 0
for (who, code, path, ua), c in denied.most_common(20):
    print(f"  denied {c}x {code} {path} by {who} ({ua})", file=sys.stderr); o += c if who == "OTHER" else 0
print(o)')
  [ "${other:-0}" = 0 ] || alarms+=("$other gateway denials from callers other than our probes (read them)")
else
  den=$(pq "sum by (result) (increase(authsvc_decisions_total{namespace=\"$NS\",allow=\"false\"}[${WIN}m]))")
  echo "auth-service denials, last $WIN min: $den"
  total=0; for n in $(echo "$den" | grep -oE '=[0-9]+' | tr -d =); do total=$((total+n)); done
  [ "$den" = ERROR ] && alarms+=("Prometheus query failed")
  [ "$total" -le "$ALLOW" ] || alarms+=("$total denials in $WIN min (allowed $ALLOW from probes): find the caller in Cloud Logging or the R3 query")
fi

# 3. Site flows: must not be denied.
for p in / /Genesis.1 /api/texts/Genesis.1 /api/related/Genesis.1 /texts /login; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE$p"); echo "flow $p -> $c"
  [[ "$c" =~ ^(200|301|302)$ ]] || alarms+=("$p answered $c")
done
# 4. The gate itself: no key on /api/knn-search must be a gateway 401 with code api_key_required.
body=$(curl -s --max-time 20 -X POST -A 'SefariaR4Replay/1.1 (watch probe)' -H 'Content-Type: application/json' -d '{"query":"x"}' "$BASE/api/knn-search")
echo "knn no-key -> $(echo "$body" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("code"))
except Exception: print("not json")')"
echo "$body" | grep -q '"api_key_required"' || alarms+=("knn-search without a key is not a gateway api_key_required")

if [ ${#alarms[@]} -eq 0 ]; then echo "TICK OK"; exit 0; fi
printf 'TICK ALARM:'; printf ' %s;' "${alarms[@]}"; echo; exit 1
