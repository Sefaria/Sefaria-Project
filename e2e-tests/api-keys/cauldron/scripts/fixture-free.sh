#!/usr/bin/env bash
# shellcheck shell=bash
# shellcheck disable=SC2034  # sourced library: variables come from and go to run.sh
# Fixture-free cauldron cases: plain requests with no key or a made-up key, plus read-only
# cluster observation. Sourced by run.sh, which provides RUN_DIR, RUN_ID, rec and the lib.

GATED=/api/knn-search
UNGATED=/api/v3/texts/Genesis.1.1

status_of() { cut -f1 <<<"$1"; }
body_of() { cat "$(cut -f2 <<<"$1")"; }
body_has() { grep -qF -- "$2" "$(cut -f2 <<<"$1")"; }
headers_of() { cat "$(cut -f2 <<<"$1").h"; }
json_field() { python3 -c 'import json,sys
try: print(json.load(sys.stdin).get(sys.argv[1], ""))
except Exception: print("")' "$1"; }

random_key() { printf 'sfr_%s' "$(LC_ALL=C tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c 32)"; }

probe_a2a() {
  local key since r code www logs
  key="$(random_key)"; since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  r="$(c -H "x-api-key: $key" "$BASE$GATED")"
  code="$(body_of "$r" | json_field code)"
  www="$(headers_of "$r" | tr -d '\r' | grep -i '^www-authenticate:' | cut -d' ' -f2- || true)"
  sleep 3
  logs="$(kc logs "$AUTH_DEPLOY" --since-time="$since" 2>/dev/null || true)"
  local has_prefix=no has_full=no
  grep -q "key_prefix=${key:0:10} " <<<"$logs" && has_prefix=yes
  grep -qF "$key" <<<"$logs" && has_full=yes
  local ev; ev="GET $GATED with a random sfr_ key -> $(status_of "$r") code=$code www-authenticate='$www'; deny log line with a 10-character prefix (sfr_ and 6, as the auth service logs it): $has_prefix; full value in the log: $has_full"
  if [ "$(status_of "$r")" = 401 ] && [ "$code" = api_key_invalid ] && [ -n "$www" ] && [ "$has_prefix" = yes ] && [ "$has_full" = no ]; then
    rec A2a pass "$ev"
  else
    rec A2a "$(infra_or "$(status_of "$r")" fail-product-bug)" "$ev"
  fi
}

probe_a2b_ungated() {
  local key r line="" all=1
  key="$(random_key)"
  for p in "$UNGATED" / /static/css/s2.css; do
    r="$(c -H "x-api-key: $key" "$BASE$p")"
    line="$line $p->$(status_of "$r")($(body_of "$r" | json_field code))"
    case "$(status_of "$r")" in 200|301|302) ;; *) all=0 ;; esac
  done
  if [ $all = 1 ]; then rec "A2b-ungated" pass "unknown sfr_ key:$line"
  else rec "A2b-ungated" fail-known-gap "@known-gap D2: unknown sfr_ key on ungated paths:$line (desired 200/301/302)"; fi
}

probe_a2c() {
  local g u
  g="$(c -H 'x-api-key;' "$BASE$GATED")"; u="$(c -H 'x-api-key;' "$BASE$UNGATED")"
  local ev; ev="empty x-api-key: gated -> $(status_of "$g") $(body_of "$g" | json_field code); ungated -> $(status_of "$u")"
  if [ "$(status_of "$g")" = 401 ] && [ "$(body_of "$g" | json_field code)" = api_key_required ] && [ "$(status_of "$u")" = 200 ]; then
    rec A2c pass "$ev"; else rec A2c "$(infra_or "$(status_of "$g")" fail-product-bug)" "$ev"; fi
}

probe_na8() {
  local ev="" ok=1 r
  for h in "$HOST" "$CAULDRON.cauldron.sefaria.org" "voices.$CAULDRON.cauldron.sefaria.org"; do
    r="$(c "https://$h$GATED")"
    ev="$ev $h$GATED->$(status_of "$r") $(body_of "$r" | json_field code);"
    [ "$(status_of "$r")" = 401 ] || ok=0
  done
  r="$(c "https://$CAULDRON.cauldron.sefaria.org/texts")"
  local loc; loc="$(headers_of "$r" | tr -d '\r' | grep -i '^location:' | cut -d' ' -f2- || true)"
  ev="$ev bare /texts->$(status_of "$r") location=$loc"
  [ "$(status_of "$r")" = 301 ] || ok=0
  if [ $ok = 1 ]; then rec N-A8 pass "unkeyed half:$ev (keyed bare-host 301 needs a seeded key: blocked Q1)"
  else rec N-A8 fail-product-bug "$ev"; fi
}

probe_ncr5() {
  local ev="" any=0 r xfo csp
  for p in /settings/developer /settings/account /login; do
    r="$(c "$BASE$p")"
    xfo="$(headers_of "$r" | tr -d '\r' | grep -i '^x-frame-options:' | cut -d' ' -f2- || true)"
    csp="$(headers_of "$r" | tr -d '\r' | grep -i '^content-security-policy:' | grep -io 'frame-ancestors[^;]*' || true)"
    ev="$ev $p->$(status_of "$r") XFO='${xfo}' frame-ancestors='${csp}';"
    [ -n "$xfo$csp" ] && any=1
  done
  if [ $any = 1 ]; then rec N-CR5 pass "logged out:$ev"
  else rec N-CR5 fail-known-gap "@known-gap N-CR5: no X-Frame-Options or frame-ancestors (logged out):$ev"; fi
}

probe_b11() {
  local r ev
  r="$(c -H 'Cookie: interfaceLang=english' "$BASE/Genesis.1?lang=en")"
  local has=no; body_has "$r" 'God began to create' && has=yes
  ev="JS-off GET /Genesis.1 -> $(status_of "$r"), verse text in the server HTML=$has"
  local probes cron node
  probes="$(kc get pods -l "$WEB_SELECTOR" -o jsonpath='{.items[0].spec.containers[0].readinessProbe.httpGet.path}:{.items[0].spec.containers[0].readinessProbe.httpGet.port} {.items[0].spec.containers[0].livenessProbe.httpGet.path}:{.items[0].spec.containers[0].livenessProbe.httpGet.port}' 2>/dev/null)"
  cron="$(kc get cronjobs -o name 2>/dev/null | grep "$CAULDRON" | tr '\n' ' ')"
  node="$(kc get pods -l "$WEB_SELECTOR" -o jsonpath='{.items[0].spec.containers[0].env[?(@.name=="NODEJS_HOST")].value}' 2>/dev/null)"
  ev="$ev; web readiness/liveness httpGet $probes (kubelet to the pod, not through Envoy); SSR NODEJS_HOST=$node (in-cluster Service); cronjobs: $cron"
  if [ "$has" = yes ] && [ "$(status_of "$r")" = 200 ] && [ -n "$node" ]; then rec B11 pass "$ev"
  else rec B11 "$(infra_or "$(status_of "$r")" fail-product-bug)" "$ev"; fi
}

probe_nb4_b3() {
  local h w l
  h="$(c "$BASE/healthz")"
  rec N-B4 "$( [ "$(status_of "$h")" = 200 ] && echo pass || infra_or "$(status_of "$h")" fail-product-bug )" \
    "GET /healthz (UA down-detector shape) -> $(status_of "$h") $(body_of "$h" | head -c 160 | tr '\n' ' '); find-refs POST + async polling half not-run (R6: no POSTs to non-developer endpoints without Daniel's OK)"
  w="$(c -H 'Origin: https://site-b.example.com' "$BASE/api/websites/site-b.example.com")"
  l="$(c "$BASE/linker.v3.js")"
  local acao; acao="$(headers_of "$w" | tr -d '\r' | grep -i '^access-control-allow-origin:' | cut -d' ' -f2- || true)"
  rec B3-get-half "$( [ "$(status_of "$w")" = 200 ] && [ -n "$acao" ] && echo pass || infra_or "$(status_of "$w")" fail-product-bug )" \
    "GET /api/websites/site-b.example.com with Origin site-b -> $(status_of "$w") ACAO='$acao'; /linker.v3.js -> $(status_of "$l"). find-refs POST half not-run (R6)"
}

probe_d4() {
  # The public listing never shows fixture rows. (The test controls' mock rows are gone with the controls.) A pass
  # needs a 200, a parseable listing and a successful read-only count of the fixture rows that exist.
  local r rows fixture_rows fixture_shown
  r="$(c "$BASE/api/powered-by")"
  rows="$(body_of "$r" | python3 -c 'import json,sys
d=json.load(sys.stdin); d=d.get("projects", d) if isinstance(d, dict) else d
assert isinstance(d, list); print(len(d))' 2>/dev/null)"
  fixture_rows="$(kc_psql_ro "select count(*) from powered_by_project where notes ~ '^E2E api-keys ' or creator_email like 'apikeys-e2e-%@example.com'" 2>/dev/null)"
  if [ "$(status_of "$r")" != 200 ] || [ -z "$rows" ] || ! [[ $fixture_rows =~ ^[0-9]+$ ]]; then
    rec D-4 "$(infra_or "$(status_of "$r")" fail-harness)" "GET /api/powered-by -> $(status_of "$r"), listing rows='${rows:-unparsed}', fixture count='${fixture_rows:-query failed}'"
    return
  fi
  fixture_shown="$(grep -c 'apikeys-e2e-\|E2E api-keys' "$(cut -f2 <<<"$r")" || true)"
  local ev="GET /api/powered-by -> 200, $rows rows; fixture rows in the database=$fixture_rows, visible in the listing=$fixture_shown"
  if [ "$fixture_shown" = 0 ]; then rec D-4 pass "$ev"; else rec D-4 fail-product-bug "$ev"; fi
}

probe_nm4() {
  local a b v
  a="$(c "$BASE/settings/account")"; b="$(c "$BASE/settings/account/")"; v="$(c "https://voices.$CAULDRON.cauldron.sefaria.org/settings/account")"
  local la lb sa sb sv
  la="$(headers_of "$a" | tr -d '\r' | grep -i '^location:' | cut -d' ' -f2- || true)"
  lb="$(headers_of "$b" | tr -d '\r' | grep -i '^location:' | cut -d' ' -f2- || true)"
  sa="$(status_of "$a")"; sb="$(status_of "$b")"; sv="$(status_of "$v")"
  local ev; ev="logged out: /settings/account -> $sa $la; /settings/account/ -> $sb $lb; voices /settings/account -> $sv"
  # The page is @login_required: a logged-out request is redirected (302) to the login page, with or without the
  # trailing slash, and Voices has no account page (404). Any other status, 000 and 5xx included, is a failure.
  local ok=1 s
  for s in "$sa" "$sb" "$sv"; do [[ $s =~ ^(000|5[0-9][0-9])$ ]] && ok=0; done
  if [ "$ok" = 0 ]; then rec N-M4 fail-harness "no answer or a 5xx (000/502/503/504 included): $ev"; return; fi
  if [ "$sv" = 404 ] && [ "$sa" = 302 ] && [ "$sb" = 302 ] \
     && [[ $la == */login* ]] && [[ $lb == */login* ]]; then
    rec N-M4 pass "partial (logged-out half): $ev. SSR content check with a session: blocked (Q1)"
  else rec N-M4 fail-product-bug "want 302 to /login for both account URLs and 404 on Voices: $ev"; fi
}

probe_b8_strapi() {
  local r
  r="$(c -X POST -H "Authorization: Basic $(printf 'e2e:wrong' | base64)" -H 'Content-Type: application/json' --data '{}' "$BASE/api/strapi/cache-invalidate")"
  local ev; ev="Strapi cache-invalidate, wrong Basic, sent once -> $(status_of "$r") '$(body_of "$r" | head -c 80 | tr '\n' ' ')' gateway code='$(body_of "$r" | json_field code)'"
  if [ "$(status_of "$r")" = 401 ] && [ -z "$(body_of "$r" | json_field code)" ]; then
    rec B8-strapi pass "$ev. Formstack half blocked (Q1: its safety net is the seeded teardown)"
  else rec B8-strapi "$(infra_or "$(status_of "$r")" fail-product-bug)" "$ev"; fi
}

probe_ne1() {
  sleep 5
  local lines; lines="$(kc logs -l "$NGINX_SELECTOR" --since=20m --tail=-1 2>/dev/null | grep -F "$UA_TAG/$RUN_ID" | mask || true)"
  local n; n="$(printf '%s\n' "$lines" | grep -c . || true)"
  printf '%s\n' "$lines" | head -20 | sed -E 's/"(remoteIp|remote_addr|realIp|clientIp|xForwardedFor)": *"[^"]*"/"\1": "<ip>"/g' > "$RUN_DIR/nginx-sample.log"
  local tier proj res cls
  tier="$(printf '%s' "$lines" | grep -c 'sefariaTier' || true)"
  proj="$(printf '%s' "$lines" | grep -c 'sefariaProject' || true)"
  res="$(printf '%s' "$lines" | grep -c 'sefariaAuthResult' || true)"
  cls="$(printf '%s' "$lines" | grep -c 'apiClassification' || true)"
  local ev="nginx lines from this run's UA=$n; with sefariaTier=$tier sefariaProject=$proj sefariaAuthResult=$res apiClassification=$cls (sample: results nginx-sample.log)"
  if [ "$n" -gt 0 ] && [ "$tier" -gt 0 ] && [ "$proj" -gt 0 ] && [ "$res" -gt 0 ]; then rec N-E1 pass "$ev"
  elif [ "$n" = 0 ]; then rec N-E1 blocked "$ev: no log lines found for the run"
  else rec N-E1 fail-known-gap "@known-gap D4: $ev"; fi
}

probe_ne4() {
  local dp; dp="$(kc_psql_ro '\dp api_project' | tr '\n' ' ')"
  local reader; reader="$(printf '%s' "$dp" | grep -o 'auth_service_reader=r/[a-z_]*' | head -3 | tr '\n' ' ')"
  local col; col="$(printf '%s' "$dp" | grep -oE 'deleted_at:[^|]*auth_service_reader=r' | head -1 || true)"
  local tier_col; tier_col="$(printf '%s' "$dp" | grep -oE 'tier_id:[^|]*auth_service_reader=r' | head -1 || true)"
  local tm; tm="$(kc_psql_ro '\dp api_tier_meter_limit' | tr '\n' ' ')"
  local tm_col; tm_col="$(printf '%s' "$tm" | grep -oE 'monthly_per_project:[^|]*auth_service_reader=r' | head -1 || true)"
  local loads; loads="$(kc logs "$AUTH_DEPLOY" --since=24h 2>/dev/null | grep -cE 'reload (failed|error)|permission denied' || true)"
  if [ -n "$col" ] && [ -n "$tier_col" ] && [ -n "$tm_col" ]; then
    rec N-E4 pass "cauldron half (read-only): \\dp api_project shows deleted_at and tier_id column grants for auth_service_reader ('$(printf '%s' "$col" | head -c 120)'); \\dp api_tier_meter_limit shows a monthly_per_project column grant ('$(printf '%s' "$tm_col" | head -c 120)'); reload errors in auth log (24h)=$loads. The failure-visibility half is local (D11 ne4-grant.sh)"
  else
    rec N-E4 fail-product-bug "reader column grants missing: deleted_at on api_project='${col:-none}', tier_id on api_project='${tier_col:-none}', monthly_per_project on api_tier_meter_limit='${tm_col:-none}'; reader grants: $reader"
  fi
}

probe_e1() {
  kc_port_forward || { rec E1 blocked "port-forward to $AUTH_SVC did not come up"; return; }
  local reg met rows
  reg="$(curl -s -m 10 "http://127.0.0.1:$PF_PORT/internal/registry" | python3 -c 'import json,sys
d=json.load(sys.stdin); print(json.dumps({k: d.get(k) for k in ("len","version","loaded_at","mode")}))' 2>/dev/null || echo '{}')"
  met="$(curl -s -m 10 "http://127.0.0.1:$PF_PORT/metrics" | grep -E '^authsvc_(reload|registry|notify|decisions)' | mask | head -12 | tr '\n' ' ')"
  # The loader's own join (internal/registry/pgload.go): keys of live and soft-deleted API projects, revoked included.
  rows="$(kc_psql_ro 'select count(*) from powered_by_apikey k join api_project p on p.id = k.project_id join api_tier t on t.id = p.tier_id')"
  printf '%s\n' "$reg" > "$RUN_DIR/registry.json"
  printf '%s\n' "$met" > "$RUN_DIR/metrics-registry.txt"
  local len; len="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("len"))' "$reg" 2>/dev/null)"
  local ev="/internal/registry $reg; load-query rows (read-only psql)=$rows; metrics: $met"
  if [ -n "$len" ] && [ "$len" = "$rows" ]; then
    rec E1 pass "observation half: $ev. After-restart and after-NOTIFY halves not-run on the cauldron (restart DENY; NOTIFY needs a seeded write, blocked Q1); covered locally by D11 e1-registry.sh"
  else rec E1 fail-product-bug "registry len != load-query rows: $ev"; fi
  kill "$PF_PID" 2>/dev/null; wait "$PF_PID" 2>/dev/null; PF_PID=""
}

probe_e2() {
  local mode; mode="$(kc logs "$AUTH_DEPLOY" --since=24h 2>/dev/null | grep -oE 'mode=[a-z]+' | sort | uniq -c | tr '\n' ' ')"
  rec E2 not-run "observe mode can only be shown by changing AUTH_MODE (a cluster edit: G3). Observation only: auth log modes over 24h: $mode. Covered locally (D11 e2-observe.sh)"
}
