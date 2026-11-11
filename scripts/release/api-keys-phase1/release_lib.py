#!/usr/bin/env python3
"""Helpers for the API keys phase 1 release scripts (standard library only, except the env file reader (env-get,
env-flag-off, env-images, auth-service-enabled), hr-values and chart-prod-paths, which need PyYAML and exit 3 without it).

Each subcommand reads files or stdin and prints plain text or JSON for the shell scripts. Nothing here talks to a
cluster or a database, and nothing prints a Secret value: Secrets are only ever handled by name.
"""

import argparse
import ast
import json
import re
import sys
from pathlib import Path


def _read_json(path):
    with open(path) as handle:
        return json.load(handle)


def _stdin_json():
    data = sys.stdin.read()
    return json.loads(data) if data.strip() else {}


# pg_dump --schema-only output varies only in comments, session settings and the per-run \restrict key.
_SCHEMA_SKIP = re.compile(r"^(--|SET |SELECT pg_catalog\.set_config|\\restrict |\\unrestrict )")


def normalise_schema(_args):
    for line in sys.stdin:
        line = line.rstrip()
        if not line or _SCHEMA_SKIP.match(line):
            continue
        print(line)


_CAST = re.compile(r"::[a-z][a-z ]*(\[\])?")


def canonical_schema(_args):
    """A weaker form of the normalised schema for when no scratch Postgres is available: CHECK expressions with casts,
    parentheses and spaces removed, because Postgres re-deparses them differently after every dump and restore."""
    for line in sys.stdin:
        line = line.rstrip("\n")
        if "CHECK (" in line:
            head, _, expr = line.partition("CHECK (")
            line = head + "CHECK " + re.sub(r"[()\s]", "", _CAST.sub("", expr))
        print(line)


_ROLE = re.compile(r"\b(?:OWNER TO|TO|FROM|FOR ROLE)\s+(\"?[A-Za-z_][A-Za-z0-9_$]*\"?)")


def roles_from_sql(_args):
    """Role names a schema SQL file assigns ownership or privileges to (PUBLIC excluded), one per line."""
    names = set()
    for line in sys.stdin:
        if line.startswith(("ALTER ", "GRANT ", "REVOKE ")):
            for match in _ROLE.finditer(line):
                name = match.group(1).strip('"')
                if name.upper() != "PUBLIC" and not name.startswith("pg_"):
                    names.add(name)
    for name in sorted(names):
        print(name)


def _items(doc):
    return doc.get("items", []) if doc.get("kind", "").endswith("List") else [doc]


def pod_images(_args):
    """name<TAB>phase<TAB>image of the web container (else the first)<TAB>every container image, comma separated."""
    for pod in _items(_stdin_json()):
        containers = pod.get("spec", {}).get("containers", [])
        if not containers:
            continue
        web = next((c for c in containers if c.get("name") == "web"), containers[0])
        images = ",".join(c.get("image", "") for c in containers)
        print(
            "\t".join([pod["metadata"]["name"], pod.get("status", {}).get("phase", ""), web.get("image", ""), images])
        )


def image_repository(ref):
    """The repository of an image reference: without @digest, and without :tag when the colon follows the last slash
    (a registry port such as host:5000/name is kept)."""
    ref = ref.split("@", 1)[0]
    slash, colon = ref.rfind("/"), ref.rfind(":")
    return ref[:colon] if colon > slash else ref


def image_guard(args):
    """Prints every Running or Pending pod that runs an image outside the allowed set: any container of a pod labelled
    app=<web label>, and any container whose repository is one of the allowed images' repositories (tasks, cron).
    Exit 1 when there is one."""
    allowed = set(args.allowed.split())
    repos = {image_repository(i) for i in allowed}
    bad = 0
    for pod in _items(_stdin_json()):
        if pod.get("status", {}).get("phase") not in ("Running", "Pending"):
            continue
        is_web = pod.get("metadata", {}).get("labels", {}).get("app") == args.web_label
        containers = pod.get("spec", {}).get("containers", []) + pod.get("spec", {}).get("initContainers", [])
        for c in containers:
            image = c.get("image", "")
            if image in allowed:
                continue
            if (is_web and c.get("name") == "web") or image_repository(image) in repos:
                print(f"{pod['metadata']['name']}\t{image}")
                bad = 1
    return bad


class EnvFileError(Exception):
    """An env file (HelmRelease YAML) that cannot be read, or a value that is not what the caller asked for."""


def _strict_loader(yaml):
    """A safe YAML loader that refuses a mapping with the same key twice (PyYAML would silently keep the last one)."""

    class Loader(yaml.SafeLoader):
        pass

    def construct_mapping(loader, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            key = loader.construct_object(key_node, deep=True)
            if key in seen:
                raise yaml.constructor.ConstructorError(None, None, f"duplicate key {key!r}", key_node.start_mark)
            seen.add(key)
        return yaml.SafeLoader.construct_mapping(loader, node, deep)

    Loader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, construct_mapping)
    return Loader


def load_env_file(text):
    """The one HelmRelease document of an env file as a dict. Anything else (empty, invalid YAML, a duplicate key, no or
    several HelmRelease documents) raises EnvFileError. This is the only way the release scripts read an env file."""
    yaml = _yaml()
    if not isinstance(text, str) or not text.strip():
        raise EnvFileError("the env file is empty or unreadable")
    try:
        docs = [d for d in yaml.load_all(text, Loader=_strict_loader(yaml)) if d is not None]
    except (yaml.YAMLError, TypeError, ValueError) as exc:
        raise EnvFileError(
            f"the env file is not valid YAML: {str(exc).splitlines()[0] if str(exc) else exc!r}"
        ) from exc
    releases = [d for d in docs if isinstance(d, dict) and d.get("kind") == "HelmRelease"]
    if len(releases) != 1:
        raise EnvFileError(f"expected exactly one HelmRelease document in the env file, found {len(releases)}")
    return releases[0]


def env_value_any(text, dotted):
    """The raw value at the dotted path; a missing path raises EnvFileError."""
    node = load_env_file(text)
    walked = []
    for key in dotted.split("."):
        walked.append(key)
        if not isinstance(node, dict) or key not in node:
            raise EnvFileError(f"{'.'.join(walked)} is missing in the env file")
        node = node[key]
    return node


ENV_TYPES = ("str", "str-or-empty", "bool")


def env_value(text, dotted, kind):
    """The value at the dotted path (spec.values.authService.enabled) of an env file, of the type asked for, or
    EnvFileError. Types: str (non-empty string), str-or-empty (string, may be ""), bool (a YAML boolean; the string
    "true" is an error). A missing path is an error, never a default."""
    if kind not in ENV_TYPES:
        raise EnvFileError(f"unknown type {kind!r} (one of {', '.join(ENV_TYPES)})")
    node = env_value_any(text, dotted)
    if kind == "bool":
        ok = isinstance(node, bool)
    elif kind == "str":
        ok = isinstance(node, str) and node.strip() != ""
    else:
        ok = isinstance(node, str)
    if not ok:
        raise EnvFileError(f"{dotted} is {node!r} ({type(node).__name__}), expected {kind}")
    return node


def env_setting_is_off(text, dotted):
    """For a string setting Django reads as os.getenv(NAME, "False").lower() == "true": (True, value) only for an
    explicit false ("False", "false", "0", or the YAML false / 0 that renders to the same); (False, value) for anything
    else. A missing path, a null or an unreadable file raises EnvFileError (callers fail on it)."""
    value = env_value_any(text, dotted)
    if isinstance(value, bool) or isinstance(value, int):
        return (value is False or (type(value) is int and value == 0)), value
    if isinstance(value, str):
        return value.strip().lower() in ("false", "0"), value
    raise EnvFileError(f"{dotted} is {value!r} ({type(value).__name__}), expected a string, boolean or number")


def _env_fail(exc):
    print(f"env file: {exc}", file=sys.stderr)
    return 2


def env_get(args):
    """Print one value of an env file (stdin) at a dotted path, typed; exit 2 with a message when it cannot be read."""
    try:
        value = env_value(sys.stdin.read(), args.path, args.type)
    except EnvFileError as exc:
        return _env_fail(exc)
    print(("true" if value else "false") if isinstance(value, bool) else value)
    return 0


def env_flag_off(args):
    """Exit 0 and print the value when a string setting of an env file (stdin) is explicitly off; exit 1 and print it
    when it is anything else; exit 2 (message on stderr) when it cannot be read."""
    try:
        off, value = env_setting_is_off(sys.stdin.read(), args.path)
    except EnvFileError as exc:
        return _env_fail(exc)
    print(value)
    return 0 if off else 1


ENV_COMPONENTS = (
    ("web", "spec.values.web.containerImage.imageRegistry", "spec.values.web.containerImage.tag"),
    ("nodejs", "spec.values.nodejs.containerImage.imageRegistry", "spec.values.nodejs.containerImage.tag"),
    ("nginx", "spec.values.nginx.containerImage.imageRegistry", "spec.values.nginx.containerImage.tag"),
    ("authService", "spec.values.authService.image.repository", "spec.values.authService.image.tag"),
)


def env_images(_args):
    """component<TAB>repository<TAB>tag for web, nodejs, nginx and authService of an env file (stdin). A key that is
    missing or not a string exits 2 with nothing printed; an empty string is printed as an empty field (the caller
    decides which components may have one)."""
    text = sys.stdin.read()
    lines = []
    try:
        for component, repo_path, tag_path in ENV_COMPONENTS:
            lines.append(
                f"{component}\t{env_value(text, repo_path, 'str-or-empty')}\t{env_value(text, tag_path, 'str-or-empty')}"
            )
    except EnvFileError as exc:
        return _env_fail(exc)
    print("\n".join(lines))
    return 0


def auth_service_enabled(_args):
    """`true` or `false`: authService.enabled of an env file (stdin), a YAML boolean; exit 2 when it cannot be read."""
    try:
        value = env_value(sys.stdin.read(), "spec.values.authService.enabled", "bool")
    except EnvFileError as exc:
        return _env_fail(exc)
    print("true" if value else "false")
    return 0


def rollout_images(_args):
    """name<TAB>revision annotation<TAB>status phase<TAB>container images, comma separated."""
    for ro in _items(_stdin_json()):
        meta = ro.get("metadata", {})
        containers = ro.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
        print(
            "\t".join(
                [
                    meta.get("name", ""),
                    meta.get("annotations", {}).get("rollout.argoproj.io/revision", ""),
                    ro.get("status", {}).get("phase", ""),
                    ",".join(c.get("image", "") for c in containers),
                ]
            )
        )


def with_image_tag(image, tag):
    """The image reference with its tag replaced (and any @digest dropped): repository:tag."""
    return f"{image_repository(image)}:{tag}"


def rollout_web_image(args):
    """The image of the web container of a Rollout (stdin JSON); exit 1 when it has none."""
    containers = _stdin_json().get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
    web = next((c for c in containers if c.get("name") == args.container), None)
    if not web or not web.get("image"):
        print(f"the Rollout has no container named {args.container}", file=sys.stderr)
        return 1
    print(web["image"])
    return 0


# Pod-level fields a one-off pod copies from the Rollout's pod template. Everything that makes a pod part of the
# serving fleet (labels, probes, ports, the other containers, spread and anti-affinity rules) is left out on purpose.
_POD_SPEC_COPY = (
    "volumes",
    "serviceAccountName",
    "serviceAccount",
    "automountServiceAccountToken",
    "imagePullSecrets",
    "nodeSelector",
    "tolerations",
    "securityContext",
    "priorityClassName",
    "runtimeClassName",
    "dnsPolicy",
    "dnsConfig",
    "hostAliases",
    "initContainers",
    "terminationGracePeriodSeconds",
    "enableServiceLinks",
    "shareProcessNamespace",
)
_CONTAINER_DROP = ("ports", "livenessProbe", "readinessProbe", "startupProbe", "lifecycle", "args", "command")


def oneoff_pod(args):
    """A Pod manifest (JSON) copied from a Rollout's pod template (stdin): the web container only, with its image tag
    replaced and the given shell script as its command, and without the serving fleet's labels, probes, ports and
    anti-affinity. Volumes, env, envFrom, resources, serviceAccount and imagePullSecrets are copied as they are."""
    rollout = _stdin_json()
    template = rollout.get("spec", {}).get("template", {}).get("spec", {})
    web = next((c for c in template.get("containers", []) if c.get("name") == args.container), None)
    if web is None:
        print(f"the Rollout has no container named {args.container}", file=sys.stderr)
        return 1
    container = {k: v for k, v in web.items() if k not in _CONTAINER_DROP}
    container["image"] = with_image_tag(web["image"], args.image_tag)
    container["command"] = ["/bin/bash", "-c"]
    container["args"] = [Path(args.script_file).read_text()]
    spec = {k: template[k] for k in _POD_SPEC_COPY if k in template}
    spec["containers"] = [container]
    spec["restartPolicy"] = "Never"
    spec["activeDeadlineSeconds"] = args.deadline
    node_affinity = (template.get("affinity") or {}).get("nodeAffinity")
    if node_affinity:
        spec["affinity"] = {"nodeAffinity": node_affinity}
    pod = {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {
            "name": args.name,
            "namespace": args.namespace,
            "labels": {"app": args.label, "release.sefaria.org/purpose": args.purpose},
        },
        "spec": spec,
    }
    json.dump(pod, sys.stdout, indent=2)
    print()
    return 0


def fence_check(args):
    """Reads a kubectl List (stdin) of Rollouts, Deployments, StatefulSets, DaemonSets, CronJobs and Jobs and prints
    kind/name<TAB>reason for everything that is still live next to a database restore: a controller whose pod template
    runs an image of the web repository other than the allowed ones (it can start such pods at any time, also when
    scaled to zero), a CronJob of the web repository that is not suspended, a Job of it with active pods.
    Exit 1 when there is one."""
    allowed = set(args.allowed.split())
    repos = {image_repository(i) for i in allowed}
    bad = 0

    def images(spec):
        return [c.get("image", "") for c in spec.get("containers", []) + spec.get("initContainers", [])]

    for obj in _items(_stdin_json()):
        kind = obj.get("kind", "")
        name = f"{kind}/{obj.get('metadata', {}).get('name', '')}"
        spec = obj.get("spec", {})
        if kind in ("Rollout", "Deployment", "StatefulSet", "DaemonSet"):
            for image in images(spec.get("template", {}).get("spec", {})):
                if image_repository(image) in repos and image not in allowed:
                    print(f"{name}\tits pod template runs {image}, which is not the snapshot's image")
                    bad = 1
        elif kind == "CronJob":
            pod = spec.get("jobTemplate", {}).get("spec", {}).get("template", {}).get("spec", {})
            if any(image_repository(i) in repos for i in images(pod)) and not spec.get("suspend"):
                print(f"{name}\tit runs the web image and is not suspended (it may write the database)")
                bad = 1
        elif kind == "Job":
            pod = spec.get("template", {}).get("spec", {})
            if obj.get("status", {}).get("active", 0) and any(image_repository(i) in repos for i in images(pod)):
                print(f"{name}\tit runs the web image and has active pods")
                bad = 1
    return bad


def secret_refs(_args):
    """Names of the Secrets a HelmRelease's values reference (every values key named ref), plus the auth Secret."""
    names = set()

    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "ref" and isinstance(value, str) and value:
                    names.add(value)
                else:
                    walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for hr in _items(_stdin_json()):
        walk(hr.get("spec", {}).get("values", {}))
    names.add("auth-service-registry")
    for name in sorted(names):
        print(name)


def hr_summary(_args):
    """JSON: the HelmRelease fields a rollback compares (chart version, image tags, suspend)."""
    doc = _stdin_json()
    spec = doc.get("spec", {})
    values = spec.get("values", {})

    def tag(*path):
        node = values
        for key in path:
            node = node.get(key, {}) if isinstance(node, dict) else {}
        return node if isinstance(node, str) else ""

    print(
        json.dumps(
            {
                "chart_version": spec.get("chart", {}).get("spec", {}).get("version", ""),
                "web_tag": tag("web", "containerImage", "tag"),
                "web_repository": tag("web", "containerImage", "imageRegistry"),
                "nodejs_tag": tag("nodejs", "containerImage", "tag"),
                "nginx_tag": tag("nginx", "containerImage", "tag"),
                "auth_service_tag": tag("authService", "image", "tag"),
                "auth_service_enabled": (values.get("authService") or {}).get("enabled", False),
                "suspend": bool(spec.get("suspend", False)),
            },
            sort_keys=True,
        )
    )


def hr_spec_equal(args):
    """Exit 0 when two HelmRelease objects have the same spec, ignoring spec.suspend."""
    left = _read_json(args.left).get("spec", {})
    right = _read_json(args.right).get("spec", {})
    left.pop("suspend", None)
    right.pop("suspend", None)
    if left == right:
        return 0
    print("HelmRelease specs differ", file=sys.stderr)
    return 1


def helm_release(_args):
    """From `helm history -o json`: the newest deployed revision, else the newest one."""
    history = _stdin_json() or []
    if not history:
        return 1
    deployed = [h for h in history if h.get("status") == "deployed"]
    print((deployed or history)[-1]["revision"])
    return 0


def listing_refusals(args):
    """The EXPLICIT_REFUSALS of master's 0003_request_not_to_publish as a SQL VALUES list (name, link)."""
    tree = ast.parse(Path(args.migration).read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "EXPLICIT_REFUSALS" for t in node.targets):
            rows = ast.literal_eval(node.value)
            break
    else:
        print("EXPLICIT_REFUSALS not found", file=sys.stderr)
        return 1

    def lit(text):
        return "'" + text.replace("'", "''") + "'"

    print(", ".join(f"({lit(name)}, {lit(link)})" for name, link in rows))
    return 0


def migrations_from_paths(_args):
    """git ls-tree paths like app/migrations/0001_x.py -> app<TAB>name (Django app label = directory).
    Everything under scripts/ is ignored: it holds tooling and test fixtures (the suite's fixture app), not Django apps."""
    for line in sys.stdin:
        parts = line.strip().split("/")
        if len(parts) < 3 or parts[-2] != "migrations" or parts[0] == "scripts":
            continue
        name = parts[-1]
        if not re.match(r"^\d{4}_.+\.py$", name):
            continue
        print(f"{parts[-3]}\t{name[:-3]}")


def compare_migrations(args):
    """JSON {pending, unknown}: code migrations not applied, and applied ones (of apps in the code) the code lacks."""
    code = {tuple(line.split("\t")) for line in Path(args.code).read_text().splitlines() if line.strip()}
    applied = {tuple(line.split("\t")[:2]) for line in Path(args.applied).read_text().splitlines() if line.strip()}
    code_apps = {app for app, _ in code}
    pending = sorted(code - applied)
    unknown = sorted(m for m in applied - code if m[0] in code_apps)
    print(json.dumps({"pending": ["/".join(m) for m in pending], "unknown": ["/".join(m) for m in unknown]}))


def _tsv(path, columns):
    rows = []
    p = Path(path)
    if not p.exists():
        return rows
    for line in p.read_text().splitlines():
        if not line.strip():
            continue
        values = line.split("\t")
        rows.append(dict(zip(columns, values)))
    return rows


def build_manifest(args):
    """Collects the captured files of a snapshot directory into manifest.json."""
    root = Path(args.dir)
    meta = _read_json(root / "meta.json")
    manifest = {"format": 1, **meta, "envs": {}, "database": {}, "files": {}}
    for env in meta["sharing_envs"]:
        k8s = root / "k8s" / env
        entry = {}
        hr_path = k8s / "helmrelease.json"
        if hr_path.exists() and hr_path.stat().st_size:
            hr = _read_json(hr_path)
            entry["helmrelease_name"] = hr.get("metadata", {}).get("name")
            entry["helmrelease_spec"] = hr.get("spec", {})
        gr_path = k8s / "gitrepository.json"
        if gr_path.exists() and gr_path.stat().st_size:
            entry["release_tag"] = _read_json(gr_path).get("spec", {}).get("ref", {}).get("tag", "")
        hist_path = k8s / "helm-history.json"
        if hist_path.exists() and hist_path.stat().st_size:
            history = _read_json(hist_path) or []
            entry["helm_history"] = history
            deployed = [h for h in history if h.get("status") == "deployed"]
            entry["helm_revision"] = (deployed or history or [{}])[-1].get("revision")
        entry["helm_release"] = (
            (k8s / "helm-release.txt").read_text().strip() if (k8s / "helm-release.txt").exists() else ""
        )
        entry["rollouts"] = _tsv(k8s / "rollouts.tsv", ["name", "revision", "phase", "images"])
        entry["web_pods"] = _tsv(k8s / "web-pods.tsv", ["name", "phase", "image", "images"])
        entry["pods"] = _tsv(k8s / "pods.tsv", ["name", "phase", "image", "images"])
        expected = (k8s / "secrets-expected.txt").read_text().split() if (k8s / "secrets-expected.txt").exists() else []
        present = (
            set((k8s / "secrets-present.txt").read_text().split()) if (k8s / "secrets-present.txt").exists() else set()
        )
        entry["secrets"] = {name: name in present for name in expected}
        cdb = k8s / "current-database.txt"
        entry["current_database"] = cdb.read_text().strip() if cdb.exists() else ""
        envfiles = {}
        for source in ("deployed", "branch"):
            path = root / "envfiles" / f"{env}.{source}.helmrelease.yaml"
            if path.exists():
                envfiles[source] = {"path": str(path.relative_to(root)), "content": path.read_text()}
        entry["envfile"] = envfiles
        manifest["envs"][env] = entry
    db = root / "db"
    manifest["database"] = {
        "name": meta["database"],
        "django_migrations": _tsv(db / "django_migrations.tsv", ["id", "app", "name", "applied"]),
        "row_counts": {r["table"]: int(r["rows"]) for r in _tsv(db / "row_counts.tsv", ["table", "rows"])},
        "scoped_tables": (db / "scoped-tables.txt").read_text().split() if (db / "scoped-tables.txt").exists() else [],
        "scoped_checksums": _tsv(db / "scoped-checksums.tsv", ["table", "rows", "md5"]),
        "apikeys_notify_exists": (db / "apikeys_notify.sql").exists(),
        "reader_role_exists": (db / "reader-role.txt").read_text().strip() == "t"
        if (db / "reader-role.txt").exists()
        else None,
    }
    for name in sorted(p for p in root.rglob("*") if p.is_file() and p.suffix in (".dump", ".sql", ".list")):
        sha = name.with_name(name.name + ".sha256")
        if sha.exists():
            manifest["files"][str(name.relative_to(root))] = sha.read_text().split()[0]
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def gitrepo_serves(args):
    """Exit 0 when a Flux GitRepository (stdin, JSON) is pinned to --tag AND has produced an artifact for it; else the
    reason on stdout and exit 1. Flux writes status.artifact.revision as `<tag>@sha1:<sha>` (older versions `<tag>/<sha>`)."""
    obj = _stdin_json() or {}
    want = args.tag
    pinned = (obj.get("spec") or {}).get("ref", {}).get("tag", "")
    if pinned != want:
        print(f"spec.ref.tag is '{pinned}', not '{want}'")
        return 1
    revision = ((obj.get("status") or {}).get("artifact") or {}).get("revision", "")
    if not revision.startswith((want + "@", want + "/")):
        print(f"status.artifact.revision is '{revision}': Flux has not fetched '{want}' yet")
        return 1
    return 0


def manifest_get(args):
    """Prints a dotted path of a manifest; strings plain, everything else as JSON."""
    node = _read_json(args.manifest)
    for key in args.path.split("."):
        if isinstance(node, list):
            node = node[int(key)]
        else:
            node = node.get(key) if isinstance(node, dict) else None
        if node is None:
            return 1
    print(node if isinstance(node, str) else json.dumps(node, sort_keys=True))
    return 0


def migrations_insert_sql(args):
    """SQL that puts the powered_by django_migrations rows back to the manifest's."""
    rows = [r for r in _read_json(args.manifest)["database"]["django_migrations"] if r["app"] == "powered_by"]
    print("DELETE FROM public.django_migrations WHERE app = 'powered_by';")
    for r in rows:
        name = r["name"].replace("'", "''")
        print(
            "INSERT INTO public.django_migrations (id, app, name, applied) "
            f"VALUES ({int(r['id'])}, 'powered_by', '{name}', '{r['applied']}');"
        )


def rehearse_summary(args):
    """Summarises a rehearsal: per-migration seconds and the lock waits seen by the sampler."""
    timings = [json.loads(line) for line in Path(args.timings).read_text().splitlines() if line.strip()]
    waits = {}
    exclusive = {}
    ticks = 0
    for line in Path(args.samples).read_text().splitlines() if Path(args.samples).exists() else []:
        parts = line.split("\t")
        if len(parts) < 6:
            continue
        kind, _ts, pid, relation, mode, seconds = parts[:6]
        try:
            seconds = float(seconds or 0)
        except ValueError:
            continue
        if kind == "tick":
            ticks += 1
        elif kind == "wait":
            key = (relation or "?", mode or "?")
            waits[key] = max(waits.get(key, 0.0), seconds)
        elif kind == "hold":
            # A relation created in the migration's own transaction has no committed pg_class row yet: only its oid.
            label = f"oid {relation} (created by the running migration)" if relation.isdigit() else relation or "?"
            exclusive[label] = max(exclusive.get(label, 0.0), seconds)
    report = {
        "sampler_ticks": ticks,
        "migrations": timings,
        "total_seconds": round(sum(t["seconds"] for t in timings), 3),
        "max_lock_wait_seconds": [
            {"relation": r, "mode": m, "seconds": round(s, 3)}
            for (r, m), s in sorted(waits.items(), key=lambda kv: -kv[1])
        ],
        "access_exclusive_held_seconds": [
            {"relation": r, "seconds": round(s, 3)} for r, s in sorted(exclusive.items(), key=lambda kv: -kv[1])
        ],
    }
    Path(args.out).write_text(json.dumps(report, indent=2) + "\n")
    print(f"{'migration':60} {'seconds':>9}")
    for t in timings:
        print(f"{t['app'] + '.' + t['name']:60} {t['seconds']:9.3f}")
    print(f"{'total':60} {report['total_seconds']:9.3f}")
    print(f"\nLock sampler: {ticks} samples (every 0.2 s)")
    if ticks == 0:
        print("ERROR: the lock sampler recorded nothing, so no lock result can be reported", file=sys.stderr)
        return 1
    if report["max_lock_wait_seconds"]:
        print("\nLongest lock waits seen (relation, mode, seconds):")
        for w in report["max_lock_wait_seconds"][:15]:
            print(f"  {w['relation']:40} {w['mode']:24} {w['seconds']:.3f}")
    else:
        print("\nNo session waited on a lock while the sampler ran.")
    if report["access_exclusive_held_seconds"]:
        print("\nACCESS EXCLUSIVE locks seen (relation, longest seen held, seconds):")
        for h in report["access_exclusive_held_seconds"][:15]:
            print(f"  {h['relation']:50} {h['seconds']:.3f}")


# --- preflight: the prod-only paths the chart renders --------------------------------------------------------------


def _yaml():
    try:
        import yaml
    except ImportError:
        print(
            "PyYAML is not installed for this Python (set APIKEYS_RELEASE_PYTHON3 to one that has it)", file=sys.stderr
        )
        sys.exit(3)
    return yaml


def hr_values(_args):
    """The spec.values of the HelmRelease in an env file (stdin), as YAML for helm template -f."""
    yaml = _yaml()
    releases = [d for d in yaml.safe_load_all(sys.stdin) if isinstance(d, dict) and d.get("kind") == "HelmRelease"]
    if len(releases) != 1:
        sys.exit(f"expected one HelmRelease in the env file, found {len(releases)}")
    yaml.safe_dump(releases[0].get("spec", {}).get("values", {}) or {}, sys.stdout)


DATADOG_KEY = re.compile(r"(^|\.)datadoghq\.com/")


def chart_prod_paths(args):
    """From `helm template` output (stdin): JSON {cronjobs: {name: {schedule, suspend}}, datadog: {labels, annotations}}
    with the CronJobs the chart renders and the Datadog labels and annotations of the web Rollout's pod template."""
    yaml = _yaml()
    cronjobs, datadog = {}, {"labels": {}, "annotations": {}}
    for doc in yaml.safe_load_all(sys.stdin):
        if not isinstance(doc, dict):
            continue
        meta = doc.get("metadata", {}) or {}
        if doc.get("kind") == "CronJob":
            spec = doc.get("spec", {}) or {}
            cronjobs[meta.get("name")] = {"schedule": spec.get("schedule"), "suspend": bool(spec.get("suspend"))}
        elif doc.get("kind") == "Rollout" and meta.get("name") == args.web_rollout:
            tmeta = (doc.get("spec", {}).get("template", {}) or {}).get("metadata", {}) or {}
            for field in ("labels", "annotations"):
                datadog[field] = {k: str(v) for k, v in (tmeta.get(field) or {}).items() if DATADOG_KEY.search(k)}
    json.dump({"cronjobs": cronjobs, "datadog": datadog}, sys.stdout, sort_keys=True)


def check_cronjobs(args):
    """STATUS<TAB>message lines: every CronJob the chart renders (--rendered, from chart-prod-paths) exists in the cluster
    (stdin: kubectl get cronjobs -o json) with the same schedule and not suspended; CronJobs of the release that the chart
    no longer renders are reported."""
    rendered = _read_json(args.rendered)["cronjobs"]
    live = {c["metadata"]["name"]: c for c in _items(_stdin_json())}
    if not rendered:
        print(f"SKIP\tthe chart renders no CronJob for {args.instance}")
        return
    present = []
    for name, want in sorted(rendered.items()):
        got = live.get(name)
        if got is None:
            print(
                f"FAIL\tCronJob {name} (schedule '{want['schedule']}') is rendered by the chart but missing in the cluster"
            )
            continue
        present.append(name)
        spec = got.get("spec", {})
        if spec.get("schedule") != want["schedule"]:
            print(
                f"WARN\tCronJob {name}: schedule '{spec.get('schedule')}' in the cluster, '{want['schedule']}' in the chart"
            )
        if spec.get("suspend") and not want["suspend"]:
            print(f"WARN\tCronJob {name} is suspended in the cluster; the chart renders it active")
    if present:
        print(
            f"PASS\t{len(present)} of {len(rendered)} CronJobs the chart renders for {args.instance} exist in the cluster"
        )
    stale = sorted(
        n
        for n, c in live.items()
        if n not in rendered and (c["metadata"].get("labels") or {}).get("app.kubernetes.io/instance") == args.instance
    )
    if stale:
        print(f"WARN\tCronJobs of release {args.instance} that the chart no longer renders: {', '.join(stale)}")


def check_datadog(args):
    """STATUS<TAB>message lines: every Running web pod (stdin: kubectl get pods -o json) carries the Datadog labels and
    annotations the chart renders on the web pod template (--rendered, from chart-prod-paths)."""
    want = _read_json(args.rendered)["datadog"]
    if not want["labels"] and not want["annotations"]:
        print("SKIP\tthe chart renders no Datadog labels or annotations on the web pods (datadog.enabled is off)")
        return
    pods = [p for p in _items(_stdin_json()) if p.get("status", {}).get("phase") == "Running"]
    if not pods:
        print("FAIL\tno Running web pod to check the Datadog labels and annotations on")
        return
    bad = 0
    for pod in pods:
        meta = pod.get("metadata", {})
        missing, differ = [], []
        for field in ("labels", "annotations"):
            have = meta.get(field) or {}
            for key, value in sorted(want[field].items()):
                if key not in have:
                    missing.append(key)
                elif str(have[key]) != value:
                    differ.append(f"{key}={have[key]!r} (chart {value!r})")
        if missing:
            bad += 1
            print(f"FAIL\tweb pod {meta.get('name')} lacks Datadog {', '.join(missing)}")
        if differ:
            print(f"WARN\tweb pod {meta.get('name')}: Datadog values differ: {'; '.join(differ)}")
    if not bad:
        n = len(want["labels"]) + len(want["annotations"])
        print(f"PASS\tall {len(pods)} Running web pods carry the {n} Datadog labels and annotations the chart renders")


# --- watch-promotion ------------------------------------------------------------------------------------------------


def _percentile(values, q):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))]


def _nginx_counts(path):
    """Counts of nginx structured access log lines (one JSON object per line, httpRequest.status). Other lines (error
    log, startup notices) are counted as unparsed. No line is ever printed."""
    total = errors = unparsed = 0
    latencies = []
    try:
        lines = Path(path).read_text(errors="replace").splitlines()
    except OSError:
        return None
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            doc = json.loads(line)
            status = int(doc["httpRequest"]["status"])
        except (ValueError, KeyError, TypeError):
            unparsed += 1
            continue
        total += 1
        if status >= 500:
            errors += 1
        latency = doc["httpRequest"].get("latency")
        if isinstance(latency, (int, float)):
            latencies.append(float(latency))
    return {
        "requests": total,
        "5xx": errors,
        "5xx_pct": round(100.0 * errors / total, 3) if total else 0.0,
        "unparsed_lines": unparsed,
        "latency_p50": _percentile(latencies, 0.5),
        "latency_p95": _percentile(latencies, 0.95),
    }


def _pods_summary(path, state):
    try:
        doc = _read_json(path)
    except (OSError, ValueError):
        return None
    baseline = state.setdefault("restarts", {})
    pods = []
    for pod in _items(doc):
        name = pod["metadata"]["name"]
        status = pod.get("status", {})
        conds = {c.get("type"): c.get("status") for c in status.get("conditions", []) or []}
        restarts = sum(int(c.get("restartCount", 0)) for c in status.get("containerStatuses", []) or [])
        baseline.setdefault(name, restarts)
        pods.append(
            {
                "name": name,
                "phase": status.get("phase"),
                "ready": conds.get("Ready") == "True",
                "terminating": bool(pod["metadata"].get("deletionTimestamp")),
                "restarts": restarts,
                "restarts_since_start": restarts - baseline[name],
            }
        )
    return {
        "total": len(pods),
        "ready": sum(1 for p in pods if p["ready"]),
        "restarts_since_start": sum(p["restarts_since_start"] for p in pods),
        "pods": pods,
    }


DB_ERROR_ALARM_TICKS = 3


def watch_tick(args):
    """One tick of watch-promotion.sh: reads what the shell collected (database JSON, web pods JSON, nginx log lines),
    appends one JSON line to --jsonl, prints the live line, and exits 10 when a threshold is crossed (not 2,
    which argparse uses for a usage error)."""
    state_path = Path(args.state)
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    errors = [e for e in (args.errors or "").split(",") if e]
    record = {"tick": args.tick, "time": args.time, "window_seconds": args.window, "errors": errors}

    db = None
    if "db" not in errors:
        try:
            db = json.loads(Path(args.db).read_text())
        except (OSError, ValueError):
            errors.append("db")
    migrations = None
    if "migrations" not in errors:
        try:
            migrations = json.loads(Path(args.migrations).read_text())
        except (OSError, ValueError):
            errors.append("migrations")
    if db is not None:
        db.update(migrations or {"newest_powered_by": None, "powered_by_migrations": None})
    record["db"] = db
    pods = None if "pods" in errors else _pods_summary(args.pods, state)
    if pods is None and "pods" not in errors:
        errors.append("pods")
    record["web_pods"] = pods
    nginx = None if "nginx" in errors else _nginx_counts(args.nginx)
    if nginx is None and "nginx" not in errors:
        errors.append("nginx")
    if nginx is not None and not nginx["requests"] and nginx["unparsed_lines"]:
        # Lines arrived but none parsed as an access log entry: the 5xx check would be blind, so the tick is incomplete.
        errors.append("nginx")
    record["nginx"] = nginx

    alarms, events = [], []
    parts = [f"{args.time} #{args.tick}"]
    if db is not None:
        waits = db.get("lock_waits") or []
        longest = max((float(w.get("seconds") or 0) for w in waits), default=0.0)
        state["max_lock_wait"] = max(state.get("max_lock_wait", 0.0), longest)
        if migrations is None:
            newest = "unread"
        else:
            newest = (migrations.get("newest_powered_by") or {}).get("name") or "-"
            if state.get("newest_powered_by") not in (None, newest):
                events.append(f"powered_by migration applied: {newest}")
            state["newest_powered_by"] = newest
        parts.append(
            f"db: lock waits {len(waits)} (longest {longest:.1f}s), long-running {len(db.get('long_running') or [])},"
            f" newest powered_by {newest}"
        )
        if waits and longest > args.max_lock_wait:
            worst = max(waits, key=lambda w: float(w.get("seconds") or 0))
            alarms.append(
                f"lock wait {longest:.1f}s > {args.max_lock_wait:g}s: pid {worst.get('pid')} waiting for"
                f" {worst.get('waiting_for') or worst.get('wait_event')}, blocked by {worst.get('blocked_by')}"
            )
    else:
        parts.append("db: ERROR")
    # A database that cannot be read for several ticks in a row during the migration is itself an alarm.
    state["db_error_streak"] = 0 if db is not None else state.get("db_error_streak", 0) + 1
    if state["db_error_streak"] >= DB_ERROR_ALARM_TICKS and state["db_error_streak"] % DB_ERROR_ALARM_TICKS == 0:
        alarms.append(f"the database could not be read for {state['db_error_streak']} ticks in a row")
    if pods is not None:
        parts.append(f"prod web: {pods['ready']}/{pods['total']} ready, restarts +{pods['restarts_since_start']}")
        if pods["restarts_since_start"] > state.get("restarts_seen", 0):
            events.append(f"prod web pod restarts since start: {pods['restarts_since_start']}")
        state["restarts_seen"] = max(state.get("restarts_seen", 0), pods["restarts_since_start"])
    else:
        parts.append("prod web: ERROR")
    if nginx is not None:
        p95 = nginx["latency_p95"]
        parts.append(
            f"nginx: {nginx['requests']} req, 5xx {nginx['5xx']} ({nginx['5xx_pct']:.2f}%)"
            + (f", p95 {p95:.3f}s" if p95 is not None else "")
            + (f", {nginx['unparsed_lines']} unparsed lines" if nginx["unparsed_lines"] else "")
            + (
                " (no access log line: no nginx pod matched, no traffic, or the log format changed)"
                if not nginx["requests"]
                else ""
            )
        )
        if nginx["requests"] >= args.min_requests:
            state["max_5xx_pct"] = max(state.get("max_5xx_pct", 0.0), nginx["5xx_pct"])
            if nginx["5xx_pct"] > args.max_5xx_pct:
                alarms.append(
                    f"prod 5xx {nginx['5xx_pct']:.2f}% > {args.max_5xx_pct:g}%"
                    f" ({nginx['5xx']} of {nginx['requests']} requests in {args.window}s)"
                )
    else:
        parts.append("nginx: ERROR")

    record["errors"] = errors
    record["alarms"] = alarms
    record["events"] = events
    with open(args.jsonl, "a") as out:
        out.write(json.dumps(record, sort_keys=True, default=str) + "\n")
    state["ticks"] = state.get("ticks", 0) + 1
    state["alarm_ticks"] = state.get("alarm_ticks", 0) + (1 if alarms else 0)
    state.setdefault("alarms", []).extend(f"{args.time} {a}" for a in alarms)
    state["error_ticks"] = state.get("error_ticks", 0) + (1 if errors else 0)
    state_path.write_text(json.dumps(state, sort_keys=True))

    print(" | ".join(parts), flush=True)
    for event in events:
        print(f"    event: {event}", flush=True)
    if errors:
        print(f"    could not read: {', '.join(errors)} (see {Path(args.jsonl).parent}/errors.log)", flush=True)
    for alarm in alarms:
        bar = "!" * 100
        print(f"{bar}\n!!! ALARM: {alarm}\n{bar}", flush=True)
    return 10 if alarms else 0


def watch_summary(args):
    """The end of watch-promotion.sh: prints what the watch saw and exits 2 after any alarm, 1 after a tick that could
    not read everything, else 0."""
    state = _read_json(args.state) if Path(args.state).exists() else {}
    print(f"\nwatch-promotion: {state.get('ticks', 0)} ticks; JSON lines in {args.jsonl}")
    print(f"  longest lock wait: {state.get('max_lock_wait', 0.0):.1f}s (threshold {args.max_lock_wait:g}s)")
    print(f"  highest prod 5xx rate: {state.get('max_5xx_pct', 0.0):.2f}% (threshold {args.max_5xx_pct:g}%)")
    print(f"  newest powered_by migration at the end: {state.get('newest_powered_by', '-')}")
    print(f"  prod web pod restarts since start: {state.get('restarts_seen', 0)}")
    if state.get("ticks", 0) == 0:
        print("watch-promotion: no tick completed")
        return 1
    if state.get("alarm_ticks"):
        bar = "!" * 100
        print(bar)
        print(f"!!! watch-promotion: ALARM on {state['alarm_ticks']} tick(s):")
        for alarm in state.get("alarms", [])[:20]:
            print(f"!!!   {alarm}")
        print(bar)
        return 2
    if state.get("error_ticks"):
        print(f"watch-promotion: {state['error_ticks']} tick(s) could not read everything; the watch is incomplete")
        return 1
    print("watch-promotion: no threshold crossed")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("normalise-schema").set_defaults(func=normalise_schema)
    sub.add_parser("canonical-schema").set_defaults(func=canonical_schema)
    sub.add_parser("roles-from-sql").set_defaults(func=roles_from_sql)
    sub.add_parser("pod-images").set_defaults(func=pod_images)
    p = sub.add_parser("env-get")
    p.add_argument("path")
    p.add_argument("--type", choices=ENV_TYPES, required=True)
    p.set_defaults(func=env_get)
    p = sub.add_parser("env-flag-off")
    p.add_argument("path")
    p.set_defaults(func=env_flag_off)
    sub.add_parser("rollout-images").set_defaults(func=rollout_images)
    sub.add_parser("env-images").set_defaults(func=env_images)
    sub.add_parser("auth-service-enabled").set_defaults(func=auth_service_enabled)
    p = sub.add_parser("image-guard")
    p.add_argument("--allowed", required=True)
    p.add_argument("--web-label", required=True)
    p.set_defaults(func=image_guard)
    p = sub.add_parser("rollout-web-image")
    p.add_argument("--container", default="web")
    p.set_defaults(func=rollout_web_image)
    p = sub.add_parser("oneoff-pod")
    p.add_argument("--container", default="web")
    p.add_argument("--image-tag", required=True)
    p.add_argument("--script-file", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--namespace", required=True)
    p.add_argument("--label", required=True)
    p.add_argument("--purpose", required=True)
    p.add_argument("--deadline", type=int, required=True)
    p.set_defaults(func=oneoff_pod)
    p = sub.add_parser("fence-check")
    p.add_argument("--allowed", required=True)
    p.set_defaults(func=fence_check)
    sub.add_parser("secret-refs").set_defaults(func=secret_refs)
    sub.add_parser("hr-summary").set_defaults(func=hr_summary)
    sub.add_parser("helm-release-revision").set_defaults(func=helm_release)
    p = sub.add_parser("hr-spec-equal")
    p.add_argument("left")
    p.add_argument("right")
    p.set_defaults(func=hr_spec_equal)
    p = sub.add_parser("listing-refusals")
    p.add_argument("migration")
    p.set_defaults(func=listing_refusals)
    sub.add_parser("migrations-from-paths").set_defaults(func=migrations_from_paths)
    p = sub.add_parser("compare-migrations")
    p.add_argument("--code", required=True)
    p.add_argument("--applied", required=True)
    p.set_defaults(func=compare_migrations)
    p = sub.add_parser("build-manifest")
    p.add_argument("--dir", required=True)
    p.set_defaults(func=build_manifest)
    p = sub.add_parser("gitrepo-serves")
    p.add_argument("--tag", required=True)
    p.set_defaults(func=gitrepo_serves)
    p = sub.add_parser("manifest-get")
    p.add_argument("manifest")
    p.add_argument("path")
    p.set_defaults(func=manifest_get)
    p = sub.add_parser("migrations-insert-sql")
    p.add_argument("manifest")
    p.set_defaults(func=migrations_insert_sql)
    p = sub.add_parser("rehearse-summary")
    p.add_argument("--timings", required=True)
    p.add_argument("--samples", required=True)
    p.add_argument("--out", required=True)
    p.set_defaults(func=rehearse_summary)
    sub.add_parser("hr-values").set_defaults(func=hr_values)
    p = sub.add_parser("chart-prod-paths")
    p.add_argument("--web-rollout", required=True)
    p.set_defaults(func=chart_prod_paths)
    p = sub.add_parser("check-cronjobs")
    p.add_argument("--rendered", required=True)
    p.add_argument("--instance", required=True)
    p.set_defaults(func=check_cronjobs)
    p = sub.add_parser("check-datadog")
    p.add_argument("--rendered", required=True)
    p.set_defaults(func=check_datadog)
    for name, func in (("watch-tick", watch_tick), ("watch-summary", watch_summary)):
        p = sub.add_parser(name)
        p.add_argument("--state", required=True)
        p.add_argument("--jsonl", required=True)
        p.add_argument("--max-lock-wait", type=float, required=True)
        p.add_argument("--max-5xx-pct", type=float, required=True)
        p.set_defaults(func=func)
        if name == "watch-tick":
            p.add_argument("--tick", type=int, required=True)
            p.add_argument("--time", required=True)
            p.add_argument("--window", type=int, required=True)
            p.add_argument("--db", required=True)
            p.add_argument("--migrations", required=True)
            p.add_argument("--pods", required=True)
            p.add_argument("--nginx", required=True)
            p.add_argument("--errors", default="")
            p.add_argument("--min-requests", type=int, required=True)
    args = parser.parse_args()
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
