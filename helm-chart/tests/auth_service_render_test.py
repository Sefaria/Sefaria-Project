#!/usr/bin/env python3
"""
Renders the chart with each environment's HelmRelease values, with authService off (as shipped) and on, and checks
what the auth service work must and must not render:

- Off: no auth-service object, no x-sefaria-* header handling, and no x-sefaria-* nginx log fields.
- On: the listener strips client-sent x-sefaria-* headers, so a fail-open pass cannot carry a forged tier or project;
  nginx logs the x-sefaria-* fields that ext_authz sets; ext_authz fails open with an explicit timeout.
- Both: the nginx access log records the scrubbed request URI and referer, never the raw ones, and no key header.

Needs helm and PyYAML. Run from the repository root: python3 helm-chart/tests/auth_service_render_test.py
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CHART = ROOT / "helm-chart" / "sefaria"
ENVS = ("staging", "preprod", "prod")
SEFARIA_HEADERS = {"x-sefaria-tier", "x-sefaria-project", "x-sefaria-auth-result", "x-sefaria-meter"}
NGINX_LOG_FIELDS = {
    "sefariaProject": "$http_x_sefaria_project",
    "sefariaTier": "$http_x_sefaria_tier",
    "sefariaAuthResult": "$http_x_sefaria_auth_result",
}

failures = []


def check(condition, message):
    print(("ok: " if condition else "FAIL: ") + message)
    if not condition:
        failures.append(message)


def helm_release(env):
    with open(ROOT / "envs" / env / "helmrelease.yaml") as f:
        return next(d for d in yaml.safe_load_all(f) if d and d.get("kind") == "HelmRelease")


def render(release, enabled):
    with tempfile.NamedTemporaryFile("w", suffix=".yaml") as values:
        yaml.safe_dump(release["spec"].get("values", {}), values)
        values.flush()
        args = ["helm", "template", release["metadata"]["name"], str(CHART), "-f", values.name]
        if enabled:
            # A release writes the image tag; rendering with the flag on fails without one.
            args += ["--set", "authService.enabled=true", "--set", "authService.image.tag=render-test"]
        result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"helm template failed for {release['metadata']['name']} (enabled={enabled}):\n{result.stderr}")
    return [d for d in yaml.safe_load_all(result.stdout) if d]


def find(objects, kind, name=None):
    return [o for o in objects if o["kind"] == kind and (name is None or re.search(name, o["metadata"]["name"]))]


def nginx_log_format(objects):
    (configmap,) = find(objects, "ConfigMap", r"^nginx-conf-")
    match = re.search(r"log_format structured escape=json '(.*?)';", configmap["data"]["nginx.template.conf"])
    assert match, "no structured log_format in the nginx config"
    return match.group(1)


def check_log_format_never_logs_a_key(where, log_format):
    check('"requestUrl": "$request_uri_scrubbed"' in log_format, f"{where}: nginx logs the scrubbed request URI")
    check('"referer": "$referer_scrubbed"' in log_format, f"{where}: nginx logs the scrubbed referer")
    check(
        not re.search(r"\$(request_uri|http_referer|args|query_string|arg_api_?key|http_x_api_key)\b", log_format),
        f"{where}: nginx logs no raw URI, query string, referer or key header",
    )


def check_off(env, objects):
    where = f"{env} off"
    check(not find(objects, "Deployment", r"-auth-service$"), f"{where}: no auth-service Deployment")
    check(not find(objects, "Service", r"^auth-service-"), f"{where}: no auth-service Service")
    check(not find(objects, "SecurityPolicy"), f"{where}: no SecurityPolicy (ext_authz is not attached)")
    check(not find(objects, "HTTPRoute", r"-http-redirect$"), f"{where}: port 80 is not turned into a redirect")
    check(
        all("headers" not in p["spec"] for p in find(objects, "ClientTrafficPolicy")),
        f"{where}: the ClientTrafficPolicy has no header rules",
    )
    log_format = nginx_log_format(objects)
    check(not any(field in log_format for field in NGINX_LOG_FIELDS), f"{where}: no x-sefaria-* nginx log fields")
    check_log_format_never_logs_a_key(where, log_format)


def check_on(env, objects):
    where = f"{env} on"
    check(len(find(objects, "Deployment", r"-auth-service$")) == 1, f"{where}: one auth-service Deployment")

    (policy,) = find(objects, "ClientTrafficPolicy")
    removed = set(policy["spec"].get("headers", {}).get("earlyRequestHeaders", {}).get("remove", []))
    check(removed >= SEFARIA_HEADERS, f"{where}: the listener strips client-sent {sorted(SEFARIA_HEADERS)}")
    targets = policy["spec"].get("targetRefs") or []
    check(
        bool(targets) and all(t.get("sectionName") for t in targets),
        f"{where}: the header strip targets named listeners (a Gateway-wide policy is rejected whole)",
    )

    (security,) = find(objects, "SecurityPolicy")
    ext_auth = security["spec"]["extAuth"]
    check(ext_auth.get("failOpen") is True, f"{where}: ext_authz fails open")
    check(ext_auth.get("timeout") == "200ms", f"{where}: ext_authz has an explicit 200ms timeout")
    check("bodyToExtAuth" not in ext_auth, f"{where}: no route-wide bodyToExtAuth")

    log_format = nginx_log_format(objects)
    check(
        all(f'"{field}": "{variable}"' in log_format for field, variable in NGINX_LOG_FIELDS.items()),
        f"{where}: nginx logs {sorted(NGINX_LOG_FIELDS)} from the ext_authz headers",
    )
    check_log_format_never_logs_a_key(where, log_format)


def main():
    for env in ENVS:
        release = helm_release(env)
        check(release["spec"]["values"]["authService"]["enabled"] is False, f"{env}: ships authService.enabled false")
        check_off(env, render(release, enabled=False))
        check_on(env, render(release, enabled=True))
    if failures:
        sys.exit(f"{len(failures)} check(s) failed")


if __name__ == "__main__":
    main()
