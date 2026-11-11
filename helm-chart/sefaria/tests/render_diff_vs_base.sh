#!/usr/bin/env bash
# Proves a chart change leaves what is already deployed alone: renders the chart at <base-ref> and at HEAD for each
# environment with that environment's values (authService off, as shipped) and fails on any difference that is not in the
# inline allow-list below. Prints every allowed difference it saw, so a reviewer reads them.
#
# Differences that arise on every render (the randAlphaNum redeploy string) are normalised first; the base is rendered
# twice and must match itself after normalising, which proves nothing else varies.
#
# Usage (from anywhere inside the repository): bash helm-chart/sefaria/tests/render_diff_vs_base.sh <base-ref>
# Needs helm, git, python3 and PyYAML. Both renders use the HEAD chart's env values; the base chart ignores keys it lacks.
set -euo pipefail

BASE_REF="${1:?usage: render_diff_vs_base.sh <base-ref>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
git -C "$ROOT" rev-parse --verify --quiet "$BASE_REF^{commit}" >/dev/null || { echo "unknown ref: $BASE_REF"; exit 2; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/base"
git -C "$ROOT" archive "$BASE_REF" helm-chart/sefaria | tar -x -C "$TMP/base"
echo "base: $BASE_REF ($(git -C "$ROOT" rev-parse --short "$BASE_REF")), head: $(git -C "$ROOT" rev-parse --short HEAD) plus the working tree"

for env in staging preprod prod; do
  python3 - "$ROOT/envs/$env/helmrelease.yaml" "$TMP/$env.values.yaml" <<'PY'
import sys, yaml
release = next(d for d in yaml.safe_load_all(open(sys.argv[1])) if d and d.get("kind") == "HelmRelease")
assert release["spec"]["values"]["authService"]["enabled"] is False, "the env must ship authService off"
yaml.safe_dump(release["spec"].get("values", {}), open(sys.argv[2], "w"))
PY
  helm template "$env" "$TMP/base/helm-chart/sefaria" -f "$TMP/$env.values.yaml" > "$TMP/$env.base.yaml"
  helm template "$env" "$TMP/base/helm-chart/sefaria" -f "$TMP/$env.values.yaml" > "$TMP/$env.base2.yaml"
  helm template "$env" "$ROOT/helm-chart/sefaria" -f "$TMP/$env.values.yaml" > "$TMP/$env.head.yaml"
done

python3 - "$TMP" <<'PY'
import difflib, re, sys, yaml

tmp = sys.argv[1]
ENVS = ("staging", "preprod", "prod")

# Allow-list: (name, environments, kind, metadata.name regex, regex a changed line must match).
# Blank lines count as part of a change in an allowed object.
BLANK = r"\s*"
RULES = [
    ("gunicorn logger", ENVS, "ConfigMap", r"^gunicorn-config-",
     rf"({BLANK}|\s*#.*|\s*try:|\s*except Exception:|\s*pass|\s*if os\.path\.exists\(.*\):|\s*logger_class = .*)"),
    ("DEVELOPER_SETTINGS_* entries", ENVS, "ConfigMap", r"^local-settings-",
     rf"({BLANK}|\s*DEVELOPER_SETTINGS_(ENABLED|STAFF_ONLY)\b.*)"),
    ("nginx log_format and scrub maps", ENVS, "ConfigMap", r"^nginx-conf-",
     rf"({BLANK}|\s*#.*|\s*map \$\S+ \$(uri_scrub_\d|referer_scrub_\d|uri_key_\d|referer_key_\d|request_uri_scrubbed|referer_scrubbed) \{{"
     r"|\s*\"~\*.*\" .*;|\s*default \$(request_uri|http_referer|uri_scrub_\d|referer_scrub_\d|uri_key_\d|referer_key_\d);|\s*\}|\s*log_format structured .*)"),
    ("staging sync-postgres CronJob", ("staging",), "CronJob", r"sync-postgres", r".*"),
    # Not in the plan's list: one comment line in the ClientTrafficPolicy, a no-op for Kubernetes.
    ("ClientTrafficPolicy comment", ENVS, "ClientTrafficPolicy", r".*", rf"({BLANK}|\s*# Port 80 still serves the site here.*)"),
]


def normalise(text):
    # randAlphaNum 8 in the Rollout env: differs on every render.
    return re.sub(r"(name: randomstringtoforceredeployments\n\s+value: )\S+", r"\1RANDOM", text)


def objects(text):
    found = {}
    for doc in re.split(r"^---\n", normalise(text), flags=re.M):
        if not doc.strip():
            continue
        data = yaml.safe_load(doc) or {}
        found[(data.get("kind"), data.get("metadata", {}).get("name"))] = doc
    return found


failures = []
for env in ENVS:
    base, base2, head = (objects(open(f"{tmp}/{env}.{n}.yaml").read()) for n in ("base", "base2", "head"))
    if base != base2:
        failures.append(f"{env}: the base render differs from itself after normalising; extend normalise()")
        continue
    print(f"== {env}: {len(base)} objects at base, {len(head)} at head")
    seen = {}
    for key in sorted(set(base) | set(head), key=str):
        kind, name = key
        if base.get(key) == head.get(key):
            continue
        changed = []
        if key not in base or key not in head:
            changed.append(("+" if key in head else "-", f"<whole object {'added' if key in head else 'removed'}>"))
            lines = (head.get(key) or base.get(key)).split("\n")
            changed = [("+" if key in head else "-", l) for l in lines]
        else:
            for l in difflib.unified_diff(base[key].split("\n"), head[key].split("\n"), lineterm="", n=0):
                if l[0] in "+-" and not l.startswith(("+++", "---")):
                    changed.append((l[0], l[1:]))
        for sign, line in changed:
            rule = next((r for r in RULES if env in r[1] and r[2] == kind and re.search(r[3], name or "")
                         and re.fullmatch(r[4], line)), None)
            if rule:
                seen.setdefault((rule[0], kind, name), []).append((sign, line))
            else:
                failures.append(f"{env}: {kind}/{name}: unallowed change {sign}{line[:160]}")
    for (rule, kind, name), lines in seen.items():
        shown = [(s, l) for s, l in lines if l.strip()]
        print(f"  allowed [{rule}] {kind}/{name}: {len(shown)} changed lines")
        for sign, line in shown[:6]:
            print(f"    {sign}{line.strip()[:110]}")
        if len(shown) > 6:
            print(f"    ... {len(shown) - 6} more")

if failures:
    print("\nFAIL: renders differ from the base outside the allow-list:")
    for f in failures[:40]:
        print("  " + f)
    sys.exit(1)
print("\nrender_diff_vs_base: ok (only allow-listed differences)")
PY
