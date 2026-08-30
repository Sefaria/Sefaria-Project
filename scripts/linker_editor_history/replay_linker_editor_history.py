"""
Replay linker_editor_history entries (as exported by export_linker_editor_history.py) against
this environment, by calling the same sefaria.helper.linker_editor functions the live
/linker-editor UI calls -- so every replayed edit goes through the same validation, cache
invalidation, and (re-)logging a live admin action would.

This does NOT protect against cross-environment drift the source history can't see: a schema
that has diverged between environments, match_templates edited directly against Mongo outside
the linker editor, or a NonUniqueTerm that pre-existed in one environment's seed data but not
the other's. Any of those surface as an InputError on the affected entry, which this script
pauses on and asks the operator to ignore or abort -- it does not guess.
"""
import argparse
import json
import os
import sys

import django
django.setup()

from sefaria.helper import linker_editor
from sefaria.model.linker_editor_history import log_linker_editor_action
from sefaria.system.exceptions import InputError

# Actions whose logged params match the target function's keyword arguments exactly.
DIRECT_ACTIONS = {
    "add_match_template": linker_editor.add_match_template,
    "remove_match_template": linker_editor.remove_match_template,
    "replace_match_template": linker_editor.replace_match_template,
    "set_address_types": linker_editor.set_address_types,
    "set_node_properties": linker_editor.set_node_properties,
    "add_non_unique_term_titles": linker_editor.add_non_unique_term_titles,
    "delete_non_unique_term": linker_editor.delete_non_unique_term,
}


def _remap(value, slug_remap):
    """Recursively substitute any string found in slug_remap: an original NonUniqueTerm slug ->
    the slug this environment actually assigned when the term's create_non_unique_term entry was
    replayed. Slug generation includes a live collision-avoidance suffix against whatever terms
    already exist in this DB, so it isn't guaranteed to match the source environment's slug."""
    if isinstance(value, str):
        return slug_remap.get(value, value)
    if isinstance(value, list):
        return [_remap(v, slug_remap) for v in value]
    if isinstance(value, dict):
        return {k: _remap(v, slug_remap) for k, v in value.items()}
    return value


def _apply_create_non_unique_term(params, uid, slug_remap):
    # Logged params include the server-assigned `slug` from the source environment, which isn't
    # a parameter of create_non_unique_term(titles, uid) -- drop it, then remap future references
    # to it onto whatever slug this environment actually assigns.
    result = linker_editor.create_non_unique_term(titles=params["titles"], uid=uid)
    original_slug = params.get("slug")
    if original_slug:
        slug_remap[original_slug] = result["slug"]
    return result


def _apply_swap_non_unique_term_usages(params, uid):
    # Logged params are {old_slug, new_slug, affected_usages}, but the function signature is
    # (slug, new_slug, uid) -- affected_usages is a derived audit trail recomputed live from the
    # usage index, not an input.
    return linker_editor.swap_non_unique_term_usages(slug=params["old_slug"], new_slug=params["new_slug"], uid=uid)


def _apply_rebuild_dibur_hamatchils_sync(params, uid):
    # Celery Task instances remain plain callables: calling one directly (instead of
    # .apply_async) runs its body synchronously in-process, no broker/worker required.
    from sefaria.helper.linker.tasks import rebuild_dibur_hamatchils_task
    title = params["title"]
    rebuild_dibur_hamatchils_task(title)
    # The synchronous path bypasses enqueue_rebuild_dibur_hamatchils, which normally logs this
    # action -- log it manually so this environment's own audit trail stays consistent.
    log_linker_editor_action(uid, "rebuild_dibur_hamatchils", {"title": title}, index_title=title)


def _apply_entry(entry, uid, slug_remap, sync_dibur_hamatchil):
    action = entry["action"]
    params = _remap(entry["params"], slug_remap)

    if action == "create_non_unique_term":
        return _apply_create_non_unique_term(params, uid, slug_remap)
    if action == "swap_non_unique_term_usages":
        return _apply_swap_non_unique_term_usages(params, uid)
    if action == "rebuild_dibur_hamatchils":
        if sync_dibur_hamatchil:
            return _apply_rebuild_dibur_hamatchils_sync(params, uid)
        return linker_editor.enqueue_rebuild_dibur_hamatchils(title=params["title"], uid=uid)
    if action in DIRECT_ACTIONS:
        return DIRECT_ACTIONS[action](**params, uid=uid)
    raise InputError("Unknown linker_editor_history action '{}'.".format(action))


def _load_progress(progress_path):
    if not os.path.exists(progress_path):
        return set()
    with open(progress_path, encoding="utf-8") as f:
        return set(json.load(f))


def _save_progress(progress_path, applied_ids):
    with open(progress_path, "w", encoding="utf-8") as f:
        json.dump(sorted(applied_ids), f)


def _prompt_ignore_or_abort(entry, error):
    print("\nFAILED to replay entry:", file=sys.stderr)
    print(f"  _id: {entry.get('_id')}", file=sys.stderr)
    print(f"  action: {entry.get('action')}", file=sys.stderr)
    print(f"  params: {entry.get('params')}", file=sys.stderr)
    print(f"  error: {error}", file=sys.stderr)
    while True:
        choice = input("[i]gnore and continue, or [a]bort? ").strip().lower()
        if choice in ("i", "ignore"):
            return True
        if choice in ("a", "abort"):
            return False
        print("Please answer 'i' or 'a'.")


def main():
    parser = argparse.ArgumentParser(
        description="Replay linker_editor_history entries (from export_linker_editor_history.py) against this environment."
    )
    parser.add_argument("--input", required=True, help="Path to the JSON file produced by export_linker_editor_history.py")
    parser.add_argument("--uid", required=True, type=int,
                         help="Destination-environment user id to attribute every replayed action to "
                              "(the recorded source-environment uid is never reused)")
    parser.add_argument("--sync-dibur-hamatchil", action="store_true",
                         help="Run dibur_hamatchil rebuilds synchronously in-process instead of enqueueing a Celery "
                              "task -- use this if the destination has no worker consuming that queue")
    parser.add_argument("--progress-file", default=None,
                         help="Resume/progress sidecar file path (default: <input>.progress.json)")
    args = parser.parse_args()

    progress_path = args.progress_file or (args.input + ".progress.json")

    with open(args.input, encoding="utf-8") as f:
        entries = json.load(f)
    entries.sort(key=lambda e: e["_id"])  # ObjectId hex strings sort lexically == chronologically

    applied_ids = _load_progress(progress_path)
    slug_remap = {}
    applied = ignored = already_done = 0

    for entry in entries:
        entry_id = entry["_id"]
        if entry_id in applied_ids:
            already_done += 1
            continue
        try:
            _apply_entry(entry, args.uid, slug_remap, args.sync_dibur_hamatchil)
        except InputError as e:
            if _prompt_ignore_or_abort(entry, e):
                ignored += 1
                continue
            print(f"\nAborted. {applied} entries applied, {ignored} ignored before this point.", file=sys.stderr)
            print("Resume by re-running with the same --input; already-applied entries will be skipped.", file=sys.stderr)
            sys.exit(1)
        applied_ids.add(entry_id)
        _save_progress(progress_path, applied_ids)
        applied += 1

    print(f"\nDone. {applied} entries applied, {ignored} ignored, {already_done} already applied in a prior run.")
    if slug_remap:
        print("NonUniqueTerm slug remapping (source slug -> destination slug):")
        for old, new in slug_remap.items():
            print(f"  {old} -> {new}")


if __name__ == "__main__":
    main()
