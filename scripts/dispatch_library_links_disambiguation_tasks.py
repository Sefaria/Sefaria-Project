"""
dispatch_library_links_disambiguation_tasks.py

Script to dispatch library links disambiguation tasks for:
1. Ambiguous resolutions - group by char range
2. Non-segment-level resolutions

Set DEBUG_MODE = True at the top of the script to limit to 10 random docs for debug.

Examples:
    python dispatch_library_links_disambiguation_tasks.py --ambiguous-start 565440 --non-segment-start 0
    python dispatch_library_links_disambiguation_tasks.py --ambiguous-start skip --non-segment-start 0
"""

import django
django.setup()

from collections import defaultdict
import argparse
from tqdm import tqdm
from sefaria.model import Ref
from sefaria.system.exceptions import InputError
from sefaria.system.database import db
from sefaria.settings import CELERY_QUEUES, CELERY_ENABLED
from sefaria.celery_setup.app import app
from dataclasses import asdict
from sefaria.helper.linker.disambiguator import AmbiguousResolutionPayload, NonSegmentResolutionPayload

# Global flag for debug mode
DEBUG_MODE = True  # True = sample a small random subset; False = process all matching LinkerOutput docs
DEBUG_LIMIT = 10 # Number of random examples to fetch in debug mode
DEBUG_SEED = 6133  # Seed for reproducible random sampling


def _parse_start_arg(value: str):
    if value is None:
        return 0
    if value.lower() == "skip":
        return "skip"
    return int(value)


def is_segment_level_ref(ref_str):
    """Check if a reference string is segment-level"""
    try:
        oref = Ref(ref_str)
        return oref.is_segment_level()
    except (InputError, AttributeError):
        return False


def find_ambiguous_resolutions():
    """
    Find all LinkerOutput records with ambiguous resolutions.
    Group by ref and char range.

    Returns:
        list of dicts with structure:
        {
            'ref': str,
            'versionTitle': str,
            'language': str,
            'charRange': [int, int],
            'text': str,
            'ambiguous_refs': [str, str, ...]
        }
    """
    print("Loading LinkerOutputs with ambiguous resolutions...")
    if DEBUG_MODE:
        print(f"DEBUG MODE: Fetching {DEBUG_LIMIT} random examples with seed {DEBUG_SEED}")

    # Find all LinkerOutputs that have at least one ambiguous span
    query = {
        "spans": {
            "$elemMatch": {
                "ambiguous": True,
                "type": "citation"
            }
        }
    }

    # Use db cursor directly for efficiency
    if DEBUG_MODE:
        # Use aggregation pipeline for random sampling with seed
        pipeline = [
            {"$match": query},
            {"$sample": {"size": DEBUG_LIMIT}}
        ]
        cursor = db.linker_output.aggregate(pipeline)
    else:
        cursor = db.linker_output.find(query)

    ambiguous_groups = []

    for raw_linker_output in cursor:
        # Group spans by charRange within this LinkerOutput
        char_range_groups = defaultdict(list)

        for span in raw_linker_output.get('spans', []):
            if span.get('ambiguous', False) and span.get('type') == 'citation':
                char_range_key = tuple(span['charRange'])
                char_range_groups[char_range_key].append(span)

        # Create a dict for each char range group
        for char_range, spans in char_range_groups.items():
            ambiguous_refs = []
            normalized_refs = set()
            text = spans[0]['text']  # All spans in group have same text

            for span in spans:
                ref_str = span.get('ref')
                if not ref_str:
                    continue
                if ref_str not in ambiguous_refs:
                    ambiguous_refs.append(ref_str)
                try:
                    normalized_refs.add(Ref(ref_str).normal())
                except Exception:
                    normalized_refs.add(ref_str)

            # Only include if truly ambiguous (2+ distinct resolution options)
            if len(normalized_refs) > 1:
                ambiguous_groups.append(AmbiguousResolutionPayload(
                    ref=raw_linker_output['ref'],
                    versionTitle=raw_linker_output['versionTitle'],
                    language=raw_linker_output['language'],
                    charRange=list(char_range),
                    text=text,
                    ambiguous_refs=ambiguous_refs,
                ))

    print(f"Found {len(ambiguous_groups)} ambiguous resolution groups")
    return ambiguous_groups


def find_non_segment_level_resolutions():
    """
    Find all LinkerOutput records with successful (non-failed, non-ambiguous)
    resolutions that are NOT segment-level refs.

    Returns:
        list of dicts with structure:
        {
            'ref': str,
            'versionTitle': str,
            'language': str,
            'charRange': [int, int],
            'text': str,
            'resolved_ref': str,
            'ref_level': str  # e.g., 'book', 'chapter', 'section'
        }
    """
    print("Loading LinkerOutputs with non-segment-level resolutions...")
    if DEBUG_MODE:
        print(f"DEBUG MODE: Fetching {DEBUG_LIMIT} random examples with seed {DEBUG_SEED}")

    # Query for LinkerOutputs that have at least one citation span
    # We'll filter for non-segment-level in Python since that requires Ref logic
    query = {
        "spans": {
            "$elemMatch": {
                "type": "citation",
                "failed": {"$ne": True},
                "ambiguous": {"$ne": True},
                "ref": {"$exists": True}
            }
        }
    }

    # Use db cursor directly for efficiency
    if DEBUG_MODE:
        # Use aggregation pipeline for random sampling with seed
        pipeline = [
            {"$match": query},
            {"$sample": {"size": DEBUG_LIMIT}}
        ]
        cursor = db.linker_output.aggregate(pipeline)
    else:
        cursor = db.linker_output.find(query)

    non_segment_resolutions = []

    for raw_linker_output in cursor:
        for span in raw_linker_output.get('spans', []):
            # Only look at successful citation resolutions
            if (span.get('type') != 'citation' or
                span.get('failed', False) or
                span.get('ambiguous', False)):
                continue

            ref_str = span.get('ref')
            if not ref_str:
                continue

            # Check if it's NOT segment level
            if not is_segment_level_ref(ref_str):
                try:
                    oref = Ref(ref_str)
                    ref_level = 'unknown'

                    if oref.is_book_level():
                        ref_level = 'book'
                    elif oref.is_section_level():
                        ref_level = 'section'
                    else:
                        # Could be chapter or other level
                        ref_level = f'depth_{len(oref.sections)}'

                    non_segment_resolutions.append(NonSegmentResolutionPayload(
                        ref=raw_linker_output['ref'],
                        versionTitle=raw_linker_output['versionTitle'],
                        language=raw_linker_output['language'],
                        charRange=span['charRange'],
                        text=span['text'],
                        resolved_non_segment_ref=ref_str,
                    ))
                except Exception as e:
                    print(f"Warning: Error processing ref {ref_str}: {e}")

    print(f"Found {len(non_segment_resolutions)} non-segment-level resolutions")
    return non_segment_resolutions


def enqueue_bulk_disambiguation(payload: dict):
    """Enqueue single-item bulk disambiguation task following the codebase pattern"""
    sig = app.signature(
        "linker.cauldron_routine_disambiguation",
        args=(payload,),
        options={"queue": CELERY_QUEUES.get("tasks", "TASK QUEUE UNDEFINED")},
    )
    return sig.apply_async()


def main():
    """Main execution function - find and dispatch tasks"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--ambiguous-start", default="0",
                        help="Number to skip for ambiguous resolutions, or 'skip'")
    parser.add_argument("--non-segment-start", default="0",
                        help="Number to skip for non-segment resolutions, or 'skip'")
    args = parser.parse_args()
    ambiguous_start_from = _parse_start_arg(args.ambiguous_start)
    non_segment_start_from = _parse_start_arg(args.non_segment_start)

    print("Starting Library Links Disambiguation Tasks Dispatcher")
    if DEBUG_MODE:
        print(f"DEBUG MODE: Limited to {DEBUG_LIMIT} documents")

    # Check if Celery is enabled
    if not CELERY_ENABLED:
        print("\n" + "="*80)
        print("ERROR: CELERY_ENABLED is False in settings")
        print("="*80)
        print("Celery is disabled in your local_settings.py")
        print("To enable Celery:")
        print("  1. Make sure Redis or RabbitMQ is running")
        print("  2. Set CELERY_ENABLED = True in local_settings.py")
        print("  3. Start a Celery worker with: celery -A sefaria.celery_setup.app worker")
        print("="*80 + "\n")
        return

    # Find ambiguous resolutions
    ambiguous_resolutions = [] if ambiguous_start_from == "skip" else find_ambiguous_resolutions()

    # Find non-segment-level resolutions
    non_segment_resolutions = [] if non_segment_start_from == "skip" else find_non_segment_level_resolutions()

    # Dispatch bulk disambiguation tasks (single payload each)
    print(f"Dispatching {len(ambiguous_resolutions) + len(non_segment_resolutions)} bulk disambiguation tasks...")
    try:
        ambiguous_iter = (
            ambiguous_resolutions[ambiguous_start_from:]
            if isinstance(ambiguous_start_from, int) and ambiguous_start_from
            else ambiguous_resolutions
        )
        for resolution in tqdm(
            ambiguous_iter,
            desc="Ambiguous resolutions",
            initial=ambiguous_start_from if isinstance(ambiguous_start_from, int) else 0,
            total=len(ambiguous_resolutions),
        ):
            enqueue_bulk_disambiguation(asdict(resolution))
        non_segment_iter = (
            non_segment_resolutions[non_segment_start_from:]
            if isinstance(non_segment_start_from, int) and non_segment_start_from
            else non_segment_resolutions
        )
        for resolution in tqdm(
            non_segment_iter,
            desc="Non-segment resolutions",
            initial=non_segment_start_from if isinstance(non_segment_start_from, int) else 0,
            total=len(non_segment_resolutions),
        ):
            enqueue_bulk_disambiguation(asdict(resolution))
        print("Dispatched bulk disambiguation tasks")
    except Exception as e:
        print(f"\nERROR dispatching bulk task: {e}")
        print("Make sure the Celery broker (Redis/RabbitMQ) is running and accessible.")
        return

    print("Task dispatch complete!")


if __name__ == "__main__":
    main()
