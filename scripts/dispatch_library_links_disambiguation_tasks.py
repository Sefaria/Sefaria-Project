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
import structlog

logger = structlog.get_logger(__name__)

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
    logger.info("Loading LinkerOutputs with ambiguous resolutions...")
    if DEBUG_MODE:
        logger.info(f"DEBUG MODE: Limiting to {DEBUG_LIMIT} documents")

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

    logger.info(f"Found {len(ambiguous_groups)} ambiguous resolution groups")
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
    logger.info("Loading LinkerOutputs with non-segment-level resolutions...")
    if DEBUG_MODE:
        logger.info(f"DEBUG MODE: Limiting to {DEBUG_LIMIT} documents")

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
                    logger.warning(f"Error processing ref {ref_str}: {e}")

    logger.info(f"Found {len(non_segment_resolutions)} non-segment-level resolutions")
    return non_segment_resolutions


def print_sample_results(results, title, max_samples=10):
    """Pretty print a sample of results"""
    print(f"\n{'='*80}")
    print(f"{title}")
    print(f"{'='*80}")
    print(f"Total count: {len(results)}")

    if results:
        print(f"\nShowing first {min(max_samples, len(results))} results:\n")
        for i, result in enumerate(results[:max_samples], 1):
            print(f"\n{i}. {result.get('ref', 'N/A')}")
            print(f"   Version: {result.get('versionTitle', 'N/A')} ({result.get('language', 'N/A')})")
            print(f"   Text: \"{result.get('text', 'N/A')}\"")
            print(f"   Char Range: {result.get('charRange', 'N/A')}")

            if 'ambiguous_refs' in result:
                print(f"   Ambiguous Options ({len(result['ambiguous_refs'])}):")
                for ref in result['ambiguous_refs']:
                    print(f"     - {ref}")

            if 'resolved_ref' in result:
                print(f"   Resolved To: {result['resolved_ref']}")
                print(f"   Ref Level: {result['ref_level']}")
    else:
        print("\nNo results found.")


def main():
    """Main execution function"""
    print("="*80)
    print("Library Links Disambiguation Tasks Dispatcher")
    if DEBUG_MODE:
        print(f"*** DEBUG MODE: Limited to {DEBUG_LIMIT} documents ***")
    print("="*80)

    # 1. Find ambiguous resolutions
    ambiguous_resolutions = find_ambiguous_resolutions()
    print_sample_results(
        ambiguous_resolutions,
        "AMBIGUOUS RESOLUTIONS (grouped by char range)",
        max_samples=10
    )

    # 2. Find non-segment-level resolutions
    non_segment_resolutions = find_non_segment_level_resolutions()
    print_sample_results(
        non_segment_resolutions,
        "NON-SEGMENT-LEVEL RESOLUTIONS",
        max_samples=10
    )

    # Summary statistics
    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"Total ambiguous resolution groups: {len(ambiguous_resolutions)}")
    print(f"Total non-segment-level resolutions: {len(non_segment_resolutions)}")

    # Group non-segment resolutions by level
    if non_segment_resolutions:
        level_counts = defaultdict(int)
        for resolution in non_segment_resolutions:
            level_counts[resolution['ref_level']] += 1

        print(f"\nNon-segment resolutions by level:")
        for level, count in sorted(level_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  {level}: {count}")

    # Group ambiguous resolutions by number of options
    if ambiguous_resolutions:
        option_counts = defaultdict(int)
        for resolution in ambiguous_resolutions:
            num_options = len(resolution['ambiguous_refs'])
            option_counts[num_options] += 1

        print(f"\nAmbiguous resolutions by number of options:")
        for num_options, count in sorted(option_counts.items()):
            print(f"  {num_options} options: {count} cases")

    print(f"\n{'='*80}")
    print("Analysis complete!")
    print(f"{'='*80}\n")

    return ambiguous_resolutions, non_segment_resolutions


if __name__ == "__main__":
    main()

