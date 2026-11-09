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
helm template prod "$root/helm-chart/sefaria" -f "$tmp/values.yaml" >"$tmp/off.yaml" || { echo "FAIL: helm template off"; exit 1; }

"$PY" "$here/render_check.py" "$tmp/on.yaml" >/dev/null && echo "ok: the real flag-on render passes" || { echo "FAIL: the real render fails"; fail=1; }
"$PY" "$here/render_check.py" --off "$tmp/off.yaml" >/dev/null && echo "ok: the real flag-off render passes" || { echo "FAIL: the real off render fails"; fail=1; }
"$PY" "$here/render_check.py" --off "$tmp/on.yaml" >/dev/null && { echo "FAIL: --off accepts a flag-on render"; fail=1; } || echo "ok: --off rejects a flag-on render"

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
mutate "two replicas without a PDB" 'one("Deployment", "-auth-service")["spec"]["replicas"] = 2'
exit $fail
