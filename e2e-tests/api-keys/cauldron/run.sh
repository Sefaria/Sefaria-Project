#!/usr/bin/env bash
# Cauldron runner for the api-keys suites, fixture-free. Read SAFETY.md first; this script prints it.
#
#   run.sh free    preflight, warm-up, read-only snapshot, fixture-free probes and Playwright cases,
#                  api-tests (GET-only subset), snapshot again. Writes nothing to the cluster.
#   run.sh check   the G1 self-check only.
#
# Seeding the cauldron is not part of this runner: see SAFETY.md "Seeded runs".
# Results go to e2e-tests/api-keys/results/cauldron-runs/<runId>/ (Playwright empties results/cauldron/ itself) (git-ignored). cases.tsv there holds
# one line per case: id, status, evidence. Every line is masked before it is written.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
source "$HERE/scripts/fixture-free.sh"

MODE="${1:-}"
case "$MODE" in free|check) ;; *) die "usage: run.sh free|check" ;; esac

g1_check "$HERE/run.sh" "$HERE/lib.sh" "$HERE"/scripts/*.sh "$REPO/auth-service/dev/local-stack/scenarios/a-series.sh"
[ "$MODE" = check ] && { log "G1 check passed"; exit 0; }

cat "$HERE/SAFETY.md" >&2

RUN_ID="${APIKEYS_RUN_ID:-$(date -u +%Y%m%dT%H%MZ)-cauldron}"
RUN_DIR="$REPO/e2e-tests/api-keys/results/cauldron-runs/$RUN_ID"
mkdir -p "$RUN_DIR"; chmod 700 "$RUN_DIR"
git -C "$REPO" check-ignore -q "$RUN_DIR" || die "$RUN_DIR is not git-ignored"
CASES="$RUN_DIR/cases.tsv"; : > "$CASES"
MANIFEST_REL=e2e-tests/.apikeys-e2e-cauldron.json
MANIFEST="$REPO/$MANIFEST_REL"
PF_PID=""
AUTH_POD_START=""

rec() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" | mask >> "$CASES"; printf '%-14s %-16s %s\n' "$1" "$2" "$3" | mask >&2; }
infra_or() { case "$1" in 000|502|503|504) echo blocked ;; *) echo "$2" ;; esac; }

cleanup() {
  local rc=$?
  [ -n "$PF_PID" ] && kill "$PF_PID" 2>/dev/null
  rm -f "$MANIFEST" "$RUN_DIR"/tmp.*
  exit $rc
}
trap cleanup EXIT INT TERM

auth_pod_state() {
  kc get pods -o custom-columns=N:.metadata.name,R:.status.containerStatuses[0].restartCount,S:.status.startTime --no-headers \
    | grep apikeys-pipeline-auth-service | tr -s ' ' | tr '\n' ';'
}

# --- preflight (N-E6) ---------------------------------------------------------------------------
preflight() {
  local merge short imgs sefaria bad hr authlog
  merge="$(gh api repos/Sefaria/Sefaria-Project/pulls/3798 -q .merge_commit_sha)" || die "gh api failed"
  short="${merge:0:7}"
  imgs="$(kc get pods -l deployEnv=apikeys-pipeline --field-selector=status.phase=Running \
    -o jsonpath='{range .items[*]}{.metadata.name}{" "}{range .spec.containers[*]}{.image}{" "}{end}{"\n"}{end}')"
  printf '%s\n' "$imgs" > "$RUN_DIR/images.txt"
  sefaria="$(printf '%s\n' "$imgs" | grep -oE 'sefaria-[a-z0-9-]+:sha-[0-9a-f]+' | sort -u)"
  [ "$(printf '%s\n' "$sefaria" | grep -c .)" -ge 4 ] || die "fewer than 4 distinct sefaria images found: $sefaria"
  bad="$(printf '%s\n' "$sefaria" | grep -v ":sha-$short\$" || true)"
  [ -z "$bad" ] || die "pin is stale or moved (merge sha $short): $bad. Do not bump; report it."
  hr="$(kc get helmrelease apikeys-pipeline -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')"
  [ "$hr" = True ] || die "HelmRelease Ready=$hr"
  authlog="$(kc logs "$AUTH_DEPLOY" 2>/dev/null | grep -oE 'registry loaded keys=[0-9]+.{0,60}' | tail -1)"
  [ -n "$authlog" ] || die "auth service log has no 'registry loaded keys='"
  AUTH_POD_START="$(auth_pod_state)"
  rec N-E6 pass "images: $(printf '%s ' $sefaria)= merge_commit_sha $short; HelmRelease Ready=True; auth log '$authlog'"
}

# --- warm-up --------------------------------------------------------------------------------------
warmup() {
  local deadline=$(( $(date +%s) + 1200 )) s last
  while :; do
    s="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -A "$UA_TAG/$RUN_ID" "$BASE/api/texts/Genesis.1.1" || echo 000)"
    [ "$s" = 200 ] && break
    [ "$(date +%s)" -gt "$deadline" ] && die "warm-up: no 200 within 20 min (last $s)"
    log "warm-up: $s"; sleep 15
  done
  # A web pod that restarted in the last 5 minutes is still settling (Redis cold start).
  for _ in $(seq 1 20); do
    last="$(kc get pods -l "$WEB_SELECTOR" -o jsonpath='{.items[*].status.containerStatuses[*].lastState.terminated.finishedAt}' | tr ' ' '\n' | sort | tail -1)"
    [ -z "$last" ] && break
    python3 -c 'import sys,datetime as d; t=d.datetime.fromisoformat(sys.argv[1].replace("Z","+00:00")); sys.exit(0 if (d.datetime.now(d.timezone.utc)-t).total_seconds()>300 else 1)' "$last" && break
    log "web pod restarted at $last; waiting"; sleep 30
  done
  log "warm: Genesis.1.1 200"
}

# --- snapshot (N-D1) ------------------------------------------------------------------------------
SNAP_SQL="select 'keys', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from powered_by_apikey
union all select 'projects', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from powered_by_project
union all select 'band_users', count(*), '' from auth_user where id between $ID_LO and $ID_HI
union all select 'marker_projects', count(*), '' from powered_by_project where notes ~ '^E2E api-keys \\S+ \\(temporary\\)\$'
union all select 'fixture_email_projects', count(*), '' from powered_by_project where creator_email like 'apikeys-e2e-%@example.com'
union all select 'fixture_email_users', count(*), '' from auth_user where email like 'apikeys-e2e-%'
union all select 'band_owned_projects', count(*), '' from powered_by_project where owner_id between $ID_LO and $ID_HI
union all select 'mock_rows', count(*), '' from powered_by_project where notes = 'Created by the developer settings test controls.'
union all select 'limits', count(*), md5(coalesce(string_agg(project_id::text || ':' || tier, ',' order by project_id), '')) from powered_by_projectlimits"

snapshot() {
  kc_psql_ro "$SNAP_SQL" > "$RUN_DIR/snapshot-$1.txt" || die "snapshot $1 failed"
  log "snapshot $1: $(tr '\n' ' ' < "$RUN_DIR/snapshot-$1.txt" | sed -E 's/\|[0-9a-f]{32}/|<md5>/g')"
}
snap_val() { grep "^$2|" "$RUN_DIR/snapshot-$1.txt" | cut -d'|' -f2; }
snap_sum() { grep "^$2|" "$RUN_DIR/snapshot-$1.txt" | cut -d'|' -f3; }
fixture_counts_zero() {
  local f; for f in band_users marker_projects fixture_email_projects fixture_email_users band_owned_projects; do
    [ "$(snap_val "$1" "$f")" = 0 ] || return 1; done
}

# --- Playwright, fixture-free selection -----------------------------------------------------------
FREE_GREP='(A4a: |A4b: |A5b: |A6a: |A6c: |N-CR9: |N-CR10: |N-A2: |B1: logged out|C8 control|A8: a gateway denial|N-A4: |B6: sefaria-mcp|N-B2: )'
FREE_FILES="e2e-tests/api-keys/_smoke.spec.ts e2e-tests/api-keys/gateway/decisions.spec.ts e2e-tests/api-keys/gateway/paths.spec.ts e2e-tests/api-keys/gateway/cauldron-only.spec.ts e2e-tests/api-keys/callers/website-smoke.spec.ts e2e-tests/api-keys/callers/browser-key-cors.spec.ts e2e-tests/api-keys/callers/replays.spec.ts"

write_empty_manifest() {
  git -C "$REPO" check-ignore -q "$MANIFEST_REL" || die "$MANIFEST_REL is not git-ignored"
  ( umask 077; python3 -c 'import json,sys,datetime
print(json.dumps({"schemaVersion":1,"target":"cauldron","baseURL":sys.argv[1],"runId":sys.argv[2],
 "marker":"(fixture-free run: nothing seeded)","createdAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "passwordFile":"","accounts":[],"projects":[],"keys":[],"legacyKeys":[]}, indent=1))' "$BASE" "$RUN_ID" > "$MANIFEST" )
}

playwright_run() {  # $1 label, rest: extra args. --no-deps: the setup project would wipe the local suites' .auth/.
  local label="$1"; shift
  ( cd "$REPO" && env -u APIKEYS_TRACE APIKEYS_TARGET=cauldron APIKEYS_MANIFEST="$MANIFEST_REL" APIKEYS_RUN_ID="$RUN_ID" \
      PLAYWRIGHT_JSON_OUTPUT_NAME="$RUN_DIR/playwright-$label.json" \
      npx playwright test --project=apikeys --no-deps --workers=2 --reporter=list,json "$@" ) 2>&1 | mask > "$RUN_DIR/playwright-$label.log"
  local rc=${PIPESTATUS[0]}
  python3 - "$RUN_DIR/playwright-$label.json" "$RUN_DIR/playwright-$label.tsv" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
rows = []
def walk(suite):
    for s in suite.get("suites", []): walk(s)
    for spec in suite.get("specs", []):
        for t in spec.get("tests", []):
            res = t.get("results", [])
            last = res[-1] if res else {}
            err = (last.get("error") or {}).get("message", "") if last else ""
            ann = "; ".join(a.get("description", "") for a in t.get("annotations", []) if a.get("description"))
            rows.append((spec.get("file", ""), spec.get("line", 0), spec["title"], t.get("status"), last.get("status", ""),
                         len(res), err.splitlines()[0][:300] if err else "", ann[:400]))
for s in data.get("suites", []): walk(s)
with open(sys.argv[2], "w") as f:
    for r in rows: f.write("\t".join(str(x) for x in r) + "\n")
PY
  mask < "$RUN_DIR/playwright-$label.json" > "$RUN_DIR/playwright-$label.json.m" && mv "$RUN_DIR/playwright-$label.json.m" "$RUN_DIR/playwright-$label.json"
  mask < "$RUN_DIR/playwright-$label.tsv" > "$RUN_DIR/playwright-$label.tsv.m" && mv "$RUN_DIR/playwright-$label.tsv.m" "$RUN_DIR/playwright-$label.tsv"
  log "playwright $label exit $rc: $(cut -f5 "$RUN_DIR/playwright-$label.tsv" | sort | uniq -c | tr '\n' ' ')"
}

# --- api-tests (N-B3), GET-only subset ------------------------------------------------------------
api_tests() {
  ( cd "$REPO/api-tests" && API_BASE_URL="$BASE" python3 -m pytest -q -p no:cacheprovider -p no:django -c /dev/null --rootdir . \
      -k 'not register and not create_sheet and not login_refresh' . ) 2>&1 | mask > "$RUN_DIR/api-tests.log"
  local summary; summary="$(grep -E '(passed|failed|error)' "$RUN_DIR/api-tests.log" | tail -1)"
  if grep -qE '[0-9]+ (failed|error)' <<<"$summary"; then
    rec N-B3 fail-product-bug "api-tests GET-only subset on the cauldron: $summary; see api-tests.log"
  else
    rec N-B3 pass "api-tests GET-only subset (3 POST tests deselected: register, create_sheet, login_refresh; sequential) on the cauldron: $summary. Staging comparison not run (cauldron-only host rule)"
  fi
}

# --- main -----------------------------------------------------------------------------------------
log "run $RUN_ID ($MODE) against $BASE, context $KCTX"
preflight
warmup
snapshot before
fixture_counts_zero before || die "fixture band, marker or fixture-email rows exist before the run; not touching rows this run did not create"
log "baseline keys=$(snap_val before keys) projects=$(snap_val before projects) mock_rows=$(snap_val before mock_rows)"

write_empty_manifest
playwright_run free --grep "$FREE_GREP" --grep-invert '(N-A8|logged in|SMOKE-1)' $FREE_FILES

probe_a2a; probe_a2b_ungated; probe_a2c; probe_na8; probe_ncr5; probe_b11; probe_nb4_b3
probe_d4; probe_nm4; probe_b8_strapi; probe_ne4; probe_e1; probe_e2
api_tests
probe_ne1

AUTH_POD_END="$(auth_pod_state)"
if [ "$AUTH_POD_START" = "$AUTH_POD_END" ]; then
  rec F1-passive not-run "no preemption or restart of the auth pod during the run ($AUTH_POD_END); the drill is DENIED on the cauldron and runs locally (D11 f1-stop.sh)"
else
  rec F1-passive pass "auth pod changed during the run: before '$AUTH_POD_START' after '$AUTH_POD_END'; see the Playwright and probe evidence from that window"
fi

snapshot after
if fixture_counts_zero after && [ "$(snap_sum before keys)" = "$(snap_sum after keys)" ] && [ "$(snap_sum before projects)" = "$(snap_sum after projects)" ]; then
  rec N-D1 pass "read-only snapshot before/after: keys $(snap_val after keys) projects $(snap_val after projects) mock_rows $(snap_val after mock_rows); id checksums unchanged; band, marker and fixture-email counts 0"
else
  rec N-D1 fail-product-bug "snapshot changed: before $(tr '\n' ' ' < "$RUN_DIR/snapshot-before.txt") after $(tr '\n' ' ' < "$RUN_DIR/snapshot-after.txt")"
fi

hits="$(grep -rEl 'sfr_[A-Za-z0-9]{5,}' "$RUN_DIR" || true)"
[ -z "$hits" ] || { rec N-CR4-harness fail-product-bug "unmasked key-shaped values in: $hits"; exit 1; }
log "N-CR4 grep over $RUN_DIR: clean"
log "done: $CASES"
