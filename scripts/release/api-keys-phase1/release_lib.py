#!/usr/bin/env python3
"""Helpers for the API keys phase 1 release scripts (standard library only).

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
    """git ls-tree paths like app/migrations/0001_x.py -> app<TAB>name (Django app label = directory)."""
    for line in sys.stdin:
        parts = line.strip().split("/")
        if len(parts) < 3 or parts[-2] != "migrations":
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
    for line in Path(args.samples).read_text().splitlines() if Path(args.samples).exists() else []:
        parts = line.split("\t")
        if len(parts) < 6:
            continue
        kind, _ts, pid, relation, mode, seconds = parts[:6]
        try:
            seconds = float(seconds or 0)
        except ValueError:
            continue
        if kind == "wait":
            key = (relation or "?", mode or "?")
            waits[key] = max(waits.get(key, 0.0), seconds)
        elif kind == "hold":
            # A relation created in the migration's own transaction has no committed pg_class row yet: only its oid.
            label = f"oid {relation} (created by the running migration)" if relation.isdigit() else relation or "?"
            exclusive[label] = max(exclusive.get(label, 0.0), seconds)
    report = {
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("normalise-schema").set_defaults(func=normalise_schema)
    sub.add_parser("canonical-schema").set_defaults(func=canonical_schema)
    sub.add_parser("roles-from-sql").set_defaults(func=roles_from_sql)
    sub.add_parser("pod-images").set_defaults(func=pod_images)
    sub.add_parser("rollout-images").set_defaults(func=rollout_images)
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
    args = parser.parse_args()
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
