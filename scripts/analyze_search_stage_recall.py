"""
analyze_search_stage_recall.py

Measures recall loss if the search pipeline runs only Stage A (text-only LLM
queries) instead of both Stage A and Stage B (base-text-seeded queries).

In production, Stage B only fires when Dicta does NOT resolve the payload and
base context is available, so this script filters the sample to that population:
runs Dicta first and skips payloads it would resolve before search.

For each sampled payload that would actually reach Stage B:
  - stage_a_queries        : queries generated in Stage A
  - stage_b_unique_queries : queries unique to Stage B (not in Stage A)
  - stage_a_candidates     : deduped candidates from Stage A
  - stage_b_unique_cands   : candidates from Stage B that A didn't find
  - has_base_context       : whether base context was available (always True
                             when Stage B fired in production)
  - stage_a_confirmed      : LLM confirmed a Stage-A-only candidate
  - stage_ab_confirmed     : LLM confirmed a candidate from A+B combined
  - winning_stage          : 'A' / 'B' / 'none' / 'tie' - which stage's queries
                             produced the chosen candidate
  - stage_b_rescued        : True when A failed but A+B succeeded
  - stage_b_regressed      : True when A succeeded but A+B failed (LLM picked
                             a worse candidate from larger pool)

Run via:
    ./run scripts/analyze_search_stage_recall.py
    ./run scripts/analyze_search_stage_recall.py --sample 300 --output results.csv
"""

import django
django.setup()

import argparse
import csv
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import structlog
from tqdm import tqdm

from sefaria.model import Ref
from sefaria.system.database import db
from sefaria.helper.linker.disambiguator import (
    NonSegmentResolutionPayload,
    Candidate,
    _query_dicta,
    _dicta_phrase_distance,
    _get_ref_text,
    _prepare_citing_context,
    _normalize_citing_input,
    _llm_form_search_query,
    _query_sefaria_search,
    _dedupe_candidates,
    _llm_choose_best_candidate,
    _confirm_candidate,
    _get_commentary_base_context,
)
from sefaria.helper.linker.tasks import _is_non_segment_or_perek_ref

logger = structlog.get_logger(__name__)

DEFAULT_SAMPLE = 200
DEFAULT_OUTPUT = os.path.join(os.path.dirname(__file__), "search_stage_recall.csv")
NUM_THREADS = 28
CSV_FIELDS = [
    "citing_ref",
    "non_segment_ref",
    "has_base_context",
    "stage_a_queries",
    "stage_b_unique_queries",
    "stage_a_candidates",
    "stage_b_unique_cands",
    "stage_a_chosen_ref",
    "stage_ab_chosen_ref",
    "stage_a_confirmed",
    "stage_ab_confirmed",
    "winning_stage",
    "stage_b_rescued",
    "stage_b_regressed",
]


def _sample_search_path_payloads(n: int) -> list[NonSegmentResolutionPayload]:
    """
    Sample payloads that may reach the search pipeline (Hebrew, >3 segments).

    Dicta/base-context filtering requires text and API calls, so the precise
    production Stage-B population is filtered in _process_payload.
    """
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
                seg_refs = Ref(ref_str).all_segment_refs()
            except Exception:
                continue
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


def _run_search_queries(
    queries: list[str],
    searched: set,
    non_segment_ref: str,
) -> tuple[list[Candidate], list[str]]:
    """Run queries that haven't been searched yet. Returns (new_candidates, new_queries_run)."""
    new_candidates: list[Candidate] = []
    new_queries: list[str] = []
    for q in queries:
        q = (q or "").strip()
        if not q or q in searched:
            continue
        searched.add(q)
        new_queries.append(q)
        hits = _query_sefaria_search(q, target_ref=non_segment_ref)
        if hits:
            new_candidates.extend(hits)
            continue
        retry = _query_sefaria_search(q, target_ref=non_segment_ref)
        if retry:
            new_candidates.extend(retry)
    return new_candidates, new_queries


def _choose_and_confirm(
    candidates: list[Candidate],
    marked_text: str,
    lang: str,
    base_ref: Optional[str],
    base_text: Optional[str],
    citing_ref: str,
) -> tuple[Optional[Candidate], bool]:
    """Choose the best candidate from candidates and return (chosen, confirmed)."""
    if not candidates:
        return None, False
    deduped = _dedupe_candidates(candidates)
    if len(deduped) == 1:
        chosen = deduped[0]
    else:
        chosen = _llm_choose_best_candidate(
            marked_text, deduped,
            base_ref=base_ref, base_text=base_text, lang=lang, citing_ref=citing_ref,
        )
    if not chosen:
        return None, False
    ok, _ = _confirm_candidate(
        chosen, marked_text, lang,
        base_ref=base_ref, base_text=base_text,
        auto_approve_prefix="Metzudat Zion", citing_ref=citing_ref,
    )
    return chosen, ok


def _dicta_would_resolve(
    windowed_text: str,
    marked_text: str,
    windowed_span: dict,
    non_segment_ref: str,
    citing_ref: str,
    lang: str,
    base_ref: Optional[str],
    base_text: Optional[str],
) -> bool:
    """Return True when production Dicta path would stop before search fallback."""
    dicta_candidates = _query_dicta(windowed_text, target_ref=non_segment_ref)
    if not dicta_candidates:
        return False

    if len(dicta_candidates) == 1:
        candidate = dicta_candidates[0]
    else:
        candidate = _llm_choose_best_candidate(
            marked_text, dicta_candidates,
            base_ref=base_ref, base_text=base_text, lang=lang, citing_ref=citing_ref,
        )
    if not candidate:
        return False

    try:
        citation_is_section_level = Ref(non_segment_ref).is_section_level()
    except Exception:
        citation_is_section_level = False

    score = candidate.score or 0
    dist = _dicta_phrase_distance(windowed_text, windowed_span, candidate)
    if (citation_is_section_level and score >= 5 and dist is not None and dist <= 10) \
            or (score >= 15 and dist is not None and dist <= 5):
        return True

    # Match production: Dicta confirmation intentionally omits base context.
    ok, _ = _confirm_candidate(
        candidate, marked_text, lang,
        auto_approve_prefix="Metzudat Zion", citing_ref=citing_ref,
    )
    return ok


def _candidate_ref_set(candidates: list[Candidate]) -> set[str]:
    return {c.resolved_ref for c in _dedupe_candidates(candidates)}


def _winning_stage(chosen: Optional[Candidate], confirmed: bool, a_refs: set[str], b_refs: set[str]) -> str:
    if not chosen or not confirmed:
        return "none"
    in_a = chosen.resolved_ref in a_refs
    in_b = chosen.resolved_ref in b_refs
    if in_a and in_b:
        return "tie"
    if in_a:
        return "A"
    if in_b:
        return "B"
    return "none"


def _process_payload(payload: NonSegmentResolutionPayload) -> Optional[dict]:
    try:
        citing_ref = payload.ref
        lang = payload.language
        vtitle = payload.versionTitle
        non_segment_ref = payload.resolved_non_segment_ref

        citing_text_full = _get_ref_text(citing_ref, lang, vtitle)
        if not citing_text_full:
            return None

        citing_text_norm, char_range_norm, snippet_norm = _normalize_citing_input(
            citing_text_full, payload.charRange, payload.text, lang,
        )

        base_ref, base_text = _get_commentary_base_context(citing_ref)
        has_base = bool(base_text)
        if not has_base:
            return None

        windowed_text, marked_text, windowed_span = _prepare_citing_context(
            citing_text_norm, char_range_norm, snippet_norm,
        )
        if _dicta_would_resolve(
            windowed_text, marked_text, windowed_span,
            non_segment_ref, citing_ref, lang, base_ref, base_text,
        ):
            return None

        searched: set = set()

        # Stage A: text-only queries
        a_queries_raw = _llm_form_search_query(marked_text, citing_ref=citing_ref) or []
        a_candidates, a_queries_run = _run_search_queries(a_queries_raw, searched, non_segment_ref)

        # Stage B: base-seeded queries (new queries only, searched set carries over)
        b_candidates: list[Candidate] = []
        b_queries_run: list[str] = []
        if base_text:
            b_queries_raw = _llm_form_search_query(
                marked_text, base_ref=base_ref, base_text=base_text, citing_ref=citing_ref,
            ) or []
            b_candidates, b_queries_run = _run_search_queries(b_queries_raw, searched, non_segment_ref)

        a_refs = _candidate_ref_set(a_candidates)
        b_refs = _candidate_ref_set(b_candidates)
        b_unique_refs = b_refs - a_refs

        # Confirm: Stage A alone vs A+B combined
        stage_a_chosen, stage_a_confirmed = _choose_and_confirm(
            a_candidates, marked_text, lang, base_ref, base_text, citing_ref,
        )
        if b_unique_refs:
            stage_ab_chosen, stage_ab_confirmed = _choose_and_confirm(
                a_candidates + b_candidates, marked_text, lang, base_ref, base_text, citing_ref,
            )
        else:
            stage_ab_chosen, stage_ab_confirmed = stage_a_chosen, stage_a_confirmed
        winning_stage = _winning_stage(stage_ab_chosen, stage_ab_confirmed, a_refs, b_refs)

        return {
            "citing_ref": citing_ref,
            "non_segment_ref": non_segment_ref,
            "has_base_context": has_base,
            "stage_a_queries": "; ".join(a_queries_run),
            "stage_b_unique_queries": "; ".join(b_queries_run),
            "stage_a_candidates": len(a_refs),
            "stage_b_unique_cands": len(b_unique_refs),
            "stage_a_chosen_ref": stage_a_chosen.resolved_ref if stage_a_chosen else "",
            "stage_ab_chosen_ref": stage_ab_chosen.resolved_ref if stage_ab_chosen else "",
            "stage_a_confirmed": "yes" if stage_a_confirmed else "no",
            "stage_ab_confirmed": "yes" if stage_ab_confirmed else "no",
            "winning_stage": winning_stage,
            "stage_b_rescued": "yes" if (not stage_a_confirmed and stage_ab_confirmed) else "no",
            "stage_b_regressed": "yes" if (stage_a_confirmed and not stage_ab_confirmed) else "no",
        }
    except Exception as e:
        logger.warning(f"Error processing {payload.ref}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Analyze recall drop from removing Stage B search")
    parser.add_argument("--sample", type=int, default=DEFAULT_SAMPLE)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    print(f"Sampling {args.sample} search-path payloads...")
    payloads = _sample_search_path_payloads(args.sample)
    print(f"Got {len(payloads)} payloads. Running with {NUM_THREADS} threads...")

    rows = []
    with ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
        futures = {executor.submit(_process_payload, p): p for p in payloads}
        for future in tqdm(as_completed(futures), total=len(futures), desc="Processing"):
            result = future.result()
            if result:
                rows.append(result)

    if not rows:
        print("No results.")
        return

    total = len(rows)
    with_base = sum(1 for r in rows if r["has_base_context"])
    a_confirmed = sum(1 for r in rows if r["stage_a_confirmed"] == "yes")
    ab_confirmed = sum(1 for r in rows if r["stage_ab_confirmed"] == "yes")
    rescued = sum(1 for r in rows if r["stage_b_rescued"] == "yes")
    regressed = sum(1 for r in rows if r["stage_b_regressed"] == "yes")
    winning_stage_counts = {
        stage: sum(1 for r in rows if r["winning_stage"] == stage)
        for stage in ("A", "B", "tie", "none")
    }

    def pct(numerator: int, denominator: int = total) -> str:
        return f"{100 * numerator / denominator:.1f}%" if denominator else "0.0%"

    print(f"\n{'='*60}")
    print(f"Eligible Stage-B rows:     {total} (from {len(payloads)} sampled >3-segment payloads)")
    print(f"Has base context:          {with_base} ({pct(with_base)})")
    print(f"Stage A confirmed:         {a_confirmed} ({pct(a_confirmed)})")
    print(f"Stage A+B confirmed:       {ab_confirmed} ({pct(ab_confirmed)})")
    print(f"Stage B rescued:           {rescued} ({pct(rescued)})")
    print(f"Stage B regressed:         {regressed} ({pct(regressed)})")
    print(
        "Winning stage:             "
        f"A={winning_stage_counts['A']}, "
        f"B={winning_stage_counts['B']}, "
        f"tie={winning_stage_counts['tie']}, "
        f"none={winning_stage_counts['none']}"
    )
    if ab_confirmed:
        print(f"Recall drop vs A+B recall: {pct(rescued, ab_confirmed)}")
    if total:
        print(f"Absolute recall drop:      {pct(rescued)}")

    with open(args.output, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
