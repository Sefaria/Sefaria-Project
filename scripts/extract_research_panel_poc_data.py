#!/usr/bin/env python
"""
Dump existing resource-panel data for a parsha/ref range.

This is intentionally file-backed POC plumbing: it uses the same read helpers that
feed the reader resource panel, but writes JSON snapshots instead of introducing
new persistence models.
"""
import argparse
import json
import os
import re
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

import django

django.setup()

from bson import ObjectId

from sefaria.client.wrapper import format_link_object_for_client
from sefaria.helper.text import get_parasha_ref_set, get_talmud_perek_ref_set
from sefaria.helper.topic import get_topics_for_ref
from sefaria.model import LinkSet, Ref
from sefaria.model.guide import GuideSet
from sefaria.model.manuscript import ManuscriptPageSet
from sefaria.model.media import get_media_for_ref
from sefaria.model.text import TextChunk
from sefaria.model.webpage import get_webpages_for_ref
from sefaria.sheets import get_sheets_for_ref
from sefaria.system.exceptions import InputError


DEFAULT_REF = "Deuteronomy 29:9-30:20"
DEFAULT_OUT_DIR = Path("data/research_panel_poc/raw")


def jsonable(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    return value


def safe_call(label: str, fn):
    try:
        return fn(), None
    except Exception as exc:
        return None, {"source": label, "error": f"{type(exc).__name__}: {exc}"}


def text_for_ref(tref: str) -> dict:
    oref = Ref(tref)
    out = {}
    for lang in ("en", "he"):
        data, err = safe_call(f"text:{lang}", lambda lang=lang: TextChunk(oref, lang=lang).text)
        out[lang] = data
        if err:
            out.setdefault("errors", []).append(err)
    return out


def get_link_metadata_for_ref(tref: str, with_text: bool = False) -> list[dict]:
    """
    Local extraction variant of sefaria.client.wrapper.get_links().

    The public helper currently touches library collections after building text
    links, even when sheet links are disabled. This POC extractor wants the link
    objects only; sheets are collected separately.
    """
    links = []
    oref = Ref(tref)
    nref = oref.normal()
    len_ref = len(nref)
    re_ref = oref.regex() if oref.is_range() else None

    for link in LinkSet(oref):
        if re_ref:
            pos = 0 if any(re.match(re_ref, expanded) for expanded in link.expandedRefs0) else 1
        else:
            pos = 0 if any(nref == expanded[:len_ref] for expanded in link.expandedRefs0) else 1
        try:
            anchor_ref = Ref(link.refs[pos])
            node_depth = getattr(anchor_ref.index_node, "depth", None)
            if node_depth is None or len(anchor_ref.sections) != node_depth:
                continue

            source_ref = Ref(link.refs[0 if pos == 1 else 1])
            node_depth = getattr(source_ref.index_node, "depth", None)
            if node_depth is None or len(source_ref.sections) + 1 < node_depth:
                continue

            if link.refs[pos] in get_talmud_perek_ref_set() or link.refs[pos] in get_parasha_ref_set():
                continue

            links.append(format_link_object_for_client(link, with_text, nref, pos))
        except Exception:
            continue
    return links


def collect_segment(tref: str, include_link_text: bool) -> dict:
    oref = Ref(tref)
    segment = {
        "ref": oref.normal(),
        "heRef": oref.he_normal(),
        "baseText": text_for_ref(oref.normal()),
        "related": {},
        "errors": [],
    }

    calls = {
        # Sheets are collected explicitly below. Keeping with_sheet_links=False avoids
        # double-counting and keeps this aligned with the resource panel's separate
        # links/sheets buckets.
        "links": lambda: get_link_metadata_for_ref(oref.normal(), with_text=include_link_text),
        "sheets": lambda: get_sheets_for_ref(oref.normal()),
        "topics": lambda: get_topics_for_ref(oref.normal(), lang="english", annotate=True),
        "webpages": lambda: get_webpages_for_ref(oref.normal()),
        "media": lambda: get_media_for_ref(oref.normal()),
        "manuscripts": lambda: ManuscriptPageSet.load_set_for_client(oref.normal()),
        "guides": lambda: GuideSet.load_set_for_client(oref.normal()),
    }

    for key, fn in calls.items():
        data, err = safe_call(key, fn)
        segment["related"][key] = data or []
        if err:
            segment["errors"].append(err)

    segment["counts"] = {key: len(value) for key, value in segment["related"].items()}
    return segment


def summarize(raw: dict) -> dict:
    totals = Counter()
    link_categories = Counter()
    link_books = Counter()
    topic_slugs = Counter()
    webpage_domains = Counter()
    sheet_ids = set()
    unique_link_ids = set()
    unique_source_refs = set()
    errors = []

    for segment in raw["segments"]:
        totals.update(segment["counts"])
        errors.extend(segment.get("errors", []))
        for link in segment["related"]["links"]:
            if link.get("_id"):
                unique_link_ids.add(link["_id"])
            if link.get("sourceRef"):
                unique_source_refs.add(link["sourceRef"])
            if link.get("category"):
                link_categories[link["category"]] += 1
            if link.get("index_title"):
                link_books[link["index_title"]] += 1
            if link.get("isSheet") and link.get("id"):
                sheet_ids.add(str(link["id"]))
        for sheet in segment["related"]["sheets"]:
            if sheet.get("id"):
                sheet_ids.add(str(sheet["id"]))
        for topic in segment["related"]["topics"]:
            slug = topic.get("topic") or topic.get("slug")
            if slug:
                topic_slugs[slug] += 1
        for webpage in segment["related"]["webpages"]:
            if webpage.get("domain"):
                webpage_domains[webpage["domain"]] += 1

    return {
        "parsha": raw["parsha"],
        "ref": raw["ref"],
        "segmentCount": len(raw["segments"]),
        "totalRawItemsAcrossSegments": dict(totals),
        "uniqueLinks": len(unique_link_ids),
        "uniqueSourceRefs": len(unique_source_refs),
        "uniqueSheets": len(sheet_ids),
        "linkCategories": link_categories.most_common(),
        "topLinkBooks": link_books.most_common(50),
        "topTopics": topic_slugs.most_common(50),
        "topWebpageDomains": webpage_domains.most_common(50),
        "segmentsByTotalItems": sorted(
            [
                {
                    "ref": segment["ref"],
                    "total": sum(segment["counts"].values()),
                    "counts": segment["counts"],
                }
                for segment in raw["segments"]
            ],
            key=lambda item: item["total"],
            reverse=True,
        ),
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", default=DEFAULT_REF)
    parser.add_argument("--parsha", default="Nitzavim")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--include-link-text", action="store_true")
    args = parser.parse_args()

    parsha_ref = Ref(args.ref)
    segment_refs = [r.normal() for r in parsha_ref.all_segment_refs()]
    raw = {
        "parsha": args.parsha,
        "ref": parsha_ref.normal(),
        "heRef": parsha_ref.he_normal(),
        "includeLinkText": args.include_link_text,
        "segmentRefs": segment_refs,
        "segments": [],
    }

    for i, tref in enumerate(segment_refs, start=1):
        print(f"[{i}/{len(segment_refs)}] {tref}")
        raw["segments"].append(collect_segment(tref, args.include_link_text))

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = "with_link_text" if args.include_link_text else "metadata"
    raw_path = out_dir / f"{args.parsha.lower()}_{suffix}.raw.json"
    summary_path = out_dir / f"{args.parsha.lower()}_{suffix}.summary.json"

    raw_jsonable = jsonable(raw)
    summary = summarize(raw_jsonable)

    raw_path.write_text(json.dumps(raw_jsonable, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {raw_path}")
    print(f"Wrote {summary_path}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
