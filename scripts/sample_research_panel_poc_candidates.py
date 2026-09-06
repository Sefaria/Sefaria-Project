#!/usr/bin/env python
"""
Select a bounded research-panel POC candidate set from a raw parsha dump.

This sampler is intentionally heuristic. It tries to produce a useful tagging
queue for the POC: broad verse coverage, strong source quality, and deterministic
snippet evidence where the existing linker/MUTC data can provide it.
"""
import argparse
import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Optional

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

import django

django.setup()

from bson import ObjectId

from sefaria.model import Link, Ref
from sefaria.model.marked_up_text_chunk import (
    LinkerOutputSet,
    MarkedUpTextChunkSet,
    MUTCSpanType,
)
from sefaria.model.passage import Passage
from sefaria.model.text import TextChunk
from sefaria.model.webpage_text import WebPageText
from sefaria.system.exceptions import InputError


DEFAULT_RAW = Path("data/research_panel_poc/raw/nitzavim_metadata.raw.json")
DEFAULT_OUT = Path("data/research_panel_poc/nitzavim_candidates_1000.json")

TARGET_COUNTS = {
    "text-link": 600,
    "sheet": 250,
    "webpage": 150,
}
TOTAL_TARGET = 1000

HIGH_VALUE_CATEGORIES = {
    "Commentary", "Quoting Commentary", "Midrash", "Jewish Thought", "Chasidut",
    "Kabbalah", "Halakhah", "Talmud", "Tanakh", "Musar", "Essay",
}
CANONICAL_BOOK_PATTERNS = [
    r"^Rashi on ", r"^Ramban on ", r"^Ibn Ezra on ", r"^Sforno on ",
    r"^Or HaChaim on ", r"^Kli Yakar on ", r"^Chizkuni$", r"^Akeidat Yitzchak$",
    r"^Akeidat Yitzchak", r"^Sifrei Devarim$", r"^Midrash Tanchuma",
    r"^Malbim on ", r"^Haamek Davar on ", r"^Torah Temimah",
    r"^Rabbeinu Bahya", r"^Zohar$", r"^BDB$",
]
PREFERRED_WEB_DOMAINS = {
    "etzion.org.il", "rabbisacks.org", "outorah.org", "aish.com", "hadar.org",
    "thelehrhaus.com", "myjewishlearning.com", "jtsa.edu", "allparsha.org",
    "toravoda.org.il", "library.yctorah.org", "exploringjudaism.org",
    "mayim.org.il", "sivanrahavmeir.com", "halachipedia.com",
}
THEME_TOPIC_SLUGS = {
    "parashat-nitzavim", "teshuvah", "free-will", "covenants",
    "covenant-with-israel", "torah", "mitzvot", "it-is-not-in-heaven",
    "elul", "rosh-hashanah", "yom-kippur", "high-holidays",
}


def norm_key(value: Any) -> str:
    return "" if value is None else str(value)


def plain_text(value: Any) -> str:
    if isinstance(value, list):
        return " ".join(plain_text(v) for v in value)
    if value is None:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(value))).strip()


def text_for_ref(tref: str, lang: str = "en") -> str:
    try:
        return plain_text(TextChunk(Ref(tref), lang=lang).text)
    except Exception:
        return ""


def containing_passage(tref: str) -> Optional[dict]:
    try:
        passage = Passage.containing_segment(Ref(tref))
    except Exception:
        return None
    if not passage:
        return None
    return {
        "ref": passage.full_ref,
        "type": passage.type,
        "source": getattr(passage, "source", None),
    }


def refs_overlap(a: str, b: str) -> bool:
    try:
        aref = Ref(a)
        bref = Ref(b)
        return aref.overlaps(bref) or aref.contains(bref) or bref.contains(aref)
    except Exception:
        return a == b


def load_link(link_id: str) -> Optional[Link]:
    if not link_id:
        return None
    try:
        return Link().load({"_id": ObjectId(link_id)})
    except Exception:
        return None


def mutc_evidence_for_link(link: dict, max_spans: int = 3) -> list[dict]:
    source_ref = link.get("sourceRef")
    anchor_ref = link.get("anchorRef")
    if not source_ref or not anchor_ref:
        return []
    evidence = []
    for SetKlass, source_name in (
        (MarkedUpTextChunkSet, "marked_up_text_chunks"),
        (LinkerOutputSet, "linker_output"),
    ):
        try:
            chunks = list(SetKlass({"ref": source_ref}))
        except Exception:
            chunks = []
        for chunk in chunks:
            for span in getattr(chunk, "spans", []):
                if span.get("type") != MUTCSpanType.CITATION.value or span.get("deleted"):
                    continue
                span_ref = span.get("llm_resolved_ref_non_segment") or span.get("llm_resolved_ref_ambiguous") or span.get("ref")
                if not span_ref or not refs_overlap(span_ref, anchor_ref):
                    continue
                evidence.append({
                    "source": source_name,
                    "sourceSegmentRef": source_ref,
                    "versionTitle": getattr(chunk, "versionTitle", None),
                    "language": getattr(chunk, "language", None),
                    "targetRef": span_ref,
                    "charRange": span.get("charRange"),
                    "text": span.get("text"),
                })
                if len(evidence) >= max_spans:
                    return evidence
    return evidence


def web_text_available(url: str) -> bool:
    try:
        return bool(WebPageText().load(url))
    except Exception:
        return False


def canonical_bonus(title: str) -> int:
    return 2 if any(re.search(pattern, title or "") for pattern in CANONICAL_BOOK_PATTERNS) else 0


def make_link_candidates(raw: dict) -> list[dict]:
    by_id = {}
    anchors_by_id = defaultdict(set)
    for segment in raw["segments"]:
        for link in segment["related"]["links"]:
            key = link.get("_id") or "|".join([norm_key(link.get("anchorRef")), norm_key(link.get("sourceRef")), norm_key(link.get("type"))])
            by_id.setdefault(key, link)
            anchors_by_id[key].add(segment["ref"])

    candidates = []
    for key, link in by_id.items():
        raw_link = load_link(link.get("_id"))
        generated_by = getattr(raw_link, "generated_by", None) if raw_link else None
        inline_citation = bool(getattr(raw_link, "inline_citation", False)) if raw_link else False
        evidence = mutc_evidence_for_link(link)
        source_text = text_for_ref(link.get("sourceRef"), "en") or text_for_ref(link.get("sourceRef"), "he")
        score = 0
        score += 5 if evidence else 0
        score += 3 if inline_citation or generated_by == "add_links_from_text" else 0
        score += 3 if link.get("sourceHasEn") else 0
        score += 3 if link.get("category") in HIGH_VALUE_CATEGORIES else 0
        score += canonical_bonus(link.get("index_title", ""))
        score += min(len(anchors_by_id[key]), 4)
        score += 1 if source_text else -4
        if link.get("category") in {"Reference", "Liturgy"}:
            score -= 1

        anchor_refs = sorted(anchors_by_id[key], key=lambda r: Ref(r).order_id())
        candidates.append({
            "resourceType": "text-link",
            "id": key,
            "anchorRefs": anchor_refs,
            "primaryAnchorRef": anchor_refs[0],
            "passage": containing_passage(anchor_refs[0]),
            "sourceRef": link.get("sourceRef"),
            "sourceHeRef": link.get("sourceHeRef"),
            "sourceBook": link.get("index_title"),
            "category": link.get("category"),
            "linkType": link.get("type"),
            "collectiveTitle": link.get("collectiveTitle"),
            "sourceHasEn": link.get("sourceHasEn"),
            "generatedBy": generated_by,
            "inlineCitation": inline_citation,
            "deterministicSnippetEvidence": evidence,
            "deterministicSnippetAvailable": bool(evidence),
            "sourceTextPreview": source_text[:700],
            "selectionScore": score,
        })
    return candidates


def make_sheet_candidates(raw: dict) -> list[dict]:
    by_id = {}
    anchors_by_id = defaultdict(set)
    for segment in raw["segments"]:
        for sheet in segment["related"]["sheets"]:
            key = str(sheet.get("id"))
            by_id.setdefault(key, sheet)
            anchors_by_id[key].add(segment["ref"])

    candidates = []
    for key, sheet in by_id.items():
        topics = [t.get("slug") or t.get("asTyped") for t in sheet.get("topics", []) if t]
        theme_hits = sorted(set(topics) & THEME_TOPIC_SLUGS)
        score = 0
        score += min(int(sheet.get("views") or 0) // 500, 8)
        score += min(len(sheet.get("likes") or []), 5)
        score += 4 if theme_hits else 0
        score += min(len(anchors_by_id[key]), 5)
        score += 2 if sheet.get("summary") else 0
        score += 2 if sheet.get("is_featured") else 0
        if not sheet.get("title"):
            score -= 4

        anchor_refs = sorted(anchors_by_id[key], key=lambda r: Ref(r).order_id())
        candidates.append({
            "resourceType": "sheet",
            "id": key,
            "anchorRefs": anchor_refs,
            "primaryAnchorRef": anchor_refs[0],
            "passage": containing_passage(anchor_refs[0]),
            "title": sheet.get("title"),
            "url": sheet.get("sheetUrl"),
            "ownerName": sheet.get("ownerName"),
            "views": sheet.get("views"),
            "topicSlugs": topics,
            "themeTopicHits": theme_hits,
            "summary": plain_text(sheet.get("summary"))[:700],
            "selectionScore": score,
        })
    return candidates


def make_webpage_candidates(raw: dict) -> list[dict]:
    by_url = {}
    anchors_by_url = defaultdict(set)
    for segment in raw["segments"]:
        for webpage in segment["related"]["webpages"]:
            key = webpage.get("url")
            if not key:
                continue
            by_url.setdefault(key, webpage)
            anchors_by_url[key].add(segment["ref"])

    candidates = []
    for key, page in by_url.items():
        domain = page.get("domain")
        has_body = web_text_available(key)
        score = 0
        score += 4 if domain in PREFERRED_WEB_DOMAINS else 0
        score += min(int(page.get("linkerHits") or 0) // 20, 8)
        score += min(len(anchors_by_url[key]), 5)
        score += 3 if has_body else 0
        score += 1 if page.get("description") else 0
        if not page.get("title"):
            score -= 4

        anchor_refs = sorted(anchors_by_url[key], key=lambda r: Ref(r).order_id())
        candidates.append({
            "resourceType": "webpage",
            "id": key,
            "anchorRefs": anchor_refs,
            "primaryAnchorRef": anchor_refs[0],
            "passage": containing_passage(anchor_refs[0]),
            "title": page.get("title"),
            "url": key,
            "domain": domain,
            "siteName": page.get("siteName"),
            "description": plain_text(page.get("description"))[:700],
            "linkerHits": page.get("linkerHits"),
            "webPageTextAvailable": has_body,
            "selectionScore": score,
        })
    return candidates


def select_with_caps(
    candidates: list[dict],
    target: int,
    cap_key: str,
    cap: int,
    min_per_ref: int = 0,
    per_ref_cap: Optional[int] = None,
) -> list[dict]:
    candidates = sorted(candidates, key=lambda c: (-c["selectionScore"], c.get("primaryAnchorRef", ""), c.get("id", "")))
    selected = []
    seen = set()
    caps = Counter()
    per_ref = Counter()

    if min_per_ref:
        for candidate in candidates:
            if len(selected) >= target:
                break
            if candidate["id"] in seen:
                continue
            anchor = candidate["primaryAnchorRef"]
            key = candidate.get(cap_key) or ""
            if per_ref[anchor] >= min_per_ref or caps[key] >= cap:
                continue
            selected.append(candidate)
            seen.add(candidate["id"])
            caps[key] += 1
            per_ref[anchor] += 1

    for candidate in candidates:
        if len(selected) >= target:
            break
        if candidate["id"] in seen:
            continue
        anchor = candidate["primaryAnchorRef"]
        if per_ref_cap is not None and per_ref[anchor] >= per_ref_cap:
            continue
        key = candidate.get(cap_key) or ""
        if caps[key] >= cap:
            continue
        selected.append(candidate)
        seen.add(candidate["id"])
        caps[key] += 1
        per_ref[anchor] += 1
    return selected


def fill_reserve(all_candidates: list[dict], selected: list[dict], total: int, per_ref_cap: int = 40) -> list[dict]:
    selected_ids = {(c["resourceType"], c["id"]) for c in selected}
    per_ref = Counter(c["primaryAnchorRef"] for c in selected)
    remaining = [c for c in all_candidates if (c["resourceType"], c["id"]) not in selected_ids]
    remaining.sort(key=lambda c: (-c["selectionScore"], c["resourceType"], c.get("primaryAnchorRef", ""), c.get("id", "")))
    for candidate in remaining:
        if len(selected) >= total:
            break
        anchor = candidate["primaryAnchorRef"]
        if per_ref[anchor] >= per_ref_cap:
            continue
        selected.append(candidate)
        per_ref[anchor] += 1
    return selected


def summarize(selected: list[dict], all_counts: dict) -> dict:
    by_type = Counter(c["resourceType"] for c in selected)
    by_ref = Counter(c["primaryAnchorRef"] for c in selected)
    by_category = Counter(c.get("category") for c in selected if c["resourceType"] == "text-link")
    by_domain = Counter(c.get("domain") for c in selected if c["resourceType"] == "webpage")
    return {
        "selectedCount": len(selected),
        "selectedByType": dict(by_type),
        "availableByType": all_counts,
        "textLinkCategories": by_category.most_common(),
        "webpageDomains": by_domain.most_common(),
        "segmentsBySelectedCount": by_ref.most_common(),
        "deterministicSnippetEvidenceCount": sum(1 for c in selected if c.get("deterministicSnippetAvailable")),
        "webpagesWithBodyCount": sum(1 for c in selected if c.get("webPageTextAvailable")),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", default=str(DEFAULT_RAW))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--total", type=int, default=TOTAL_TARGET)
    args = parser.parse_args()

    raw = json.loads(Path(args.raw).read_text(encoding="utf-8"))
    print("Building text-link candidates")
    link_candidates = make_link_candidates(raw)
    print("Building sheet candidates")
    sheet_candidates = make_sheet_candidates(raw)
    print("Building webpage candidates")
    webpage_candidates = make_webpage_candidates(raw)

    selected = []
    selected += select_with_caps(link_candidates, TARGET_COUNTS["text-link"], "sourceBook", 20, min_per_ref=6, per_ref_cap=24)
    selected += select_with_caps(sheet_candidates, TARGET_COUNTS["sheet"], "ownerName", 8, min_per_ref=3, per_ref_cap=10)
    selected += select_with_caps(webpage_candidates, TARGET_COUNTS["webpage"], "domain", 15, min_per_ref=2, per_ref_cap=6)
    selected = fill_reserve(link_candidates + sheet_candidates + webpage_candidates, selected, args.total)
    selected = selected[:args.total]

    out = {
        "parsha": raw["parsha"],
        "ref": raw["ref"],
        "heRef": raw["heRef"],
        "selectionPolicy": {
            "targetTotal": args.total,
            "initialTargets": TARGET_COUNTS,
            "caps": {
                "textLinksPerSourceBook": 20,
                "sheetsPerOwner": 8,
                "webpagesPerDomain": 15,
                "textLinksPerPrimaryAnchorRef": 24,
                "sheetsPerPrimaryAnchorRef": 10,
                "webpagesPerPrimaryAnchorRef": 6,
                "reserveFillPerPrimaryAnchorRef": 40,
            },
            "note": "Passage fields are deterministic lookups from Passage.containing_segment, not LLM tags.",
        },
        "summary": summarize(selected, {
            "text-link": len(link_candidates),
            "sheet": len(sheet_candidates),
            "webpage": len(webpage_candidates),
        }),
        "items": selected,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")
    print(json.dumps(out["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
