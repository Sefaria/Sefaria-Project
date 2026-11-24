#!/usr/bin/env bash
# verify.sh <stage|ID...>: the verification items for the API keys phase 1 rollout to preprod (observe) and later prod.
# Stages: pre (before merging the promotion), post (after the preprod deploy), soak (after 1 h), prod-pre (before the
# preprod -> prod promotion). Each item prints one line: PASS|FAIL|INVALID <ID> <what> :: <evidence>. Exit 0 all PASS,
# 2 any FAIL, 1 any INVALID (a check that could not run is never a pass). Read-only: kubectl get/logs, curl, gh reads,
# and one read-only Postgres check (V03, the provision script's --verify).
set -uo pipefail
P=gke_production-deployment_us-east1-b_cluster-1; DEV=gke_development-205018_us-east1-b_cluster-1
REPO=Sefaria/Sefaria-Project; INFRA=Sefaria/infrastructure; PRE=www.sefariapreprod.org; PROD=www.sefaria.org
TOOLING=~/sefaria/worktrees/apikeys-tooling; RUN="$(cd "$(dirname "$0")" && pwd)"
PROMO_PR=${PROMO_PR:-4142}; BASE_CHART=${BASE_CHART:-0.95.1-preprod.2}
# TARGET=preprod (default) or prod: which environment the post/soak items check.
TARGET=${TARGET:-preprod}
if [[ $TARGET == prod ]]; then NS=default HRN=production HOST=$PROD BR=prod NGX=app=nginx-production WEBL=app=web-production AREP=2 BASE_CHART=${BASE_CHART_PROD:-0.95.1-prod.1} DEVSET=off
else NS=preprod HRN=preprod HOST=$PRE BR=preprod NGX=app=nginx-preprod WEBL=app=web-preprod AREP=1 DEVSET=on; fi
F=0; I=0
r(){ local st=$1 id=$2 what=$3 ev=$4; echo "$st $id $what :: $ev"; [[ $st == FAIL ]] && F=1; [[ $st == INVALID ]] && I=1; return 0; }
k(){ kubectl --context "$P" "$@"; }
hr(){ k -n "$1" get helmrelease "$2" -o json 2>/dev/null; }
authdep(){ k -n "$1" get deploy -o json 2>/dev/null | jq -c '[.items[]|select(.metadata.name|test("auth-service$"))][0] // empty'; }

V01(){ local a b; a=$(k get ns preprod -o name 2>&1); b=$(kubectl --context $DEV get ns default -o name 2>&1)
  [[ $a == namespace/preprod && $b == namespace/default ]] && r PASS V01 "cluster access (prod + dev)" "$a; $b" || r INVALID V01 "cluster access" "${a:0:80} | ${b:0:80}"; }
V02(){ local out=""; for ns in default preprod; do
    d=$(k -n $ns get secret auth-service-registry -o jsonpath='{.data.AUTH_PG_DSN}' 2>/dev/null | base64 -d 2>/dev/null)
    db=${d##*/}; db=${db%%\?*}; out+="$ns:${db:-missing} "; done
  [[ $out == "default:sefaria_auth preprod:sefaria_auth " ]] && r PASS V02 "registry Secret in both namespaces names sefaria_auth" "$out" || r FAIL V02 "registry Secret" "$out"; }
V03(){ [[ -x $TOOLING/auth-service/scripts/provision-cluster-registry.sh ]] || { r INVALID V03 "reader role" "no tooling checkout at $TOOLING"; return; }
  local v; v=$(cd $TOOLING && CTX=$P DB=sefaria_auth ROLE=auth_service_reader auth-service/scripts/provision-cluster-registry.sh --verify 2>&1 | tail -1)
  [[ $v == "verify: PASS"* ]] && r PASS V03 "prod reader role: read-only, loader columns only (DB read)" "$v" || r FAIL V03 "prod reader role" "$v"; }
V04(){ local tag; tag=$(hr preprod preprod | jq -r '.spec.values.authService.image.tag')
  gcloud artifacts docker tags list us-east1-docker.pkg.dev/production-deployment/containers/sefaria-auth-service --format='value(tag)' 2>/dev/null | sed 's#.*/##' | grep -qx "$tag" \
    && r PASS V04 "preprod auth image exists" "$tag" || r FAIL V04 "preprod auth image exists" "tag=$tag not in registry"; }
V05(){ local m files; m=$(gh pr view $PROMO_PR -R $REPO --json mergeable,state -q '"\(.state) \(.mergeable)"' 2>&1)
  files=$(gh pr diff $PROMO_PR -R $REPO 2>/dev/null | awk '/^diff --git a\/envs\/preprod\//{f=1;next} /^diff --git/{f=0} f' | grep -E '^[-+] +(enabled|tag):' | tr '\n' ' ')
  [[ $m == "OPEN MERGEABLE" || $m == MERGED* ]] && [[ $files == *"+      enabled: true"* && $files != *"tag:"* ]] \
    && r PASS V05 "promotion PR turns preprod auth on and leaves its image tag alone" "#$PROMO_PR $m; $files" || r FAIL V05 "promotion PR" "#$PROMO_PR $m; $files"; }
V06(){ local o; o=$("$RUN/tick.sh" 2>&1); local rc=$?; local tl; tl=$(grep -E '^TICK' <<<"$o")
  (( rc==0 )) && r PASS V06 "health tick (pods, probes, 5xx, auth state)" "$tl" || r FAIL V06 "health tick" "$(grep -E '^(ALARM|INVALID)' <<<"$o" | head -3 | tr '\n' ' ')"; }
V07(){ local rd perm; rd=$(kubectl --context $DEV -n default get deploy sefariastaging-auth-service -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
  perm=$(kubectl --context $DEV -n default logs deploy/sefariastaging-auth-service --since=10m 2>/dev/null | grep -c "permission denied")
  [[ ${rd:-0} -ge 1 && $perm -eq 0 ]] && r PASS V07 "staging auth ready, reader grants intact (weekly copy lesson)" "ready=$rd permDenied10m=$perm" || r FAIL V07 "staging auth" "ready=${rd:-0} permDenied10m=$perm"; }
V08(){ local b; b=$(gh api /organizations/Sefaria/settings/billing/budgets -q '.budgets[]|select(.budget_product_sku=="actions")|.budget_amount' 2>/dev/null)
  local last; last=$(gh run list -R $INFRA --limit 1 --json conclusion,displayTitle -q '.[0]|"\(.conclusion) \(.displayTitle)"' 2>/dev/null)
  [[ -n $b && $b != 0 && $last == success* ]] && r PASS V08 "deploy jobs can run (Actions budget, last infra run)" "budget=\$$b; $last" || r FAIL V08 "deploy jobs can run" "budget=\$${b:-?}; $last"; }

V10(){ local d; d=$(gh run list -R $REPO --branch $BR --workflow "Deploy Static Environment" --limit 1 --json conclusion,headSha -q '.[0]|"\(.conclusion) \(.headSha[0:10])"' 2>/dev/null)
  local t; t=$(gh run list -R $INFRA --limit 10 --json conclusion,displayTitle -q '[.[]|select(.displayTitle|test("Update '"$BR"' tag"))][0]|"\(.conclusion) \(.displayTitle)"' 2>/dev/null)
  [[ $d == success* && $t == success* ]] && r PASS V10 "$TARGET release + infra tag update ran" "$d; $t" || r FAIL V10 "$TARGET release + infra tag" "$d; $t"; }
V11(){ local j; j=$(hr $NS $HRN); local v ready mode en
  read -r v ready en mode < <(jq -r '[.spec.chart.spec.version, (.status.conditions[]|select(.type=="Ready").status), .spec.values.authService.enabled, .spec.values.authService.mode]|@tsv' <<<"$j")
  [[ $v != "$BASE_CHART" && $ready == True && $en == true && $mode == observe ]] && r PASS V11 "$TARGET HelmRelease Ready on the new chart, auth on in observe" "chart=$v ready=$ready enabled=$en mode=$mode" || r FAIL V11 "$TARGET HelmRelease" "chart=$v ready=$ready enabled=$en mode=$mode"; }
V12(){ local d; d=$(authdep $NS); [[ -z $d ]] && { r FAIL V12 "$TARGET auth Deployment" "none"; return; }
  local s; s=$(jq -r '"ready=\(.status.readyReplicas//0)/\(.spec.replicas) image=\(.spec.template.spec.containers[0].image|split(":")[-1])"' <<<"$d")
  [[ $s == ready=$AREP/$AREP* ]] && r PASS V12 "$TARGET auth pod ready" "$s" || r FAIL V12 "$TARGET auth pod ready" "$s"; }
V13(){ local sp; sp=$(k -n $NS get securitypolicy -o json 2>/dev/null | jq -r '[.items[]|select(.metadata.name|test("auth"))][0]|if .==null then "none" else "\(.metadata.name) accepted=\([.status.ancestors[]?.conditions[]?|select(.type=="Accepted").status]|join(",")) failOpen=\(.spec.extAuth.failOpen) timeout=\(.spec.extAuth.grpc.backendRefs[0].timeout // .spec.extAuth.timeout // "?")" end')
  [[ $sp == *"accepted=True"* && $sp == *"failOpen=true"* ]] && r PASS V13 "SecurityPolicy accepted, fails open" "$sp" || r FAIL V13 "SecurityPolicy" "$sp"; }
V14(){ # registry health from Prometheus (the service logs only on changes): every pod reloaded within 3 min, registry
  # version > 0, and no permission errors in the logs of the last 30 min.
  local PQ age d e
  PQ(){ k get --raw "/api/v1/namespaces/monitoring/services/prometheus-kube-prometheus-prometheus:9090/proxy/api/v1/query?query=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1")" 2>/dev/null; }
  age=$(PQ "max(time() - authsvc_registry_last_reload_success_timestamp_seconds{namespace=\"$NS\"})" | jq -r '.data.result[0].value[1]//empty|tonumber|floor')
  d=$(authdep $NS | jq -r '.metadata.name // empty'); e=$(k -n $NS logs deploy/$d --since=30m 2>/dev/null | grep -ciE "permission denied|panic|fatal")
  [[ -n $age && $age -lt 180 && ${e:-0} -eq 0 ]] && r PASS V14 "registry reloads on every pod, no permission errors" "oldest successful reload ${age}s ago; errors30m=${e:-0}" || r FAIL V14 "registry health" "oldest reload ${age:-unknown}s ago; errors30m=${e:-0}"; }
V15(){ local a b ks; a=$(curl -s -o /dev/null -D - -m 20 -H 'x-api-key: sfr_verify_unknown_000' https://$HOST/api/texts/Genesis.1.1 | tr -d '\r')
  ks=$(grep -i '^x-sefaria-key-status' <<<"$a" | cut -d' ' -f2); a=$(head -1 <<<"$a" | awk '{print $2}')
  b=$(curl -s -o /dev/null -m 20 -w '%{http_code}' https://$HOST/api/texts/Genesis.1.1)
  # sfr_ keys are the ones the auth service checks (sk_ or other keys go to Django untouched).
  [[ $a == 200 && $b == 200 && $ks == not_accepted ]] && r PASS V15 "observe never denies; an unknown sfr_ key is flagged not_accepted" "unknownSfrKey=$a keyStatus=$ks noKey=$b" || r FAIL V15 "observe never denies / key flagged" "unknownSfrKey=$a keyStatus=${ks:-none} noKey=$b"; }
V16(){ local c l; read -r c l < <(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' http://$HOST/Genesis.1)
  [[ $c =~ ^30[18]$ && $l == https://* ]] && r PASS V16 "plain HTTP redirects to HTTPS" "$c -> $l" || r FAIL V16 "HTTP->HTTPS redirect" "$c -> $l"; }
V17(){ local h; h=$(curl -s -D - -o /dev/null -m 20 -H 'x-sefaria-key-status: forged-by-verify' -H 'x-sefaria-tier: forged-by-verify' https://$HOST/api/texts/Genesis.1.1 | tr -d '\r')
  grep -qi "forged-by-verify" <<<"$h" && r FAIL V17 "forged x-sefaria-* headers stripped" "forged value echoed back" || r PASS V17 "forged x-sefaria-* headers stripped" "no forged value in response; key-status=$(grep -i '^x-sefaria-key-status' <<<"$h" | cut -d' ' -f2-)"; }
V18(){ local n; n=$(k -n $NS logs -l $NGX -c nginx --since=10m --tail=400 2>/dev/null | grep -c '"sefariaAuthResult"')
  (( n>0 )) && r PASS V18 "nginx logs carry the auth result" "$n lines with sefariaAuthResult in 10 min" || r FAIL V18 "nginx auth log fields" "0 lines with sefariaAuthResult"; }
V19(){ local a; a=$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' https://$HOST/settings/developer)
  if [[ $DEVSET == off ]]; then [[ $a == 404* ]] && r PASS V19 "developer settings stay off on $TARGET" "$a" || r FAIL V19 "developer settings should be off on $TARGET" "$a"; return; fi
  [[ $a == 302*login* ]] && r PASS V19 "developer settings on, anonymous sent to login" "$a" || r FAIL V19 "developer settings" "$a (404 means the flag is still off)"; }
V20(){ local j; j=$(k -n $NS get pods -l $WEBL -o json 2>/dev/null); local s
  s=$(jq -r '[.items[]|select(.status.phase=="Running")]|"\([.[]|select(all(.status.containerStatuses[];.ready))]|length)/\(length) tags=\([.[].spec.containers[0].image|split(":")[-1]]|unique|join(","))"' <<<"$j")
  local tag; tag=$(k -n $NS get deploy $(authdep $NS | jq -r .metadata.name) -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null); tag=${tag##*:}
  [[ -n $tag && ${s%%/*} == $(cut -d' ' -f1 <<<"$s" | cut -d/ -f2) && $s == *"tags=$tag" ]] && r PASS V20 "$TARGET web pods all ready on the release tag" "$s (release $tag)" || r FAIL V20 "$TARGET web pods on the release tag" "$s (release $tag)"; }
V21(){ local d sp ch; d=$(authdep default); sp=$(k -n default get securitypolicy -o name 2>/dev/null | grep -ci auth); ch=$(hr default production | jq -r '.spec.chart.spec.version')
  [[ -z $d && ${sp:-0} -eq 0 && $ch == 0.95.1-prod.1 ]] && r PASS V21 "prod untouched (no auth objects, chart unchanged)" "chart=$ch" || r FAIL V21 "prod untouched" "authDeploy=${d:+yes} sp=$sp chart=$ch"; }

V22(){ # Decision matrix: each probe takes one branch of decide.go; read back from nginx's own log right away (prod
  # nginx logs rotate in under a minute) and compare result/tier with the expected value. Observe: nothing is blocked.
  local M="vm$(date +%H%M%S)" U="https://$HOST/api/texts/Genesis.1.1" G="https://$HOST/api/knn-search" out exp got bad=0 seen=0
  declare -A E=( [A]="anonymous anonymous" [B]="embed embed" [C]="jwt_pending anonymous" [D]="api_key_invalid anonymous"
    [E]="anonymous anonymous" [F]="preflight embed" [G]="observed:api_key_required anonymous" [H]="observed:api_key_invalid anonymous"
    [I]="observed:api_key_required anonymous" [J]="api_key_invalid anonymous" [K]="anonymous anonymous" [L]="anonymous anonymous" )
  q(){ curl -s -o /dev/null -m 20 "$@"; }
  # prod nginx logs rotate within ~25 s, so follow every nginx pod live while probing instead of reading afterwards.
  local tmp; tmp=$(mktemp -d); local pids=() pod
  for pod in $(k -n $NS get pods -l $NGX -o name 2>/dev/null); do k -n $NS logs -f $pod -c nginx --since=1s > "$tmp/${pod##*/}.log" 2>/dev/null & pids+=($!); done
  sleep 3
  q "$U?m=$M-A"; q -H 'Origin: https://example.org' "$U?m=$M-B"; q -H 'Authorization: Bearer abc.def.ghi' "$U?m=$M-C"
  q -H 'x-api-key: sfr_verify_unknown_000' "$U?m=$M-D"; q -H 'x-api-key: legacykey123' "$U?m=$M-E"
  q -X OPTIONS -H 'Origin: https://example.org' -H 'Access-Control-Request-Method: GET' "$U?m=$M-F"
  q "$G?m=$M-G"; q -H 'x-api-key: sfr_verify_unknown_000' "$G?m=$M-H"; q "https://$HOST/api/%6bnn-search?m=$M-I"
  q -H 'x-api-key: sfr_a' -H 'x-api-key: sfr_b' "$U?m=$M-J"; q "$U?m=$M-K&api_key=sfr_secret_must_not_be_logged"
  q -H 'x-sefaria-auth-result: forged' -H 'x-sefaria-tier: forged' -H 'x-sefaria-project: forged' "$U?m=$M-L"
  local try; for try in 1 2 3 4 5; do sleep 2; [[ $(cat "$tmp"/*.log 2>/dev/null | grep -oE "m=$M-[A-L]" | sort -u | wc -l) -ge 12 ]] && break; done
  kill "${pids[@]}" 2>/dev/null; wait "${pids[@]}" 2>/dev/null; local raw; raw=$(cat "$tmp"/*.log 2>/dev/null); rm -rf "$tmp"
  out=$(grep "$M" <<<"$raw" | python3 -c '
import sys,json
for l in sys.stdin:
    j=json.loads(l); u=j.get("httpRequest",{}).get("requestUrl","")
    print(u.split("-")[-1][:1], j.get("sefariaAuthResult"), j.get("sefariaTier"), "LEAK" if "sfr_secret" in l else "", "PROJ="+str(j.get("sefariaProject")))')
  local detail=""
  for t in A B C D E F G H I J K L; do got=$(grep "^$t " <<<"$out" | head -1)
    [[ -z $got ]] && { detail+="$t:missing "; bad=1; continue; }; seen=$((seen+1))
    [[ "$(cut -d' ' -f2-3 <<<"$got")" == "${E[$t]}" && $got != *LEAK* && $got == *"PROJ="* && $got != *"PROJ=forged"* ]] || { detail+="$t:[$got]≠[${E[$t]}] "; bad=1; }
  done
  (( bad==0 )) && r PASS V22 "decision matrix: 12 branches give the expected result and tier, key scrubbed from logs, forged headers ignored" "$seen/12 matched ($M)" || r FAIL V22 "decision matrix" "$seen/12 seen; $detail"; }

V30(){ # soak: phase M4 reached and no unacknowledged alert since. ACKED.md lists alert times the lead explained.
  local m4 t un; m4=$(grep -m1 "PHASE M4" "$RUN/TIMELINE.md" 2>/dev/null | grep -oE '20[0-9-]+T[0-9:]+Z' | head -1); t=$(grep -c . "$RUN/TIMELINE.md" 2>/dev/null)
  un=$( (grep -oE '^20[0-9-]+T[0-9:]+Z' "$RUN/ALERTS.md" 2>/dev/null | sort -u) | while read ts; do grep -q "^$ts" "$RUN/ACKED.md" 2>/dev/null || echo "$ts"; done | wc -l)
  local ak; ak=$(grep -cE '^20' "$RUN/ACKED.md" 2>/dev/null || echo 0)
  [[ -n $m4 && $un -eq 0 ]] && r PASS V30 "soak: M4 reached, no unexplained alert since" "M4=$m4 ticks=$t acknowledged=$ak unacknowledged=0" || r FAIL V30 "soak" "M4=${m4:-not yet} ticks=$t unacknowledged=$un"; }
V31(){ local s=0 n=10 t; for i in $(seq $n); do t=$(curl -s -o /dev/null -m 20 -w '%{time_total}' -H 'x-api-key: sk_verify_unknown' https://$HOST/api/texts/Genesis.1.1); s=$(python3 -c "print($s+$t)"); done
  local avg; avg=$(python3 -c "print(round($s/$n,3))"); python3 -c "import sys;sys.exit(0 if $avg<1.0 else 1)" && r PASS V31 "API latency with the auth hop (10 calls)" "avg ${avg}s" || r FAIL V31 "API latency" "avg ${avg}s"; }

V40(){ local s; s=$(gh pr view 3942 -R $REPO --json state -q .state 2>/dev/null); local k
  k=$(cd $TOOLING 2>/dev/null && kubectl --context $P -n default exec -i postgres-18-0 -- sh -c 'psql -X -qtA -U "${POSTGRES_USER:-postgres}" -d sefaria_auth -c "select count(*) from powered_by_apikey"' 2>/dev/null)
  [[ $s == MERGED || ${k:-1} -eq 0 ]] && r PASS V40 "#3942 ordering safe (merged, or no keys exist yet)" "#3942=$s keys=${k:-?}" || r FAIL V40 "#3942 ordering" "#3942=$s keys=${k:-?}: land it before the first key"; }
V41(){ r INVALID V41 "pgvector embedding CronJobs (#3711) ride to prod: confirm with the owner and node headroom" "manual: ask the #3711 owner; check prod node allocatable memory"; }
V42(){ local f; git -C ~/sefaria/Sefaria-Project fetch -q origin preprod 2>/dev/null; f=$(git -C ~/sefaria/Sefaria-Project show origin/preprod:envs/prod/helmrelease.yaml 2>/dev/null | python3 -c 'import sys,yaml;d=[x for x in yaml.safe_load_all(sys.stdin) if x and x.get("kind")=="HelmRelease"][0]["spec"]["values"]["authService"];print(d["enabled"],d["mode"],d.get("replicaCount"))' 2>/dev/null)
  [[ $f == "True observe 2" ]] && r PASS V42 "prod env file on preprod branch: auth on, observe, 2 replicas" "$f" || r FAIL V42 "prod env file" "${f:-unreadable}"; }

declare -A STAGE=([pre]="V01 V02 V03 V04 V05 V06 V07 V08" [post]="V10 V11 V12 V13 V14 V15 V16 V17 V18 V19 V20 V22 V06" [pre-prod-untouched]="V21" [soak]="V30 V31 V07" [prod-pre]="V40 V41 V42 V03 V06" [prod-post]="V10 V11 V12 V13 V14 V15 V16 V17 V18 V19 V20 V22 V06")
ids=(); for a in "$@"; do [[ -n ${STAGE[$a]:-} ]] && ids+=(${STAGE[$a]}) || ids+=("$a"); done
(( ${#ids[@]} )) || { echo "usage: [TARGET=prod] verify.sh <pre|post|soak|prod-pre|prod-post|Vnn...>"; exit 1; }
for id in "${ids[@]}"; do if declare -F "$id" >/dev/null; then "$id"; else r INVALID "$id" "unknown item" "-"; fi; done
(( F )) && exit 2; (( I )) && exit 1; exit 0
