#!/usr/bin/env python3
"""Derive the `needs_linker` test set from measured coverage, not from imports.

Static import analysis cannot answer this question in this repo: sefaria/model/
__init__.py imports the linker eagerly (`from .linker.linker import Linker`), so
every test that touches sefaria.model transitively "reaches" linker and the
import graph separates nothing -- a run over the tree returns 71 member files
including sso/tests/adapters_test.py.

Execution is the honest signal. coverage.py with `dynamic_context=test_function`
records which test actually executed a line in the linker sources; this script
reads that data and emits the test set.

Tests that were never measured are deliberately NOT emitted. An unmarked test
keeps running in the ordinary jobs, so an incomplete measurement costs CI time
rather than coverage -- the safe direction.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import pathlib

import coverage

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _module_index():
    """basename (no .py) -> repo-relative path, for every collectable test file.

    coverage's dynamic_context reports `module.test_function`, not a pytest
    nodeid, so the module has to be mapped back to a file before a marker can be
    applied. Ambiguous basenames are dropped rather than guessed -- two files
    named linker_test.py in different packages must not be silently conflated.
    """
    import collections
    hits = collections.defaultdict(list)
    for path in pathlib.Path(REPO_ROOT).rglob("*test*.py"):
        rel = os.path.relpath(path, REPO_ROOT)
        parts = rel.split(os.sep)
        # .claude/worktrees and .worktrees hold whole copies of the repo; without
        # excluding them every test basename looks ambiguous and the whole index
        # collapses to empty.
        if any(p in parts for p in ("venv", "node_modules", ".git", ".claude",
                                     ".worktrees", ".artifacts", "build", "node")):
            continue
        hits[path.stem].append(rel)
    return {k: v[0] for k, v in hits.items() if len(v) == 1}, \
           {k: v for k, v in hits.items() if len(v) > 1}


def context_to_nodeid(ctx, index=None, ambiguous=None):
    """Convert a coverage.py test context to a pytest nodeid."""
    nodeid = ctx.split("|", 1)[0]
    if "::" in nodeid:
        return nodeid
    # `module.Class.test` or `module.test`
    parts = nodeid.split(".")
    if index and len(parts) >= 2:
        mod = parts[0]
        if ambiguous and mod in ambiguous:
            return None  # refuse to guess between same-named test modules
        rel = index.get(mod)
        if rel:
            return rel + "::" + "::".join(parts[1:])
    return None

    parts = nodeid.split(".")
    for i in range(len(parts) - 1, 0, -1):
        relpath = os.path.join(*parts[:i]) + ".py"
        if os.path.exists(os.path.join(REPO_ROOT, relpath)):
            test_parts = parts[i:]
            if test_parts:
                return "::".join([relpath, *test_parts])
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-file", default=".artifacts/linker-coverage/.coverage")
    ap.add_argument("--format", choices=["json", "nodeids", "files"], default="json")
    args = ap.parse_args()

    if not os.path.exists(args.data_file):
        print(f"error: no coverage data at {args.data_file}; run the coverage pass first",
              file=sys.stderr)
        return 2

    data = coverage.CoverageData(basename=args.data_file)
    data.read()

    contexts = set()
    for measured in data.measured_files():
        for _lineno, ctxs in data.contexts_by_lineno(measured).items():
            for ctx in ctxs:
                if ctx:  # the empty context is "no test attributed"
                    contexts.add(ctx)

    # coverage renders a context as "path::Class::test|phase" -- keep the nodeid.
    index, ambiguous = _module_index()
    nodeids = set()
    for ctx in contexts:
        nodeid = context_to_nodeid(ctx, index, ambiguous)
        if nodeid:
            nodeids.add(nodeid)

    files = sorted({n.split("::", 1)[0] for n in nodeids})
    result = {
        "nodeids": sorted(nodeids),
        "files": files,
        "measured_linker_sources": sorted(
            os.path.relpath(f) for f in data.measured_files()),
    }

    if args.format == "json":
        print(json.dumps(result, indent=2))
    elif args.format == "nodeids":
        print("\n".join(result["nodeids"]))
    else:
        print("\n".join(result["files"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
