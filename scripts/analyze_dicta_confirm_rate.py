"""
analyze_dicta_confirm_rate.py

Analyzes when LLM confirmation runs on Dicta candidates to identify
obvious matches that are a waste of LLM calls.

For each sampled non-segment payload that reaches the Dicta + confirm path:
  - candidate_ref: the ref Dicta found
  - candidate_text_words: word count of the candidate text
  - dicta_score: raw score from Dicta API
  - num_dicta_candidates: how many Dicta candidates were returned
  - confirmed: whether LLM confirmed the candidate

Run via:
    ./run scripts/analyze_dicta_confirm_rate.py
    ./run scripts/analyze_dicta_confirm_rate.py --sample 300 --output results.csv
"""

import django
django.setup()

import argparse
import csv
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from typing import Optional

import structlog
from tqdm import tqdm

from sefaria.model import Ref
from sefaria.system.database import db
from sefaria.helper.linker.disambiguator import (
    NonSegmentResolutionPayload,
    _query_dicta,
    _confirm_candidate,
    _get_ref_text,
    _prepare_citing_context,
    _normalize_citing_input,
    _llm_choose_best_candidate,
    _get_commentary_base_context,
)
from sefaria.helper.linker.tasks import _is_non_segment_or_perek_ref

logger = structlog.get_logger(__name__)

DEFAULT_SAMPLE = 200
DEFAULT_OUTPUT = os.path.join(os.path.dirname(__file__), "dicta_confirm_analysis.csv")
NUM_THREADS = 14
CSV_FIELDS = [
    "citing_ref",
    "non_segment_ref",
    "num_segments",
    "num_dicta_candidates",
    "candidate_ref",
    "dicta_score",
    "candidate_text_words",
    "confirmed",
]


def _sample_non_segment_payloads(n: int) -> list[NonSegmentResolutionPayload]:
    """Sample n non-segment payloads from linker_output, Hebrew only (Dicta path)."""
    query = {
        "language": "he",
        "spans": {
            "$elemMatch": {
                "type": "citation",
                "failed": {"$ne": True},
                "ambiguous": {"$ne": True},
                "ref": {"$exists": True},
            }
        },
    }
    pipeline = [{"$match": query}, {"$sample": {"size": n * 5}}]
    docs = list(db.linker_output.aggregate(pipeline))

    payloads = []
    for doc in docs:
        citing_ref = doc.get("ref")
        if not citing_ref:
            continue
        for span in doc.get("spans", []):
            if span.get("type") != "citation" or span.get("failed") or span.get("ambiguous"):
                continue
            ref_str = span.get("ref")
            if not ref_str:
                continue
            if not _is_non_segment_or_perek_ref(ref_str):
                continue
            try:
                oref = Ref(ref_str)
                seg_refs = oref.all_segment_refs()
            except Exception:
                continue
            # Dicta path only activates for >3 segments
            if len(seg_refs) <= 3:
                continue
            payloads.append(NonSegmentResolutionPayload(
                ref=citing_ref,
                versionTitle=doc.get("versionTitle", ""),
                language=doc.get("language", "he"),
                charRange=span.get("charRange", [0, 0]),
                text=span.get("text", ""),
                resolved_non_segment_ref=ref_str,
            ))
            if len(payloads) >= n:
                return payloads
    return payloads


def _process_payload(payload: NonSegmentResolutionPayload) -> Optional[dict]:
    """
    Run the Dicta query + confirm for a single payload.
    Returns a row dict or None if Dicta returned no candidates.
    """
    try:
        citing_ref = payload.ref
        citing_lang = payload.language
        vtitle = payload.versionTitle
        non_segment_ref_str = payload.resolved_non_segment_ref

        citing_text_full = _get_ref_text(citing_ref, citing_lang, vtitle)
        if not citing_text_full:
            return None

        non_segment_oref = Ref(non_segment_ref_str)
        segment_refs = non_segment_oref.all_segment_refs()
        num_segments = len(segment_refs)

        citing_text_norm, char_range_norm, text_snippet_norm = _normalize_citing_input(
            citing_text_full, payload.charRange, payload.text, citing_lang,
        )
        windowed_text, marked_text, _ = _prepare_citing_context(
            citing_text_norm, char_range_norm, text_snippet_norm,
        )

        dicta_candidates = _query_dicta(windowed_text, target_ref=non_segment_ref_str)
        if not dicta_candidates:
            return None

        num_dicta = len(dicta_candidates)

        if num_dicta == 1:
            candidate = dicta_candidates[0]
        else:
            base_ref_temp, base_text_temp = _get_commentary_base_context(citing_ref)
            candidate = _llm_choose_best_candidate(
                marked_text, dicta_candidates,
                base_ref=base_ref_temp, base_text=base_text_temp, lang=citing_lang,
            )

        if not candidate:
            return None

        candidate_text = _get_ref_text(candidate.resolved_ref, citing_lang) or ""
        word_count = len(candidate_text.split())

        ok, _ = _confirm_candidate(
            candidate, marked_text, citing_lang,
            auto_approve_prefix="Metzudat Zion", citing_ref=citing_ref,
        )

        return {
            "citing_ref": citing_ref,
            "non_segment_ref": non_segment_ref_str,
            "num_segments": num_segments,
            "num_dicta_candidates": num_dicta,
            "candidate_ref": candidate.resolved_ref,
            "dicta_score": candidate.score,
            "candidate_text_words": word_count,
            "confirmed": "yes" if ok else "no",
        }
    except Exception as e:
        logger.warning(f"Error processing payload {payload.ref}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Analyze Dicta confirm rate")
    parser.add_argument("--sample", type=int, default=DEFAULT_SAMPLE,
                        help=f"Number of payloads to sample (default: {DEFAULT_SAMPLE})")
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help=f"Output CSV path (default: {DEFAULT_OUTPUT})")
    args = parser.parse_args()

    print(f"Sampling {args.sample} non-segment payloads (Hebrew, >3 segments)...")
    payloads = _sample_non_segment_payloads(args.sample)
    print(f"Got {len(payloads)} payloads. Running with {NUM_THREADS} threads...")

    rows = []
    with ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
        futures = {executor.submit(_process_payload, p): p for p in payloads}
        for future in tqdm(as_completed(futures), total=len(futures), desc="Processing"):
            result = future.result()
            if result:
                rows.append(result)

    print(f"\n{len(rows)} rows with Dicta candidates (out of {len(payloads)} payloads)")

    if not rows:
        print("No results to write.")
        return

    confirmed_count = sum(1 for r in rows if r["confirmed"] == "yes")
    print(f"Confirmed: {confirmed_count}/{len(rows)} ({100*confirmed_count//len(rows)}%)")

    with open(args.output, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved to {args.output}")


if __name__ == "__main__":
    main()
