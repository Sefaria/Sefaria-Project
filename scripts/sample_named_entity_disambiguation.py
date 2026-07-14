"""
sample_named_entity_disambiguation.py

Creates a dataset from linker_output for named entity disambiguation
(e.g. "Tamar" — which Tamar? Tamar of Judah or Tamar daughter of David?).

For each mention:
  - ambiguous: outputs all candidate topic slugs already stored in linker_output
  - failed (no match): finds the 3 closest topics by Levenshtein distance
    against all titles in the Topics collection

Output: JSONL to stdout (or --output file), one mention per line.

Usage:
  python scripts/sample_named_entity_disambiguation.py
  python scripts/sample_named_entity_disambiguation.py --sample-size 500 --output dataset.jsonl
  python scripts/sample_named_entity_disambiguation.py --status ambiguous --sample-size 200
  python scripts/sample_named_entity_disambiguation.py --status failed --sample-size 200
"""

import argparse
import csv
import json
import random
import sys

from tqdm import tqdm

import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db
from sefaria.helper.normalization import NormalizerComposer
from rapidfuzz import process as fuzz_process
from rapidfuzz.distance import Levenshtein

_he_normalizer = NormalizerComposer(['unidecode', 'fn-marker', 'html', 'double-space', 'maqaf', 'cantillation'])

CONTEXT_WORDS = 200  # words before/after the mention to include as context


# ---------------------------------------------------------------------------
# Topic index
# ---------------------------------------------------------------------------

def _primary_he_title(titles: list) -> str:
    for t in titles:
        if t.get("lang") == "he" and t.get("primary"):
            return t["text"]
    for t in titles:
        if t.get("primary"):
            return t["text"]
    return titles[0]["text"] if titles else ""


def _disambiguation_label(titles: list) -> str | None:
    """Return a Hebrew disambiguation hint if present on the primary he title."""
    for t in titles:
        if t.get("lang") == "he" and t.get("primary") and t.get("disambiguation"):
            return t["disambiguation"]
    return None


def build_topic_index():
    """
    Returns:
      slug_to_meta: {slug: {primary_title, disambiguation}}
      all_titles:   [(title_text, slug), ...] — Hebrew titles for TOC topics only,
                    for Levenshtein search on failed mentions
    """
    toc_slugs = set(
        doc["fromTopic"]
        for doc in db.topic_links.find({"linkType": "displays-under"}, {"fromTopic": 1})
        if doc.get("fromTopic")
    )

    slug_to_meta = {}
    all_titles = []

    for doc in tqdm(db.topics.find({}, {"slug": 1, "titles": 1}), desc="topics", unit="topic"):
        slug = doc["slug"]
        titles = doc.get("titles", [])
        if not titles:
            continue
        primary = _primary_he_title(titles)
        disambiguation = _disambiguation_label(titles)
        slug_to_meta[slug] = {"primary_title": primary, "disambiguation": disambiguation}
        if slug not in toc_slugs:
            continue
        for t in titles:
            if t.get("lang") != "he":
                continue
            text = t.get("text", "").strip()
            if text:
                all_titles.append((text, slug))

    return slug_to_meta, all_titles


# ---------------------------------------------------------------------------
# Text index + retrieval
# ---------------------------------------------------------------------------

def load_text_index() -> dict[tuple[str, str, str], str]:
    """Map (tref, version_title, language) → segment text for all Hebrew versions."""
    index: dict[tuple[str, str, str], str] = {}

    def _store(text, tref, _he_tref, version):
        if isinstance(text, str) and text:
            index[(tref, version.versionTitle, version.language)] = text

    for version in tqdm(VersionSet({"language": "he"}), desc="versions", unit="version",
                        total=db.texts.count_documents({"language": "he"})):
        version.walk_thru_contents(_store)
    return index


def _get_segment_text(ref: str, version_title: str, language: str,
                      text_index: dict[tuple[str, str, str], str]) -> str | None:
    return text_index.get((ref, version_title, language))


def _build_context(raw_text: str, char_start: int, char_end: int, mention_text: str) -> str:
    # charRange is always in raw text space; normalize the surrounding parts for display
    before = _he_normalizer.normalize(raw_text[:char_start])
    after = _he_normalizer.normalize(raw_text[char_end:])
    norm_mention = _he_normalizer.normalize(mention_text)
    before_words = before.split()[-CONTEXT_WORDS:]
    after_words = after.split()[:CONTEXT_WORDS]
    return " ".join(before_words) + " «" + norm_mention + "» " + " ".join(after_words)


# ---------------------------------------------------------------------------
# Levenshtein nearest neighbours
# ---------------------------------------------------------------------------

def find_nearest_topics(mention_text: str, all_titles: list, title_strings: list, slug_to_meta: dict, top_n: int = 3) -> list:
    raw_results = fuzz_process.extract(
        mention_text,
        title_strings,
        scorer=Levenshtein.normalized_distance,
        limit=top_n * 5,  # over-fetch; deduplicate by slug below
        score_cutoff=None,
    )

    seen_slugs = {}
    for matched_title, score, idx in raw_results:
        _, slug = all_titles[idx]
        dist = Levenshtein.distance(mention_text, matched_title)
        if slug not in seen_slugs or dist < seen_slugs[slug]["levenshtein_distance"]:
            meta = slug_to_meta.get(slug, {})
            seen_slugs[slug] = {
                "slug": slug,
                "primary_title": meta.get("primary_title", ""),
                "disambiguation": meta.get("disambiguation"),
                "matched_title": matched_title,
                "levenshtein_distance": dist,
            }
        if len(seen_slugs) >= top_n * 2:
            break

    ranked = sorted(seen_slugs.values(), key=lambda x: x["levenshtein_distance"])
    return ranked[:top_n]


# ---------------------------------------------------------------------------
# Sampling
# ---------------------------------------------------------------------------

def _query_docs(status: str, sample_size: int | None):
    """Return linker_output docs containing named-entity spans of the requested status."""
    if status == "succeeded":
        ne = {"type": "named-entity", "failed": False, "ambiguous": False}
    elif status == "ambiguous":
        ne = {"type": "named-entity", "ambiguous": True, "failed": False}
    elif status == "failed":
        ne = {"type": "named-entity", "failed": True}
    elif status == "no-failed":
        ne = {"$or": [
            {"type": "named-entity", "failed": False, "ambiguous": False},
            {"type": "named-entity", "ambiguous": True, "failed": False},
        ]}
    else:  # all
        ne = {"type": "named-entity"}

    match = {"language": "he", "spans": {"$elemMatch": ne}}
    if sample_size is not None:
        pipeline = [{"$match": match}, {"$sample": {"size": sample_size}}]
        return db.linker_output.aggregate(pipeline, allowDiskUse=True)
    return db.linker_output.find(match)


def _group_ne_spans_by_char_range(spans: list) -> dict:
    """Group named-entity spans by charRange tuple → list of spans."""
    groups: dict[tuple, list] = {}
    for span in spans:
        if span.get("type") != "named-entity":
            continue
        key = tuple(span.get("charRange", []))
        if len(key) == 2:
            groups.setdefault(key, []).append(span)
    return groups


# ---------------------------------------------------------------------------
# In-memory indexes
# ---------------------------------------------------------------------------

def load_passage_index() -> dict[str, list[str]]:
    """Map each segment ref → its passage's ref_list (first match wins)."""
    index: dict[str, list[str]] = {}
    for doc in tqdm(db.passage.find({}, {"ref_list": 1}), desc="passages", unit="passage"):
        ref_list = doc.get("ref_list", [])
        for ref in ref_list:
            if ref not in index:
                index[ref] = ref_list
    return index


def load_intra_topic_index() -> dict[str, set[str]]:
    """Map each slug → set of slugs it is linked to (in either direction)."""
    index: dict[str, set[str]] = {}
    for doc in tqdm(db.topic_links.find({"class": "intraTopic"}, {"fromTopic": 1, "toTopic": 1}),
                    desc="intra-topic links", unit="link"):
        a, b = doc.get("fromTopic"), doc.get("toTopic")
        if a and b:
            index.setdefault(a, set()).add(b)
            index.setdefault(b, set()).add(a)
    return index


# ---------------------------------------------------------------------------
# Passage co-occurrence lookup
# ---------------------------------------------------------------------------

def _passage_topics(context_ref: str, passage_index: dict[str, list[str]]) -> set[str]:
    """
    Return all topic slugs that have a named-entity mention in linker_output for
    any ref in the first passage containing context_ref.
    """
    ref_list = passage_index.get(context_ref) or [context_ref]
    slugs = set()
    for doc in db.linker_output.find({"ref": {"$in": ref_list}}, {"spans": 1}):
        for span in doc.get("spans", []):
            if span.get("type") == "named-entity" and not span.get("failed") and span.get("topicSlug"):
                slugs.add(span["topicSlug"])
    return slugs


def _topics_linked_to_candidate(candidate_slug: str, passage_topics: set[str],
                                 intra_index: dict[str, set[str]]) -> list[str]:
    """
    Among the topics present in the passage, return those linked to candidate_slug.
    """
    if not passage_topics:
        return []
    linked = intra_index.get(candidate_slug, set())
    return sorted(linked & passage_topics)


# ---------------------------------------------------------------------------
# Main record builder
# ---------------------------------------------------------------------------

def generate_records(docs, slug_to_meta: dict, all_titles: list, title_strings: list, status_filter: str,
                     passage_index: dict, intra_index: dict, text_index: dict):
    """Generator — yields one record dict at a time to avoid holding all records in RAM."""
    for doc in tqdm(docs, desc="building records", unit="doc"):
        ref = doc["ref"]
        version_title = doc.get("versionTitle", "")
        language = doc.get("language", "en")
        text = _get_segment_text(ref, version_title, language, text_index)
        passage_topics = _passage_topics(ref, passage_index)

        span_groups = _group_ne_spans_by_char_range(doc.get("spans", []))

        for (char_start, char_end), group in span_groups.items():
            is_ambiguous = any(s.get("ambiguous") and not s.get("failed") for s in group)
            is_failed = any(s.get("failed") for s in group)
            is_succeeded = not is_ambiguous and not is_failed

            if status_filter == "succeeded" and not is_succeeded:
                continue
            if status_filter == "ambiguous" and not is_ambiguous:
                continue
            if status_filter == "failed" and not is_failed:
                continue
            if status_filter == "no-failed" and is_failed:
                continue

            mention_text = group[0].get("text", "")
            context = _build_context(text, char_start, char_end, mention_text) if text else None

            if is_succeeded:
                slug = group[0].get("topicSlug")
                if not slug:
                    continue
                meta = slug_to_meta.get(slug, {})
                candidates = [{
                    "slug": slug,
                    "primary_title": meta.get("primary_title", ""),
                    "disambiguation": meta.get("disambiguation"),
                    "cooccurring_topics": _topics_linked_to_candidate(slug, passage_topics, intra_index),
                }]
                record_status = "succeeded"
            elif is_ambiguous:
                candidates = []
                seen = set()
                for span in group:
                    slug = span.get("topicSlug")
                    if slug and slug not in seen:
                        seen.add(slug)
                        meta = slug_to_meta.get(slug, {})
                        candidates.append({
                            "slug": slug,
                            "primary_title": meta.get("primary_title", ""),
                            "disambiguation": meta.get("disambiguation"),
                            "cooccurring_topics": _topics_linked_to_candidate(slug, passage_topics, intra_index),
                        })
                record_status = "ambiguous"
            else:
                candidates = find_nearest_topics(mention_text, all_titles, title_strings, slug_to_meta)
                for cand in candidates:
                    cand["cooccurring_topics"] = _topics_linked_to_candidate(cand["slug"], passage_topics, intra_index)
                record_status = "failed"

            yield {
                "ref": ref,
                "version_title": version_title,
                "language": language,
                "mention_text": mention_text,
                "char_range": [char_start, char_end],
                "context": context,
                "status": record_status,
                "candidates": candidates,
            }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sample-size", type=int, default=300,
                        help="Number of linker_output documents to sample (default: 300)")
    parser.add_argument("--all", action="store_true",
                        help="Run on the entire linker_output collection instead of sampling")
    parser.add_argument("--status", choices=["all", "succeeded", "ambiguous", "failed", "no-failed"],
                        default="all",
                        help="Which mention types to include (default: all). "
                             "'no-failed' includes succeeded + ambiguous.")
    parser.add_argument("--exclude-failed", action="store_true",
                        help="Exclude failed (unresolved) spans; equivalent to --status no-failed")
    parser.add_argument("--output", default=None,
                        help="Output CSV file path (default: stdout)")
    parser.add_argument("--seed", type=int, default=None,
                        help="Random seed for reproducibility")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.exclude_failed:
        args.status = "no-failed"
    if args.seed is not None:
        random.seed(args.seed)

    slug_to_meta, all_titles = build_topic_index()
    title_strings = [t for t, _ in all_titles]  # extracted once; reused across all find_nearest_topics calls
    passage_index = load_passage_index()
    intra_index = load_intra_topic_index()
    text_index = load_text_index()

    status_filter = args.status
    sample_size = None if args.all else args.sample_size
    mode = "full collection" if args.all else f"sample of {args.sample_size}"
    print(f"Querying linker_output ({mode}, status={args.status})...", file=sys.stderr)
    docs = _query_docs(args.status, sample_size)

    CSV_FIELDS = [
        "ref", "version_title", "language",
        "mention_text", "char_range_start", "char_range_end",
        "context", "status",
        "candidate_slugs", "candidate_primary_titles",
        "candidate_disambiguations", "matched_titles", "levenshtein_distances",
        "candidate_cooccurring_topics",
    ]

    out = open(args.output, "w", encoding="utf-8", newline="") if args.output else sys.stdout
    try:
        writer = csv.DictWriter(out, fieldnames=CSV_FIELDS)
        writer.writeheader()
        row_count = 0
        for rec in generate_records(docs, slug_to_meta, all_titles, title_strings, status_filter, passage_index, intra_index, text_index):
            cands = rec["candidates"]
            writer.writerow({
                "ref": rec["ref"],
                "version_title": rec["version_title"],
                "language": rec["language"],
                "mention_text": rec["mention_text"],
                "char_range_start": rec["char_range"][0],
                "char_range_end": rec["char_range"][1],
                "context": rec["context"] or "",
                "status": rec["status"],
                "candidate_slugs": "|".join(c["slug"] for c in cands),
                "candidate_primary_titles": "|".join(c.get("primary_title", "") for c in cands),
                "candidate_disambiguations": "|".join(c.get("disambiguation") or "" for c in cands),
                "matched_titles": "|".join(c.get("matched_title", "") for c in cands),
                "levenshtein_distances": "|".join(str(c["levenshtein_distance"]) if "levenshtein_distance" in c else "" for c in cands),
                "candidate_cooccurring_topics": "|".join(
                    ",".join(c.get("cooccurring_topics", [])) for c in cands
                ),
            })
            row_count += 1
    finally:
        if args.output:
            out.close()

    print(f"Done. Wrote {row_count} rows.", file=sys.stderr)


if __name__ == "__main__":
    main()
