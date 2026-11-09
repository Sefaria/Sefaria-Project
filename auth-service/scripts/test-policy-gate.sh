#!/usr/bin/env bash
# auth-service/scripts/test-policy-gate.sh — runs policy-gate.sh against a fake kubectl; no cluster needed.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# Fake kubectl: FAKE_<kind>_<name>_<Accepted|ResolvedRefs> holds the space-separated statuses over every ancestor or
# parent; an object with no variable at all is not found. Writes are refused, so the gate is proven read-only.
cat > "$tmp/kubectl" <<'FAKE'
#!/usr/bin/env bash
verb="" kind="" name="" cond=""
for a in "$@"; do
  case "$a" in
    get|apply|patch|delete|scale|edit|exec|create|replace|annotate|label) [ -z "$verb" ] && verb=$a ;;
    securitypolicy|clienttrafficpolicy|envoyextensionpolicy|backendtrafficpolicy|httproute) kind=$a ;;
    *'type=="Accepted"'*) cond=Accepted ;;
    *'type=="ResolvedRefs"'*) cond=ResolvedRefs ;;
    -*|*=*|*/*) ;;
    *) [ -n "$kind" ] && [ -z "$name" ] && name=$a ;;
  esac
done
[ "$verb" = get ] || { echo "fake kubectl: refused verb '$verb'" >&2; exit 99; }
prefix="FAKE_${kind}_${name//-/_}_"
found=""
for v in $(compgen -v "$prefix"); do found=1; done
[ -n "$found" ] || { echo "Error from server (NotFound)" >&2; exit 1; }
var="${prefix}${cond}"
printf '%s' "${!var-}"
FAKE
chmod +x "$tmp/kubectl"

ALL_OK=(FAKE_securitypolicy_authpoc_auth_Accepted="True" FAKE_clienttrafficpolicy_authpoc_Accepted="True"
        FAKE_httproute_authpoc_Accepted="True True" FAKE_httproute_authpoc_ResolvedRefs="True True"
        FAKE_httproute_authpoc_http_redirect_Accepted="True" FAKE_httproute_authpoc_http_redirect_ResolvedRefs="True")
run() { PATH="$tmp:$PATH" CTX=fake NS=default ENV=authpoc bash "$here/policy-gate.sh" >"$tmp/out" 2>&1; }
# expect pass|fail LABEL [VAR=value ...]: VAR= (empty) sets an empty status; UNSET_VAR removes one from the base set.
expect() {
  local want=$1 label=$2; shift 2
  ( for kv in "${ALL_OK[@]}"; do export "${kv?}"; done
    for kv in "$@"; do case "$kv" in UNSET_*) unset "${kv#UNSET_}" ;; *) export "${kv?}" ;; esac; done
    run )
  local got=$?
  if { [ "$want" = pass ] && [ $got = 0 ]; } || { [ "$want" = fail ] && [ $got = 1 ]; }; then echo "ok: $label"
  else echo "FAIL: $label (exit $got)"; sed 's/^/    /' "$tmp/out"; fail=1; fi
}
expect pass "everything accepted"
expect pass "an extension policy, when deployed, accepted" FAKE_envoyextensionpolicy_authpoc_Accepted="True True"
expect fail "an extension policy rejected" FAKE_envoyextensionpolicy_authpoc_Accepted="False"
expect fail "a rate-limit policy, when deployed, rejected" FAKE_backendtrafficpolicy_authpoc_auth_ratelimit_Accepted="False"
expect fail "security policy rejected on one ancestor" FAKE_securitypolicy_authpoc_auth_Accepted="True False"
expect fail "security policy rejected" FAKE_securitypolicy_authpoc_auth_Accepted="False"
expect fail "security policy status Unknown" FAKE_securitypolicy_authpoc_auth_Accepted="Unknown"
expect fail "security policy missing" UNSET_FAKE_securitypolicy_authpoc_auth_Accepted
expect fail "security policy with no status yet" FAKE_securitypolicy_authpoc_auth_Accepted=
expect fail "client traffic policy (header strip) rejected" FAKE_clienttrafficpolicy_authpoc_Accepted="False"
expect fail "client traffic policy (header strip) missing" UNSET_FAKE_clienttrafficpolicy_authpoc_Accepted
expect fail "app route not accepted on one listener" FAKE_httproute_authpoc_Accepted="True False"
expect fail "app route backend unresolved" FAKE_httproute_authpoc_ResolvedRefs="False True"
expect fail "redirect route missing" UNSET_FAKE_httproute_authpoc_http_redirect_Accepted UNSET_FAKE_httproute_authpoc_http_redirect_ResolvedRefs
( unset CTX; PATH="$tmp:$PATH" NS=default ENV=authpoc bash "$here/policy-gate.sh" >/dev/null 2>&1 ) \
  && { echo "FAIL: runs without CTX"; fail=1; } || echo "ok: refuses to run without an explicit CTX"
exit $fail
