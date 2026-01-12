"""
dispatch_library_links_disambiguation_tasks.py

Script to dispatch library links disambiguation tasks for:
1. Ambiguous resolutions - group by char range
2. Non-segment-level resolutions

Set DEBUG_MODE = True at the top of the script to limit to 100 docs for debug.
"""

import django
django.setup()

from collections import defaultdict
from sefaria.model import Ref
from sefaria.system.exceptions import InputError
from sefaria.system.database import db
from sefaria.settings import CELERY_QUEUES, CELERY_ENABLED
from sefaria.celery_setup.app import app
from celery import signature

# Global flag for debug mode
DEBUG_MODE = True  # Set this to False for full analysis
DEBUG_LIMIT = 100


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
        print(f"DEBUG MODE: Limiting to {DEBUG_LIMIT} documents")

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
    cursor = db.linker_output.find(query)
    if DEBUG_MODE:
        cursor = cursor.limit(DEBUG_LIMIT)

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
            text = spans[0]['text']  # All spans in group have same text

            for span in spans:
                ref_str = span.get('ref')
                if ref_str and ref_str not in ambiguous_refs:
                    ambiguous_refs.append(ref_str)

            if len(ambiguous_refs) > 1:  # Only include if truly ambiguous (2+ options)
                ambiguous_groups.append({
                    'ref': raw_linker_output['ref'],
                    'versionTitle': raw_linker_output['versionTitle'],
                    'language': raw_linker_output['language'],
                    'charRange': list(char_range),
                    'text': text,
                    'ambiguous_refs': ambiguous_refs
                })

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
        print(f"DEBUG MODE: Limiting to {DEBUG_LIMIT} documents")

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
    cursor = db.linker_output.find(query)
    if DEBUG_MODE:
        cursor = cursor.limit(DEBUG_LIMIT)

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

                    non_segment_resolutions.append({
                        'ref': raw_linker_output['ref'],
                        'versionTitle': raw_linker_output['versionTitle'],
                        'language': raw_linker_output['language'],
                        'charRange': span['charRange'],
                        'text': span['text'],
                        'resolved_ref': ref_str,
                        'ref_level': ref_level
                    })
                except Exception as e:
                    print(f"Warning: Error processing ref {ref_str}: {e}")

    print(f"Found {len(non_segment_resolutions)} non-segment-level resolutions")
    return non_segment_resolutions


def enqueue_ambiguous_resolution(resolution_data: dict):
    """Enqueue an ambiguous resolution task following the codebase pattern"""
    sig = app.signature(
        "linker.process_ambiguous_resolution",
        args=(resolution_data,),
        options={"queue": CELERY_QUEUES["tasks"]}
    )
    return sig.apply_async()


def enqueue_non_segment_resolution(resolution_data: dict):
    """Enqueue a non-segment resolution task following the codebase pattern"""
    sig = app.signature(
        "linker.process_non_segment_resolution",
        args=(resolution_data,),
        options={"queue": CELERY_QUEUES["tasks"]}
    )
    return sig.apply_async()


def main():
    """Main execution function - find and dispatch tasks"""
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
    ambiguous_resolutions = find_ambiguous_resolutions()

    # Find non-segment-level resolutions
    non_segment_resolutions = find_non_segment_level_resolutions()

    # Dispatch ambiguous resolution tasks
    print(f"Dispatching {len(ambiguous_resolutions)} ambiguous resolution tasks...")
    try:
        for resolution in ambiguous_resolutions:
            enqueue_ambiguous_resolution(resolution)
        print(f"Dispatched {len(ambiguous_resolutions)} ambiguous resolution tasks")
    except Exception as e:
        print(f"\nERROR dispatching ambiguous tasks: {e}")
        print("Make sure the Celery broker (Redis/RabbitMQ) is running and accessible.")
        return

    # Dispatch non-segment resolution tasks
    print(f"Dispatching {len(non_segment_resolutions)} non-segment resolution tasks...")
    try:
        for resolution in non_segment_resolutions:
            enqueue_non_segment_resolution(resolution)
        print(f"Dispatched {len(non_segment_resolutions)} non-segment resolution tasks")
    except Exception as e:
        print(f"\nERROR dispatching non-segment tasks: {e}")
        print("Make sure the Celery broker (Redis/RabbitMQ) is running and accessible.")
        return

    print("Task dispatch complete!")


if __name__ == "__main__":
    main()

