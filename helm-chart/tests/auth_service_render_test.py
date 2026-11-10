#!/usr/bin/env python3
"""
Renders the chart with each environment's HelmRelease values, with authService off (as shipped) and on, and checks
what the auth service work must and must not render:

- Off: no auth-service object, no x-sefaria-* header handling, and no x-sefaria-* nginx log fields.
- On: the listener strips client-sent x-sefaria-* headers, so a fail-open pass cannot carry a forged tier or project;
  nginx logs the x-sefaria-* fields that ext_authz sets; ext_authz fails open with an explicit timeout.
- Phase 1 policy, per environment file: mode observe, ext_authz fails open, no rate limiting; the flag-on render hands
  the auth service container the same mode. A self-test proves the policy check rejects a prod copy set to enforce.
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
SEFARIA_HEADERS = {
    "x-sefaria-tier",
    "x-sefaria-project",
    "x-sefaria-auth-result",
    "x-sefaria-meter",
    # nginx echoes this one to the caller, so a forged copy would be shown as the auth service's answer.
    "x-sefaria-key-status",
}
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


def helm_release(env, path=None):
    with open(path or ROOT / "envs" / env / "helmrelease.yaml") as f:
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


# Every variable the access log may record. A credential can arrive in the query string, the referer, a cookie or any
# request header, so a new variable fails the test until someone has checked it cannot carry a key. The URI and referer
# appear only in their scrubbed form, and the x-sefaria-* fields only with the flag on.
LOGGED_VARIABLES = {
    "ENV_NAME",
    "body_bytes_sent",
    "credential_transport",
    "hostname",
    "http_origin",
    "http_user_agent",
    "http_x_forwarded_proto",
    "http_x_original_forwarded_for",
    "referer_scrubbed",
    "remote_user",
    "request_length",
    "request_method",
    "request_time",
    "request_uri_scrubbed",
    "sec_fetch",
    "server_protocol",
    "session_cookie",
    "status",
    "time_local",
    "varnish_cache",
}


def check_log_format_never_logs_a_key(where, log_format, allowed):
    check('"requestUrl": "$request_uri_scrubbed"' in log_format, f"{where}: nginx logs the scrubbed request URI")
    check('"referer": "$referer_scrubbed"' in log_format, f"{where}: nginx logs the scrubbed referer")
    unexpected = set(re.findall(r"\$\{?(\w+)", log_format)) - allowed
    check(not unexpected, f"{where}: nginx logs only reviewed variables (unexpected: {sorted(unexpected)})")


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
    check_log_format_never_logs_a_key(where, log_format, LOGGED_VARIABLES)


def check_on(env, objects):
    where = f"{env} on"
    check(len(find(objects, "Deployment", r"-auth-service$")) == 1, f"{where}: one auth-service Deployment")
    # N-F1: the pod keeps answering for SHUTDOWN_DRAIN after SIGTERM, and Kubernetes must not kill it before the drain
    # and the gRPC (20 s) and HTTP (5 s) shutdown timeouts are over.
    deployments = find(objects, "Deployment", r"-auth-service$")
    pod = deployments[0]["spec"]["template"]["spec"] if deployments else {}
    container_env = {e["name"]: e.get("value") for e in pod.get("containers", [{}])[0].get("env", [])}
    drain = container_env.get("SHUTDOWN_DRAIN", "")
    seconds = int(drain[:-1]) if re.fullmatch(r"\d+s", drain) else None
    check(
        seconds is not None and seconds > 0,
        f"{where}: the auth service drains after SIGTERM (SHUTDOWN_DRAIN={drain!r})",
    )
    check(
        seconds is not None and pod.get("terminationGracePeriodSeconds", 30) >= seconds + 25,
        f"{where}: terminationGracePeriodSeconds covers the drain plus the shutdown timeouts",
    )

    (policy,) = find(objects, "ClientTrafficPolicy")
    removed = set(policy["spec"].get("headers", {}).get("earlyRequestHeaders", {}).get("remove", []))
    check(removed >= SEFARIA_HEADERS, f"{where}: the listener strips client-sent {sorted(SEFARIA_HEADERS)}")
    # The strip covers a listener only if the policy names it, and Envoy Gateway rejects a policy on the shared port-80
    # listeners or the whole Gateway. So it must name exactly the Gateway's HTTPS listeners, the site must be served on
    # those alone, and port 80 must serve nothing but the redirect to HTTPS.
    (gateway,) = find(objects, "Gateway")
    https = {
        (gateway["metadata"]["name"], li["name"]) for li in gateway["spec"]["listeners"] if li["protocol"] == "HTTPS"
    }
    http = {(gateway["metadata"]["name"], li["name"]) for li in gateway["spec"]["listeners"] if li["port"] == 80}
    targets = policy["spec"].get("targetRefs") or []
    check(
        bool(https)
        and all(t.get("kind") == "Gateway" for t in targets)
        and {(t["name"], t.get("sectionName")) for t in targets} == https,
        f"{where}: the header strip targets exactly the Gateway's HTTPS listeners",
    )

    def parents(route):
        return {(ref["name"], ref.get("sectionName")) for ref in route["spec"]["parentRefs"]}

    (site,) = find(objects, "HTTPRoute", f"^{re.escape(gateway['metadata']['name'])}$")
    check(parents(site) == https, f"{where}: the site route is served on the HTTPS listeners only")
    redirects = find(objects, "HTTPRoute", r"-http-redirect$")
    check(
        len(redirects) == 1
        and parents(redirects[0]) == http
        and [r.get("filters") for r in redirects[0]["spec"]["rules"]]
        == [[{"type": "RequestRedirect", "requestRedirect": {"scheme": "https", "statusCode": 301}}]],
        f"{where}: port 80 serves only a redirect to HTTPS",
    )
    check(
        all(parents(route).isdisjoint(http) for route in find(objects, "HTTPRoute") if route not in redirects),
        f"{where}: no other route is served on port 80",
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
    allowed = LOGGED_VARIABLES | {variable.lstrip("$") for variable in NGINX_LOG_FIELDS.values()}
    check_log_format_never_logs_a_key(where, log_format, allowed)


def policy_problems(release):
    """What is wrong with this env file's authService values for phase 1 (empty list: nothing)."""
    auth = release["spec"]["values"]["authService"]
    problems = []
    if auth.get("mode") != "observe":
        problems.append(f"authService.mode is {auth.get('mode')!r}, not 'observe'")
    if (auth.get("extAuth") or {}).get("failOpen") is not True:
        problems.append("authService.extAuth.failOpen is not true")
    if (auth.get("rateLimit") or {}).get("enabled") is not False:
        problems.append("authService.rateLimit.enabled is not false")
    return problems


def self_test_policy_check():
    """A temp copy of the prod env file with mode enforce must be rejected, or the policy check proves nothing."""
    prod = helm_release("prod")
    prod["spec"]["values"]["authService"]["mode"] = "enforce"
    with tempfile.NamedTemporaryFile("w", suffix=".yaml") as copy:
        yaml.safe_dump(prod, copy)
        copy.flush()
        mutated = helm_release("prod", copy.name)
    problems = policy_problems(mutated)
    check(any("mode" in p for p in problems), "self-test: a prod copy with mode enforce is rejected by the policy check")
    check(not policy_problems(helm_release("prod")), "self-test: the real prod file passes the same policy check")


def check_release_rules(env, release, rendered_on):
    values = release["spec"]["values"]
    problems = policy_problems(release)
    check(not problems, f"{env}: phase 1 policy: mode observe, failOpen true, rateLimit off ({'; '.join(problems)})")
    deployment = find(rendered_on, "Deployment", r"-auth-service$")
    container_env = {e["name"]: e.get("value") for e in deployment[0]["spec"]["template"]["spec"]["containers"][0]["env"]}
    check(
        container_env.get("AUTH_MODE") == "observe",
        f"{env} on: the auth-service container runs with AUTH_MODE={container_env.get('AUTH_MODE')!r} (want 'observe')",
    )
    # Phase 1 ships no 429s (D3): prod has no rate-limit backend, and the templates are untested on a cluster.
    check(
        values["authService"].get("rateLimit", {}).get("enabled") is False,
        f"{env}: authService.rateLimit.enabled is false (no rate limiting in phase 1)",
    )
    check(
        not any("rateLimit" in o.get("spec", {}) for o in rendered_on), f"{env} on: no object renders a rateLimit block"
    )
    if env == "prod":
        # D4: a lone pod that is drained or evicted leaves the gated path unprotected, since ext_authz fails open.
        budgets = find(rendered_on, "PodDisruptionBudget", r"^auth-service-disruption-budget-")
        check(values["authService"].get("replicaCount", 1) >= 2, f"{env}: the auth service runs at least 2 replicas")
        check(
            len(budgets) == 1 and budgets[0]["spec"].get("minAvailable") == 1,
            f"{env} on: a PodDisruptionBudget keeps one auth-service pod up",
        )
    if env == "preprod":
        # preprod migrates prod's shared database. A developer project created there before prod runs this release
        # cannot be deleted by prod's older code, so the flag stays off on preprod until prod runs the release. Turn it
        # on (and relax this check) only then.
        local_settings = find(rendered_on, "ConfigMap", r"^local-settings-preprod$")
        check(
            len(local_settings) == 1 and str(local_settings[0]["data"].get("DEVELOPER_SETTINGS_ENABLED")) == "False",
            f"{env}: developer settings stay off until prod runs the same release",
        )


def main():
    for env in ENVS:
        release = helm_release(env)
        check(release["spec"]["values"]["authService"]["enabled"] is False, f"{env}: ships authService.enabled false")
        check_off(env, render(release, enabled=False))
        rendered_on = render(release, enabled=True)
        check_on(env, rendered_on)
        check_release_rules(env, release, rendered_on)
    self_test_policy_check()
    if failures:
        sys.exit(f"{len(failures)} check(s) failed")


if __name__ == "__main__":
    main()
