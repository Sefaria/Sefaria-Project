#!/usr/bin/env python3
"""Apply a pytest marker to a measured set of nodeids, idempotently.

Marker sets in this repo are DERIVED, never hand-maintained: `needs_mongo` comes
from the per-test Mongo recorder, `needs_linker` from a coverage pass. Editing
them by hand guarantees drift the first time someone adds a test. This script is
how a regenerated set gets back into the tree.

Idempotent: a test that already carries the marker is left alone, so re-running
after a fresh measurement only adds what is genuinely new. Use --check to fail
without writing (for CI drift detection) and --remove to strip the marker.
"""
from __future__ import annotations

import argparse
import ast
import os
import re
import sys
from collections import defaultdict

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def targets_for(nodeids):
    """nodeid -> (file, [class or function names]). Parametrized ids collapse to
    the function, since a marker cannot sit on a single parameter set."""
    by_file = defaultdict(set)
    for nid in nodeids:
        nid = nid.split("[", 1)[0].strip()
        if not nid or "::" not in nid:
            continue
        parts = nid.split("::")
        by_file[parts[0]].add(tuple(parts[1:]))
    return by_file


def find_decorator_line(tree, path_parts, lines):
    """Return the 0-based line to insert a decorator above, and its indent."""
    node = tree
    for i, name in enumerate(path_parts):
        found = None
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) \
                    and child.name == name:
                found = child
                break
        if found is None:
            return None, None
        node = found
    first = node.decorator_list[0].lineno - 1 if node.decorator_list else node.lineno - 1
    indent = len(lines[first]) - len(lines[first].lstrip())
    return first, indent


def already_marked(node_src, marker):
    return re.search(rf"@pytest\.mark\.{re.escape(marker)}\b", node_src) is not None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--marker", required=True)
    ap.add_argument("--nodeids-file", required=True,
                    help="one nodeid per line, as emitted by the measurement step")
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    args = ap.parse_args()

    with open(args.nodeids_file) as fh:
        nodeids = [l.strip() for l in fh if l.strip()]

    by_file = targets_for(nodeids)
    added, missing, already = 0, [], 0

    for relpath, targets in sorted(by_file.items()):
        path = os.path.join(REPO_ROOT, relpath)
        if not os.path.exists(path):
            missing.append(relpath)
            continue
        with open(path) as fh:
            src = fh.read()
        lines = src.splitlines(keepends=True)
        tree = ast.parse(src, filename=path)

        # Collapse method-level targets onto their class when the whole class is
        # covered -- one decorator beats twenty.
        insertions = []
        for parts in sorted(targets, key=lambda t: -len(t)):
            line, indent = find_decorator_line(tree, list(parts), lines)
            if line is None:
                missing.append(f"{relpath}::{'::'.join(parts)}")
                continue
            seg = "".join(lines[max(0, line - 3):line + 1])
            if already_marked(seg, args.marker):
                already += 1
                continue
            insertions.append((line, indent))

        if not insertions:
            continue
        if args.check:
            added += len(insertions)
            continue

        for line, indent in sorted(set(insertions), reverse=True):
            lines.insert(line, " " * indent + f"@pytest.mark.{args.marker}\n")
            added += 1

        out = "".join(lines)
        if not re.search(r"^import pytest\b", out, re.M):
            out = "import pytest\n" + out
        with open(path, "w") as fh:
            fh.write(out)

    print(f"marker={args.marker} added={added} already_present={already} unresolved={len(missing)}")
    for m in missing[:10]:
        print(f"  unresolved: {m}", file=sys.stderr)
    if args.check and added:
        print("DRIFT: measured set is not fully marked", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
