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
args=("$@"); verb="" kind="" name="" ignore=""
for ((i = 0; i < ${#args[@]}; i++)); do
  a=${args[$i]}
  case "$a" in
    --context|-n|-o) i=$((i + 1)) ;;
    --ignore-not-found) ignore=1 ;;
    get|apply|patch|delete|scale|edit|exec|create|replace|annotate|label) [ -z "$verb" ] && verb=$a ;;
    *) if [ -z "$kind" ]; then kind=$a; elif [ -z "$name" ]; then name=$a; fi ;;
  esac
done
[ "$verb" = get ] || { echo "fake kubectl: refused verb '$verb'" >&2; exit 99; }
[ -f "$FAKE_DIR/error_$kind" ] && { cat "$FAKE_DIR/error_$kind" >&2; exit 1; }
f="$FAKE_DIR/${kind}_${name}.json"
if [ ! -f "$f" ]; then
  [ -n "$ignore" ] && exit 0
  echo "Error from server (NotFound): $kind \"$name\" not found" >&2; exit 1
fi
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
observed = [None if x == "none" else int(x) for x in o.get("observed", "").split(",")] if o.get("observed") else [gen] * len(statuses)
doc = {"kind": kind, "metadata": {"name": name, "generation": gen}, "spec": {}, "status": {}}
if kind == "httproute":
    refs = o.get("refs", "https-en,https-he").split(",")
    status_refs = o.get("status_refs", ",".join(refs)).split(",") if o.get("status_refs", "x") else []
    resolved = o.get("resolved", ",".join(["True"] * len(status_refs))).split(",")
    statuses = (statuses * len(status_refs))[:len(status_refs)] if len(statuses) == 1 else statuses
    doc["spec"]["parentRefs"] = [{"name": "authpoc", "sectionName": r} for r in refs if r]
    doc["status"]["parents"] = [
        {"parentRef": {"name": "authpoc", "sectionName": r}, "controllerName": "gateway.envoyproxy.io/gatewayclass-controller", "conditions": [
            {"type": "Accepted", "status": statuses[i], "observedGeneration": (observed * 9)[i]},
            {"type": "ResolvedRefs", "status": resolved[i], "observedGeneration": (observed * 9)[i]}]}
        for i, r in enumerate(status_refs)]
else:
    doc["status"]["ancestors"] = [
        {"ancestorRef": {"kind": "Gateway", "name": "authpoc"}, "controllerName": "gateway.envoyproxy.io/gatewayclass-controller", "conditions": [
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
expect fail "security policy condition without observedGeneration" 'obj securitypolicy authpoc-auth observed=none'
expect fail "an optional policy the gate may not read (forbidden) is not skipped" 'echo "Error from server (Forbidden): envoyextensionpolicies is forbidden" >"$FAKE_DIR/error_envoyextensionpolicy"'
expect fail "a required policy that cannot be read (timeout)" 'echo "Unable to connect to the server: i/o timeout" >"$FAKE_DIR/error_securitypolicy"'
expect fail "another controller's Accepted=True does not mask Envoy Gateway's False" 'obj httproute authpoc statuses=False,False; python3 -c "
import json,sys; p=sys.argv[1]; d=json.load(open(p))
d[\"status\"][\"parents\"].append({\"parentRef\": {\"name\": \"authpoc\", \"sectionName\": \"https-en\"}, \"controllerName\": \"example.com/other\",
  \"conditions\": [{\"type\": \"Accepted\", \"status\": \"True\", \"observedGeneration\": 3}, {\"type\": \"ResolvedRefs\", \"status\": \"True\", \"observedGeneration\": 3}]})
json.dump(d, open(p, \"w\"))" "$FAKE_DIR/httproute_authpoc.json"'
expect fail "a policy accepted only by another controller" 'python3 -c "
import json,sys; p=sys.argv[1]; d=json.load(open(p))
for a in d[\"status\"][\"ancestors\"]: a[\"controllerName\"] = \"example.com/other\"
json.dump(d, open(p, \"w\"))" "$FAKE_DIR/securitypolicy_authpoc-auth.json"'
expect fail "redirect route missing" 'rm "$FAKE_DIR/httproute_authpoc-http-redirect.json"'

# The gate against each environment's real render: the chart's own objects (names, parentRefs) with the statuses a
# controller would write, so the gate is proven to look up exactly what staging, preprod and prod deploy.
# Needs helm and a Python with PyYAML (PY=...); skipped otherwise.
PY="${PY:-python3}"
root=$(cd "$here/../.." && pwd)
if command -v helm >/dev/null && "$PY" -c 'import yaml' 2>/dev/null; then
  for env in staging preprod prod; do
    rm -rf "$FAKE_DIR"; mkdir -p "$FAKE_DIR"
    deploy_env="$("$PY" - "$root/envs/$env/helmrelease.yaml" "$tmp/values.yaml" <<'PY'
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
values = next(d for d in docs if d.get("kind") == "HelmRelease")["spec"]["values"]
yaml.safe_dump(values, open(sys.argv[2], "w"))
print(values["deployEnv"])
PY
)"
    helm template "$env" "$root/helm-chart/sefaria" -f "$tmp/values.yaml" --set authService.enabled=true \
      --set authService.image.tag=t >"$tmp/render.yaml" || { echo "FAIL: helm template $env"; fail=1; continue; }
    "$PY" - "$tmp/render.yaml" "$FAKE_DIR" <<'PY'
import json, sys, yaml
EG = "gateway.envoyproxy.io/gatewayclass-controller"
kinds = {"SecurityPolicy": "securitypolicy", "ClientTrafficPolicy": "clienttrafficpolicy",
         "EnvoyExtensionPolicy": "envoyextensionpolicy", "BackendTrafficPolicy": "backendtrafficpolicy", "HTTPRoute": "httproute"}
for d in yaml.safe_load_all(open(sys.argv[1])):
    if not d or d.get("kind") not in kinds:
        continue
    d["metadata"]["generation"] = 1
    ok = lambda t: {"type": t, "status": "True", "observedGeneration": 1}
    if d["kind"] == "HTTPRoute":
        d["status"] = {"parents": [{"parentRef": ref, "controllerName": EG, "conditions": [ok("Accepted"), ok("ResolvedRefs")]} for ref in d["spec"]["parentRefs"]]}
    else:
        d["status"] = {"ancestors": [{"ancestorRef": {"kind": "Gateway", "name": d["metadata"]["name"]}, "controllerName": EG, "conditions": [ok("Accepted")]}]}
    json.dump(d, open("%s/%s_%s.json" % (sys.argv[2], kinds[d["kind"]], d["metadata"]["name"]), "w"))
PY
    if PATH="$tmp:$PATH" CTX=fake NS=x ENV="$deploy_env" bash "$here/policy-gate.sh" >"$tmp/out" 2>&1 \
        && [ "$(grep -c '^ok ' "$tmp/out")" -ge 4 ]; then
      echo "ok: $env: the gate finds and passes the render's objects (ENV=$deploy_env, $(grep -c '^ok ' "$tmp/out") accepted)"
    else
      echo "FAIL: $env: the gate does not pass the accepted render"; sed 's/^/    /' "$tmp/out"; fail=1
    fi
    "$PY" -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d["status"]["ancestors"][0]["conditions"][0]["status"]="False"; json.dump(d,open(p,"w"))' \
      "$FAKE_DIR/clienttrafficpolicy_$deploy_env.json"
    PATH="$tmp:$PATH" CTX=fake NS=x ENV="$deploy_env" bash "$here/policy-gate.sh" >/dev/null 2>&1 \
      && { echo "FAIL: $env: a rejected header strip passes"; fail=1; } || echo "ok: $env: a rejected header strip fails the gate"
  done
else
  echo "skip: the per-environment render cases need helm and PyYAML (PY=$PY)"
fi
( unset CTX; PATH="$tmp:$PATH" NS=default ENV=authpoc bash "$here/policy-gate.sh" >/dev/null 2>&1 ) \
  && { echo "FAIL: runs without CTX"; fail=1; } || echo "ok: refuses to run without an explicit CTX"
exit $fail
