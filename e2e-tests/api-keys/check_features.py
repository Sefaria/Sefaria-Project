#!/usr/bin/env python3
"""Check that every feature and edge case in features.json names checks that exist.

Usage: check_features.py [--strict] [--summary] [--json] [--root DIR] [--features FILE]
                         [--poc-ref REF] [--offline-poc] [--require-wiki] [--no-planned]

Exit codes: 0 all good, 1 validation failures, 2 usage or I/O error.
Stdlib only, Python 3.9+. Pytest refs are read with ast; Django is never imported.
"""
from __future__ import annotations

import argparse
import ast
import fnmatch
import glob
import json
import os
import posixpath
import re
import subprocess
import sys
from collections import namedtuple

SCHEMA_VERSION = 1
ON_BRANCH, POC_ONLY, PLANNED = "on_branch", "poc_only", "planned"
STATUSES = (ON_BRANCH, POC_ONLY, PLANNED)
SEVERITIES = ("P0", "P1", "P2")
KINDS = ("pytest", "gotest", "playwright", "demo", "drill", "shell", "file", "checks_json")
CONTAINS_KINDS = ("pytest", "playwright", "demo", "drill", "shell", "file")
TOP_KEYS = {"schema_version", "refs", "must_map", "features"}
FEATURE_KEYS = {"id", "area", "title", "status", "legacy_ids", "edge_cases"}
EDGE_KEYS = {"id", "scenario", "expected", "severity", "known_gap", "status", "checks", "tracking", "planned_check"}
CHECK_KEYS = {"kind", "ref", "scope", "contains"}
FEATURE_ID = re.compile(r"^F-[A-Z]+-\d{2}$")
EDGE_ID = re.compile(r"^F-[A-Z]+-\d{2}\.e\d+$")
PROVE = re.compile(r"^\s*prove\s+(F-[A-Z]+-\d+(?:\.e\d+)?)")
SECTION_START = re.compile(r"^(section_\w+)\(\)\s*\{")
SECTION_END = re.compile(r"^\}")
GO_KNOWN_GAP = re.compile(r"^//go:build\s+.*\bknowngaps\b", re.M)
PLAYWRIGHT_CALL = re.compile(r"""\btest(?:\.(?:fixme|skip|only))?\(\s*(['"`])((?:\\.|(?!\1).)*?)\1""")
DEFAULT_DEMO = "auth-service/scripts/demo.sh"
FUNC_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)

EXIT_OK, EXIT_FAIL, EXIT_USAGE = 0, 1, 2
FEATURES_RELPATH = os.path.join("e2e-tests", "api-keys", "features.json")
POC_ENV = "API_KEYS_POC_REF"
WIKI_ENV = "API_KEY_CHECKS_JSON"
DEFAULT_WIKI_CHECKS = "~/sefaria/sefaria-wiki/wiki/projects/api-key-program/checks/checks.json"

Finding = namedtuple("Finding", "level edge kind ref reason")
Res = namedtuple("Res", "check ok reason known_gap")


# --- loading and schema -----------------------------------------------------

def load(path):
    with open(path, encoding="utf-8") as handle:
        doc = json.load(handle)
    if not isinstance(doc, dict):
        raise ValueError("top level must be a JSON object")
    return doc


def validate_schema(doc):
    errors = []
    _unknown_keys(doc, TOP_KEYS, "top level", errors)
    if doc.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"top level: schema_version must be {SCHEMA_VERSION}")
    _validate_refs(doc.get("refs", {}), errors)
    must_map = doc.get("must_map", [])
    if not isinstance(must_map, list) or not all(isinstance(item, str) for item in must_map):
        errors.append("top level: must_map must be a list of glob strings")
    features = doc.get("features")
    if not isinstance(features, list) or not features:
        errors.append("top level: features must be a non-empty list")
        return errors
    seen = {"features": set(), "edges": set()}
    for index, feature in enumerate(features):
        _validate_feature(feature, index, seen, errors)
    return errors


def _validate_refs(refs, errors):
    if not isinstance(refs, dict):
        errors.append("refs must be an object")
        return
    _unknown_keys(refs, {"poc_glob"}, "refs", errors)
    if "poc_glob" in refs and not isinstance(refs["poc_glob"], str):
        errors.append("refs: poc_glob must be a string")


def _validate_feature(feature, index, seen, errors):
    if not isinstance(feature, dict):
        errors.append(f"features[{index}]: must be an object")
        return
    fid = feature.get("id")
    where = f"feature {fid}" if isinstance(fid, str) else f"features[{index}]"
    _unknown_keys(feature, FEATURE_KEYS, where, errors)
    for key in ("id", "area", "title"):
        _require_str(feature, key, where, errors)
    if isinstance(fid, str):
        if not FEATURE_ID.match(fid):
            errors.append(f"{where}: id must look like F-AREA-NN")
        _note_unique(fid, seen["features"], f"feature id {fid}", errors)
    if feature.get("status") not in STATUSES:
        errors.append(f"{where}: status must be one of {', '.join(STATUSES)}")
    legacy = feature.get("legacy_ids", [])
    if not isinstance(legacy, list) or not all(isinstance(item, str) for item in legacy):
        errors.append(f"{where}: legacy_ids must be a list of strings")
    edges = feature.get("edge_cases")
    if not isinstance(edges, list) or not edges:
        errors.append(f"{where}: edge_cases must be a non-empty list")
        return
    for edge in edges:
        _validate_edge(edge, fid, where, seen, errors)


def _validate_edge(edge, fid, feature_where, seen, errors):
    if not isinstance(edge, dict):
        errors.append(f"{feature_where}: edge case must be an object")
        return
    eid = edge.get("id")
    label = f"edge {eid}" if isinstance(eid, str) else f"{feature_where} edge"
    _unknown_keys(edge, EDGE_KEYS, label, errors)
    if not (isinstance(eid, str) and EDGE_ID.match(eid) and isinstance(fid, str) and eid.startswith(fid + ".e")):
        errors.append(f"{label}: id must look like {fid}.eN")
    elif eid is not None:
        _note_unique(eid, seen["edges"], f"edge id {eid}", errors)
    _require_str(edge, "scenario", label, errors)
    _require_str(edge, "expected", label, errors)
    if edge.get("severity") not in SEVERITIES:
        errors.append(f"{label}: severity must be one of {', '.join(SEVERITIES)}")
    if "known_gap" in edge and not isinstance(edge["known_gap"], bool):
        errors.append(f"{label}: known_gap must be true or false")
    if "status" in edge and edge["status"] not in STATUSES:
        errors.append(f"{label}: status must be one of {', '.join(STATUSES)}")
    for key in ("tracking", "planned_check"):
        if key in edge and not isinstance(edge[key], str):
            errors.append(f"{label}: {key} must be a string")
    checks = edge.get("checks", [])
    if not isinstance(checks, list):
        errors.append(f"{label}: checks must be a list")
        return
    for check in checks:
        _validate_check(check, label, errors)


def _validate_check(check, label, errors):
    if not isinstance(check, dict):
        errors.append(f"{label}: check must be an object")
        return
    _unknown_keys(check, CHECK_KEYS, f"{label} check", errors)
    kind = check.get("kind")
    if kind not in KINDS:
        errors.append(f"{label}: kind must be one of {', '.join(KINDS)}")
        return
    ref = check.get("ref")
    if not isinstance(ref, str) or not ref:
        errors.append(f"{label}: {kind} ref must be a non-empty string")
        return
    if check.get("scope") not in (None, "poc"):
        errors.append(f"{label}: scope must be 'poc' when present")
    if check.get("scope") == "poc" and kind == "checks_json":
        errors.append(f"{label}: checks_json cannot be scope poc")
    if not _ref_shape_ok(kind, ref):
        errors.append(f"{label}: {kind} ref {ref!r} has the wrong form")
    if "contains" in check:
        _validate_contains(check, kind, label, errors)
    elif kind == "file":
        errors.append(f"{label}: file checks need a contains regex")


def _validate_contains(check, kind, label, errors):
    pattern = check["contains"]
    if kind not in CONTAINS_KINDS:
        errors.append(f"{label}: contains is not allowed for kind {kind}")
    if not isinstance(pattern, str):
        errors.append(f"{label}: contains must be a regex string")
        return
    try:
        re.compile(pattern)
    except re.error as exc:
        errors.append(f"{label}: contains is not a valid regex: {exc}")


def _ref_shape_ok(kind, ref):
    if kind == "pytest":
        parts = ref.split("::")
        return len(parts) in (2, 3) and all(parts)
    if kind in ("gotest", "playwright", "demo"):
        path, sep, rest = ref.partition("::")
        return bool(sep and path and rest)
    return True


def _unknown_keys(obj, allowed, where, errors):
    if not isinstance(obj, dict):
        return
    for key in sorted(set(obj) - allowed):
        errors.append(f"{where}: unknown key {key!r}")


def _require_str(obj, key, where, errors):
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{where}: {key} must be a non-empty string")


def _note_unique(value, seen_set, label, errors):
    if value in seen_set:
        errors.append(f"duplicate {label}")
    seen_set.add(value)


# --- git and source access ----------------------------------------------------

def _git(root, args):
    try:
        return subprocess.run(
            ["git", "-C", root] + args,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", errors="replace", check=False,
        )
    except OSError as exc:
        return subprocess.CompletedProcess(args, 127, "", str(exc))


def git_toplevel():
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", errors="replace", check=False,
        )
    except OSError:
        return None
    return proc.stdout.strip() if proc.returncode == 0 else None


def ref_exists(root, ref):
    return _git(root, ["cat-file", "-e", ref + "^{commit}"]).returncode == 0


def resolve_poc_ref(root, explicit, glob_pattern):
    """Return (ref, reason): the explicit ref, else the one remote branch matching the glob."""
    if explicit:
        return explicit, ""
    if not glob_pattern:
        return None, "no --poc-ref and no refs.poc_glob in features.json"
    listing = _git(root, ["for-each-ref", "--format=%(refname)", "refs/remotes"])
    prefix = "refs/remotes/"
    names = [line[len(prefix):] for line in listing.stdout.splitlines() if line.startswith(prefix)]
    matches = [name for name in names if fnmatch.fnmatchcase(name, glob_pattern)]
    if len(matches) == 1:
        return matches[0], ""
    return None, f"{len(matches)} remote branches match {glob_pattern}; pass --poc-ref"


class LocalSource:
    def __init__(self, root):
        self.root = root

    def _abs(self, path):
        return os.path.join(self.root, path)

    def exists(self, path):
        return os.path.isfile(self._abs(path))

    def read(self, path):
        if not self.exists(path):
            return None
        with open(self._abs(path), encoding="utf-8", errors="replace") as handle:
            return handle.read()

    def list_dir(self, path):
        absolute = self._abs(path)
        if not os.path.isdir(absolute):
            return None
        return sorted(os.listdir(absolute))

    def is_executable(self, path):
        return self.exists(path) and os.access(self._abs(path), os.X_OK)

    def grep(self, path, regex):
        text = self.read(path)
        return text is not None and re.search(regex, text, re.M) is not None


class GitSource:
    """Read-only view of one git ref; nothing is checked out."""

    def __init__(self, root, ref):
        self.root = root
        self.ref = ref

    def _object_type(self, path):
        proc = _git(self.root, ["cat-file", "-t", f"{self.ref}:{path}"])
        return proc.stdout.strip() if proc.returncode == 0 else ""

    def exists(self, path):
        return self._object_type(path) == "blob"

    def read(self, path):
        if not self.exists(path):
            return None
        proc = _git(self.root, ["show", f"{self.ref}:{path}"])
        return proc.stdout if proc.returncode == 0 else None

    def list_dir(self, path):
        if self._object_type(path) != "tree":
            return None
        proc = _git(self.root, ["ls-tree", "--name-only", f"{self.ref}:{path}"])
        return proc.stdout.splitlines() if proc.returncode == 0 else None

    def is_executable(self, path):
        proc = _git(self.root, ["ls-tree", self.ref, "--", path])
        return proc.stdout.split(" ", 1)[0] == "100755"

    def grep(self, path, regex):
        proc = _git(self.root, ["grep", "-q", "-E", "-e", regex, self.ref, "--", path])
        return proc.returncode == 0


# --- resolvers: each returns (ok, reason, known_gap); ok is True, False or None (unverified) -----

def resolve_pytest(check, src, owner):
    parts = check["ref"].split("::")
    path = parts[0]
    text = src.read(path)
    if text is None:
        return False, f"file not found: {path}", False
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError as exc:
        return False, f"syntax error in {path}: {exc.msg}", False
    cls, body = None, tree.body
    if len(parts) == 3:
        cls = _find_node(tree.body, parts[1], (ast.ClassDef,))
        if cls is None:
            return False, f"no class {parts[1]} in {path}", False
        body = cls.body
    func = _find_node(body, parts[-1], FUNC_TYPES)
    if func is None:
        return False, f"no test {parts[-1]} in {path}", False
    nodes = [func] if cls is None else [cls, func]
    return True, "", "known_gap" in parts[-1] or _failing_marked(nodes)


def _find_node(body, name, types):
    for node in body:
        if isinstance(node, types) and node.name == name:
            return node
    return None


def _failing_marked(nodes):
    for node in nodes:
        for decorator in node.decorator_list:
            target = decorator.func if isinstance(decorator, ast.Call) else decorator
            if ast.unparse(target).endswith("mark.failing"):
                return True
    return False


def resolve_gotest(check, src, owner):
    directory, _, name = check["ref"].partition("::")
    names = src.list_dir(directory)
    if names is None:
        return False, f"no directory {directory}", False
    func_name, _, subtest = name.partition("/")
    pattern = re.compile("^func " + re.escape(func_name) + r"\(", re.M)
    found_func = False
    for file_name in names:
        if not fnmatch.fnmatchcase(file_name, "*_test.go"):
            continue
        text = src.read(posixpath.join(directory, file_name)) or ""
        if not pattern.search(text):
            continue
        found_func = True
        if subtest and not _go_has_string_literal(text, subtest):
            continue
        return True, "", bool(GO_KNOWN_GAP.search(text))
    if found_func:
        return False, f"no subtest {subtest!r} in func {func_name} in {directory}/*_test.go", False
    return False, f"no func {func_name} in {directory}/*_test.go", False


def _go_has_string_literal(text, value):
    for quote in ('"', "`"):
        if quote + value + quote in text:
            return True
    return False


def resolve_playwright(check, src, owner):
    path, _, prefix = check["ref"].partition("::")
    text = src.read(path)
    if text is None:
        return False, f"file not found: {path}", False
    for match in PLAYWRIGHT_CALL.finditer(text):
        raw_title = match.group(2)
        if raw_title.split("${", 1)[0].startswith(prefix):
            return True, "", "@known-gap" in raw_title
    return False, f"no test titled {prefix!r} in {path}", False


def resolve_demo(check, src, owner):
    path, _, section = check["ref"].partition("::")
    text = src.read(path)
    if text is None:
        return False, f"file not found: {path}", False
    sections = demo_sections(text)
    if section not in sections:
        return False, f"no function {section}() in {path}", False
    if owner[1] not in sections[section]:
        return False, f"{section} does not prove {owner[1]}", False
    return True, "", False


def resolve_drill(check, src, owner):
    path, _, marker = check["ref"].partition("#")
    text = src.read(path)
    if text is None:
        return False, f"drill not found: {path}", False
    if marker and marker not in text:
        return False, f"marker {marker!r} not in {path}", False
    known_gap = "known" in posixpath.basename(path).lower() or "[KG]" in text
    return True, "", known_gap


def resolve_shell(check, src, owner):
    path = check["ref"]
    text = src.read(path)
    if text is None:
        return False, f"file not found: {path}", False
    bash_script = text.startswith("#!") and "bash" in text.split("\n", 1)[0]
    if src.is_executable(path) or bash_script:
        return True, "", False
    return False, f"{path} is neither executable nor a bash script", False


def resolve_file(check, src, owner):
    path = check["ref"]
    if not src.exists(path):
        return False, f"file not found: {path}", False
    if not src.grep(path, check["contains"]):
        return False, _no_match(check, path), False
    return True, "", False


def resolve_checks_json(check, wiki_path, require_wiki):
    ref = check["ref"]
    if not os.path.isfile(wiki_path):
        if require_wiki:
            return False, f"wiki checks.json not found: {wiki_path}", False
        return None, f"wiki checks.json absent ({wiki_path}); {ref} unverified", False
    try:
        with open(wiki_path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        return False, f"cannot read {wiki_path}: {exc}", False
    items = data.get("checks", []) if isinstance(data, dict) else data
    if not isinstance(items, list):
        return False, f"unexpected shape in {wiki_path}", False
    for item in items:
        if isinstance(item, dict) and item.get("id") == ref:
            return True, "", bool(item.get("known_gap", False))
    return False, f"id {ref} not in wiki checks.json", False


RESOLVERS = {
    "pytest": resolve_pytest,
    "gotest": resolve_gotest,
    "playwright": resolve_playwright,
    "demo": resolve_demo,
    "drill": resolve_drill,
    "shell": resolve_shell,
    "file": resolve_file,
}


def resolve_poc(check, ref, root, owner):
    """Resolve a scope-poc check against the git objects of ref (the caller checked ref exists)."""
    return _resolve_in(check, GitSource(root, ref), owner)


def _resolve_in(check, src, owner):
    kind = check["kind"]
    ok, reason, known_gap = RESOLVERS[kind](check, src, owner)
    if ok and "contains" in check and kind != "file":
        path = _ref_path(check)
        if not src.grep(path, check["contains"]):
            return False, _no_match(check, path), known_gap
    return ok, reason, known_gap


def _no_match(check, path):
    return f"/{check['contains']}/ not found in {path}"


def _ref_path(check):
    return re.split(r"::|#", check["ref"], maxsplit=1)[0]


def resolve_check(check, ctx, owner):
    kind = check["kind"]
    if kind == "checks_json":
        return resolve_checks_json(check, ctx.wiki_path, ctx.require_wiki)
    if check.get("scope") != "poc":
        return _resolve_in(check, ctx.local, owner)
    ref, reason = ctx.poc()
    if ref is None or not ref_exists(ctx.root, ref):
        message = f"POC ref unavailable: {reason or ref}"
        return (None if ctx.offline_poc else False), message, False
    return resolve_poc(check, ref, ctx.root, owner)


# --- demo.sh parsing -----------------------------------------------------------

def demo_sections(script_text):
    """Map each section_*() function name to the feature or edge ids its body proves, in order."""
    sections = {}
    current = None
    for line in script_text.splitlines():
        if current is None:
            match = SECTION_START.match(line)
            if match:
                current = match.group(1)
                sections[current] = []
            continue
        if SECTION_END.match(line):
            current = None
            continue
        match = PROVE.match(line)
        if match:
            sections[current].append(match.group(1))
    return sections


def demo_prove_ids(script_text):
    return {pid for ids in demo_sections(script_text).values() for pid in ids}


def demo_listing_problem(root, path, sections):
    try:
        proc = subprocess.run(
            ["bash", os.path.join(root, path), "--list-sections"], cwd=root,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", errors="replace", check=False, timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"cannot run {path} --list-sections: {exc}"
    if proc.returncode != 0:
        return f"{path} --list-sections exited {proc.returncode}"
    listed = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    if sorted(listed) != sorted(sections):
        return f"--list-sections printed {listed}; parsed sections are {list(sections)}"
    return None


# --- must_map ------------------------------------------------------------------

def must_map(doc, root):
    """Return 'path::test_name' for every test_* in the files matched by doc['must_map']."""
    keys = []
    for pattern in doc.get("must_map", []):
        for path in sorted(glob.glob(os.path.join(root, pattern), recursive=True)):
            if not os.path.isfile(path):
                continue
            rel = os.path.relpath(path, root).replace(os.sep, "/")
            keys.extend(f"{rel}::{name}" for name in _test_names(path))
    return list(dict.fromkeys(keys))


def _test_names(path):
    with open(path, encoding="utf-8", errors="replace") as handle:
        try:
            tree = ast.parse(handle.read(), filename=path)
        except SyntaxError:
            return []
    names = []
    for node in tree.body:
        if isinstance(node, FUNC_TYPES) and node.name.startswith("test_"):
            names.append(node.name)
        elif isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            names.extend(
                member.name for member in node.body
                if isinstance(member, FUNC_TYPES) and member.name.startswith("test_")
            )
    return names


def _pytest_key(ref):
    parts = ref.split("::")
    return f"{parts[0]}::{parts[-1]}"


# --- status rules ----------------------------------------------------------------

def edge_status(feature, edge):
    return edge.get("status", feature["status"])


def apply_status_rules(feature, edge, results):
    status = edge_status(feature, edge)
    eid = edge["id"]
    findings = []
    for res in results:
        kind, ref = res.check["kind"], res.check["ref"]
        if res.ok is False:
            findings.append(Finding("MISSING", eid, kind, ref, res.reason))
        elif res.ok is None:
            findings.append(Finding("WARN", eid, kind, ref, res.reason))
    if status == PLANNED:
        if not edge.get("tracking") or not edge.get("planned_check"):
            findings.append(Finding("MISSING", eid, "-", "-", "planned case needs tracking and planned_check"))
        return findings
    if any(_proves(res, edge, status) for res in results):
        return findings
    if any(res.ok is False for res in results) or (results and not any(res.ok for res in results)):
        return findings  # a failure is already reported; with nothing resolved: the unresolved checks are already reported and may still be the proof
    return findings + [Finding("MISSING", eid, "-", "-", _no_proof(edge, status, results))]


def _proves(res, edge, status):
    if res.ok is not True or res.known_gap != bool(edge.get("known_gap", False)):
        return False
    if status == ON_BRANCH:
        return res.check.get("scope") != "poc"
    return res.check.get("scope") == "poc" or res.check["kind"] == "demo"


def _no_proof(edge, status, results):
    if edge.get("known_gap"):
        return "known_gap case cites no resolvable known-gap test"
    if any(res.ok and res.known_gap for res in results):
        return "only known-gap tests resolve; a normal case needs a passing check"
    if status == POC_ONLY:
        return "poc_only case needs a resolvable poc-scope or demo check"
    return "no resolvable check proves this on_branch case (poc-scope checks do not count)"


# --- evaluation ----------------------------------------------------------------

class Context:
    def __init__(self, root, poc_ref=None, offline_poc=False, wiki_path=None,
                 require_wiki=False, no_planned=False):
        self.root = root
        self.local = LocalSource(root)
        self.poc_arg = poc_ref
        self.offline_poc = offline_poc
        self.wiki_path = wiki_path or os.path.expanduser(DEFAULT_WIKI_CHECKS)
        self.require_wiki = require_wiki
        self.no_planned = no_planned
        self.poc_glob = None
        self._poc = None

    def poc(self):
        if self._poc is None:
            self._poc = resolve_poc_ref(self.root, self.poc_arg, self.poc_glob)
        return self._poc


def evaluate(doc, ctx):
    """Return (failures, warnings, stats) for a parsed features document."""
    errors = validate_schema(doc)
    if errors:
        return [Finding("INVALID", "-", "-", "-", message) for message in errors], [], {}
    ctx.poc_glob = doc.get("refs", {}).get("poc_glob")
    stats = _new_stats()
    demo_paths = set()
    findings = []
    for feature in doc["features"]:
        stats["features"] += 1
        for edge in feature["edge_cases"]:
            findings.extend(_evaluate_edge(feature, edge, ctx, stats, demo_paths))
    if ctx.local.exists(DEFAULT_DEMO):
        demo_paths.add(DEFAULT_DEMO)
    findings.extend(_demo_findings(sorted(demo_paths), doc, ctx.local))
    findings.extend(_must_map_findings(doc, ctx.root))
    failures = [f for f in findings if f.level != "WARN"]
    warnings = [f for f in findings if f.level == "WARN"]
    return failures, warnings, stats


def _new_stats():
    return {"features": 0, "edges": 0, "checks_ok": 0, "checks_unverified": 0,
            "by_status": {}, "by_area": {}, "planned": {}}


def _evaluate_edge(feature, edge, ctx, stats, demo_paths):
    owner = (feature["id"], edge["id"])
    checks = edge.get("checks", [])
    results = [Res(check, *resolve_check(check, ctx, owner)) for check in checks]
    status = edge_status(feature, edge)
    stats["edges"] += 1
    _bump(stats["by_status"], status)
    _bump(stats["by_area"].setdefault(feature["area"], {}), status)
    if status == PLANNED:
        stats["planned"].setdefault(edge.get("tracking", "-"), []).append(edge["id"])
    for res in results:
        if res.ok is True:
            stats["checks_ok"] += 1
        elif res.ok is None:
            stats["checks_unverified"] += 1
    for check in checks:
        if check["kind"] == "demo" and check.get("scope") != "poc":
            demo_paths.add(_ref_path(check))
    found = apply_status_rules(feature, edge, results)
    if ctx.no_planned and status == PLANNED:
        found.append(Finding("MISSING", edge["id"], "-", "-", "planned case not allowed with --no-planned"))
    return found


def _bump(counts, key):
    counts[key] = counts.get(key, 0) + 1


def _demo_findings(paths, doc, local):
    known = _known_ids(doc)
    findings = []
    for path in paths:
        text = local.read(path)
        if text is None:
            continue
        for dangling in sorted(demo_prove_ids(text) - known):
            findings.append(Finding("MISSING", "-", "demo", path, f"prove {dangling} names no feature or edge id"))
        problem = demo_listing_problem(local.root, path, demo_sections(text))
        if problem:
            findings.append(Finding("MISSING", "-", "demo", path, problem))
    return findings


def _known_ids(doc):
    ids = set()
    for feature in doc["features"]:
        ids.add(feature["id"])
        ids.update(edge["id"] for edge in feature["edge_cases"])
    return ids


def _must_map_findings(doc, root):
    referenced = {
        _pytest_key(check["ref"])
        for feature in doc["features"]
        for edge in feature["edge_cases"]
        for check in edge.get("checks", [])
        if check["kind"] == "pytest"
    }
    return [
        Finding("MISSING", "-", "pytest", key, "test matched by must_map is not referenced by any check")
        for key in must_map(doc, root) if key not in referenced
    ]


# --- reporting and CLI -------------------------------------------------------------

def format_finding(finding):
    return f"{finding.level} {finding.edge} {finding.kind} {finding.ref}: {finding.reason}"


def report(failures, warnings, stats, as_json=False, summary=False):
    code = EXIT_FAIL if failures else EXIT_OK
    if as_json:
        payload = {
            "failures": [f._asdict() for f in failures],
            "warnings": [w._asdict() for w in warnings],
            "stats": stats,
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return code
    for finding in failures + warnings:
        print(format_finding(finding))
    if summary:
        for line in _summary_lines(stats):
            print(line)
    print(f"check_features: {len(failures)} error(s), {len(warnings)} warning(s), "
          f"{stats.get('features', 0)} features, {stats.get('edges', 0)} edges")
    return code


def _summary_lines(stats):
    lines = ["summary:"]
    by_status = stats.get("by_status", {})
    lines.append("  by status: " + ", ".join(f"{s}={by_status.get(s, 0)}" for s in STATUSES))
    lines.append("  by area:")
    for area in sorted(stats.get("by_area", {})):
        counts = stats["by_area"][area]
        lines.append(f"    {area}: " + ", ".join(f"{s}={counts[s]}" for s in STATUSES if s in counts))
    lines.append("  planned by tracking id:")
    for tracking in sorted(stats.get("planned", {})):
        lines.append(f"    {tracking}: {', '.join(stats['planned'][tracking])}")
    lines.append(f"  checks resolved: {stats.get('checks_ok', 0)}, unverified: {stats.get('checks_unverified', 0)}")
    return lines


def build_parser():
    parser = argparse.ArgumentParser(
        description="Check features.json: every feature and edge case must name checks that exist.")
    parser.add_argument("--strict", action="store_true", help="accepted for CI; every rule is always enforced (warnings stay warnings; see --require-wiki, --offline-poc)")
    parser.add_argument("--summary", action="store_true", help="print counts by status and area, planned by tracking id")
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    parser.add_argument("--root", help="repository root (default: git toplevel)")
    parser.add_argument("--features", help="features file (default: ROOT/e2e-tests/api-keys/features.json)")
    parser.add_argument("--poc-ref", help=f"git ref of the POC branch (default: ${POC_ENV}, else the one remote "
                                          "branch matching refs.poc_glob)")
    parser.add_argument("--offline-poc", action="store_true", help="a POC ref that cannot be found becomes a warning")
    parser.add_argument("--require-wiki", action="store_true", help="a missing wiki checks.json is an error")
    parser.add_argument("--no-planned", action="store_true", help="planned edge cases are errors")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    root = os.path.abspath(args.root) if args.root else git_toplevel()
    if root is None:
        print("check_features: not inside a git repository; pass --root", file=sys.stderr)
        return EXIT_USAGE
    features_path = args.features or os.path.join(root, FEATURES_RELPATH)
    try:
        doc = load(features_path)
    except (OSError, ValueError) as exc:
        print(f"check_features: cannot load {features_path}: {exc}", file=sys.stderr)
        return EXIT_USAGE
    ctx = Context(
        root,
        poc_ref=args.poc_ref or os.environ.get(POC_ENV) or None,
        offline_poc=args.offline_poc,
        wiki_path=os.path.expanduser(os.environ.get(WIKI_ENV, DEFAULT_WIKI_CHECKS)),
        require_wiki=args.require_wiki,
        no_planned=args.no_planned,
    )
    failures, warnings, stats = evaluate(doc, ctx)
    return report(failures, warnings, stats, as_json=args.json, summary=args.summary)


if __name__ == "__main__":
    sys.exit(main())
