#!/usr/bin/env bash
# auth-service/scripts/policy-gate.sh — exits 0 only when Envoy Gateway accepted every gateway object the auth service
# relies on, on every ancestor or parent, for the object's current generation. Read-only: kubectl get, nothing else.
#
# Envoy Gateway does not fail open on a rejected policy: a rejected SecurityPolicy turns the whole route into a 500, and
# a rejected ClientTrafficPolicy silently drops the x-sefaria-* header strip (forged tiers reach nginx). Run it after
# every rollout or flag flip that touches the chart's gateway objects, in every environment. Right after a rollout a
# status may still describe the previous generation: the gate fails until the controller has caught up, so rerun it.
#
#   CTX=<kube context> NS=<namespace> ENV=<deployEnv> auth-service/scripts/policy-gate.sh
#   e.g. preprod:  CTX=<prod cluster context> NS=preprod ENV=preprod
#        prod:     CTX=<prod cluster context> NS=default ENV=production
#        cauldron: CTX=gke_development-205018_us-east1-b_cluster-1 NS=default ENV=<cauldron>
#
# A policy must also be accepted for every target it names: each spec.targetRefs entry (or the older targetRef) needs an
# Envoy Gateway ancestor status that is Accepted=True for the current generation. A Gateway target (with its
# sectionName) is its own ancestor; an HTTPRoute target's ancestors are the Gateways in that route's parentRefs. A target
# with no status at all fails, as does a policy whose only accepted ancestor is an unrelated one.
#
# Checked: SecurityPolicy <env>-auth (required: the auth service is on), ClientTrafficPolicy <env> (required: the header
# strip), HTTPRoute <env> and <env>-http-redirect (Accepted and ResolvedRefs for every parentRef), EnvoyExtensionPolicy
# <env> and BackendTrafficPolicy <env>-auth-ratelimit (each when deployed). Needs kubectl and python3.
set -uo pipefail
CTX=${CTX:?set CTX to the kube context (no default, so a gate never reads the wrong cluster)}
NS=${NS:?set NS to the namespace}
ENV=${ENV:?set ENV to the deployEnv (the Gateway and HTTPRoute name)}
rc=0
ERR="$(mktemp)"; trap 'rm -f "$ERR"' EXIT

# judge KIND NAME policy|route JSON: prints ok/FAIL lines for the object; exit 1 on any FAIL.
judge() {
  OBJ_JSON="$4" python3 - "$1" "$2" "$3" <<'PY'
import json, os, sys
kind, name, shape = sys.argv[1:4]
obj = json.loads(os.environ["OBJ_JSON"])
gen = obj.get("metadata", {}).get("generation")
label = kind + "/" + name
fails = []


def current(cond):
    # Freshness needs proof: a condition without observedGeneration on an object with a generation is not current.
    seen = cond.get("observedGeneration")
    return gen is None or (seen is not None and seen >= gen)


def need(conds, ctype, where):
    c = next((c for c in conds if c.get("type") == ctype), None)
    if c is None:
        fails.append("%s: no %s condition" % (where, ctype))
    elif c.get("status") != "True":
        fails.append("%s: %s=%s (%s: %s)" % (where, ctype, c.get("status"), c.get("reason"), str(c.get("message"))[:160]))
    elif not current(c):
        fails.append("%s: %s describes generation %s, the object is at %s (rerun once the controller catches up)"
                     % (where, ctype, c.get("observedGeneration"), gen))


# Only Envoy Gateway's own status entries count: another controller's True must not mask Envoy Gateway's False.
CONTROLLER = os.environ.get("EG_CONTROLLER_PREFIX", "gateway.envoyproxy.io/")


def ours(entries):
    return [e for e in entries if str(e.get("controllerName", "")).startswith(CONTROLLER)]


status = obj.get("status") or {}
if shape == "policy":
    ancestors = ours(status.get("ancestors") or [])
    if not ancestors:
        fails.append("no ancestor status from Envoy Gateway (%s*) yet" % CONTROLLER)
    for a in ancestors:
        ref = a.get("ancestorRef") or {}
        where = "ancestor " + "/".join(str(ref.get(k)) for k in ("kind", "name", "sectionName") if ref.get(k))
        need(a.get("conditions") or [], "Accepted", where)
    count, what = len(ancestors), "ancestors"

    # Coverage: every target the policy names needs its own accepted, current ancestor status.
    spec = obj.get("spec") or {}
    targets = list(spec.get("targetRefs") or [])
    if spec.get("targetRef"):
        targets.append(spec["targetRef"])
    routes = json.loads(os.environ.get("ROUTES_JSON") or "{}")
    if spec.get("targetSelectors"):
        fails.append("spec.targetSelectors cannot be checked for coverage (use targetRefs)")
    if not targets and not spec.get("targetSelectors"):
        fails.append("no targetRefs in spec: nothing says what the policy applies to")
    for t in targets:
        tkind, tname, tsection = t.get("kind"), t.get("name"), t.get("sectionName")
        if tkind == "Gateway":
            expected = [(tname, tsection)]
        elif tkind == "HTTPRoute":
            route = routes.get(tname)
            if not route:
                fails.append("target HTTPRoute/%s: not found, so its ancestors cannot be derived" % tname)
                continue
            expected = [(r.get("name"), r.get("sectionName")) for r in (route.get("spec") or {}).get("parentRefs") or []]
            if not expected:
                fails.append("target HTTPRoute/%s has no parentRefs" % tname)
                continue
        else:
            fails.append("target %s/%s: kind not supported by this gate, coverage cannot be shown" % (tkind, tname))
            continue
        for gw, section in expected:
            # An ancestor covers a (Gateway, listener) when it names the Gateway and either no listener or that listener.
            match = [a for a in ancestors if (a.get("ancestorRef") or {}).get("name") == gw
                     and (a.get("ancestorRef") or {}).get("sectionName") in (None, "", section)]
            where = "target %s/%s%s (ancestor Gateway %s%s)" % (tkind, tname, ("/" + tsection) if tsection else "", gw,
                                                                ("/" + section) if section else "")
            accepted = [a for a in match
                        if any(c.get("type") == "Accepted" and c.get("status") == "True" and current(c)
                               for c in a.get("conditions") or [])]
            if not match:
                fails.append("%s: no Envoy Gateway status at all" % where)
            elif not accepted:
                fails.append("%s: no current Accepted=True status" % where)
else:
    parents = ours(status.get("parents") or [])
    refs = (obj.get("spec") or {}).get("parentRefs") or []
    if not refs:
        fails.append("no parentRefs in spec")

    def key(ref):
        return (ref.get("name"), ref.get("sectionName"), ref.get("namespace"))

    for ref in refs:
        where = "parent %s/%s" % (ref.get("name"), ref.get("sectionName") or "*")
        match = [p for p in parents if key(p.get("parentRef") or {}) == key(ref)]
        if not match:
            fails.append(where + ": no Envoy Gateway status for this parentRef")
            continue
        for p in match:  # each status entry on its own, never merged
            need(p.get("conditions") or [], "Accepted", where)
            need(p.get("conditions") or [], "ResolvedRefs", where)
    count, what = len(refs), "parents"
for f in fails:
    print("FAIL %s: %s" % (label, f))
if not fails:
    print("ok   %s: accepted on all %d %s at generation %s" % (label, count, what, gen))
sys.exit(1 if fails else 0)
PY
}

# check KIND NAME policy|route required|optional
# Absence is only ever concluded from --ignore-not-found's empty answer; any other kubectl error (forbidden, timeout,
# no such resource type) fails the gate.
check() {
  local json err
  if ! json=$(kubectl --context "$CTX" -n "$NS" get "$1" "$2" -o json --ignore-not-found 2>"$ERR"); then
    err="$(head -c 300 "$ERR" | tr '\n' ' ')"
    echo "FAIL $1/$2: kubectl get failed: $err"; rc=1; return
  fi
  if [ -z "$json" ]; then
    if [[ $4 == required ]]; then echo "FAIL $1/$2: not found"; rc=1; else echo "skip $1/$2: not deployed"; fi
    return
  fi
  # A policy's route targets: their parentRefs say which Gateways must show an accepted status for it.
  local routes_json="{}" rname rj
  if [[ $3 == policy ]]; then
    while IFS= read -r rname; do
      [[ -n "$rname" ]] || continue
      if ! rj=$(kubectl --context "$CTX" -n "$NS" get httproute "$rname" -o json --ignore-not-found 2>"$ERR"); then
        echo "FAIL $1/$2: kubectl get httproute/$rname failed: $(head -c 300 "$ERR" | tr '\n' ' ')"; rc=1; return
      fi
      routes_json=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); d[sys.argv[2]]=json.loads(sys.argv[3]) if sys.argv[3].strip() else None; print(json.dumps(d))' "$routes_json" "$rname" "$rj")
    done < <(python3 -c '
import json, sys
spec = json.loads(sys.argv[1]).get("spec") or {}
for t in list(spec.get("targetRefs") or []) + ([spec["targetRef"]] if spec.get("targetRef") else []):
    if t.get("kind") == "HTTPRoute" and t.get("name"):
        print(t["name"])' "$json")
  fi
  ROUTES_JSON="$routes_json" judge "$1" "$2" "$3" "$json" || rc=1
}

echo "policy-gate: context $CTX, namespace $NS, environment $ENV"
check securitypolicy "$ENV-auth" policy required
check clienttrafficpolicy "$ENV" policy required
check envoyextensionpolicy "$ENV" policy optional
check backendtrafficpolicy "$ENV-auth-ratelimit" policy optional
check httproute "$ENV" route required
check httproute "$ENV-http-redirect" route required
[ $rc = 0 ] && echo "policy-gate: PASS" || echo "policy-gate: FAIL (a rejected policy makes the route return 500; roll back with authService.enabled=false)"
exit $rc
