#!/usr/bin/env bash
# scripts/test-policy-gate.sh — runs policy-gate.sh against a fake kubectl; no cluster needed.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# fake kubectl: FAKE_<kind>_<name> holds the space-separated Accepted statuses of every ancestor; unset = not found.
cat > "$tmp/kubectl" <<'FAKE'
#!/usr/bin/env bash
kind="" name=""
for a in "$@"; do case "$a" in securitypolicy|backendtrafficpolicy) kind=$a ;; authpoc-*) name=$a ;; esac; done
var="FAKE_${kind}_${name//-/_}"
[[ -n "${!var+x}" ]] || { echo "Error from server (NotFound)" >&2; exit 1; }
printf '%s' "${!var}"
FAKE
chmod +x "$tmp/kubectl"
run() { PATH="$tmp:$PATH" ENV=authpoc bash "$here/policy-gate.sh" >/dev/null 2>&1; }
expect() { local want=$1 label=$2; shift 2; ( for kv in "$@"; do export "${kv?}"; done; run ); local got=$?; if { [ "$want" = pass ] && [ $got = 0 ]; } || { [ "$want" = fail ] && [ $got != 0 ]; }; then echo "ok: $label"; else echo "FAIL: $label (exit $got)"; fail=1; fi; }
expect pass "both policies accepted" FAKE_securitypolicy_authpoc_auth="True" FAKE_backendtrafficpolicy_authpoc_auth_ratelimit="True True"
expect pass "no rate-limit policy (rate limits off)" FAKE_securitypolicy_authpoc_auth="True"
expect fail "rate-limit policy rejected on one ancestor" FAKE_securitypolicy_authpoc_auth="True" FAKE_backendtrafficpolicy_authpoc_auth_ratelimit="True False"
expect fail "security policy rejected" FAKE_securitypolicy_authpoc_auth="False" FAKE_backendtrafficpolicy_authpoc_auth_ratelimit="True"
expect fail "security policy missing" FAKE_backendtrafficpolicy_authpoc_auth_ratelimit="True"
expect fail "security policy with no status yet" FAKE_securitypolicy_authpoc_auth=""
expect fail "legacy body policy rejected" FAKE_securitypolicy_authpoc_auth="True" FAKE_securitypolicy_authpoc_auth_legacy_body="False"
exit $fail
