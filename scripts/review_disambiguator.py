"""
review_disambiguator.py

Given a segment ref or a Sefaria URL, load LinkerOutput records for that segment,
resolve ambiguous/non-segment cases with the disambiguator, and print results with
Sefaria URLs that include debug_mode=linker.

Edit INPUT_REF_OR_URL below (no CLI params).
"""

import django
django.setup()

from urllib.parse import urlparse, unquote

from sefaria.model import Ref
from sefaria.system.database import db
from sefaria.settings import FRONT_END_URL
from sefaria.helper.linker.disambiguator import (
    AmbiguousResolutionPayload,
    NonSegmentResolutionPayload,
    disambiguate_ambiguous_ref,
    disambiguate_non_segment_ref,
)
from sefaria.helper.linker.tasks import _is_non_segment_or_perek_ref


# ---- params (edit these) ----
INPUT_REF_OR_URL = "Imrei Binah, Part IV; Chikrei Lev 1:9"
BASE_URL_OVERRIDE = None  # e.g. "https://www.sefaria.org"
# -----------------------------


def _normalize_input_to_ref_and_base_url(value: str):
    base_url = BASE_URL_OVERRIDE or FRONT_END_URL or "https://www.sefaria.org"
    raw = value.strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        path = parsed.path.strip("/")
        parts = path.split("/") if path else []
        if parts and parts[0] == "texts" and len(parts) > 1:
            ref_part = parts[1]
        elif parts:
            ref_part = parts[0]
        else:
            ref_part = ""
        ref_part = unquote(ref_part).replace("_", " ")
        return ref_part, base_url
    return unquote(raw), base_url


def _add_debug_param(url: str) -> str:
    return url + ("&debug_mode=linker" if "?" in url else "?debug_mode=linker")


def _sefaria_url(base_url: str, tref: str) -> str:
    return _add_debug_param(f"{base_url}/{Ref(tref).url()}")


def _load_linker_outputs_for_ref(tref: str):
    return list(db.linker_output.find({"ref": tref}))


def _ambiguous_payloads_for_output(raw_linker_output):
    spans = raw_linker_output.get("spans", [])
    groups = {}
    for span in spans:
        if span.get("type") == "citation" and span.get("ambiguous"):
            key = tuple(span.get("charRange", []))
            if len(key) == 2:
                groups.setdefault(key, []).append(span)

    payloads = []
    for char_range, group in groups.items():
        refs = [sp.get("ref") for sp in group if sp.get("ref")]
        normalized = set()
        for ref_str in refs:
            try:
                normalized.add(Ref(ref_str).normal())
            except Exception:
                normalized.add(ref_str)
        if len(normalized) > 1:
            payloads.append(AmbiguousResolutionPayload(
                ref=raw_linker_output["ref"],
                versionTitle=raw_linker_output["versionTitle"],
                language=raw_linker_output["language"],
                charRange=list(char_range),
                text=group[0].get("text"),
                ambiguous_refs=refs,
            ))
    return payloads


def _non_segment_payloads_for_output(raw_linker_output):
    spans = raw_linker_output.get("spans", [])
    mutc = db.marked_up_text_chunks.find_one({
        "ref": raw_linker_output["ref"],
        "versionTitle": raw_linker_output["versionTitle"],
        "language": raw_linker_output["language"],
    })
    mutc_spans = (mutc.get("spans", []) if mutc else [])
    mutc_non_segment_ranges = set()
    for mutc_span in mutc_spans:
        if mutc_span.get("type") != "citation":
            continue
        mutc_ref = mutc_span.get("ref")
        if not mutc_ref:
            continue
        try:
            mutc_oref = Ref(mutc_ref)
        except Exception:
            continue
        if _is_non_segment_or_perek_ref(mutc_ref, mutc_oref):
            key = tuple(mutc_span.get("charRange", []))
            if len(key) == 2:
                mutc_non_segment_ranges.add(key)

    payloads = []
    for span in spans:
        if span.get("type") != "citation" or span.get("failed"):
            continue
        if span.get("ambiguous"):
            key = tuple(span.get("charRange", []))
            if len(key) != 2 or key not in mutc_non_segment_ranges:
                continue
        ref_str = span.get("ref")
        if not ref_str:
            continue
        try:
            oref = Ref(ref_str)
        except Exception:
            continue
        if _is_non_segment_or_perek_ref(ref_str, oref):
            payloads.append(NonSegmentResolutionPayload(
                ref=raw_linker_output["ref"],
                versionTitle=raw_linker_output["versionTitle"],
                language=raw_linker_output["language"],
                charRange=span.get("charRange"),
                text=span.get("text"),
                resolved_non_segment_ref=ref_str,
            ))
    return payloads


def main():
    tref_or_url, base_url = _normalize_input_to_ref_and_base_url(INPUT_REF_OR_URL)
    if not tref_or_url:
        print("No ref or URL provided.")
        return

    try:
        oref = Ref(tref_or_url)
        tref = oref.normal()
    except Exception as e:
        print(f"Invalid ref: {tref_or_url} ({e})")
        return

    print(f"Ref: {tref}")
    print(f"Base URL: {base_url}")
    outputs = _load_linker_outputs_for_ref(tref)
    print(f"LinkerOutput records: {len(outputs)}")

    for raw in outputs:
        amb_payloads = _ambiguous_payloads_for_output(raw)
        ns_payloads = _non_segment_payloads_for_output(raw)

        for payload in amb_payloads:
            result = disambiguate_ambiguous_ref(payload)
            print("\nAMBIGUOUS")
            print(f"  Cite: {payload.ref}")
            print(f"  Text: {payload.text}")
            print(f"  CharRange: {payload.charRange}")
            print(f"  Options: {payload.ambiguous_refs}")
            if result and result.resolved_ref:
                print(f"  Resolved: {result.resolved_ref}")
                print(f"  Method: {result.method}")
                try:
                    resolved_url = _sefaria_url(base_url, result.resolved_ref)
                except Exception:
                    resolved_url = ""
                if resolved_url:
                    print(f"  Resolved URL: {resolved_url}")
            else:
                print("  Resolved: <unresolved>")
            print(f"  Cite URL: {_sefaria_url(base_url, payload.ref)}")

        for payload in ns_payloads:
            print("\nNON-SEGMENT")
            print(f"  Cite: {payload.ref}")
            print(f"  Text: {payload.text}")
            print(f"  CharRange: {payload.charRange}")
            print(f"  Non-seg: {payload.resolved_non_segment_ref}")
            result = disambiguate_non_segment_ref(payload)
            if result and result.resolved_ref:
                print(f"  Resolved: {result.resolved_ref}")
                print(f"  Method: {result.method}")
                try:
                    resolved_url = _sefaria_url(base_url, result.resolved_ref)
                except Exception:
                    resolved_url = ""
                if resolved_url:
                    print(f"  Resolved URL: {resolved_url}")
            else:
                print("  Resolved: <unresolved>")
            print(f"  Cite URL: {_sefaria_url(base_url, payload.ref)}")


if __name__ == "__main__":
    main()
