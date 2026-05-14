"""
dispatch_library_links_disambiguation_tasks.py

Script to dispatch library links disambiguation tasks for ambiguous and
non-segment-level resolutions, grouped by base text ref to maximize prompt
cache hits within the 5-minute TTL.

Set DEBUG_MODE = True at the top of the script to limit to a random sample for debug.

Examples:
    python dispatch_library_links_disambiguation_tasks.py
    python dispatch_library_links_disambiguation_tasks.py --start 1000
"""

import django
django.setup()

from collections import defaultdict
import argparse
import json
import random
import os
from tqdm import tqdm
from sefaria.system.exceptions import InputError
from sefaria.model import Ref
from sefaria.system.database import db
from sefaria.settings import CELERY_QUEUES, CELERY_ENABLED
from sefaria.celery_setup.app import app
from dataclasses import asdict
from sefaria.helper.linker.disambiguator import (
    AmbiguousResolutionPayload, NonSegmentResolutionPayload, _get_commentary_base_ref
)
from sefaria.helper.linker.tasks import _is_non_segment_or_perek_ref

# Global flag for debug mode
DEBUG_MODE = False  # True = sample a small random subset; False = process all matching LinkerOutput docs
DEBUG_LIMIT = 3000  # Number of random examples to fetch in debug mode
DEBUG_SEED = 6139   # Seed for reproducible random sampling

DEBUG_CACHE_DIR = os.path.join(os.path.dirname(__file__), "debug_cache")


def _debug_cached_sample(cache_name: str, query: dict, collection, limit: int) -> list:
    """
    In debug mode, load a cached sample from disk if available.
    Otherwise, run the MongoDB $sample aggregation, save results to disk, and return them.
    """
    os.makedirs(DEBUG_CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(DEBUG_CACHE_DIR, f"{cache_name}_{limit}.json")

    if os.path.exists(cache_path):
        print(f"  Loading cached sample from {cache_path}")
        with open(cache_path, "r") as f:
            return json.load(f)

    print(f"  No cache found. Sampling from MongoDB...")
    pipeline = [
        {"$match": query},
        {"$sample": {"size": limit}},
    ]
    docs = list(tqdm(collection.aggregate(pipeline), desc="  Fetching from MongoDB", total=limit, unit="doc"))
    for doc in docs:
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])

    with open(cache_path, "w") as f:
        json.dump(docs, f)
    print(f"  Saved {len(docs)} docs to {cache_path}")
    return docs


def _get_base_text_ref_for_grouping(ref_str: str):
    """
    Cheaply compute the base text ref used to group tasks by shared prompt cache.

    If ref_str contains a colon, strips the last ':number' component to produce
    the section ref string, avoiding a full Ref parse + section_ref() call.
    Either way delegates to _get_commentary_base_ref.
    """
    if ":" in ref_str and "-" not in ref_str:
        section_ref_str = ref_str.rsplit(":", 1)[0]
        try:
            return _get_commentary_base_ref(ref_str, Ref(section_ref_str))
        except Exception:
            return _get_commentary_base_ref(ref_str)
    return _get_commentary_base_ref(ref_str)


_RESUME_MARKER_FIELDS = (
    'llm_ambiguous_option_valid',
    'llm_resolved_ref_ambiguous',
    'llm_resolved_method_ambiguous',
    'llm_resolved_phrase_ambiguous',
    'llm_resolved_ref_non_segment',
    'llm_resolved_method_non_segment',
    'llm_resolved_phrase_non_segment',
    'llm_resolved_ref_but_rejected',
)


def find_all_resolutions(debug_parent_ref=None, resume_mode=False):
    """
    Find all LinkerOutput records needing disambiguation (ambiguous or non-segment),
    and group payloads by base text ref so that tasks sharing a cached prompt are
    dispatched together within the 5-minute TTL.

    Args:
        debug_parent_ref: optional Ref; when set, only process citing refs that are
            equal to or contained within this ref.
        resume_mode: if True, sort docs by _id for deterministic iteration and strip
            prior disambiguation markers from spans in-memory so the rebuilt payload
            list matches the original (pre-processing) list. Used for resume-from-anchor.

    Returns:
        dict mapping base_text_ref -> list of AmbiguousResolutionPayload | NonSegmentResolutionPayload
    """
    print("Loading LinkerOutputs needing disambiguation...")
    if debug_parent_ref is not None:
        print(f"DEBUG REF: Limiting to refs equal to or contained in '{debug_parent_ref.normal()}'")
    if DEBUG_MODE:
        print(f"DEBUG MODE: Fetching {DEBUG_LIMIT} random examples with seed {DEBUG_SEED}")
    if resume_mode:
        print("RESUME MODE: using natural order and ignoring prior disambiguation markers")

    query = {
        "spans": {
            "$elemMatch": {
                "type": "citation",
                "$or": [
                    {"ambiguous": True},
                    {"failed": {"$ne": True}, "ref": {"$exists": True}},
                ],
            }
        }
    }

    if DEBUG_MODE:
        docs = _debug_cached_sample("all_resolutions", query, db.linker_output, DEBUG_LIMIT)
    else:
        # Use natural order (no sort) to match the original un-sorted run.
        # WiredTiger natural order is generally stable across in-place updates,
        # though not formally guaranteed across docs that grow.
        docs = db.linker_output.find(query)

    groups = defaultdict(list)
    total_ambiguous = 0
    total_non_segment = 0

    doc_total = len(docs) if isinstance(docs, list) else None
    progress = tqdm(docs, desc="Processing docs", total=doc_total, unit="doc")
    for raw_doc in progress:
        citing_ref = raw_doc.get('ref')
        if not citing_ref:
            continue

        base_ref = _get_base_text_ref_for_grouping(citing_ref) or "__no_base_ref__"
        spans = raw_doc.get('spans', [])

        if resume_mode:
            for span in spans:
                for marker in _RESUME_MARKER_FIELDS:
                    span.pop(marker, None)

        # --- Ambiguous payloads: group spans by charRange ---
        char_range_groups = defaultdict(list)
        for span in spans:
            if span.get('type') == 'citation' and span.get('ambiguous', False) and span.get('llm_ambiguous_option_valid') is None:
                char_range_groups[tuple(span['charRange'])].append(span)

        for char_range, amb_spans in char_range_groups.items():
            ambiguous_refs = []
            normalized_refs = set()
            text = amb_spans[0].get('text', '')
            for s in amb_spans:
                r = s.get('ref')
                if not r:
                    continue
                try:
                    normalized_refs.add(Ref(r).normal())
                except Exception:
                    normalized_refs.add(r)

            has_match_to_parent_ref = False
            if len(normalized_refs) > 1:
                if debug_parent_ref is not None:
                    for tref in normalized_refs:
                        try:
                            oref = Ref(tref)
                            if debug_parent_ref.contains(oref) or oref == debug_parent_ref:
                                has_match_to_parent_ref = True
                                break
                        except Exception:
                            continue

                if not debug_parent_ref or has_match_to_parent_ref:
                    groups[base_ref].append(AmbiguousResolutionPayload(
                        ref=citing_ref,
                        versionTitle=raw_doc['versionTitle'],
                        language=raw_doc['language'],
                        charRange=list(char_range),
                        text=text,
                        ambiguous_refs=list(normalized_refs),
                    ))
                    total_ambiguous += 1
                    progress.set_postfix(ambiguous=total_ambiguous, non_segment=total_non_segment, refresh=False)

        # --- Non-segment payloads ---
        for span in spans:
            if span.get('type') != 'citation' or span.get('failed', False):
                continue
            if span.get('ambiguous', False) and not span.get('llm_ambiguous_option_valid'):
                continue
            if span.get('llm_resolved_ref_non_segment'):
                continue

            ref_str = span.get('ref')
            if span.get('ambiguous', False) and span.get('llm_ambiguous_option_valid'):
                ref_str = span.get('llm_resolved_ref_ambiguous') or ref_str
            if not ref_str:
                continue
            if debug_parent_ref is not None:
                try:
                    r = Ref(ref_str)
                    if not (debug_parent_ref.contains(r) or r == debug_parent_ref):
                        continue
                except Exception:
                    continue

            if _is_non_segment_or_perek_ref(ref_str):
                try:
                    groups[base_ref].append(NonSegmentResolutionPayload(
                        ref=citing_ref,
                        versionTitle=raw_doc['versionTitle'],
                        language=raw_doc['language'],
                        charRange=span['charRange'],
                        text=span['text'],
                        resolved_non_segment_ref=ref_str,
                    ))
                    total_non_segment += 1
                    progress.set_postfix(ambiguous=total_ambiguous, non_segment=total_non_segment, refresh=False)
                except Exception as e:
                    print(f"Warning: Error processing ref {ref_str}: {e}")

    print(
        f"Found {total_ambiguous} ambiguous + {total_non_segment} non-segment = "
        f"{total_ambiguous + total_non_segment} total payloads across {len(groups)} base text groups"
    )
    return groups


def _payload_match_key(payload):
    """Identity tuple for a payload, stable across runs."""
    base = (payload.ref, payload.versionTitle, payload.language, tuple(payload.charRange))
    if hasattr(payload, "resolved_non_segment_ref"):
        return base + ("non_segment", payload.resolved_non_segment_ref)
    return base + ("ambiguous", tuple(sorted(payload.ambiguous_refs)))


def _target_match_key(target: dict):
    """Identity tuple for a resume-anchor dict loaded from JSON."""
    base = (target['ref'], target['versionTitle'], target['language'], tuple(target['charRange']))
    if 'resolved_non_segment_ref' in target:
        return base + ("non_segment", target['resolved_non_segment_ref'])
    return base + ("ambiguous", tuple(sorted(target['ambiguous_refs'])))


def enqueue_bulk_disambiguation(payload: dict):
    """Enqueue a single disambiguation task."""
    sig = app.signature(
        "linker.cauldron_routine_disambiguation",
        args=(payload,),
        options={"queue": CELERY_QUEUES.get("tasks", "TASK QUEUE UNDEFINED")},
    )
    return sig.apply_async()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=0,
                        help="Number of individual payloads to skip before dispatching")
    parser.add_argument("--limit", type=int, default=0,
                        help="Number of individual payloads to limit to")
    parser.add_argument("--debug-ref", type=str, default=None,
                        help="Filter to citing refs equal to or contained within this ref")
    parser.add_argument("--resume-after-payload-file", type=str, default=None,
                        help="Path to JSON file with the last-dispatched payload. Enables "
                             "resume mode: sorts docs by _id, ignores prior disambiguation "
                             "markers, and dispatches starting after the matching payload.")
    parser.add_argument("--dry-run", action="store_true",
                        help="In resume mode, locate the anchor and print context without dispatching.")
    args = parser.parse_args()

    if args.resume_after_payload_file and args.limit:
        print("ERROR: --resume-after-payload-file is incompatible with --limit")
        return
    if args.resume_after_payload_file and args.start:
        print("ERROR: --resume-after-payload-file is incompatible with --start")
        return

    debug_parent_ref = None
    if args.debug_ref:
        try:
            debug_parent_ref = Ref(args.debug_ref)
        except InputError:
            print(f"ERROR: Could not parse --debug-ref '{args.debug_ref}'")
            return

    print("Starting Library Links Disambiguation Tasks Dispatcher")
    if DEBUG_MODE:
        print(f"DEBUG MODE: Limited to {DEBUG_LIMIT} documents")

    if not CELERY_ENABLED:
        print("\n" + "=" * 80)
        print("ERROR: CELERY_ENABLED is False in settings")
        print("=" * 80)
        print("To enable Celery:")
        print("  1. Make sure Redis or RabbitMQ is running")
        print("  2. Set CELERY_ENABLED = True in local_settings.py")
        print("  3. Start a Celery worker with: celery -A sefaria.celery_setup.app worker")
        print("=" * 80 + "\n")
        return

    resume_mode = args.resume_after_payload_file is not None
    groups = find_all_resolutions(debug_parent_ref=debug_parent_ref, resume_mode=resume_mode)

    # Flatten groups into an ordered list, keeping each base-text group contiguous
    payloads_list = list(groups.values())
    all_payloads = [payload for payloads in payloads_list for payload in payloads]

    if resume_mode:
        with open(args.resume_after_payload_file) as f:
            target = json.load(f)
        target_key = _target_match_key(target)
        match_index = None
        for i, p in enumerate(all_payloads):
            if _payload_match_key(p) == target_key:
                match_index = i
                break
        if match_index is None:
            print("ERROR: Could not find resume-after payload in rebuilt list. "
                  "Verify the JSON file contents and that the doc is still in the collection.")
            return

        print(f"\n=== Resume anchor found at index {match_index} / {len(all_payloads)} ===")
        print(f"Anchor payload: {asdict(all_payloads[match_index])}")
        for offset in (-2, -1, 1, 2):
            j = match_index + offset
            if 0 <= j < len(all_payloads):
                print(f"  [{j:>8}] {'<-- anchor' if offset == 0 else ''} {asdict(all_payloads[j])}")
        print(f"=== Would dispatch {len(all_payloads) - match_index - 1} payloads starting at index {match_index + 1} ===\n")

        if args.dry_run:
            print("Dry-run: not dispatching.")
            return

        dispatch_list = all_payloads[match_index + 1:]
        start = match_index + 1
        total = len(all_payloads)
    elif args.limit:
        random.shuffle(all_payloads)
        total = args.limit
        dispatch_list = all_payloads[args.start:args.start+args.limit]
        start = args.start
    else:
        total = len(all_payloads)
        dispatch_list = all_payloads[args.start:]
        start = args.start

    print(f"Dispatching {len(dispatch_list)} tasks (skipping first {start})...")
    try:
        for payload in tqdm(dispatch_list, desc="Dispatching", initial=start, total=total):
            enqueue_bulk_disambiguation(asdict(payload))
        print("Task dispatch complete!")
    except Exception as e:
        print(f"\nERROR dispatching task: {e}")
        print("Make sure the Celery broker (Redis/RabbitMQ) is running and accessible.")


if __name__ == "__main__":
    main()
