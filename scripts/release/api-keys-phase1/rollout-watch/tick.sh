#!/usr/bin/env bash
# tick.sh: one read-only health tick of preprod + prod for the API keys phase 1 prod promotion (2026-11-23).
# Prints one summary line per check, writes ticks/<utc>.json, exits 0 OK, 2 ALARM, 1 INVALID (a check could not run).
# Never changes anything: kubectl get/top, curl GET.
set -uo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; CTX=gke_production-deployment_us-east1-b_cluster-1
TS=$(date -u +%Y%m%dT%H%M%SZ); OUT="$D/ticks/$TS.json"; ALARM=0; INVALID=0; LINES=()
add(){ LINES+=("$1"); echo "$1"; }
k(){ kubectl --context "$CTX" "$@"; }
# 1. HelmReleases
for hr in default/production preprod/preprod; do
  j=$(k -n "${hr%/*}" get helmrelease "${hr#*/}" -o json 2>/dev/null) || { add "INVALID hr $hr unreadable"; INVALID=1; continue; }
  read -r ready ver susp < <(jq -r '[(.status.conditions[]|select(.type=="Ready").status), .spec.chart.spec.version, (.spec.suspend//false)]|@tsv' <<<"$j")
  [[ $ready == True && $susp == false ]] && add "ok hr $hr chart=$ver" || { add "ALARM hr $hr ready=$ready suspend=$susp chart=$ver"; ALARM=1; }
done
# 2. Web pods: ready count, crashloop, restarts in last tick window (by lastState finishedAt within 10 min)
for sel in "default app=web-production" "preprod app=web-preprod"; do
  ns=${sel%% *}; lab=${sel#* }
  j=$(k -n "$ns" get pods -l "$lab" -o json 2>/dev/null) || { add "INVALID pods $ns"; INVALID=1; continue; }
  tot=$(jq '[.items[]|select(.status.phase!="Succeeded" and .status.phase!="Failed")]|length' <<<"$j")
  rdy=$(jq '[.items[]|select(any(.status.conditions[]?;.type=="Ready" and .status=="True"))]|length' <<<"$j")
  crash=$(jq '[.items[].status.containerStatuses[]?|select(.state.waiting.reason=="CrashLoopBackOff" or .state.waiting.reason=="ImagePullBackOff" or .state.waiting.reason=="ErrImagePull")]|length' <<<"$j")
  since=$(date -u -d '-10 min' +%Y-%m-%dT%H:%M:%SZ)
  recent=$(jq --arg s "$since" '[.items[].status.containerStatuses[]?|select((.lastState.terminated.finishedAt//"") > $s)|.lastState.terminated.reason]|join(",")' -r <<<"$j")
  imgs=$(jq -r '[.items[]|select(.status.phase!="Failed")|.spec.containers[0].image|split(":")[-1]]|unique|join(",")' <<<"$j")
  need=$(( tot>2 ? tot-2 : 1 ))
  line="pods $ns web ready=$rdy/$tot crash=$crash restarts10m=[$recent] tag=$imgs"
  if (( crash>0 || rdy<need )); then add "ALARM $line"; ALARM=1; else add "ok $line"; fi
done
# 3. auth service: the live HelmRelease spec says what should run (authService.enabled + mode); the objects must match.
#    off -> no auth Deployment, no SecurityPolicy. on -> Deployment ready, SecurityPolicy present, Secret present, no
#    registry permission errors in the last 5 min, and (observe) a request with an unknown key is still served (200).
#    expect.env may pin AUTH_<ns>=off|observe|enforce to override (normally empty).
[[ -f "$D/expect.env" ]] && . "$D/expect.env"
for pair in "default production www.sefaria.org" "preprod preprod www.sefariapreprod.org"; do
  set -- $pair; ns=$1 hr=$2 host=$3
  spec=$(k -n "$ns" get helmrelease "$hr" -o json 2>/dev/null | jq -r '.spec.values.authService | if .enabled then .mode else "off" end') || spec=""
  [[ -z $spec ]] && { add "INVALID auth $ns helmrelease unreadable"; INVALID=1; continue; }
  want=$(eval echo "\${AUTH_$ns:-$spec}")
  dep=$(k -n "$ns" get deploy -o json 2>/dev/null) || { add "INVALID auth $ns deployments unreadable"; INVALID=1; continue; }
  read -r nd rd < <(jq -r '[.items[]|select(.metadata.name|test("auth-service$"))]|[length, (map(.status.readyReplicas//0)|add//0)]|@tsv' <<<"$dep")
  sp=$(k -n "$ns" get securitypolicy -o name 2>/dev/null | grep -ci auth); sp=${sp:-0}
  sec=$(k -n "$ns" get secret auth-service-registry -o name 2>/dev/null | wc -l)
  line="auth $ns want=$want deploy=$nd ready=$rd securitypolicy=$sp secret=$sec"
  if [[ $want == off ]]; then
    (( nd==0 && sp==0 )) && add "ok $line" || add "info $line (auth objects present while spec says off: rollout in progress?)"
    continue
  fi
  perm=0
  if (( nd>0 )); then perm=$(k -n "$ns" logs deploy/$(jq -r '[.items[]|select(.metadata.name|test("auth-service$"))][0].metadata.name' <<<"$dep") --since=5m 2>/dev/null | grep -vi "refusing to replace a non-empty key set" | grep -ciE "permission denied|reload failed|panic|fatal"); fi
  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -H 'x-api-key: sk_monitor_unknown_key' "https://$host/api/texts/Genesis.1.1")
  line="$line regErrors5m=${perm:-0} unknownKey=$code"
  if (( nd>0 && rd>0 && sp>0 && sec>0 && ${perm:-0}==0 )) && { [[ $want != observe ]] || [[ $code == 200 ]]; }; then add "ok $line"
  else add "ALARM $line (auth $want expected healthy)"; ALARM=1; fi
done
# 3b. staging auth service (dev cluster): ready, and the reader still has its grants (the weekly copy wiped them 11-22).
DCTX=gke_development-205018_us-east1-b_cluster-1
sj=$(kubectl --context $DCTX -n default get deploy sefariastaging-auth-service -o json 2>/dev/null) || sj=""
if [[ -z $sj ]]; then add "INVALID staging auth deployment unreadable"; INVALID=1
else
  srd=$(jq -r '.status.readyReplicas//0' <<<"$sj")
  sperm=$(kubectl --context $DCTX -n default logs deploy/sefariastaging-auth-service --since=5m 2>/dev/null | grep -ci "permission denied")
  [[ $srd -ge 1 && ${sperm:-0} -eq 0 ]] && add "ok staging auth ready=$srd permDenied5m=${sperm:-0}" || { add "ALARM staging auth ready=$srd permDenied5m=${sperm:-0}"; ALARM=1; }
fi
# 4. HTTP probes (status, seconds)
probe(){ local host=$1 path=$2 want=$3 r; r=$(curl -s -o /dev/null -m 20 -w '%{http_code} %{time_total}' "https://$host$path") || r="000 0"
  set -- $r; if [[ " $want " == *" $1 "* ]]; then add "ok probe $host$path $1 ${2}s"; else add "ALARM probe $host$path got $1 want [$want] ${2}s"; ALARM=1; fi; }
for h in www.sefaria.org www.sefariapreprod.org; do
  probe $h / "200 302"; probe $h /Genesis.1 "200 302"; probe $h /api/texts/Genesis.1.1 "200"; probe $h "/api/v3/texts/Genesis.1.1" "200"
  probe $h /login "200"; probe $h /api/name/Shabbat "200"; probe $h /settings/developer "404 302"
  probe $h /api-terms "404 200 302"; probe $h /powered-by "200 301 302"
done
# 5. 5xx share over the last 5 minutes from Envoy's per-route counters in Prometheus (every request through the gateway;
#    kubectl logs on prod nginx only reach back ~40 s, so they cannot measure a 5-minute window).
PQ(){ kubectl --context "$CTX" get --raw "/api/v1/namespaces/monitoring/services/prometheus-kube-prometheus-prometheus:9090/proxy/api/v1/query?query=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1")" 2>/dev/null; }
for sel in "default httproute/default/production/" "preprod httproute/preprod/preprod/"; do
  ns=${sel%% *}; pre=${sel#* }
  r=$(PQ "sum by (envoy_response_code_class) (increase(envoy_cluster_upstream_rq_xx{envoy_cluster_name=~\"${pre}.*\"}[5m]))" | jq -r '[.data.result[]|{c:.metric.envoy_response_code_class,v:(.value[1]|tonumber)}] | "\(map(.v)|add//0|floor) \(map(select(.c=="5")|.v)|add//0|floor)"' 2>/dev/null) || r=""
  [[ -z $r || $r == "0 0" && $ns == default ]] && { add "INVALID gateway $ns 5xx unreadable from Prometheus"; INVALID=1; continue; }
  set -- $r; pct=$(python3 -c "print(round(100*$2/$1,2) if $1 else 0)")
  if (( $1 >= 50 )) && python3 -c "import sys;sys.exit(0 if $pct>2 else 1)"; then add "ALARM gateway $ns 5xx=$2/$1 ($pct%) last 5m"; ALARM=1; else add "ok gateway $ns 5xx=$2/$1 ($pct%) last 5m"; fi
done
printf '%s\n' "${LINES[@]}" | jq -R . | jq -s --arg ts "$TS" --argjson a $ALARM --argjson i $INVALID '{ts:$ts,alarm:$a,invalid:$i,lines:.}' > "$OUT"
(( ALARM )) && { echo "TICK $TS: ALARM"; exit 2; }; (( INVALID )) && { echo "TICK $TS: INVALID"; exit 1; }; echo "TICK $TS: OK"
