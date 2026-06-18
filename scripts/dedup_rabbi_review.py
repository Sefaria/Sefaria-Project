"""
dedup_rabbi_review.py

Outputs two CSVs for manual review of topics marked dedup_needed=true:

1. dedup_matches.csv — each row is a (dedup topic, close Levenshtein match) pair
   among mishnaic-people / talmudic-people.
   Columns: dedup_slug, dedup_he, dedup_en, match_slug, match_he, match_en,
            description_dedup, description_match

2. mentions_sample.csv — 5 random "mention" RefTopicLinks for every mishnaic/
   talmudic person (not just dedup ones).
   Columns: slug, en_title, he_title, ref, url

Usage:
    ./run scripts/dedup_rabbi_review.py [--out-dir /path/to/dir]
"""

import argparse
import csv
import os
import random

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
import django
django.setup()

from sefaria.model import *
from rapidfuzz.distance import Levenshtein

LEVENSHTEIN_THRESHOLD = 0.40   # normalized distance cutoff
MENTIONS_SAMPLE = 5


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _all_titles(topic):
    """Return every title string stored on the topic (all langs)."""
    return [t["text"] for t in getattr(topic, "titles", [])]


def _primary(topic, lang):
    return topic.get_primary_title(lang) or ""


def _description_en(topic):
    return getattr(topic, "description", {}).get("en", "") or ""


def _best_normalized_distance(titles_a, titles_b):
    """Minimum normalized Levenshtein distance across all cross-pairs."""
    best = 1.0
    for ta in titles_a:
        for tb in titles_b:
            if not ta or not tb:
                continue
            d = Levenshtein.normalized_distance(ta, tb)
            if d < best:
                best = d
    return best


def _sefaria_url(ref_str):
    try:
        return "https://www.sefaria.org/" + Ref(ref_str).url()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# load data
# ---------------------------------------------------------------------------

def load_dedup_topics():
    return list(TopicSet({"properties.dedup_needed.value": "true"}))


def load_rabbi_slugs():
    """Return set of slugs that are mishnaic-people or talmudic-people."""
    slugs = set()
    for parent in ("mishnaic-people", "talmudic-people"):
        for link in IntraTopicLinkSet({"toTopic": parent}):
            slugs.add(link.fromTopic)
    return slugs


def load_topics_by_slugs(slugs):
    topics = {}
    for slug in slugs:
        t = Topic.init(slug)
        if t is not None:
            topics[slug] = t
    return topics


# ---------------------------------------------------------------------------
# CSV 1 — dedup matches
# ---------------------------------------------------------------------------

def build_dedup_matches(dedup_topics, rabbi_topics):
    rows = []
    for dedup in dedup_topics:
        dedup_titles = _all_titles(dedup)
        dedup_en = _primary(dedup, "en")
        dedup_he = _primary(dedup, "he")
        dedup_desc = _description_en(dedup)

        for slug, candidate in rabbi_topics.items():
            if slug == dedup.slug:
                continue
            cand_titles = _all_titles(candidate)
            dist = _best_normalized_distance(dedup_titles, cand_titles)
            if dist <= LEVENSHTEIN_THRESHOLD:
                rows.append({
                    "dedup_slug": dedup.slug,
                    "dedup_en": dedup_en,
                    "dedup_he": dedup_he,
                    "match_slug": slug,
                    "match_en": _primary(candidate, "en"),
                    "match_he": _primary(candidate, "he"),
                    "description_dedup": dedup_desc,
                    "description_match": _description_en(candidate),
                    "_dist": round(dist, 3),
                })

    rows.sort(key=lambda r: (r["dedup_slug"], r["_dist"]))
    for r in rows:
        del r["_dist"]
    return rows


DEDUP_COLS = [
    "dedup_slug", "dedup_en", "dedup_he",
    "match_slug", "match_en", "match_he",
    "description_dedup", "description_match",
]


# ---------------------------------------------------------------------------
# CSV 2 — mention samples (all mishnaic + talmudic people)
# ---------------------------------------------------------------------------

def build_mentions_sample(rabbi_topics):
    rows = []
    for slug, topic in rabbi_topics.items():
        links = list(RefTopicLinkSet({"toTopic": slug, "linkType": "mention"}))
        sample = random.sample(links, min(MENTIONS_SAMPLE, len(links)))
        for link in sample:
            rows.append({
                "slug": slug,
                "en_title": _primary(topic, "en"),
                "he_title": _primary(topic, "he"),
                "ref": link.ref,
                "url": _sefaria_url(link.ref),
            })
    return rows


MENTIONS_COLS = ["slug", "en_title", "he_title", "ref", "url"]


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def write_csv(path, cols, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows → {path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default=".", help="Directory for output CSVs")
    args = parser.parse_args()

    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)

    print("Loading dedup topics…")
    dedup_topics = load_dedup_topics()
    print(f"  {len(dedup_topics)} topics need dedup")

    print("Loading mishnaic/talmudic people…")
    rabbi_slugs = load_rabbi_slugs()
    print(f"  {len(rabbi_slugs)} rabbi slugs")

    rabbi_topics = load_topics_by_slugs(rabbi_slugs)
    print(f"  {len(rabbi_topics)} rabbi topics loaded")

    print("Computing Levenshtein matches…")
    match_rows = build_dedup_matches(dedup_topics, rabbi_topics)
    write_csv(os.path.join(out_dir, "dedup_matches.csv"), DEDUP_COLS, match_rows)

    print("Sampling mentions…")
    mention_rows = build_mentions_sample(rabbi_topics)
    write_csv(os.path.join(out_dir, "mentions_sample.csv"), MENTIONS_COLS, mention_rows)


if __name__ == "__main__":
    main()
