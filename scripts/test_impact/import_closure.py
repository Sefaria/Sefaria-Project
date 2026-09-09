#!/usr/bin/env python3
"""Static first-party import-closure analysis, for deciding which test groups a
change can possibly affect.

Why this exists
---------------
Gating a test job on "did a file under sefaria/model/linker/ change?" is exact
about the question it asks and wrong about the question that matters. A linker
test can break from a change *outside* linker paths -- sefaria/model/text.py,
requirements.txt, anything the test transitively imports. Path-filtering on the
subsystem's own directory therefore produces false greens.

The question that is both safe and deterministic is: did any changed file appear
in the transitive import closure of the tests we are considering skipping? This
module answers that by walking the AST -- no imports are executed, no database
is touched, and the answer is a pure function of the tree.

FAIL OPEN. Dynamic imports (importlib, __import__, Django app loading, string
-based settings references) are invisible to static analysis. Anything this
module cannot resolve is reported in `unresolved`, and every caller MUST treat a
non-empty `unresolved` as "run the tests" rather than "skip them". Skipping on
incomplete information is the failure this whole design exists to avoid.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import sys
from collections import deque

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Genuinely-computed imports that are nonetheless provably bounded. Each entry
# needs a reason, and the burden is on the entry: if you cannot say why the
# computed name can never reach the subsystem, it does not belong here and the
# analysis should fail open instead.
DYNAMIC_ALLOWLIST = {
    # __import__(SITE_PACKAGE + ".site_settings") -- SITE_PACKAGE is a settings
    # string naming a directory under sites/; every candidate is a flat settings
    # module with no linker involvement.
    "sefaria/site/site_settings.py",
}

# Directories that are never first-party source for this analysis.
SKIP_DIRS = {".git", "venv", "node_modules", "static", "locale", "log", "logs",
             "__pycache__", ".worktrees", ".claude", "build", "data", ".artifacts"}


def iter_python_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if fn.endswith(".py"):
                yield os.path.join(dirpath, fn)


def module_name_for(path, root):
    rel = os.path.relpath(path, root)
    if rel.endswith("__init__.py"):
        rel = os.path.dirname(rel)
    else:
        rel = rel[: -len(".py")]
    return rel.replace(os.sep, ".").strip(".")


def build_index(root):
    """module name -> file path, for every first-party module."""
    index = {}
    for path in iter_python_files(root):
        index[module_name_for(path, root)] = path
    return index


def imports_of(path):
    """Every module name syntactically imported by this file. Relative imports are
    resolved against the file's own package."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            tree = ast.parse(fh.read(), filename=path)
    except (SyntaxError, UnicodeDecodeError):
        return set(), True  # unparseable -> treat as unresolved, fail open
    found = set()
    pkg = module_name_for(path, REPO_ROOT).rsplit(".", 1)[0]
    dynamic = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                found.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level:  # relative import
                base = pkg.split(".")
                base = base[: len(base) - (node.level - 1)] if node.level > 1 else base
                prefix = ".".join(base)
                mod = f"{prefix}.{node.module}" if node.module else prefix
                found.add(mod)
                for alias in node.names:
                    found.add(f"{mod}.{alias.name}")
            elif node.module:
                found.add(node.module)
                for alias in node.names:
                    found.add(f"{node.module}.{alias.name}")
        elif isinstance(node, ast.Call):
            fn = node.func
            name = getattr(fn, "id", None) or getattr(fn, "attr", None)
            if name in ("import_module", "__import__"):
                # A literal argument is statically resolvable -- __import__("pymongo")
                # is an ordinary import written the long way, not a blind spot.
                # Only a computed name is genuinely opaque.
                arg = node.args[0] if node.args else None
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    found.add(arg.value)
                else:
                    dynamic = True
    return found, dynamic


def closure(seeds, index):
    """Transitive first-party import closure of `seeds` (file paths).
    Returns (set of file paths, set of unresolved reasons)."""
    seen, unresolved = set(), set()
    queue = deque(seeds)
    while queue:
        path = queue.popleft()
        if path in seen:
            continue
        seen.add(path)
        names, dynamic = imports_of(path)
        rel = os.path.relpath(path, REPO_ROOT)
        if dynamic and rel not in DYNAMIC_ALLOWLIST:
            unresolved.add(f"{rel}: computed import, cannot resolve statically")
        for name in names:
            # Longest-prefix match: `from sefaria.model.text import Ref` should
            # resolve to sefaria/model/text.py, not sefaria/model/.
            parts = name.split(".")
            for i in range(len(parts), 0, -1):
                cand = ".".join(parts[:i])
                if cand in index:
                    queue.append(index[cand])
                    break
    return seen, unresolved


def is_subsystem_file(path, subsystem_globs):
    rel = os.path.relpath(path, REPO_ROOT)
    import fnmatch
    return any(fnmatch.fnmatch(rel, g) for g in subsystem_globs)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--subsystem-glob", action="append", required=True,
                    help="repo-relative glob defining the subsystem, e.g. 'sefaria/model/linker/*'. Repeatable.")
    ap.add_argument("--test-glob", action="append", default=["*test*.py"],
                    help="which files count as tests when scanning for members.")
    ap.add_argument("--changed-file", action="append", default=[],
                    help="repo-relative changed path. If given, the tool answers affected/not-affected.")
    ap.add_argument("--format", choices=["json", "paths", "nodeids"], default="json")
    args = ap.parse_args()

    index = build_index(REPO_ROOT)

    # 1. Which test files transitively reach the subsystem?
    import fnmatch
    members, member_unresolved = [], set()
    for path in iter_python_files(REPO_ROOT):
        rel = os.path.relpath(path, REPO_ROOT)
        if not any(fnmatch.fnmatch(os.path.basename(rel), g) for g in args.test_glob):
            continue
        reached, unres = closure([path], index)
        member_unresolved |= unres
        if any(is_subsystem_file(p, args.subsystem_glob) for p in reached):
            members.append(rel)

    # 2. The trigger set: everything those tests transitively import.
    member_paths = [os.path.join(REPO_ROOT, m) for m in sorted(members)]
    trigger, trigger_unresolved = closure(member_paths, index)
    trigger_rel = sorted(os.path.relpath(p, REPO_ROOT) for p in trigger)

    unresolved = sorted(member_unresolved | trigger_unresolved)
    result = {
        "members": sorted(members),
        "trigger_paths": trigger_rel,
        "unresolved": unresolved,
        "fail_open": bool(unresolved),
    }

    if args.changed_file:
        changed = set(args.changed_file)
        hit = sorted(changed & set(trigger_rel))
        # FAIL OPEN: unresolved analysis means we cannot prove the tests are
        # unaffected, so we say they are affected.
        result["changed_in_closure"] = hit
        result["affected"] = bool(hit) or result["fail_open"]

    if args.format == "json":
        print(json.dumps(result, indent=2))
    elif args.format == "paths":
        print("\n".join(trigger_rel))
    else:
        print("\n".join(result["members"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
