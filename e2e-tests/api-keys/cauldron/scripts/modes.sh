# shellcheck shell=bash
# The cauldron runner's modes beyond the fixture-free probes. Sourced by run.sh after lib.sh and fixture-free.sh.
#
#   free additions   the A-series (unkeyed) in the cauldron's own auth mode, and a passive latency sample (F5)
#   seeded           the seeded flow of SAFETY.md "Seeded runs"; refuses unless APIKEYS_ALLOW_SEEDING=<cauldron>
#   verify-off       read-only proof that the gate is off (E4), to run after authService.enabled=false is applied
#   drill-f1         F1 on the cauldron: the auth service scaled to 0 and back while a probe loops at 1 request/s;
#                    refuses unless APIKEYS_ALLOW_MUTATING_ON=<cauldron> (the owner's go-ahead, SAFETY.md)
#
# Every cluster call carries --context (g1_check). The only writes are behind those two guards: the seeder's ORM
# writes in a web pod (seeded) and one scale of the auth-service Deployment with its restore (drill-f1).

SHARED_CAULDRONS=" apikeys-pipeline authpoc api-keys-poc "

# The auth mode the cauldron runs, from its HelmRelease values (read-only).
cauldron_auth_mode() {
  local m; m="$(kc get helmrelease "$CAULDRON" -o jsonpath='{.spec.values.authService.mode}' 2>/dev/null)"
  echo "${m:-enforce}"
}

# A-series against the cauldron. Unkeyed checks only unless the manifest was seeded for the cauldron.
probe_aseries() {  # probe_aseries [MANIFEST]: keyed checks only with a manifest seeded for the cauldron
  local mode log="$RUN_DIR/a-series.log"
  # Without one, point at a file that does not exist, so the A-series stays unkeyed (the free run's empty manifest
  # names the cauldron as its target but holds no keys).
  local manifest="${1:-$RUN_DIR/no-manifest-unkeyed.json}"
  mode="$(cauldron_auth_mode)"
  APIKEYS_CAULDRON="$CAULDRON" APIKEYS_MANIFEST="$manifest" \
    bash "$REPO/auth-service/dev/local-stack/scenarios/a-series.sh" --target cauldron --mode "$mode" 2>&1 | mask >"$log"
  local rc=${PIPESTATUS[0]}
  local counts; counts="$(awk '{print $2}' "$log" | sort | uniq -c | tr -s ' ' | tr '\n' ' ')"
  if [ "$rc" = 0 ]; then rec A-series pass "mode $mode: $counts(a-series.log)"
  else rec A-series fail-product-bug "mode $mode, $rc FAIL line(s): $counts; first: $(grep -m1 ' FAIL ' "$log" | cut -c1-200)"; fi
}

# F5 passive: sequential requests at 2 per second (no load), gated without a key (answered by ext_authz) and ungated
# (through the route), and the auth service's own decision latency from /metrics through the port-forward.
probe_f5_passive() {
  local i out gated=() ungated=()
  for i in $(seq 1 20); do
    out="$(curl -s -o /dev/null -m 10 -w '%{http_code} %{time_starttransfer}' -A "$UA_TAG/$RUN_ID" "$BASE/api/knn-search")"
    gated+=("$out"); sleep 0.5
    out="$(curl -s -o /dev/null -m 20 -w '%{http_code} %{time_starttransfer}' -A "$UA_TAG/$RUN_ID" "$BASE/api/v3/texts/Genesis.1.1")"
    ungated+=("$out"); sleep 0.5
  done
  local stats
  stats="$(python3 - "${gated[@]}" -- "${ungated[@]}" <<'PY'
import sys
args = sys.argv[1:]
cut = args.index("--")
def summary(rows):
    codes = sorted({r.split()[0] for r in rows})
    ms = sorted(float(r.split()[1]) * 1000 for r in rows)
    return "codes %s p50 %.0f ms p90 %.0f ms max %.0f ms" % (",".join(codes), ms[len(ms) // 2], ms[int(len(ms) * 0.9) - 1], ms[-1])
print("gated (ext_authz answers): %s; ungated (route): %s" % (summary(args[:cut]), summary(args[cut + 1:])))
PY
)"
  local hist=""
  if kc_port_forward; then
    hist="$(curl -s -m 10 "http://127.0.0.1:$PF_PORT/metrics" | grep -E '^authsvc_(check|decision)[a-z_]*_(seconds|duration)[a-z_]*(_bucket\{[^}]*le="0\.(05|1|2)"|_count|_sum)' | head -8 | tr '\n' ' ')"
    kill "$PF_PID" 2>/dev/null; wait "$PF_PID" 2>/dev/null; PF_PID=""
  fi
  printf '%s\n%s\n' "$stats" "$hist" >"$RUN_DIR/f5-passive.txt"
  rec F5-passive pass "$stats; auth-service decision metrics: ${hist:-not exposed}. The 200 ms timeout drill itself runs locally (f5-latency.sh, nf2-pause.sh); the load benchmark belongs on a perf cauldron (D6)"
}

# --- seeded ---------------------------------------------------------------------------------------------------------

seeded_guard() {
  [ "${APIKEYS_ALLOW_SEEDING:-}" = "$CAULDRON" ] \
    || die "seeded mode writes fixture rows to the shared sefaria_auth registry: it needs the cauldron owner's go-ahead (SAFETY.md, the cauldron owner on apisplit), given as APIKEYS_ALLOW_SEEDING=$CAULDRON"
  [[ $SHARED_CAULDRONS != *" $CAULDRON "* ]] || die "$CAULDRON is a shared cauldron; seeding it is never allowed"
  [ -f "${APIKEYS_E2E_PASSWORD_FILE:-}" ] || die "APIKEYS_E2E_PASSWORD_FILE must name the fixture password file"
}

# The seed script runs in a web pod from stdin, so neither it nor the password is in the exec arguments.
seed_exec() {
  local pod; pod="$(web_pod)"; [ -n "$pod" ] || die "no running web pod"
  { printf 'APIKEYS_E2E_PASSWORD = %s\n' "$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read().strip()))' "$APIKEYS_E2E_PASSWORD_FILE")"
    cat "$REPO/scripts/dev/seed_api_keys_e2e.py"; } |
    kubectl --context "$KCTX" -n "$NS" exec -i "$pod" -c web -- \
      env APIKEYS_CAULDRON="$CAULDRON" APIKEYS_ALLOW_MUTATING_ON="$CAULDRON" sh -c 'cd /app && python - --target cauldron "$@"' seed "$@"
}

SEEDED=0
seeded_teardown() {
  [ "$SEEDED" = 1 ] || return 0
  local dry="$RUN_DIR/teardown-dry-run.txt"
  seed_exec --teardown --dry-run 2>&1 | mask >"$dry" \
    || { rec seeded-teardown fail-harness "the teardown dry run failed; teardown NOT run, clean up by hand ($dry)"; return 1; }
  # Every user the dry run names must be in the fixture band, and every project must carry the run marker.
  if ! python3 - "$dry" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
head = re.search(r"would remove \d+ users \(([^)]*)\)", text)
if not head:
    sys.exit(1)
users = [u.strip() for u in head.group(1).split(",") if u.strip() and u.strip() != "none"]
if any(not (2098000001 <= int(u) <= 2098000999) for u in users):
    sys.exit(1)
# Each project must be a fixture for a reason the guard can check: the run marker, an owner in the band, or an
# unclaimed listing with a fixture email (UI tests create projects without the marker; they are owned by band users).
for line in text.splitlines():
    if not line.startswith("  project "):
        continue
    why = re.search(r" why=(\S+)$", line)
    why = why.group(1) if why else ""
    if why == "marker" and re.search(r"notes='E2E api-keys \S+ \(temporary\)'", line):
        continue
    if why.startswith("owner=") and 2098000001 <= int(why[6:]) <= 2098000999:
        continue
    if re.fullmatch(r"email=apikeys-e2e-[a-z0-9-]+@example\.com", why):
        continue
    sys.exit(1)
PY
  then
    rec seeded-teardown fail-product-bug "the dry run names rows outside the band or marker; teardown NOT run, clean up by hand ($dry)"
    return 1
  fi
  # SEEDED stays 1 unless the teardown itself succeeded, so the exit trap tries again.
  if ! seed_exec --teardown 2>&1 | mask >"$RUN_DIR/teardown.txt"; then
    rec seeded-teardown fail-harness "--teardown failed: $(tail -1 "$RUN_DIR/teardown.txt")"
    return 1
  fi
  SEEDED=0
  if seed_exec --leftovers 2>&1 | mask >"$RUN_DIR/leftovers-after.txt"; then
    rec seeded-teardown pass "teardown done; $(tail -1 "$RUN_DIR/leftovers-after.txt")"
  else
    rec seeded-teardown fail-product-bug "leftovers after teardown: $(tail -1 "$RUN_DIR/leftovers-after.txt")"
  fi
}

# Leaves out what SAFETY.md excludes from a seeded cauldron run: account deletion, the double-click project test,
# /register, B7 and B9.
SEEDED_GREP_INVERT='(N-M6:|N-C9:|B7:|B9:|register)'

seeded_run() {
  seeded_guard
  log "seeded run $RUN_ID against $BASE (go-ahead: APIKEYS_ALLOW_SEEDING=$CAULDRON)"
  preflight
  warmup
  snapshot before
  fixture_counts_zero before || die "fixture band, marker or fixture-email rows exist before the run"
  seed_exec --leftovers 2>&1 | mask >"$RUN_DIR/leftovers-before.txt" || die "--leftovers is not 0 before seeding: $(tail -1 "$RUN_DIR/leftovers-before.txt")"
  git -C "$REPO" check-ignore -q "$MANIFEST_REL" || die "$MANIFEST_REL is not git-ignored"
  SEEDED=1
  trap 'trap_rc=$?; seeded_teardown; cleanup "$trap_rc"' EXIT INT TERM
  ( umask 077; seed_exec --reset --manifest-stdout >"$MANIFEST" 2>"$RUN_DIR/seed.err" ) || die "seeding failed: $(mask <"$RUN_DIR/seed.err" | tail -3)"
  rec seeded pass "seeded $(python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); print(len(m["accounts"]), "accounts,", len(m["keys"]), "keys")' "$MANIFEST")"

  # The setup project logs the seeded accounts in; a separate session directory keeps the local suites' .auth/ intact.
  local specs prc
  rm -f "$RUN_DIR/playwright-seeded.json"
  specs="$(git -C "$REPO" ls-files 'e2e-tests/api-keys/*.spec.ts' | tr '\n' ' ')"
  ( cd "$REPO" && env -u APIKEYS_TRACE APIKEYS_TARGET=cauldron APIKEYS_CAULDRON="$CAULDRON" APIKEYS_MANIFEST="$MANIFEST_REL" \
      APIKEYS_RUN_ID="$RUN_ID" APIKEYS_AUTH_DIR=e2e-tests/api-keys/.auth-cauldron PLAYWRIGHT_JSON_OUTPUT_NAME="$RUN_DIR/playwright-seeded.json" \
      npx playwright test --project=apikeys --workers=2 --reporter=list,json --grep-invert "$SEEDED_GREP_INVERT" $specs \
  ) 2>&1 | mask >"$RUN_DIR/playwright-seeded.log"
  prc=${PIPESTATUS[0]}
  [ -f "$RUN_DIR/playwright-seeded.json" ] || echo '{"suites": [], "errors": [{"message": "no report"}]}' >"$RUN_DIR/playwright-seeded.json"
  mask <"$RUN_DIR/playwright-seeded.json" >"$RUN_DIR/playwright-seeded.json.m" && mv "$RUN_DIR/playwright-seeded.json.m" "$RUN_DIR/playwright-seeded.json"
  local pw; pw="$(python3 - "$RUN_DIR/playwright-seeded.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
n = {"passed": 0, "skipped": 0, "known_gap": 0, "failed": 0, "flaky": 0}
revoke = []
def walk(s):
    for c in s.get("suites", []):
        walk(c)
    for spec in s.get("specs", []):
        for t in spec.get("tests", []):
            st = t.get("status")
            key = {"expected": "passed", "skipped": "skipped", "flaky": "flaky"}.get(st)
            if key is None:
                key = "known_gap" if "@known-gap" in spec["title"] else "failed"
            n[key] += 1
            if spec["title"].startswith(("A9a", "A9b")):
                revoke.extend(a.get("description", "") for a in t.get("annotations", []) if a.get("description"))
for s in d.get("suites", []):
    walk(s)
# Report-level errors (a broken config, a crashed worker) and an empty run are failures too.
errors = len(d.get("errors") or [])
if errors or not (n["passed"] + n["known_gap"] + n["failed"] + n["flaky"]):
    n["failed"] += max(errors, 1)
print("%(failed)d\t%(passed)d passed, %(skipped)d skipped, %(known_gap)d known-gap, %(flaky)d flaky, %(failed)d failed" % n
      + ("; revoke-to-deny: " + " | ".join(revoke)[:300] if revoke else ""))
PY
)"
  if [ -z "$pw" ]; then rec playwright-seeded fail-harness "no Playwright report; see playwright-seeded.log"
  elif [ "${pw%%$'\t'*}" = 0 ] && [ "$prc" != 0 ] && [[ ${pw#*$'\t'} == *" 0 known-gap"* ]]; then
    rec playwright-seeded fail-harness "exit $prc with no failing test: ${pw#*$'\t'}"
  elif [ "${pw%%$'\t'*}" = 0 ]; then rec playwright-seeded pass "${pw#*$'\t'}"
  else rec playwright-seeded fail-product-bug "${pw#*$'\t'}"; fi

  probe_aseries "$MANIFEST"
  probe_ne1
  seeded_teardown
  snapshot after
  if fixture_counts_zero after && [ "$(snap_sum before keys)" = "$(snap_sum after keys)" ] && [ "$(snap_sum before projects)" = "$(snap_sum after projects)" ]; then
    rec N-D1 pass "after teardown the registry is as before: keys $(snap_val after keys) projects $(snap_val after projects); band, marker and fixture-email counts 0"
  else
    rec N-D1 fail-product-bug "snapshot differs after teardown: before $(tr '\n' ' ' <"$RUN_DIR/snapshot-before.txt") after $(tr '\n' ' ' <"$RUN_DIR/snapshot-after.txt")"
  fi
}

# --- verify-off (E4) ------------------------------------------------------------------------------------------------

verify_off() {
  log "verify-off: is the gate off on $CAULDRON? (read-only)"
  local sp; sp="$(kc get securitypolicy "$CAULDRON-auth" -o name 2>&1)"
  case "$sp" in *NotFound*|*"not found"*) rec E4-policy pass "no SecurityPolicy $CAULDRON-auth" ;; *) rec E4-policy fail-product-bug "SecurityPolicy still present: $sp" ;; esac
  local dep; dep="$(kc get deploy "$CAULDRON-auth-service" -o name 2>&1)"
  case "$dep" in *NotFound*|*"not found"*) rec E4-deploy pass "no Deployment $CAULDRON-auth-service" ;; *) rec E4-deploy fail-product-bug "auth-service Deployment still present: $dep" ;; esac
  local r; r="$(c "$BASE/api/knn-search")"
  if [ "$(body_of "$r" | json_field code)" = api_key_required ]; then rec E4-gated fail-product-bug "the gated path still answers the gateway's 401 api_key_required"
  else rec E4-gated "$(infra_or "$(status_of "$r")" pass)" "gated path without a key -> $(status_of "$r"), not a gateway denial"; fi
  r="$(c -H 'x-sefaria-tier: partner' "$BASE/api/v3/texts/Genesis.1.1")"
  rec E4-ungated "$(infra_or "$(status_of "$r")" "$([ "$(status_of "$r")" = 200 ] && echo pass || echo fail-product-bug)")" "ungated page -> $(status_of "$r")"
  sleep 5
  local lines; lines="$(kc logs -l "$NGINX_SELECTOR" --since=5m --tail=-1 2>/dev/null | grep -F "$UA_TAG/$RUN_ID" | mask || true)"
  if printf '%s' "$lines" | grep -q 'sefariaTier'; then rec E4-log fail-product-bug "nginx still logs sefariaTier with the gate off"
  else rec E4-log pass "nginx log lines for this run carry no x-sefaria-* fields ($(printf '%s\n' "$lines" | grep -c .) lines)"; fi
}

# --- drill-f1 -------------------------------------------------------------------------------------------------------

F1_REPLICAS=""
F1_LOOP=""
f1_stop_probe() {
  [ -n "$F1_LOOP" ] || return 0
  touch "$RUN_DIR/f1.stop"; sleep 2; kill "$F1_LOOP" 2>/dev/null; wait "$F1_LOOP" 2>/dev/null; F1_LOOP=""
}
# Restores the recorded replica count; the record is cleared only once the scale call succeeded, so the exit trap
# retries a failed restore.
f1_restore() {
  [ -n "$F1_REPLICAS" ] || return 0
  local try
  for try in 1 2 3; do
    if kubectl --context "$KCTX" -n "$NS" scale "$AUTH_DEPLOY" --replicas="$F1_REPLICAS" >/dev/null 2>&1; then
      log "auth service scaled back to $F1_REPLICAS"; F1_REPLICAS=""; return 0
    fi
    sleep 5
  done
  log "RESTORE FAILED: run kubectl --context $KCTX -n $NS scale $AUTH_DEPLOY --replicas=$F1_REPLICAS by hand"
  rec F1-restore fail-harness "the auth service could not be scaled back to $F1_REPLICAS"
  return 1
}

drill_f1() {
  [ "${APIKEYS_ALLOW_MUTATING_ON:-}" = "$CAULDRON" ] \
    || die "drill-f1 scales the auth service to 0: it needs the cauldron owner's go-ahead (SAFETY.md), given as APIKEYS_ALLOW_MUTATING_ON=$CAULDRON"
  [[ $SHARED_CAULDRONS != *" $CAULDRON "* ]] || die "$CAULDRON is a shared cauldron; drills are never allowed there"
  preflight
  F1_REPLICAS="$(kc get "$AUTH_DEPLOY" -o jsonpath='{.spec.replicas}')"
  [ -n "$F1_REPLICAS" ] || die "cannot read the replicas of $AUTH_DEPLOY"
  trap 'trap_rc=$?; f1_stop_probe; f1_restore; cleanup "$trap_rc"' EXIT INT TERM
  local probe="$RUN_DIR/f1-probe.tsv"; : >"$probe"
  ( while [ ! -f "$RUN_DIR/f1.stop" ]; do
      printf '%s\t%s\n' "$(date +%s.%N)" "$(curl -s -o "$RUN_DIR/tmp.f1" -m 5 -w '%{http_code}' -A "$UA_TAG/$RUN_ID" "$BASE/api/knn-search" || echo 000)$(python3 -c 'import json,sys
try: print(" " + (json.load(open(sys.argv[1])).get("code") or "-"))
except Exception: print(" -")' "$RUN_DIR/tmp.f1")" >>"$probe"
      sleep 1
    done ) &
  F1_LOOP=$!
  sleep 10
  local t_down; t_down="$(date +%s.%N)"
  kubectl --context "$KCTX" -n "$NS" scale "$AUTH_DEPLOY" --replicas=0 >/dev/null || die "scale to 0 failed"
  log "auth service scaled to 0; waiting for its pods to go"
  for _ in $(seq 1 60); do [ -z "$(kc get pods -l "app=auth-service-$CAULDRON" -o name 2>/dev/null)" ] && break; sleep 2; done
  sleep 20
  local t_up; t_up="$(date +%s.%N)"
  f1_restore || { f1_stop_probe; die "could not restore the auth service; scale it back by hand"; }
  for _ in $(seq 1 90); do
    [ "$(kc get "$AUTH_DEPLOY" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)" -ge 1 ] 2>/dev/null && break; sleep 2
  done
  local t_ready; t_ready="$(date +%s.%N)"
  sleep 15
  f1_stop_probe
  local verdict
  verdict="$(python3 - "$probe" "$t_down" "$t_up" "$t_ready" "${F1_EXPECT_OUTAGE:-405 -}" <<'PY'
import sys
rows = [l.rstrip("\n").split("\t") for l in open(sys.argv[1]) if "\t" in l]
down, up, ready = (float(x) for x in sys.argv[2:5])
expected = sys.argv[5]
def window(a, b): return [r[1] for r in rows if a <= float(r[0]) < b]
before, outage, after = window(0, down), window(down + 15, up), window(ready + 5, 9e12)
denied_in_outage = sum(1 for r in outage if r.endswith("api_key_required") or r.endswith("api_key_invalid"))
# Failing open means the request reached Django, so every outage row must be the answer Django gives the probe
# (F1_EXPECT_OUTAGE, default "405 -": the method of the keyless probe is not allowed on the gated path, and no
# gateway code is attached). A 5xx or a transport error is an outage, not fail-open, and fails the drill.
other_in_outage = sorted({r for r in outage if r != expected})
ok_before = all(r.endswith("api_key_required") for r in before) and before
ok_after = after and all(r.endswith("api_key_required") for r in after)
print("pass" if ok_before and outage and denied_in_outage == 0 and not other_in_outage and ok_after else "fail",
      f"before={len(before)} all 401 api_key_required={bool(ok_before)}; outage={len(outage)} gateway denials={denied_in_outage}, "
      f"not the Django answer ({expected!r})={other_in_outage} (codes {sorted(set(outage))}); "
      f"after ready+5s={len(after)} all 401={bool(ok_after)}; ready {ready - up:.0f}s after the scale-up")
PY
)"
  case "$verdict" in pass*) rec F1 pass "${verdict#pass }" ;; *) rec F1 fail-product-bug "${verdict#fail }" ;; esac
}
