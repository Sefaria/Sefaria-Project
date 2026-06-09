#!/usr/bin/env python
"""
Populate local Elasticsearch text index with first-chapter samples from
every primary Tanakh book and every Bavli tractate, across all versions.

Broader than populate_sample_search.py (Genesis 1:1-1:5 only) but still
bounded: one chapter per book gives ~20-40k docs — enough for realistic
search development without a full reindex.

Text cleaning and category path logic is shared with the real indexer
(sefaria/search.py) so results behave the same as production.

Usage:
    PYTHONPATH=/path/to/Sefaria-Project python scripts/populate_tanakh_talmud_search.py --force
"""

import argparse
import os
import re
import sys
from urllib.parse import urlparse

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
import django
django.setup()

from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

from sefaria.model import library, Ref, VersionSet, TextChunk
from sefaria.search import make_text_doc_id, get_search_categories, TextIndexer

TEXT_INDEX = os.getenv("SEARCH_INDEX_NAME_TEXT", "text")
SEARCH_URL = os.getenv("SEARCH_URL", "http://localhost:9200")


def is_local_url(url):
    parsed = urlparse(url)
    return parsed.hostname in {"localhost", "127.0.0.1", "::1"}


def analyzer_settings():
    return {
        "analysis": {
            "analyzer": {
                "exact_english": {
                    "tokenizer": "standard",
                    "filter": ["lowercase", "asciifolding"],
                },
                "stemmed_english": {
                    "tokenizer": "standard",
                    "filter": ["lowercase", "asciifolding", "english_stemmer"],
                },
            },
            "filter": {
                "english_stemmer": {"type": "stemmer", "language": "english"},
            },
        },
    }


def text_mapping():
    return {
        "_source": {"excludes": ["linked_refs"]},
        "properties": {
            "ref":                  {"type": "keyword"},
            "heRef":                {"type": "keyword"},
            "version":              {"type": "keyword"},
            "lang":                 {"type": "keyword"},
            "version_priority":     {"type": "integer", "index": False},
            "titleVariants":        {"type": "keyword"},
            "categories":           {"type": "keyword"},
            "category":             {"type": "keyword"},
            "he_category":          {"type": "keyword"},
            "index_title":          {"type": "keyword"},
            "he_index_title":       {"type": "keyword"},
            "path":                 {"type": "keyword"},
            "he_path":              {"type": "keyword"},
            "order":                {"type": "keyword"},
            "pagesheetrank":        {"type": "double", "index": False},
            "comp_date":            {"type": "integer", "index": False},
            "exact":                {"type": "text", "analyzer": "exact_english"},
            "naive_lemmatizer": {
                "type": "text",
                "analyzer": "stemmed_english",
                "fields": {"exact": {"type": "text", "analyzer": "exact_english"}},
            },
            "hebrew_version_title": {"type": "keyword"},
            "languageFamilyName":   {"type": "keyword"},
            "isPrimary":            {"type": "boolean"},
            "linked_refs":          {"type": "keyword"},
        },
    }


def create_index_with_alias(es, alias_name, backing_name, force):
    if es.indices.exists(index=backing_name):
        if not force:
            raise RuntimeError(
                f"{backing_name} already exists. Re-run with --force to recreate."
            )
        es.indices.delete(index=backing_name)

    if es.indices.exists(index=alias_name):
        if not force:
            raise RuntimeError(
                f"{alias_name} exists as a concrete index. Re-run with --force to replace it."
            )
        es.indices.delete(index=alias_name)

    es.indices.create(
        index=backing_name,
        settings=analyzer_settings(),
        mappings=text_mapping(),
    )
    if es.indices.exists_alias(name=alias_name):
        es.indices.delete_alias(index="*", name=alias_name)
    es.indices.put_alias(index=backing_name, name=alias_name)


def get_primary_indexes(top_level_categories):
    """
    Return Index records whose categories[0] is one of top_level_categories.
    library.get_indexes_in_category can return commentaries that live under a
    different root, so we filter by categories[0] to stay primary-text-only.
    """
    seen = set()
    results = []
    for cat in top_level_categories:
        for idx in library.get_indexes_in_category(cat, full_records=True):
            if idx.categories[0] == cat and idx.title not in seen:
                seen.add(idx.title)
                results.append(idx)
    return results


def docs_for_book(idx, backing_index):
    """
    Yield ES bulk action dicts for the first chapter of `idx`.
    One doc per leaf-ref × version. Skips empty content silently.
    """
    try:
        first_section = Ref(idx.title).first_available_section_ref()
        leaf_refs = first_section.all_subrefs() or [first_section]
    except Exception as e:
        print(f"    [skip] {idx.title}: could not get refs — {e}")
        return

    versions = list(VersionSet({"title": idx.title}))
    if not versions:
        print(f"    [skip] {idx.title}: no versions in DB")
        return

    # Book-level fields computed once per index
    categories = idx.categories
    try:
        he_title = idx.get_title("he") or ""
    except Exception:
        he_title = ""
    try:
        tp = idx.best_time_period()
        comp_date = int(getattr(tp, "end", None) or getattr(tp, "start", 3000))
    except Exception:
        comp_date = 3000

    for oref in leaf_refs:
        try:
            indexed_cats = get_search_categories(oref, categories)
            title_variants = oref.index_node.all_tree_titles("en")
            order = oref.order_id()
            tref = oref.normal()
            he_ref = oref.he_normal()
        except Exception:
            continue

        path = "/".join(indexed_cats + [idx.title])

        for priority, v in enumerate(versions):
            try:
                raw = TextChunk(oref, v.language, vtitle=v.versionTitle).text
            except Exception:
                continue

            if isinstance(raw, list):
                raw = " ".join(str(x) for x in raw if x)

            # Use the same text cleaning pipeline as the real indexer
            content = TextIndexer.modify_text_in_doc(raw)
            if not content:
                continue

            lang_family = (
                getattr(v, "languageFamilyName", None)
                or ("hebrew" if v.language == "he" else "english")
            )

            doc = {
                "ref":                  tref,
                "heRef":                he_ref,
                "version":              v.versionTitle,
                "lang":                 v.language,
                "version_priority":     priority,
                "titleVariants":        title_variants,
                "categories":           indexed_cats,
                "category":             indexed_cats[0] if indexed_cats else "",
                "he_category":          he_title,
                "index_title":          idx.title,
                "he_index_title":       he_title,
                "path":                 path,
                "he_path":              "",
                "order":                order,
                "pagesheetrank":        0.1,
                "comp_date":            comp_date,
                "exact":                content,
                "naive_lemmatizer":     content,
                "hebrew_version_title": getattr(v, "versionTitleInHebrew", None),
                "languageFamilyName":   lang_family,
                "isPrimary":            bool(getattr(v, "isPrimary", False)),
                "linked_refs":          [],
            }

            yield {
                "_index": backing_index,
                "_id": make_text_doc_id(tref, v.versionTitle, v.language),
                "_source": doc,
            }


def main():
    parser = argparse.ArgumentParser(
        description="Populate local ES with first-chapter samples from Tanakh + Talmud."
    )
    parser.add_argument("--url", default=SEARCH_URL,
                        help="Elasticsearch URL (default: SEARCH_URL env or localhost:9200)")
    parser.add_argument("--force", action="store_true",
                        help="Recreate the text index if it already exists.")
    parser.add_argument("--allow-nonlocal", action="store_true",
                        help="Allow writing to a non-localhost ES instance.")
    parser.add_argument("--chunk-size", type=int, default=500,
                        help="Docs per bulk request (default: 500).")
    args = parser.parse_args()

    if not args.allow_nonlocal and not is_local_url(args.url):
        raise RuntimeError(f"Refusing to write sample data to non-local ES: {args.url}")

    es = Elasticsearch(args.url)
    if not es.ping():
        raise RuntimeError(f"Could not connect to Elasticsearch at {args.url}")

    backing = f"{TEXT_INDEX}-a"
    create_index_with_alias(es, TEXT_INDEX, backing, args.force)
    print(f"Index ready: {TEXT_INDEX} -> {backing}\n")

    indexes = get_primary_indexes(["Tanakh", "Talmud"])
    print(f"Books to index: {len(indexes)}  (first chapter of each, all versions)\n")

    total_docs = 0
    skipped = []

    for i, idx in enumerate(indexes, 1):
        book_docs = list(docs_for_book(idx, backing))
        if not book_docs:
            skipped.append(idx.title)
            continue
        try:
            bulk(es, book_docs, chunk_size=args.chunk_size)
            total_docs += len(book_docs)
            print(f"  [{i:>3}/{len(indexes)}] {idx.title:<50} {len(book_docs):>5} docs")
        except Exception as e:
            print(f"  [{i:>3}/{len(indexes)}] {idx.title}: bulk failed — {e}")
            skipped.append(idx.title)

    print(f"\nDone. {total_docs} docs across {len(indexes) - len(skipped)} books.")
    if skipped:
        print(f"Skipped ({len(skipped)}): {skipped}")
    print(f"\nTry: curl 'http://localhost:9200/{TEXT_INDEX}/_search?q=land&pretty'")


if __name__ == "__main__":
    main()
