#!/usr/bin/env bash
# auth-service/scripts/test-policy-gate.sh — runs policy-gate.sh against a fake kubectl; no cluster needed.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# Fake kubectl: `get KIND NAME -o json` prints $FAKE_DIR/KIND_NAME.json, or NotFound when there is no such file. Any
# verb but get is refused, so the gate is proven read-only.
cat >"$tmp/kubectl" <<'FAKE'
#!/usr/bin/env bash
args=("$@"); verb="" kind="" name=""
for ((i = 0; i < ${#args[@]}; i++)); do
  a=${args[$i]}
  case "$a" in
    --context|-n|-o) i=$((i + 1)) ;;
    get|apply|patch|delete|scale|edit|exec|create|replace|annotate|label) [ -z "$verb" ] && verb=$a ;;
    *) if [ -z "$kind" ]; then kind=$a; elif [ -z "$name" ]; then name=$a; fi ;;
  esac
done
[ "$verb" = get ] || { echo "fake kubectl: refused verb '$verb'" >&2; exit 99; }
f="$FAKE_DIR/${kind}_${name}.json"
[ -f "$f" ] || { echo "Error from server (NotFound): $kind \"$name\" not found" >&2; exit 1; }
cat "$f"
FAKE
chmod +x "$tmp/kubectl"

# obj KIND NAME [key=value ...] -> writes the fake object. Keys: gen (metadata.generation), statuses (one Accepted status
# per ancestor/parent, comma-separated), resolved (ResolvedRefs per parent), observed (observedGeneration per condition),
# refs (spec.parentRefs sectionNames, comma-separated; routes only), status_refs (parentRef sectionNames in status).
obj() {
  python3 - "$FAKE_DIR" "$@" <<'PY'
import json, sys
out, kind, name = sys.argv[1:4]
o = dict(kv.split("=", 1) for kv in sys.argv[4:])
gen = int(o.get("gen", 3))
statuses = o.get("statuses", "True").split(",") if o.get("statuses", "True") else []
observed = [int(x) for x in o.get("observed", "").split(",")] if o.get("observed") else [gen] * len(statuses)
doc = {"kind": kind, "metadata": {"name": name, "generation": gen}, "spec": {}, "status": {}}
if kind == "httproute":
    refs = o.get("refs", "https-en,https-he").split(",")
    status_refs = o.get("status_refs", ",".join(refs)).split(",") if o.get("status_refs", "x") else []
    resolved = o.get("resolved", ",".join(["True"] * len(status_refs))).split(",")
    statuses = (statuses * len(status_refs))[:len(status_refs)] if len(statuses) == 1 else statuses
    doc["spec"]["parentRefs"] = [{"name": "authpoc", "sectionName": r} for r in refs if r]
    doc["status"]["parents"] = [
        {"parentRef": {"name": "authpoc", "sectionName": r}, "conditions": [
            {"type": "Accepted", "status": statuses[i], "observedGeneration": (observed * 9)[i]},
            {"type": "ResolvedRefs", "status": resolved[i], "observedGeneration": (observed * 9)[i]}]}
        for i, r in enumerate(status_refs)]
else:
    doc["status"]["ancestors"] = [
        {"ancestorRef": {"kind": "Gateway", "name": "authpoc"}, "conditions": [
            {"type": "Accepted", "status": s, "observedGeneration": observed[i], "reason": "Test", "message": "fake"}]}
        for i, s in enumerate(statuses)]
json.dump(doc, open("%s/%s_%s.json" % (out, kind, name), "w"))
PY
}
base() {
  rm -rf "$FAKE_DIR"; mkdir -p "$FAKE_DIR"
  obj securitypolicy authpoc-auth; obj clienttrafficpolicy authpoc
  obj httproute authpoc; obj httproute authpoc-http-redirect refs=http-en,http-he
}
run() { PATH="$tmp:$PATH" CTX=fake NS=default ENV=authpoc bash "$here/policy-gate.sh" >"$tmp/out" 2>&1; }
# expect pass|fail LABEL [shell commands that change the fake objects]
expect() {
  local want=$1 label=$2; shift 2
  base; eval "$*"
  run; local got=$?
  if { [ "$want" = pass ] && [ $got = 0 ]; } || { [ "$want" = fail ] && [ $got = 1 ]; }; then echo "ok: $label"
  else echo "FAIL: $label (exit $got)"; sed 's/^/    /' "$tmp/out"; fail=1; fi
}
export FAKE_DIR="$tmp/objects"
expect pass "everything accepted"
expect pass "an extension policy, when deployed, accepted" 'obj envoyextensionpolicy authpoc statuses=True,True'
expect fail "an extension policy rejected" 'obj envoyextensionpolicy authpoc statuses=False'
expect fail "a rate-limit policy, when deployed, rejected" 'obj backendtrafficpolicy authpoc-auth-ratelimit statuses=False'
expect fail "security policy rejected on one ancestor" 'obj securitypolicy authpoc-auth statuses=True,False'
expect fail "security policy rejected" 'obj securitypolicy authpoc-auth statuses=False'
expect fail "security policy status Unknown" 'obj securitypolicy authpoc-auth statuses=Unknown'
expect fail "security policy missing" 'rm "$FAKE_DIR/securitypolicy_authpoc-auth.json"'
expect fail "security policy with no ancestor status yet" 'obj securitypolicy authpoc-auth statuses='
expect fail "security policy accepted only for an older generation" 'obj securitypolicy authpoc-auth gen=4 observed=3'
expect fail "client traffic policy (header strip) rejected" 'obj clienttrafficpolicy authpoc statuses=False'
expect fail "client traffic policy (header strip) missing" 'rm "$FAKE_DIR/clienttrafficpolicy_authpoc.json"'
expect fail "app route not accepted on one listener" 'obj httproute authpoc statuses=True,False'
expect fail "app route backend unresolved" 'obj httproute authpoc resolved=False,True'
expect fail "app route: a parentRef with no status at all" 'obj httproute authpoc refs=https-en,https-he status_refs=https-en'
expect fail "app route accepted only for an older generation" 'obj httproute authpoc gen=5 observed=4'
expect fail "redirect route missing" 'rm "$FAKE_DIR/httproute_authpoc-http-redirect.json"'
( unset CTX; PATH="$tmp:$PATH" NS=default ENV=authpoc bash "$here/policy-gate.sh" >/dev/null 2>&1 ) \
  && { echo "FAIL: runs without CTX"; fail=1; } || echo "ok: refuses to run without an explicit CTX"
exit $fail
