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


def find_all_resolutions():
    """
    Find all LinkerOutput records needing disambiguation (ambiguous or non-segment),
    and group payloads by base text ref so that tasks sharing a cached prompt are
    dispatched together within the 5-minute TTL.

    Returns:
        dict mapping base_text_ref -> list of AmbiguousResolutionPayload | NonSegmentResolutionPayload
    """
    print("Loading LinkerOutputs needing disambiguation...")
    if DEBUG_MODE:
        print(f"DEBUG MODE: Fetching {DEBUG_LIMIT} random examples with seed {DEBUG_SEED}")

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
                if r not in ambiguous_refs:
                    ambiguous_refs.append(r)
                try:
                    normalized_refs.add(Ref(r).normal())
                except Exception:
                    normalized_refs.add(r)

            if len(normalized_refs) > 1:
                groups[base_ref].append(AmbiguousResolutionPayload(
                    ref=citing_ref,
                    versionTitle=raw_doc['versionTitle'],
                    language=raw_doc['language'],
                    charRange=list(char_range),
                    text=text,
                    ambiguous_refs=ambiguous_refs,
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
    args = parser.parse_args()

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

    groups = find_all_resolutions()

    # Flatten groups into an ordered list, keeping each base-text group contiguous
    payloads_list = list(groups.values())
    all_payloads = [payload for payloads in payloads_list for payload in payloads]
    random.shuffle(all_payloads)
    total = len(all_payloads)
    dispatch_list = all_payloads[args.start:] if args.start else all_payloads
    dispatch_list = dispatch_list[:5000]

    print(f"Dispatching {len(dispatch_list)} tasks (skipping first {args.start})...")
    try:
        for payload in tqdm(dispatch_list, desc="Dispatching", initial=args.start, total=total):
            enqueue_bulk_disambiguation(asdict(payload))
        print("Task dispatch complete!")
    except Exception as e:
        print(f"\nERROR dispatching task: {e}")
        print("Make sure the Celery broker (Redis/RabbitMQ) is running and accessible.")


if __name__ == "__main__":
    main()
