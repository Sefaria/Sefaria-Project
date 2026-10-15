#!/usr/bin/env python3
"""
Renders the local stack's Envoy config and nginx template into the run directory.

Envoy: a static stand-in for what Envoy Gateway 1.9 generates from the chart's SecurityPolicy, ClientTrafficPolicy
and EnvoyExtensionPolicy. The Lua body is read from helm-chart/sefaria/templates/gateway/extensionpolicy.yaml, so it
cannot drift from the chart.

nginx: helm-chart/sefaria/conf/nginx.template.conf.tpl rendered by Helm's own `tpl` (in a container), then the local
deviations listed in LOCAL_NGINX_DEVIATIONS. Each must match at least once, so a template change that removes the
target fails loudly instead of silently diverging.

Usage: render_configs.py <run-dir> [--envoy-variant default|keepunchanged]
"""
import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys

import yaml

STACK_DIR = pathlib.Path(__file__).resolve().parent
REPO = STACK_DIR.parents[2]
CHART = REPO / "helm-chart" / "sefaria"
HELM_IMAGE = "alpine/helm:3.16.4"

AUTHZ_TIMEOUT = "0.2s"
ROOT_DOMAIN = "gateway.test"
DJANGO_FLAG_ON = 8100
DJANGO_FLAG_OFF = 8101

LOCAL_NGINX_DEVIATIONS = [
    ("upstream to host Django instead of Varnish", "server ${VARNISH_HOST}:8040;",
     "server ${VARNISH_HOST}:%d;" % DJANGO_FLAG_ON),
    ("keep the port in Host (plain HTTP on :10080)", "proxy_set_header Host $host;",
     "proxy_set_header Host $http_host;"),
    ("forwarded proto is http locally", "proxy_set_header X-Forwarded-Proto https;",
     "proxy_set_header X-Forwarded-Proto $scheme;"),
]


def chart_lua():
    text = (CHART / "templates" / "gateway" / "extensionpolicy.yaml").read_text()
    match = re.search(r"inline: \|\n((?:        .*\n|\n)+)", text)
    if not match:
        sys.exit("render: Lua block not found in extensionpolicy.yaml")
    return "\n".join(line[8:] for line in match.group(1).splitlines()) + "\n"


def socket(address, port):
    return {"socket_address": {"address": address, "port_value": port}}


def cluster(name, host, port, http2=False, extra=None):
    c = {
        "name": name,
        "type": "STRICT_DNS",
        # host.docker.internal also resolves to IPv6, where host Django (bound to 127.0.0.1) is not listening.
        "dns_lookup_family": "V4_ONLY",
        "connect_timeout": "1s",
        "load_assignment": {"cluster_name": name, "endpoints": [{"lb_endpoints": [
            {"endpoint": {"address": socket(host, port)}}]}]},
    }
    if http2:
        c["typed_extension_protocol_options"] = {"envoy.extensions.upstreams.http.v3.HttpProtocolOptions": {
            "@type": "type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions",
            "explicit_http_config": {"http2_protocol_options": {}}}}
    c.update(extra or {})
    return c


def vhost(name, hosts, cluster_name, timeout="120s"):
    domains = []
    for h in hosts:
        domains += [h, h + ":*"]
    return {"name": name, "domains": domains,
            "routes": [{"match": {"prefix": "/"}, "route": {"cluster": cluster_name, "timeout": timeout}}]}


def hcm(stat_prefix, strip, escaped_slashes):
    cfg = {
        "@type": "type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
        "stat_prefix": stat_prefix,
        "codec_type": "HTTP1",
        "use_remote_address": True,
        "normalize_path": True,
        "merge_slashes": True,
        "path_with_escaped_slashes_action": escaped_slashes,
        "route_config": {"name": stat_prefix, "virtual_hosts": [
            vhost("echo", ["echo." + ROOT_DOMAIN], "echo"),
            vhost("direct", ["direct." + ROOT_DOMAIN], "django_direct"),
            vhost("flagoff", ["flagoff." + ROOT_DOMAIN], "django_flagoff"),
            vhost("site", ["*"], "nginx", timeout="300s"),
        ]},
        "http_filters": [
            {"name": "envoy.filters.http.ext_authz", "typed_config": {
                "@type": "type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthz",
                "transport_api_version": "V3",
                "failure_mode_allow": True,
                "grpc_service": {"envoy_grpc": {"cluster_name": "authsvc"}, "timeout": AUTHZ_TIMEOUT},
                "allowed_headers": {"patterns": [
                    {"exact": h, "ignore_case": True} for h in ("x-api-key", "authorization", "origin")]},
            }},
            {"name": "envoy.filters.http.lua", "typed_config": {
                "@type": "type.googleapis.com/envoy.extensions.filters.http.lua.v3.Lua",
                "default_source_code": {"inline_string": chart_lua()},
            }},
            {"name": "envoy.filters.http.router", "typed_config": {
                "@type": "type.googleapis.com/envoy.extensions.filters.http.router.v3.Router"}},
        ],
    }
    if strip:
        cfg["xff_num_trusted_hops"] = 1
        cfg["early_header_mutation_extensions"] = [{
            "name": "envoy.http.early_header_mutation.header_mutation",
            "typed_config": {
                "@type": "type.googleapis.com/envoy.extensions.http.early_header_mutation.header_mutation.v3.HeaderMutation",
                "mutations": [{"remove": h} for h in ("x-sefaria-tier", "x-sefaria-project", "x-sefaria-auth-result")],
            }}]
    return cfg


def listener(name, port, strip, escaped_slashes):
    return {"name": name, "address": socket("0.0.0.0", port), "filter_chains": [{"filters": [{
        "name": "envoy.filters.network.http_connection_manager",
        "typed_config": hcm(name, strip, escaped_slashes)}]}]}


def envoy_config(variant):
    escaped = {"default": "UNESCAPE_AND_REDIRECT", "keepunchanged": "KEEP_UNCHANGED"}[variant]
    # k8s readiness stand-in: /readyz every 3s, failureThreshold 3. With panic routing off, a not-ready auth
    # service has no endpoint, so ext_authz errors and fails open, as with a pod outside the Service endpoints.
    authsvc_extra = {
        "health_checks": [{"timeout": "1s", "interval": "3s", "unhealthy_threshold": 3, "healthy_threshold": 1,
                           "http_health_check": {"path": "/readyz", "codec_client_type": "HTTP1"}}],
        "common_lb_config": {"healthy_panic_threshold": {"value": 0}},
    }
    authsvc = cluster("authsvc", "authsvc", 9090, http2=True, extra=authsvc_extra)
    authsvc["load_assignment"]["endpoints"][0]["lb_endpoints"][0]["endpoint"]["health_check_config"] = {
        "port_value": 8080}
    return {
        "admin": {"address": socket("0.0.0.0", 19000)},
        "static_resources": {
            "listeners": [
                listener("strip_on", 10080, True, escaped),
                listener("strip_off", 10081, False, escaped),
            ],
            "clusters": [
                authsvc,
                cluster("nginx", "nginx", 80),
                cluster("echo", "echo", 8080),
                cluster("django_direct", "host.docker.internal", DJANGO_FLAG_ON),
                cluster("django_flagoff", "host.docker.internal", DJANGO_FLAG_OFF),
            ],
        },
    }


NGINX_VALUES = """\
domains:
  root:
    - url: "%s"
      code: [en, he]
  modules:
""" % ROOT_DOMAIN
# The same call as templates/configmap/nginx.yaml, inside a ConfigMap so Helm's YAML check passes.
NGINX_TEMPLATE_WRAPPER = """\
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-conf-local
data:
  nginx.template.conf: |
    {{- tpl (.Files.Get "conf/nginx.template.conf.tpl") . | nindent 4 }}
"""


def render_nginx(run_dir):
    chart = run_dir / "nginx-chart"
    shutil.rmtree(chart, ignore_errors=True)
    (chart / "templates").mkdir(parents=True)
    (chart / "conf").mkdir()
    shutil.copy(CHART / "conf" / "nginx.template.conf.tpl", chart / "conf")
    (chart / "Chart.yaml").write_text("apiVersion: v2\nname: nginx-local\nversion: 0.0.0\n")
    values = NGINX_VALUES + _modules_yaml() + "instrumentation:\n  enabled: false\n"
    (chart / "values.yaml").write_text(values)
    (chart / "templates" / "configmap.yaml").write_text(NGINX_TEMPLATE_WRAPPER)
    out = subprocess.run(
        ["docker", "run", "--rm", "-v", "%s:/chart:ro" % chart, HELM_IMAGE, "template", "local", "/chart"],
        check=True, capture_output=True, text=True).stdout
    rendered = yaml.safe_load(out)["data"]["nginx.template.conf"]
    for why, old, new in LOCAL_NGINX_DEVIATIONS:
        if old not in rendered:
            sys.exit("render: nginx deviation no longer applies (%s): %r not found" % (why, old))
        rendered = rendered.replace(old, new)
    (run_dir / "nginx.template.conf").write_text(rendered)


def _modules_yaml():
    """The chart's own domains.modules block from values.yaml (voices), so module redirects match the chart."""
    text = (CHART / "values.yaml").read_text()
    match = re.search(r"^  modules:\n((?:    .*\n)+)", text, re.M)
    if not match:
        sys.exit("render: domains.modules not found in values.yaml")
    return match.group(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("run_dir")
    parser.add_argument("--envoy-variant", default="default", choices=["default", "keepunchanged"])
    parser.add_argument("--only", choices=["envoy", "nginx"])
    args = parser.parse_args()
    run_dir = pathlib.Path(args.run_dir).resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    if args.only in (None, "envoy"):
        (run_dir / "envoy.yaml").write_text(json.dumps(envoy_config(args.envoy_variant), indent=2) + "\n")
        (run_dir / "envoy.variant").write_text(args.envoy_variant + "\n")
    if args.only in (None, "nginx"):
        render_nginx(run_dir)


if __name__ == "__main__":
    main()
