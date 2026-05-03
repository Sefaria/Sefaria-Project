"""
Count the total number of items the disambiguator would process in non-DEBUG mode.

Reports:
  - Ambiguous resolution groups (grouped by ref + charRange)
  - Non-segment-level resolution payloads
  - Perek refs adjacent to a contained daf ref (redundant perek pattern)

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

# Maximum character gap between end of one span and start of the next to be
# considered "adjacent" for the perek+daf pattern check.
_PEREK_DAF_ADJACENCY_THRESHOLD = 20


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


def count_perek_adjacent_daf(sample_limit: int = 10):
    """
    Count LinkerOutput spans where a perek ref sits adjacent to a daf ref that is
    contained within that perek — the "פרק מאימתי )ברכות דף ב(" pattern.

    In this pattern the perek ref is redundant: the daf already provides more
    specific information, so the disambiguator need not process the perek ref at all.

    Returns (pair_count, doc_count, samples) where:
      pair_count  — total (perek-span, daf-span) adjacent-contained pairs found
      doc_count   — number of distinct LinkerOutput docs containing at least one pair
      samples     — up to sample_limit example dicts for inspection
    """
    perakim = _get_talmud_perek_ref_set()
    perek_oref_cache: dict = {}

    query = {
        "spans": {
            "$elemMatch": {
                "type": "citation",
                "ref": {"$exists": True},
            }
        }
    }

    total_docs = db.linker_output.count_documents(query)
    print(f"  Matched {total_docs} LinkerOutput docs")
    docs = db.linker_output.find(query, {"spans": 1, "ref": 1})

    pair_count = 0
    doc_count = 0
    samples = []

    for doc in tqdm(docs, total=total_docs, desc="  Scanning perek+daf adjacency"):
        citation_spans = [
            s for s in doc.get("spans", [])
            if s.get("type") == "citation" and s.get("ref") and s.get("charRange")
        ]
        if len(citation_spans) < 2:
            continue

        citation_spans.sort(key=lambda s: s["charRange"][0])

        doc_pairs = []
        for i, span in enumerate(citation_spans):
            ref_str = span.get("ref")
            if ref_str not in perakim:
                continue

            if ref_str not in perek_oref_cache:
                try:
                    perek_oref_cache[ref_str] = Ref(ref_str)
                except Exception:
                    perek_oref_cache[ref_str] = None
            perek_oref = perek_oref_cache[ref_str]
            if perek_oref is None:
                continue

            perek_start, perek_end = span["charRange"]

            for j in (i - 1, i + 1):
                if j < 0 or j >= len(citation_spans):
                    continue
                neighbor = citation_spans[j]
                neighbor_ref = neighbor.get("ref")
                if not neighbor_ref or neighbor_ref in perakim:
                    continue

                n_start, n_end = neighbor["charRange"]
                gap = max(perek_start, n_start) - min(perek_end, n_end)
                if gap > _PEREK_DAF_ADJACENCY_THRESHOLD:
                    continue

                try:
                    neighbor_oref = Ref(neighbor_ref)
                except Exception:
                    continue

                if perek_oref.contains(neighbor_oref):
                    pair_count += 1
                    doc_pairs.append({
                        "doc_ref": doc.get("ref"),
                        "perek_ref": ref_str,
                        "perek_text": span.get("text", ""),
                        "daf_ref": neighbor_ref,
                        "daf_text": neighbor.get("text", ""),
                        "gap_chars": gap,
                    })

        if doc_pairs:
            doc_count += 1
            if len(samples) < sample_limit:
                samples.extend(doc_pairs[:sample_limit - len(samples)])

    return pair_count, doc_count, samples


def main():
    print("Counting disambiguator items (non-DEBUG mode)\n")

    print("Ambiguous resolutions:")
    ambiguous = count_ambiguous()
    print(f"  => {ambiguous} ambiguous resolution groups\n")

    print("Non-segment-level resolutions:")
    non_segment = count_non_segment()
    print(f"  => {non_segment} non-segment resolution payloads\n")

    print("Perek-adjacent-daf pattern (redundant perek refs):")
    pair_count, doc_count, samples = count_perek_adjacent_daf()
    print(f"  => {pair_count} perek+daf pairs across {doc_count} docs")
    if samples:
        print("  Sample pairs:")
        for s in samples:
            print(
                f"    [{s['doc_ref']}]  perek='{s['perek_text']}' ({s['perek_ref']})"
                f"  daf='{s['daf_text']}' ({s['daf_ref']})  gap={s['gap_chars']}"
            )
    print()

    print(f"Total items: {ambiguous + non_segment}")


if __name__ == "__main__":
    main()
