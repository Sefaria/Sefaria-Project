#!/usr/bin/env python3
"""
Assertions on a `helm template` render of the chart with authService enabled: the objects the auth service needs, with
the names, wiring and listener attachments that Envoy Gateway accepts. Pair it with a render with the flag off, which
must contain none of them (render-check.sh does both per environment).

  render_check.py RENDERED.yaml [--dsn-secret auth-service-registry]   exit 0 when every check passes
  render_check.py --off RENDERED.yaml                                   the flag-off render: no auth-service objects

Needs PyYAML only. helm-chart/tests/auth_service_render_test.py checks the header strip, the nginx log fields and the
key scrubbing; this file checks names, wiring and listener attachments, so the two do not overlap.
"""

import argparse
import sys

import yaml

GATEWAY_API = "gateway.networking.k8s.io"
SEFARIA_HEADERS = {"x-sefaria-tier", "x-sefaria-project", "x-sefaria-auth-result", "x-sefaria-meter"}
AUTH_KINDS = ("SecurityPolicy",)

failures = []


def check(condition, message):
    print(("ok:   " if condition else "FAIL: ") + message)
    if not condition:
        failures.append(message)


def load(path):
    with open(path) as f:
        return [d for d in yaml.safe_load_all(f) if d]


def objects(docs, kind, name=None):
    return [d for d in docs if d.get("kind") == kind and (name is None or d["metadata"]["name"] == name)]


def auth_objects(docs):
    return [
        d
        for d in docs
        if d.get("kind") in AUTH_KINDS
        or "auth-service" in d["metadata"]["name"]
        or (d.get("kind") == "HTTPRoute" and d["metadata"]["name"].endswith("-http-redirect"))
    ]


def check_off(docs):
    found = sorted("{}/{}".format(d["kind"], d["metadata"]["name"]) for d in auth_objects(docs))
    check(not found, "flag off renders no auth-service object (found: {})".format(", ".join(found) or "none"))
    for ctp in objects(docs, "ClientTrafficPolicy"):
        removed = set(((ctp["spec"].get("headers") or {}).get("earlyRequestHeaders") or {}).get("remove") or [])
        check(
            not removed & SEFARIA_HEADERS,
            "flag off: ClientTrafficPolicy/{} strips no x-sefaria-* header".format(ctp["metadata"]["name"]),
        )


def check_on(docs, dsn_secret):
    gateways = objects(docs, "Gateway")
    check(len(gateways) == 1, f"exactly one Gateway (got {len(gateways)})")
    if not gateways:
        return
    env = gateways[0]["metadata"]["name"]
    listeners = gateways[0]["spec"]["listeners"]
    https = sorted(lst["name"] for lst in listeners if lst["protocol"] == "HTTPS" and lst["port"] == 443)
    http = sorted(lst["name"] for lst in listeners if lst["port"] == 80)
    print(f"info: environment {env}: {len(https)} HTTPS listeners, {len(http)} port-80 listeners")
    # An empty listener set would make every attachment comparison below pass vacuously.
    check(bool(https) and bool(http), f"the Gateway has HTTPS (443) and port-80 listeners ({len(https)}, {len(http)})")

    deployments = objects(docs, "Deployment", env + "-auth-service")
    check(len(deployments) == 1, f"Deployment {env}-auth-service")
    check(
        not [d for d in objects(docs, "Deployment") if d["metadata"]["name"].startswith("auth-service-")],
        "no workload named auth-service-<env> (workloads are <env>-<service>)",
    )
    check(
        not [d for d in objects(docs, "Deployment") if "postgres" in d["metadata"]["name"]],
        "no chart-managed Postgres (the registry is the cluster's shared database)",
    )
    if deployments:
        container = deployments[0]["spec"]["template"]["spec"]["containers"][0]
        env_vars = {e["name"]: e for e in container.get("env", [])}
        ref = ((env_vars.get("PG_DSN") or {}).get("valueFrom") or {}).get("secretKeyRef") or {}
        check(
            ref.get("name") == dsn_secret and ref.get("key") == "AUTH_PG_DSN",
            "PG_DSN comes from Secret {} key AUTH_PG_DSN (got {})".format(dsn_secret, ref or "a literal or nothing"),
        )
        image = container["image"]
        check(
            ":" in image.rsplit("/", 1)[-1] and not image.endswith(":latest") and not image.endswith(":"),
            f"auth-service image is pinned, not :latest or untagged ({image})",
        )
        replicas = deployments[0]["spec"].get("replicas", 1)
        pdbs = [p for p in objects(docs, "PodDisruptionBudget") if "auth-service" in p["metadata"]["name"]]
        check(
            (replicas > 1) == bool(pdbs),
            f"a PDB exactly when there is more than one replica (replicas {replicas}, PDBs {len(pdbs)})",
        )

    services = objects(docs, "Service", "auth-service-" + env)
    check(len(services) == 1, f"Service auth-service-{env}")
    if services:
        ports = [p.get("name") for p in services[0]["spec"]["ports"]]
        check(ports == ["http", "grpc"], "named service ports http,grpc (got {})".format(",".join(map(str, ports))))
        if deployments:
            # The Service must reach the pods: its selector matches the pod labels, and each port's targetPort is a
            # port the container declares (by name or number).
            pod = deployments[0]["spec"]["template"]
            labels = (pod.get("metadata") or {}).get("labels") or {}
            selector = services[0]["spec"].get("selector") or {}
            check(
                bool(selector) and all(labels.get(k) == v for k, v in selector.items()),
                f"the Service selector {selector} matches the auth-service pod labels",
            )
            declared = pod["spec"]["containers"][0].get("ports") or []
            names = {cp.get("name") for cp in declared}
            numbers = {cp.get("containerPort") for cp in declared}
            for sp in services[0]["spec"]["ports"]:
                target = sp.get("targetPort", sp.get("port"))
                check(
                    target in names or target in numbers,
                    f"Service port {sp.get('name')} targets a declared container port ({target})",
                )
            # Each Service port must land on the container port its server listens on (HTTP_ADDR, GRPC_ADDR): a grpc
            # port aimed at the HTTP server would make every ext_authz call fail, and fail open.
            env_vars = {e["name"]: e.get("value", "") for e in pod["spec"]["containers"][0].get("env", [])}
            listen = {"http": env_vars.get("HTTP_ADDR", ""), "grpc": env_vars.get("GRPC_ADDR", "")}
            by_name = {cp.get("name"): cp.get("containerPort") for cp in declared}
            for sp in services[0]["spec"]["ports"]:
                target = sp.get("targetPort", sp.get("port"))
                resolved = by_name.get(target, target)
                want = listen.get(sp.get("name"), "")
                check(
                    bool(want) and want.rsplit(":", 1)[-1] == str(resolved),
                    f"Service port {sp.get('name')} reaches the {sp.get('name')} server (container port {resolved}, listens on {want or '?'})",
                )
            grpc = [sp.get("port") for sp in services[0]["spec"]["ports"] if sp.get("name") == "grpc"]
            for p in objects(docs, "SecurityPolicy"):
                ports_used = [
                    b.get("port") for b in ((p["spec"].get("extAuth") or {}).get("grpc") or {}).get("backendRefs") or []
                ]
                check(
                    bool(grpc) and ports_used == grpc,
                    f"ext_authz calls the Service's grpc port ({ports_used} vs {grpc})",
                )

    policies = objects(docs, "SecurityPolicy")
    check([p["metadata"]["name"] for p in policies] == [env + "-auth"], f"one SecurityPolicy, {env}-auth")
    for p in policies:
        spec = p["spec"]
        targets = [(t.get("group"), t.get("kind"), t.get("name")) for t in spec.get("targetRefs") or []]
        check(
            targets == [(GATEWAY_API, "HTTPRoute", env)],
            f"SecurityPolicy targets HTTPRoute {env} only (got {targets})",
        )
        check("targetRef" not in spec, "SecurityPolicy uses targetRefs, not the deprecated targetRef")
        ext = spec.get("extAuth") or {}
        check(ext.get("failOpen") is True, "ext_authz fails open")
        check(
            bool(ext.get("timeout")),
            "ext_authz timeout is explicit ({}; Envoy Gateway's default is 10s)".format(ext.get("timeout")),
        )
        backends = [(b.get("name"), b.get("port")) for b in (ext.get("grpc") or {}).get("backendRefs") or []]
        check(
            backends == [("auth-service-" + env, 9090)],
            f"ext_authz calls auth-service-{env}:9090 over gRPC (got {backends})",
        )
        check("backendRef" not in (ext.get("grpc") or {}), "ext_authz uses backendRefs, not the deprecated backendRef")
        check(
            set(ext.get("headersToExtAuth") or []) == {"x-api-key", "authorization", "origin"},
            "only x-api-key, authorization and origin go to the auth service",
        )
        check("bodyToExtAuth" not in ext, "no request body goes to the auth service")
        check("jwt" not in spec, "no jwt block (phase 1 is ext_authz only)")
        annotations = p["metadata"].get("annotations") or {}
        check("cert-manager.io/cluster-issuer" not in annotations, "no cert-manager annotation on the SecurityPolicy")

    ctps = objects(docs, "ClientTrafficPolicy")
    check(len(ctps) == 1, f"one ClientTrafficPolicy (got {len(ctps)})")
    for ctp in ctps:
        spec = ctp["spec"]
        removed = set(((spec.get("headers") or {}).get("earlyRequestHeaders") or {}).get("remove") or [])
        check(
            removed >= SEFARIA_HEADERS,
            "client-sent {} stripped at the listener".format(",".join(sorted(SEFARIA_HEADERS))),
        )
        check("targetRef" not in spec, "ClientTrafficPolicy uses targetRefs, not the deprecated targetRef")
        refs = spec.get("targetRefs") or []
        sections = [t.get("sectionName") for t in refs]
        others = [t for t in refs if (t.get("group"), t.get("kind"), t.get("name")) != (GATEWAY_API, "Gateway", env)]
        check(not others and bool(refs), f"every ClientTrafficPolicy targetRef is this environment's Gateway {env}")
        # Envoy Gateway rejects a policy on the shared port-80 listeners or on the whole Gateway; then neither the header
        # strip nor the client IP detection applies.
        check(None not in sections, "every ClientTrafficPolicy targetRef names a listener (sectionName)")
        check(
            sorted(s for s in sections if s) == https,
            "the ClientTrafficPolicy targets exactly the HTTPS (443) listeners, none on port 80",
        )

    routes = {r["metadata"]["name"]: r for r in objects(docs, "HTTPRoute")}
    app = routes.get(env)
    check(app is not None, f"HTTPRoute {env}")
    if app:
        check(
            {p.get("name") for p in app["spec"]["parentRefs"]} == {env},
            f"the app HTTPRoute attaches to Gateway {env} only",
        )
        check(
            sorted(p.get("sectionName") for p in app["spec"]["parentRefs"]) == https,
            "the app HTTPRoute is served on the HTTPS listeners only",
        )
    redirect = routes.get(env + "-http-redirect")
    check(redirect is not None, f"HTTPRoute {env}-http-redirect")
    if redirect:
        check(
            {p.get("name") for p in redirect["spec"]["parentRefs"]} == {env},
            f"the redirect HTTPRoute attaches to Gateway {env} only",
        )
        check(
            sorted(p.get("sectionName") for p in redirect["spec"]["parentRefs"]) == http,
            "port 80 serves only the redirect route",
        )
        filters = redirect["spec"]["rules"][0].get("filters") or [{}]
        check(
            (filters[0].get("requestRedirect") or {}).get("scheme") == "https", "the port-80 route redirects to https"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("rendered")
    parser.add_argument("--off", action="store_true", help="the render has authService.enabled=false")
    parser.add_argument("--dsn-secret", default="auth-service-registry")
    args = parser.parse_args()
    docs = load(args.rendered)
    if args.off:
        check_off(docs)
    else:
        check_on(docs, args.dsn_secret)
    print(f"{args.rendered}: {len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
