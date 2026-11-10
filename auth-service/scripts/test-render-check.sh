#!/usr/bin/env bash
# auth-service/scripts/test-render-check.sh — proves render_check.py catches what it claims to: renders prod with the
# flag on, then breaks one thing at a time in a copy and expects a failure. Needs helm and PyYAML (PY=...).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
PY="${PY:-python3}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$PY" - "$root/envs/prod/helmrelease.yaml" "$tmp/values.yaml" <<'PY'
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
yaml.safe_dump(next(d for d in docs if d.get("kind") == "HelmRelease")["spec"]["values"], open(sys.argv[2], "w"))
PY
helm template prod "$root/helm-chart/sefaria" -f "$tmp/values.yaml" --set authService.enabled=true \
  --set authService.image.tag=t >"$tmp/on.yaml" || { echo "FAIL: helm template"; exit 1; }
helm template prod "$root/helm-chart/sefaria" -f "$tmp/values.yaml" --set authService.enabled=false >"$tmp/off.yaml" || { echo "FAIL: helm template off"; exit 1; }

"$PY" "$here/render_check.py" "$tmp/on.yaml" >/dev/null && echo "ok: the real flag-on render passes" || { echo "FAIL: the real render fails"; fail=1; }
"$PY" "$here/render_check.py" --off "$tmp/off.yaml" >/dev/null && echo "ok: the real flag-off render passes" || { echo "FAIL: the real off render fails"; fail=1; }
"$PY" "$here/render_check.py" --off "$tmp/on.yaml" >/dev/null && { echo "FAIL: --off accepts a flag-on render"; fail=1; } || echo "ok: --off rejects a flag-on render"

# The flag-off render must hold no auth or rate-limit policy of any kind.
inject() {  # inject LABEL OFF|ON PYTHON-EXPRESSION-ON-docs: add objects to a copy of the real render, expect a failure
  "$PY" - "$tmp/$2.yaml" "$tmp/bad.yaml" "$3" <<'PY'
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
exec(sys.argv[3])
yaml.safe_dump_all(docs, open(sys.argv[2], "w"))
PY
  local flag=(); [ "$2" = off ] && flag=(--off)
  if "$PY" "$here/render_check.py" ${flag[@]+"${flag[@]}"} "$tmp/bad.yaml" >"$tmp/out" 2>&1; then echo "FAIL: not caught: $1"; fail=1; else echo "ok: caught: $1"; fi
}
btp='{"apiVersion": "gateway.envoyproxy.io/v1alpha1", "kind": "BackendTrafficPolicy", "metadata": {"name": "production-auth-ratelimit"}, "spec": {}}'
inject "flag off, a rate-limit BackendTrafficPolicy renders" off "docs.append($btp)"
inject "flag off, a BackendTrafficPolicy reading x-sefaria-tier renders" off 'docs.append({"kind": "BackendTrafficPolicy", "metadata": {"name": "x"}, "spec": {"rateLimit": {"match": "x-sefaria-tier"}}})'
inject "flag off, an auth EnvoyExtensionPolicy renders" off 'docs.append({"kind": "EnvoyExtensionPolicy", "metadata": {"name": "production-auth"}, "spec": {}})'
inject "rate limiting off, a rate-limit BackendTrafficPolicy renders" on "docs.append($btp)"
"$PY" "$here/render_check.py" --off "$tmp/off.yaml" >/dev/null && echo "ok: the real off render (client-IP EnvoyExtensionPolicy, splash BackendTrafficPolicy) still passes" || { echo "FAIL: shared policies read as auth objects"; fail=1; }

# render-check.sh renders the off-case from the env file as shipped: an env file that ships the flag on, or not as a
# YAML boolean, must fail it, and a forced --set must not hide that.
for variant in "true" '"false"'; do
  rm -rf "$tmp/envs"; mkdir -p "$tmp/envs"; cp -R "$root/envs/prod" "$tmp/envs/prod"
  "$PY" - "$tmp/envs/prod/helmrelease.yaml" "$variant" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
new, n = re.subn(r"(\n    authService:\n(?:      #[^\n]*\n)*      enabled: )false", r"\g<1>" + sys.argv[2], text, count=1)
assert n == 1, "authService.enabled not found"
open(sys.argv[1], "w").write(new)
PY
  if ENVS_DIR="$tmp/envs" PY="$PY" bash "$here/render-check.sh" prod >"$tmp/rc.out" 2>&1; then echo "FAIL: render-check.sh passes an env file shipping authService.enabled: $variant"; fail=1
  else grep -q "does not ship authService.enabled as a YAML false" "$tmp/rc.out" && echo "ok: render-check.sh fails an env file shipping authService.enabled: $variant" || { echo "FAIL: wrong failure for $variant"; cat "$tmp/rc.out"; fail=1; }; fi
done
rm -rf "$tmp/envs"; mkdir -p "$tmp/envs"; cp -R "$root/envs/prod" "$tmp/envs/prod"
ENVS_DIR="$tmp/envs" PY="$PY" bash "$here/render-check.sh" prod >/dev/null 2>&1 && echo "ok: render-check.sh passes the shipped prod env file" || { echo "FAIL: render-check.sh fails the shipped prod env file"; fail=1; }

# mutate LABEL PYTHON-EXPRESSION-ON-docs: applies the edit to a copy of the flag-on render and expects a failure.
mutate() {
  "$PY" - "$tmp/on.yaml" "$tmp/bad.yaml" "$2" <<'PY'
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
def one(kind, suffix=""):
    return next(d for d in docs if d["kind"] == kind and d["metadata"]["name"].endswith(suffix))
exec(sys.argv[3])
yaml.safe_dump_all(docs, open(sys.argv[2], "w"))
PY
  if "$PY" "$here/render_check.py" "$tmp/bad.yaml" >"$tmp/out" 2>&1; then echo "FAIL: not caught: $1"; fail=1; else echo "ok: caught: $1"; fi
}
mutate "the header strip loses x-sefaria-tier" 'one("ClientTrafficPolicy")["spec"]["headers"]["earlyRequestHeaders"]["remove"].remove("x-sefaria-tier")'
mutate "the header strip loses x-sefaria-key-status" 'one("ClientTrafficPolicy")["spec"]["headers"]["earlyRequestHeaders"]["remove"].remove("x-sefaria-key-status")'
mutate "the ClientTrafficPolicy targets a port-80 listener" 'one("ClientTrafficPolicy")["spec"]["targetRefs"][0]["sectionName"] = "http-en"'
mutate "the ClientTrafficPolicy targets the whole Gateway" 'one("ClientTrafficPolicy")["spec"]["targetRefs"][0].pop("sectionName")'
mutate "ext_authz fails closed" 'one("SecurityPolicy")["spec"]["extAuth"]["failOpen"] = False'
mutate "ext_authz has no timeout" 'one("SecurityPolicy")["spec"]["extAuth"].pop("timeout")'
mutate "the body goes to the auth service" 'one("SecurityPolicy")["spec"]["extAuth"]["bodyToExtAuth"] = {"maxRequestBytes": 1024}'
mutate "the SecurityPolicy targets the Gateway" 'one("SecurityPolicy")["spec"]["targetRefs"][0]["kind"] = "Gateway"'
mutate "PG_DSN is a literal" '[e for e in one("Deployment", "-auth-service")["spec"]["template"]["spec"]["containers"][0]["env"] if e["name"] == "PG_DSN"][0].pop("valueFrom")'
mutate "the image is :latest" 'one("Deployment", "-auth-service")["spec"]["template"]["spec"]["containers"][0]["image"] = "x/auth:latest"'
mutate "the app route listens on port 80" 'one("HTTPRoute", "production")["spec"]["parentRefs"][0]["sectionName"] = "http-en"'
mutate "the redirect route redirects to http" 'one("HTTPRoute", "-http-redirect")["spec"]["rules"][0]["filters"][0]["requestRedirect"]["scheme"] = "http"'
mutate "the ClientTrafficPolicy targets another Gateway" 'one("ClientTrafficPolicy")["spec"]["targetRefs"][0]["name"] = "staging"'
mutate "the ClientTrafficPolicy target is not a Gateway" 'one("ClientTrafficPolicy")["spec"]["targetRefs"][0]["kind"] = "HTTPRoute"'
mutate "the SecurityPolicy targets a route of another environment" 'one("SecurityPolicy")["spec"]["targetRefs"][0]["name"] = "staging"'
mutate "the app route attaches to another Gateway" 'one("HTTPRoute", "production")["spec"]["parentRefs"][0]["name"] = "staging"'
mutate "every listener and attachment removed" 'g = one("Gateway"); g["spec"]["listeners"] = []; one("ClientTrafficPolicy")["spec"]["targetRefs"] = []; one("HTTPRoute", "production")["spec"]["parentRefs"] = []; one("HTTPRoute", "-http-redirect")["spec"]["parentRefs"] = []'
mutate "the Service selects no auth-service pod" 'one("Service", "auth-service-production")["spec"]["selector"] = {"app": "nothing"}'
mutate "the Service grpc port moves away from ext_authz" 'one("Service", "auth-service-production")["spec"]["ports"][1]["port"] = 9999'
mutate "the Service targets an undeclared container port" 'one("Service", "auth-service-production")["spec"]["ports"][1]["targetPort"] = "grpc-x"'
mutate "the Service grpc port aimed at the HTTP server" 'one("Service", "auth-service-production")["spec"]["ports"][1]["targetPort"] = "http"'
mutate "the Service ports swapped" 'ps = one("Service", "auth-service-production")["spec"]["ports"]; ps[0]["targetPort"], ps[1]["targetPort"] = "grpc", "http"'
# Prod runs two replicas, so its render has a PDB: drop it, and separately keep it with one replica.
mutate "two replicas without a PDB" 'one("Deployment", "-auth-service")["spec"]["replicas"] = 2; docs[:] = [d for d in docs if not (d["kind"] == "PodDisruptionBudget" and "auth-service" in d["metadata"]["name"])]'
mutate "one replica with a PDB" 'one("Deployment", "-auth-service")["spec"]["replicas"] = 1'
exit $fail
