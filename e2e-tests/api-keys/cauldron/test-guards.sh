#!/usr/bin/env bash
# e2e-tests/api-keys/cauldron/test-guards.sh — the runner's go-ahead guards hold before any cluster call. A fake kubectl
# and gh record every call; a guarded mode run without its go-ahead must stop with no call recorded. No cluster needed.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for tool in kubectl gh; do
  printf '#!/usr/bin/env bash\necho "%s $*" >>"%s/calls"\nexit 1\n' "$tool" "$tmp" >"$tmp/$tool"
  chmod +x "$tmp/$tool"
done
# expect_refusal LABEL ENV... -- ARGS: the run must exit non-zero, print STOP, and make no cluster call.
expect_refusal() {
  local label=$1; shift
  local envs=()
  while [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  : >"$tmp/calls"
  env -u APIKEYS_ALLOW_SEEDING -u APIKEYS_ALLOW_MUTATING_ON PATH="$tmp:$PATH" ${envs[@]+"${envs[@]}"} bash "$here/run.sh" "$@" >"$tmp/out" 2>&1
  local rc=$?
  if [ $rc != 0 ] && grep -q STOP "$tmp/out" && [ ! -s "$tmp/calls" ]; then echo "ok: $label"
  else echo "FAIL: $label (exit $rc, calls: $(tr '\n' ';' <"$tmp/calls"))"; sed 's/^/    /' "$tmp/out" | tail -5; fail=1; fi
}
expect_refusal "seeded without APIKEYS_ALLOW_SEEDING" APIKEYS_CAULDRON=apisplit -- seeded
expect_refusal "seeded with a go-ahead for another cauldron" APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_SEEDING=other -- seeded
expect_refusal "seeded on a shared cauldron, even with a go-ahead" APIKEYS_CAULDRON=authpoc APIKEYS_ALLOW_SEEDING=authpoc -- seeded
expect_refusal "seeded without a password file" APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_SEEDING=apisplit APIKEYS_E2E_PASSWORD_FILE=/nonexistent -- seeded
expect_refusal "drill-f1 without APIKEYS_ALLOW_MUTATING_ON" APIKEYS_CAULDRON=apisplit -- drill-f1
expect_refusal "drill-f1 with a go-ahead for another cauldron" APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_MUTATING_ON=other -- drill-f1
expect_refusal "a kube context other than the dev cluster" APIKEYS_KUBE_CONTEXT=gke_production -- free
expect_refusal "an unknown mode" -- bogus
# Writes stay behind the guards: outside modes.sh's two guarded functions, no runner line names a write verb.
if grep -nE 'kubectl[^|]*\b(apply|patch|delete|edit|replace|annotate|label|create|rollout|cordon|drain)\b' "$here/run.sh" "$here/lib.sh" "$here"/scripts/*.sh; then
  echo "FAIL: a cluster write verb appears in the runner"; fail=1
else echo "ok: no apply/patch/delete/edit/create/rollout in the runner"; fi
scales="$(grep -hE 'kubectl .* scale ' "$here"/scripts/*.sh "$here/run.sh" "$here/lib.sh" | grep -vc 'log "' || true)"
[ "$scales" = 2 ] && echo "ok: the only scale calls are drill-f1's scale-down and its restore" || { echo "FAIL: $scales scale calls"; fail=1; }
execs="$(grep -nE 'kubectl .* exec ' "$here"/scripts/*.sh "$here/run.sh" "$here/lib.sh" | grep -vc 'postgres\|PG_POD\|seed_exec\|"\$pod" -c web' || true)"
[ "$execs" = 0 ] && echo "ok: exec only into Postgres (read-only) and the seeder's web pod" || { echo "FAIL: other exec calls"; fail=1; }
# N-CR4: the key scan runs on every mode's exit path. The runner is copied into a scratch git repo with the three modes'
# bodies replaced by no-ops, and a run dir is pre-seeded with a file; a full key must fail the run in each mode, a
# display prefix ("sfr_" plus 6 characters, then bullets) must not, and the mode's own exit status is kept otherwise.
leak="$tmp/leakrepo"; mkdir -p "$leak/e2e-tests/api-keys" "$leak/auth-service/dev/local-stack/scenarios"
cp -R "$here" "$leak/e2e-tests/api-keys/cauldron"
touch "$leak/auth-service/dev/local-stack/scenarios/a-series.sh"
printf 'results/\n' >"$leak/e2e-tests/api-keys/.gitignore"; printf 'e2e-tests/api-keys/results/\n' >"$leak/.gitignore"
git -C "$leak" init -q
printf '\nseeded_guard() { :; }\nseeded_run() { :; }\nverify_off() { :; }\ndrill_f1() { :; }\n' >>"$leak/e2e-tests/api-keys/cauldron/scripts/modes.sh"
expect_scan() {  # expect_scan MODE CONTENT WANT_EXIT
  local mode=$1 content=$2 want=$3 rundir="$leak/e2e-tests/api-keys/results/cauldron-runs/leak-$1"
  rm -rf "$rundir"; mkdir -p "$rundir"; printf '%s\n' "$content" >"$rundir/evidence.log"
  env PATH="$tmp:$PATH" APIKEYS_CAULDRON=apisplit APIKEYS_ALLOW_MUTATING_ON=apisplit APIKEYS_ALLOW_SEEDING=apisplit APIKEYS_RUN_ID="leak-$mode" \
    bash "$leak/e2e-tests/api-keys/cauldron/run.sh" "$mode" >"$tmp/out" 2>&1
  local rc=$?
  if [ "$rc" = "$want" ] && { [ "$want" = 0 ] || grep -q 'N-CR4-harness' "$tmp/out"; }; then echo "ok: key scan, $mode, exit $rc"
  else echo "FAIL: key scan, $mode: exit $rc, wanted $want"; sed 's/^/    /' "$tmp/out" | tail -6; fail=1; fi
}
for mode in seeded verify-off drill-f1; do
  expect_scan "$mode" "header sfr_AbCdEf0123456789AbCdEf0123456789" 1
  expect_scan "$mode" "shown as sfr_abcdef••••••••" 0
done
# Probe verdicts (N-M4, F5-passive, E4-log): each probe is run against stubbed curl/kubectl answers and must record
# fail for 000, 502 or an empty log and pass for the right answer. PROBE_SRC (default: this checkout) names the
# cauldron directory to test, so the same cases can be pointed at an older copy of the scripts.
src="${PROBE_SRC:-$here}"
run_probe() {  # run_probe FUNCTION ENV... -> the probe's "REC id status" lines
  local fn=$1; shift
  # shellcheck disable=SC2016  # the script is meant to be single-quoted: it runs in the child shell
  env FAKE_MODE=enforce "$@" bash -c '
    set -u
    src=$1; fn=$2; tmp=$3
    BASE=https://www.x.cauldron.sefaria.org; CAULDRON=x; RUN_DIR=$tmp/run; RUN_ID=r1; UA_TAG=ua; NGINX_SELECTOR=app=nginx-x; AUTH_DEPLOY=deploy/x
    mkdir -p "$RUN_DIR"
    rec() { echo "REC $1 $2"; }
    infra_or() { case "$1" in 000|502|503|504) echo blocked ;; *) echo "$2" ;; esac; }
    log() { :; }
    sleep() { :; }
    mask() { cat; }
    die() { echo "DIE $*"; exit 1; }
    kc_port_forward() { return 1; }
    # curl stub: answers by path from FAKE_GATED / FAKE_UNGATED (status), FAKE_GATED_CODE (JSON code of the gated body),
    # FAKE_ACCOUNT / FAKE_ACCOUNT_LOC (the account page), FAKE_VOICES.
    fake_answer() {  # fake_answer URL -> "status|body|location"
      case "$1" in
        *voices*) echo "${FAKE_VOICES:-404}||" ;;
        */settings/account*) echo "${FAKE_ACCOUNT:-302}||${FAKE_ACCOUNT_LOC:-https://www.x.cauldron.sefaria.org/login?next=/settings/account}" ;;
        */api/knn-search) echo "${FAKE_GATED:-401}|{\"code\":\"${FAKE_GATED_CODE:-api_key_required}\"}|" ;;
        *) echo "${FAKE_UNGATED:-200}||" ;;
      esac
    }
    curl() {
      local out="" hdr="" url="" a
      while [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift ;; -D) hdr=$2; shift ;; -A|-m|-w|-H) shift ;; -*) ;; *) url=$1 ;; esac; shift; done
      local ans status body loc; ans="$(fake_answer "$url")"; status=${ans%%|*}; ans=${ans#*|}; body=${ans%%|*}; loc=${ans#*|}
      [ -n "$out" ] && printf "%s" "$body" >"$out"
      [ -n "$hdr" ] && { [ -n "$loc" ] && printf "HTTP/2 %s\r\nlocation: %s\r\n" "$status" "$loc" >"$hdr" || printf "HTTP/2 %s\r\n" "$status" >"$hdr"; }
      printf "%s %s" "$status" "0.010"
    }
    kc() {
      case "$*" in
        *"get helmrelease"*) echo "$FAKE_MODE" ;;
        *"get securitypolicy"*|*"get deploy"*) echo "NotFound" ;;
        *"logs "*) [ -n "${FAKE_LOGS:-}" ] || return 1; printf "%s\n" "$FAKE_LOGS" ;;
      esac
    }
    # c is replaced by the lib one: it calls curl, which is stubbed above.
    c() { local out; out="$(mktemp "$RUN_DIR/tmp.XXXXXX")"; local code; code="$(curl -o "$out" -D "$out.h" "${@: -1}" | cut -d" " -f1)"; printf "%s\t%s\n" "$code" "$out"; }
    source "$src/scripts/fixture-free.sh"; source "$src/scripts/modes.sh"
    "$fn"' _ "$src" "$fn" "$tmp" 2>/dev/null
}
expect_rec() {  # expect_rec LABEL ID WANT(pass|fail) FUNCTION ENV...
  local label=$1 id=$2 want=$3 fn=$4; shift 4
  local got; got="$(run_probe "$fn" "$@" | awk -v id="$id" '$1 == "REC" && $2 == id {print $3; exit}')"
  if { [ "$want" = pass ] && [ "$got" = pass ]; } || { [ "$want" = fail ] && [[ $got == fail* ]]; }; then echo "ok: $label ($id -> $got)"
  else echo "FAIL: $label ($id -> '${got:-no record}', wanted $want)"; fail=1; fi
}
expect_rec "N-M4: logged-out 302 to /login on both URLs and 404 on Voices passes" N-M4 pass probe_nm4
expect_rec "N-M4: 000 on the account page fails" N-M4 fail probe_nm4 FAKE_ACCOUNT=000
expect_rec "N-M4: 502 on the account page fails" N-M4 fail probe_nm4 FAKE_ACCOUNT=502
expect_rec "N-M4: 503 on Voices fails" N-M4 fail probe_nm4 FAKE_VOICES=503
expect_rec "N-M4: 404 on the account page fails" N-M4 fail probe_nm4 FAKE_ACCOUNT=404
expect_rec "N-M4: 401 on the account page fails" N-M4 fail probe_nm4 FAKE_ACCOUNT=401
expect_rec "N-M4: a 302 that does not go to /login fails" N-M4 fail probe_nm4 FAKE_ACCOUNT_LOC=https://www.x.cauldron.sefaria.org/texts
expect_rec "F5-passive: enforce, gated 401 api_key_required and ungated 200 passes" F5-passive pass probe_f5_passive
expect_rec "F5-passive: every answer 000 fails" F5-passive fail probe_f5_passive FAKE_GATED=000 FAKE_UNGATED=000
expect_rec "F5-passive: every answer 502 fails" F5-passive fail probe_f5_passive FAKE_GATED=502 FAKE_UNGATED=502
expect_rec "F5-passive: ungated 502 alone fails" F5-passive fail probe_f5_passive FAKE_UNGATED=502
expect_rec "F5-passive: ungated 404 fails" F5-passive fail probe_f5_passive FAKE_UNGATED=404
expect_rec "F5-passive: enforce, gated 200 (gate not denying) fails" F5-passive fail probe_f5_passive FAKE_GATED=200 FAKE_GATED_CODE=none
expect_rec "F5-passive: enforce, gated 401 without the gateway code fails" F5-passive fail probe_f5_passive FAKE_GATED_CODE=other
expect_rec "F5-passive: observe, gated 200 passes" F5-passive pass probe_f5_passive FAKE_MODE=observe FAKE_GATED=200 FAKE_GATED_CODE=none
expect_rec "F5-passive: observe, a gateway denial fails" F5-passive fail probe_f5_passive FAKE_MODE=observe
expect_rec "E4-log: an empty log fails" E4-log fail verify_off
expect_rec "E4-log: lines for the run without x-sefaria fields pass" E4-log pass verify_off FAKE_LOGS='ua/r1 GET /api/knn-search 200'
expect_rec "E4-log: lines that carry sefariaTier fail" E4-log fail verify_off FAKE_LOGS='ua/r1 sefariaTier=partner'
expect_rec "E4-log: lines from another run count as empty" E4-log fail verify_off FAKE_LOGS='other-agent GET / 200'

bash "$here/run.sh" check >/dev/null 2>&1 && echo "ok: G1 self-check (every cluster call names the dev context)" || { echo "FAIL: G1 self-check"; fail=1; }
exit $fail
