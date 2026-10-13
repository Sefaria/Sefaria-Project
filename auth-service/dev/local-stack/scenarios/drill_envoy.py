#!/usr/bin/env python3
"""
Renders the drill Envoy: the stack's own listener config (render_configs.py) with every route sent to the echo
server, on three listeners.

  10080  ext_authz to the auth service, with the /readyz health check (the stack's k8s-readiness stand-in)
  10082  ext_authz to the same endpoints with no health check, as when Envoy keeps sending to a not-ready pod
  10083  no ext_authz, the baseline for latency

Usage: drill_envoy.py <run-dir> [authsvc-host ...]
"""
import copy
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import render_configs as rc  # noqa: E402


def with_endpoints(cluster, hosts):
    template = cluster["load_assignment"]["endpoints"][0]["lb_endpoints"][0]
    endpoints = []
    for host in hosts:
        ep = copy.deepcopy(template)
        ep["endpoint"]["address"]["socket_address"]["address"] = host
        endpoints.append(ep)
    cluster["load_assignment"]["endpoints"][0]["lb_endpoints"] = endpoints
    return cluster


def echo_only(listener, authz_cluster):
    hcm = listener["filter_chains"][0]["filters"][0]["typed_config"]
    hcm["route_config"]["virtual_hosts"] = [rc.vhost("all", ["*"], "echo")]
    filters = []
    for f in hcm["http_filters"]:
        if f["name"] == "envoy.filters.http.ext_authz":
            if authz_cluster is None:
                continue
            f["typed_config"]["grpc_service"]["envoy_grpc"]["cluster_name"] = authz_cluster
        filters.append(f)
    hcm["http_filters"] = filters
    return listener


def main():
    run_dir = pathlib.Path(sys.argv[1])
    hosts = sys.argv[2:] or ["authsvc"]
    cfg = rc.envoy_config("default")
    clusters = {c["name"]: c for c in cfg["static_resources"]["clusters"]}
    hc = with_endpoints(clusters["authsvc"], hosts)
    nohc = copy.deepcopy(hc)
    nohc["name"] = nohc["load_assignment"]["cluster_name"] = "authsvc_nohc"
    nohc.pop("health_checks")
    nohc.pop("common_lb_config")
    for ep in nohc["load_assignment"]["endpoints"][0]["lb_endpoints"]:
        ep["endpoint"].pop("health_check_config", None)
    cfg["static_resources"]["listeners"] = [
        echo_only(rc.listener("hc", 10080, True, "UNESCAPE_AND_REDIRECT"), "authsvc"),
        echo_only(rc.listener("nohc", 10082, True, "UNESCAPE_AND_REDIRECT"), "authsvc_nohc"),
        echo_only(rc.listener("noauthz", 10083, True, "UNESCAPE_AND_REDIRECT"), None),
    ]
    cfg["static_resources"]["clusters"] = [hc, nohc, clusters["echo"]]
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "envoy.yaml").write_text(json.dumps(cfg, indent=2) + "\n")


if __name__ == "__main__":
    main()
