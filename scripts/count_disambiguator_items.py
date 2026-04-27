"""
Count the total number of items the disambiguator would process in non-DEBUG mode.

Reports:
  - Ambiguous resolution groups (grouped by ref + charRange)
  - Non-segment-level resolution payloads

Run via: ./run scripts/count_disambiguator_items.py
"""

import django
django.setup()

from collections import defaultdict
from tqdm import tqdm
from sefaria.model import Ref
from sefaria.system.exceptions import InputError
from sefaria.system.database import db
from sefaria.helper.linker.tasks import _is_non_segment_or_perek_ref, _get_talmud_perek_ref_set


def count_ambiguous():
    query = {
        "spans": {
            "$elemMatch": {
                "ambiguous": True,
                "type": "citation",
            }
        }
    }

    total_docs = db.linker_output.count_documents(query)
    print(f"  Matched {total_docs} LinkerOutput docs")

    docs = db.linker_output.find(query, {"spans": 1, "ref": 1})

    ambiguous_groups = 0
    perek_ref_count = 0
    for doc in tqdm(docs, total=total_docs, desc="  Scanning ambiguous docs"):
        char_range_groups = defaultdict(list)
        for span in doc.get("spans", []):
            if span.get("ambiguous") and span.get("type") == "citation":
                char_range_key = tuple(span["charRange"])
                char_range_groups[char_range_key].append(span)

        for char_range, spans in char_range_groups.items():
            normalized_refs = set()
            for span in spans:
                ref_str = span.get("ref")
                if not ref_str:
                    continue
                try:
                    normalized_refs.add(Ref(ref_str).normal())
                except Exception:
                    normalized_refs.add(ref_str)
            if len(normalized_refs) > 1:
                for tref in normalized_refs:
                    if tref in _get_talmud_perek_ref_set():
                        perek_ref_count += 1
                        break
                ambiguous_groups += 1

    print(f"Ambig Perek Ref count: {perek_ref_count}")
    return ambiguous_groups


def count_non_segment():
    query = {
        "spans": {
            "$elemMatch": {
                "type": "citation",
                "failed": {"$ne": True},
                "ref": {"$exists": True},
                "$or": [
                    {"ambiguous": {"$ne": True}},
                    {"llm_ambiguous_option_valid": True},
                ],
            }
        }
    }

    total_docs = db.linker_output.count_documents(query)
    print(f"  Matched {total_docs} LinkerOutput docs")

    docs = db.linker_output.find(query, {"spans": 1})

    non_segment_count = 0
    perek_ref_count = 0
    for doc in tqdm(docs, total=total_docs, desc="  Scanning non-segment docs"):
        for span in doc.get("spans", []):
            if span.get("type") != "citation" or span.get("failed"):
                continue
            if span.get("ambiguous") and not span.get("llm_ambiguous_option_valid"):
                continue

            ref_str = span.get("ref")
            if span.get("ambiguous") and span.get("llm_ambiguous_option_valid"):
                ref_str = span.get("llm_resolved_ref_ambiguous") or ref_str
            if not ref_str:
                continue

            if _is_non_segment_or_perek_ref(ref_str):
                non_segment_count += 1
            if ref_str in _get_talmud_perek_ref_set():
                perek_ref_count += 1
    print("Perek ref count:", perek_ref_count)

    return non_segment_count


def main():
    print("Counting disambiguator items (non-DEBUG mode)\n")

    print("Ambiguous resolutions:")
    ambiguous = count_ambiguous()
    print(f"  => {ambiguous} ambiguous resolution groups\n")

    print("Non-segment-level resolutions:")
    non_segment = count_non_segment()
    print(f"  => {non_segment} non-segment resolution payloads\n")

    print(f"Total items: {ambiguous + non_segment}")


if __name__ == "__main__":
    main()
