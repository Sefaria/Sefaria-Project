"""
Export all documents from linker_disambiguation_tmp MongoDB collection to CSV,
matching the format of disambiguation_test_set - disambiguation_samples.csv.

Only processes 'mutc' type documents (each represents one citation disambiguation event).

Added columns (he/en text for payload_ref and result ref):
  payload_ref_he, payload_ref_en, result_ref_he, result_ref_en

English text is fetched from Sefaria. If unavailable, Sonnet 4.6 translates from Hebrew.
If Hebrew is also unavailable, the field is left blank.
"""
import argparse
import csv
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import django
django.setup()

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langchain.globals import set_llm_cache
from langchain_community.cache import SQLiteCache
from tqdm import tqdm
from sefaria.model import Ref
from sefaria.system.database import db
from sefaria.system.exceptions import InputError
from sefaria.helper.normalization import NormalizerComposer

set_llm_cache(SQLiteCache(database_path=".langchain.db"))


COLUMNS = [
    "case_type",
    "payload_ref",
    "payload_versionTitle",
    "payload_language",
    "payload_charRange",
    "payload_text",
    "payload_ambiguous_refs",
    "payload_resolved_non_segment_ref",
    "result_resolved_ref",
    "result_matched_segment",
    "result_method",
    "result_llm_resolved_phrase",
    "success",
    "error",
    "correcness",
    "payload_ref_he",
    "payload_ref_en",
    "result_ref_he",
    "result_ref_en",
]

_llm = None
_text_cache: dict = {}
_raw_he_cache: dict = {}
_normalizers: dict = {}


def _normalize(text: str, lang: str) -> str:
    if lang not in _normalizers:
        steps = ["fn-marker", "html", "double-space"]
        if lang == "he":
            steps += ["maqaf", "cantillation"]
        _normalizers[lang] = NormalizerComposer(steps)
    return _normalizers[lang].normalize(text)


def _extract_text(text_val) -> str:
    if isinstance(text_val, str):
        return text_val
    if isinstance(text_val, list):
        parts = [p for p in text_val if isinstance(p, str) and p]
        return " ".join(parts) if parts else ""
    return ""


def _get_llm():
    global _llm
    if _llm is None:
        import os
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")
        _llm = ChatAnthropic(model="claude-sonnet-4-6", temperature=0, api_key=api_key)
    return _llm


def _translate_he_to_en(hebrew_text: str) -> str:
    llm = _get_llm()
    response = llm.invoke([HumanMessage(content=(
        "Translate the following Hebrew rabbinic text to English. "
        "Output only the translation, no commentary.\n\n" + hebrew_text
    ))])
    return response.content.strip()


def _fetch_raw_he(ref_str: str) -> str:
    """Return raw (unnormalized) Hebrew text for a ref, cached."""
    if ref_str in _raw_he_cache:
        return _raw_he_cache[ref_str]
    try:
        he = _extract_text(Ref(ref_str).text("he").text)
    except (InputError, AttributeError):
        he = ""
    _raw_he_cache[ref_str] = he
    return he


def _fetch_text(ref_str: str) -> tuple[str, str]:
    """Return (he_normalized, en_normalized) for a ref string.

    Translates with Claude if English is absent and Hebrew is present.
    Returns ("", "") on invalid ref.
    """
    if ref_str in _text_cache:
        return _text_cache[ref_str]

    he = _normalize(_fetch_raw_he(ref_str), "he")
    en = ""
    try:
        en = _normalize(_extract_text(Ref(ref_str).text("en").text), "en")
    except (InputError, AttributeError):
        pass

    if not en and he:
        en = _translate_he_to_en(he)

    result = (he, en)
    _text_cache[ref_str] = result
    return result


def _bracketed_he(ref_str: str, char_range: list) -> str:
    """Return normalized Hebrew text with the citation span wrapped in {{ }}.

    Maps char_range from unnormalized coordinates to normalized using the same
    normalizer as the linker (reverse=True maps unnorm → norm indices).
    """
    he_raw = _fetch_raw_he(ref_str)
    if not he_raw:
        return ""

    # Ensure the 'he' normalizer is initialized
    _normalize("", "he")
    norm = _normalizers["he"]
    he_norm = norm.normalize(he_raw)

    if not char_range or len(char_range) != 2:
        return he_norm

    mapped = norm.norm_to_unnorm_indices(he_raw, [(char_range[0], char_range[1])], reverse=True)
    norm_start, norm_end = mapped[0]
    return he_norm[:norm_start] + "{{" + he_norm[norm_start:norm_end] + "}}" + he_norm[norm_end:]


def doc_to_row(doc):
    resolution_type = doc.get("resolution_type", "")
    span = doc.get("span", {})

    payload_ref_str = doc.get("ref", "")

    if resolution_type == "ambiguous":
        result_ref_str = doc.get("llm_resolved_ref_ambiguous", "")
        base = {
            "case_type": "ambiguous",
            "payload_ref": payload_ref_str,
            "payload_versionTitle": doc.get("versionTitle", ""),
            "payload_language": doc.get("language", ""),
            "payload_charRange": str(span.get("charRange", "")),
            "payload_text": span.get("text", ""),
            "payload_ambiguous_refs": str([span["ref"]]) if span.get("ref") else "",
            "payload_resolved_non_segment_ref": "",
            "result_resolved_ref": "",
            "result_matched_segment": result_ref_str,
            "result_method": doc.get("llm_resolved_method_ambiguous", ""),
            "result_llm_resolved_phrase": doc.get("llm_resolved_phrase_ambiguous", ""),
            "success": str(doc.get("llm_ambiguous_option_valid", "")).upper(),
            "error": "",
            "correcness": "",
        }
    elif resolution_type == "non_segment":
        result_ref_str = doc.get("llm_resolved_ref_non_segment", "")
        base = {
            "case_type": "non_segment",
            "payload_ref": payload_ref_str,
            "payload_versionTitle": doc.get("versionTitle", ""),
            "payload_language": doc.get("language", ""),
            "payload_charRange": str(span.get("charRange", "")),
            "payload_text": span.get("text", ""),
            "payload_ambiguous_refs": "",
            "payload_resolved_non_segment_ref": span.get("ref", ""),
            "result_resolved_ref": result_ref_str,
            "result_matched_segment": "",
            "result_method": doc.get("llm_resolved_method_non_segment", ""),
            "result_llm_resolved_phrase": doc.get("llm_resolved_phrase_non_segment", ""),
            "success": "TRUE" if result_ref_str else "FALSE",
            "error": "",
            "correcness": "",
        }
    else:
        return None

    payload_he = _bracketed_he(payload_ref_str, span.get("charRange"))
    _, payload_en = _fetch_text(payload_ref_str)
    result_he, result_en = _fetch_text(result_ref_str) if result_ref_str else ("", "")

    base["payload_ref_he"] = payload_he
    base["payload_ref_en"] = payload_en
    base["result_ref_he"] = result_he
    base["result_ref_en"] = result_en
    return base


def _prefetch_refs(refs: list[str], threads: int = 30) -> None:
    """Warm _text_cache for all refs in parallel."""
    unique = [r for r in dict.fromkeys(refs) if r]
    with ThreadPoolExecutor(max_workers=threads) as pool:
        futures = {pool.submit(_fetch_text, ref): ref for ref in unique}
        for future in tqdm(as_completed(futures), total=len(futures),
                           desc="Fetching text", file=sys.stderr):
            future.result()  # re-raise any exception


def main():
    parser = argparse.ArgumentParser(description="Export linker_disambiguation_tmp to CSV")
    parser.add_argument("--output", "-o", default="-", help="Output file path (default: stdout)")
    parser.add_argument("--threads", "-t", type=int, default=30,
                        help="Number of threads for parallel text fetching (default: 30)")
    args = parser.parse_args()

    docs = list(db.linker_disambiguation_tmp.find({"type": "mutc"}))[:1000]
    print(f"Loaded {len(docs)} docs.", file=sys.stderr)

    # Collect all unique refs that will need text fetched
    payload_refs = [d.get("ref", "") for d in docs]
    result_refs = [
        d.get("llm_resolved_ref_ambiguous") or d.get("llm_resolved_ref_non_segment", "")
        for d in docs
    ]
    _prefetch_refs(payload_refs + result_refs, threads=args.threads)

    out = open(args.output, "w", newline="", encoding="utf-8") if args.output != "-" else sys.stdout
    try:
        writer = csv.DictWriter(out, fieldnames=COLUMNS)
        writer.writeheader()
        count = 0
        for doc in tqdm(docs, desc="Writing CSV", file=sys.stderr):
            row = doc_to_row(doc)
            if row:
                writer.writerow(row)
                count += 1
        print(f"\nExported {count} rows.", file=sys.stderr)
    finally:
        if args.output != "-":
            out.close()


if __name__ == "__main__":
    main()
