#!/usr/bin/env python
"""
Create tiny local Elasticsearch indices for Sefaria search development.

This intentionally avoids the full Mongo-backed reindex in scripts/sindex.py.
It creates the same alias shape used by the app:

    text  -> text-a
    sheet -> sheet-a

The documents are synthetic, but their fields match the structures produced by
sefaria.search.TextIndexer and sefaria.search.index_sheet closely enough for
local search-wrapper and UI development.
"""
import argparse
import os
from datetime import datetime, timezone
from urllib.parse import urlparse

from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk


TEXT_INDEX = os.getenv("SEARCH_INDEX_NAME_TEXT", "text")
SHEET_INDEX = os.getenv("SEARCH_INDEX_NAME_SHEET", "sheet")
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
                "english_stemmer": {
                    "type": "stemmer",
                    "language": "english",
                },
            },
        },
    }


def text_mapping():
    return {
        "_source": {
            "excludes": ["linked_refs"],
        },
        "properties": {
            "ref": {"type": "keyword"},
            "heRef": {"type": "keyword"},
            "version": {"type": "keyword"},
            "lang": {"type": "keyword"},
            "version_priority": {"type": "integer", "index": False},
            "titleVariants": {"type": "keyword"},
            "categories": {"type": "keyword"},
            "category": {"type": "keyword"},
            "he_category": {"type": "keyword"},
            "index_title": {"type": "keyword"},
            "he_index_title": {"type": "keyword"},
            "path": {"type": "keyword"},
            "he_path": {"type": "keyword"},
            "order": {"type": "keyword"},
            "pagesheetrank": {"type": "double", "index": False},
            "comp_date": {"type": "integer", "index": False},
            "exact": {"type": "text", "analyzer": "exact_english"},
            "naive_lemmatizer": {
                "type": "text",
                "analyzer": "stemmed_english",
                "fields": {
                    "exact": {"type": "text", "analyzer": "exact_english"},
                },
            },
            "hebrew_version_title": {"type": "keyword"},
            "languageFamilyName": {"type": "keyword"},
            "isPrimary": {"type": "boolean"},
            "linked_refs": {"type": "keyword"},
        },
    }


def sheet_mapping():
    return {
        "properties": {
            "owner_name": {"type": "keyword"},
            "tags": {"type": "keyword"},
            "topics_en": {"type": "keyword"},
            "topics_he": {"type": "keyword"},
            "topic_slugs": {"type": "keyword"},
            "owner_image": {"type": "keyword"},
            "datePublished": {"type": "date"},
            "dateCreated": {"type": "date"},
            "dateModified": {"type": "date"},
            "sheetId": {"type": "integer"},
            "collections": {"type": "keyword"},
            "title": {"type": "keyword"},
            "views": {"type": "integer"},
            "summary": {"type": "keyword"},
            "content": {"type": "text", "analyzer": "stemmed_english"},
            "version": {"type": "keyword"},
            "profile_url": {"type": "keyword"},
            "owner_id": {"type": "integer"},
        },
    }


def create_index_with_alias(es, alias_name, backing_name, mapping, force):
    if es.indices.exists(index=backing_name):
        if not force:
            raise RuntimeError(f"{backing_name} already exists. Re-run with --force to recreate sample data.")
        es.indices.delete(index=backing_name)

    if es.indices.exists(index=alias_name):
        if not force:
            raise RuntimeError(f"{alias_name} exists as a concrete index. Re-run with --force to replace it.")
        es.indices.delete(index=alias_name)

    es.indices.create(
        index=backing_name,
        settings=analyzer_settings(),
        mappings=mapping,
    )

    if es.indices.exists_alias(name=alias_name):
        es.indices.delete_alias(index="*", name=alias_name)
    es.indices.put_alias(index=backing_name, name=alias_name)


def sample_text_docs():
    return [
        {
            "_index": "text-a",
            "_id": "Genesis 1:1 (Sample English Translation [en])",
            "_source": {
                "ref": "Genesis 1:1",
                "heRef": "בראשית א׳:א׳",
                "version": "Sample English Translation",
                "lang": "en",
                "version_priority": 0,
                "titleVariants": ["Genesis", "Bereshit", "Bereishit"],
                "categories": ["Tanakh", "Torah"],
                "category": "Tanakh",
                "he_category": "תנ״ך",
                "index_title": "Genesis",
                "he_index_title": "בראשית",
                "path": "Tanakh/Torah/Genesis",
                "he_path": "תנ״ך/תורה/בראשית",
                "order": "01-01-001-001",
                "pagesheetrank": 0.25,
                "comp_date": -1300,
                "exact": "In the beginning God created the heavens and the earth.",
                "naive_lemmatizer": "In the beginning God created the heavens and the earth.",
                "hebrew_version_title": None,
                "languageFamilyName": "english",
                "isPrimary": False,
                "linked_refs": ["Rashi on Genesis 1:1:1"],
            },
        },
        {
            "_index": "text-a",
            "_id": "Genesis 1:2 (Sample English Translation [en])",
            "_source": {
                "ref": "Genesis 1:2",
                "heRef": "בראשית א׳:ב׳",
                "version": "Sample English Translation",
                "lang": "en",
                "version_priority": 0,
                "titleVariants": ["Genesis", "Bereshit", "Bereishit"],
                "categories": ["Tanakh", "Torah"],
                "category": "Tanakh",
                "he_category": "תנ״ך",
                "index_title": "Genesis",
                "he_index_title": "בראשית",
                "path": "Tanakh/Torah/Genesis",
                "he_path": "תנ״ך/תורה/בראשית",
                "order": "01-01-001-002",
                "pagesheetrank": 0.18,
                "comp_date": -1300,
                "exact": "The earth was without form and void, and darkness was over the deep.",
                "naive_lemmatizer": "The earth was without form and void, and darkness was over the deep.",
                "hebrew_version_title": None,
                "languageFamilyName": "english",
                "isPrimary": False,
                "linked_refs": [],
            },
        },
        {
            "_index": "text-a",
            "_id": "Pirkei Avot 1:1 (Sample English Translation [en])",
            "_source": {
                "ref": "Pirkei Avot 1:1",
                "heRef": "משנה אבות א׳:א׳",
                "version": "Sample English Translation",
                "lang": "en",
                "version_priority": 0,
                "titleVariants": ["Pirkei Avot", "Avot", "Ethics of the Fathers"],
                "categories": ["Mishnah", "Seder Nezikin"],
                "category": "Mishnah",
                "he_category": "משנה",
                "index_title": "Pirkei Avot",
                "he_index_title": "משנה אבות",
                "path": "Mishnah/Seder Nezikin/Pirkei Avot",
                "he_path": "משנה/סדר נזיקין/משנה אבות",
                "order": "03-04-001-001",
                "pagesheetrank": 0.12,
                "comp_date": 200,
                "exact": "Moses received the Torah from Sinai and transmitted it to Joshua.",
                "naive_lemmatizer": "Moses received the Torah from Sinai and transmitted it to Joshua.",
                "hebrew_version_title": None,
                "languageFamilyName": "english",
                "isPrimary": False,
                "linked_refs": [],
            },
        },
        {
            "_index": "text-a",
            "_id": "Mishneh Torah, Prayer and the Priestly Blessing 1:1 (Mishneh Torah, trans. by Eliyahu Touger. Jerusalem, Moznaim Pub. c1986-c2007 [en])",
            "_source": {
                "ref": "Mishneh Torah, Prayer and the Priestly Blessing 1:1",
                "heRef": "משנה תורה, הלכות תפילה וברכת כהנים א׳:א׳",
                "version": "Mishneh Torah, trans. by Eliyahu Touger. Jerusalem, Moznaim Pub. c1986-c2007",
                "lang": "en",
                "version_priority": 0,
                "titleVariants": [
                    "Mishneh Torah, Prayer and the Priestly Blessing",
                    "Mishneh Torah, Laws of Prayer and the Priestly Blessing",
                    "Rambam, Prayer and the Priestly Blessing",
                    "Rambam, Hilkhot Tefillah",
                    "Hilchot Tefilah and Birkat Kohanim",
                ],
                "categories": ["Halakhah", "Mishneh Torah", "Sefer Ahavah"],
                "category": "Halakhah",
                "he_category": "הלכה",
                "index_title": "Mishneh Torah, Prayer and the Priestly Blessing",
                "he_index_title": "משנה תורה, הלכות תפילה וברכת כהנים",
                "path": "Halakhah/Mishneh Torah/Sefer Ahavah/Mishneh Torah, Prayer and the Priestly Blessing",
                "he_path": "הלכה/משנה תורה/ספר אהבה/משנה תורה, הלכות תפילה וברכת כהנים",
                "order": "11-02-001-001",
                "pagesheetrank": 0.2,
                "comp_date": 1180,
                "exact": (
                    "It is a positive Torah commandment to pray every day, as Exodus 23:25 states: "
                    '"You shall serve God, your Lord." Tradition teaches us that this service is prayer. '
                    "The number of prayers is not prescribed in the Torah, nor does it prescribe a specific "
                    "formula for prayer. Also, according to Torah law, there are no fixed times for prayers."
                ),
                "naive_lemmatizer": (
                    "It is a positive Torah commandment to pray every day, as Exodus 23:25 states: "
                    '"You shall serve God, your Lord." Tradition teaches us that this service is prayer. '
                    "The number of prayers is not prescribed in the Torah, nor does it prescribe a specific "
                    "formula for prayer. Also, according to Torah law, there are no fixed times for prayers."
                ),
                "hebrew_version_title": None,
                "languageFamilyName": "english",
                "isPrimary": False,
                "linked_refs": ["Exodus 23:25", "Deuteronomy 11:13"],
            },
        },
        {
            "_index": "text-a",
            "_id": "Mishneh Torah, Prayer and the Priestly Blessing 1:5 (Mishneh Torah, trans. by Eliyahu Touger. Jerusalem, Moznaim Pub. c1986-c2007 [en])",
            "_source": {
                "ref": "Mishneh Torah, Prayer and the Priestly Blessing 1:5",
                "heRef": "משנה תורה, הלכות תפילה וברכת כהנים א׳:ה׳",
                "version": "Mishneh Torah, trans. by Eliyahu Touger. Jerusalem, Moznaim Pub. c1986-c2007",
                "lang": "en",
                "version_priority": 0,
                "titleVariants": [
                    "Mishneh Torah, Prayer and the Priestly Blessing",
                    "Mishneh Torah, Laws of Prayer and the Priestly Blessing",
                    "Rambam, Prayer and the Priestly Blessing",
                    "Rambam, Hilkhot Tefillah",
                    "Hilchot Tefilah and Birkat Kohanim",
                ],
                "categories": ["Halakhah", "Mishneh Torah", "Sefer Ahavah"],
                "category": "Halakhah",
                "he_category": "הלכה",
                "index_title": "Mishneh Torah, Prayer and the Priestly Blessing",
                "he_index_title": "משנה תורה, הלכות תפילה וברכת כהנים",
                "path": "Halakhah/Mishneh Torah/Sefer Ahavah/Mishneh Torah, Prayer and the Priestly Blessing",
                "he_path": "הלכה/משנה תורה/ספר אהבה/משנה תורה, הלכות תפילה וברכת כהנים",
                "order": "11-02-001-005",
                "pagesheetrank": 0.16,
                "comp_date": 1180,
                "exact": (
                    "They also decreed that the number of prayers correspond to the number of sacrifices, "
                    "two prayers every day corresponding to the two daily sacrifices. The prayer that "
                    "corresponds to the daily morning sacrifice is called the Shacharit Prayer."
                ),
                "naive_lemmatizer": (
                    "They also decreed that the number of prayers correspond to the number of sacrifices, "
                    "two prayers every day corresponding to the two daily sacrifices. The prayer that "
                    "corresponds to the daily morning sacrifice is called the Shacharit Prayer."
                ),
                "hebrew_version_title": None,
                "languageFamilyName": "english",
                "isPrimary": False,
                "linked_refs": [],
            },
        },
    ]


def sample_sheet_docs(now):
    return [
        {
            "_index": "sheet-a",
            "_id": "100001",
            "_source": {
                "sheetId": 100001,
                "title": "Sample Sources on Creation",
                "summary": "A local sample source sheet for Elasticsearch development.",
                "content": "Creation beginning heavens earth Genesis Torah source sheet sample.",
                "owner_name": "Local Dev User",
                "owner_image": "",
                "owner_id": 1,
                "profile_url": "/profile/local-dev-user",
                "tags": ["creation", "genesis", "sample"],
                "topics_en": ["Creation", "Genesis"],
                "topics_he": ["בריאה", "בראשית"],
                "topic_slugs": ["creation", "genesis"],
                "collections": ["Sample Collection"],
                "views": 42,
                "datePublished": now,
                "dateCreated": now,
                "dateModified": now,
                "version": "1",
            },
        },
        {
            "_index": "sheet-a",
            "_id": "100002",
            "_source": {
                "sheetId": 100002,
                "title": "Sample Sources on Torah Transmission",
                "summary": "A local sample sheet about Pirkei Avot.",
                "content": "Moses received Torah Sinai Joshua elders prophets Pirkei Avot sample.",
                "owner_name": "Local Dev User",
                "owner_image": "",
                "owner_id": 1,
                "profile_url": "/profile/local-dev-user",
                "tags": ["torah", "pirkei avot", "sample"],
                "topics_en": ["Torah", "Pirkei Avot"],
                "topics_he": ["תורה", "משנה אבות"],
                "topic_slugs": ["torah", "pirkei-avot"],
                "collections": ["Sample Collection"],
                "views": 18,
                "datePublished": now,
                "dateCreated": now,
                "dateModified": now,
                "version": "1",
            },
        },
        {
            "_index": "sheet-a",
            "_id": "100003",
            "_source": {
                "sheetId": 100003,
                "title": "Sample Sources on Rambam and Prayer",
                "summary": "A local sample source sheet using Mishneh Torah, Prayer and the Priestly Blessing.",
                "content": (
                    "Rambam Mishneh Torah prayer daily commandment Shacharit Minchah Musaf "
                    "Hilchot Tefillah source sheet sample."
                ),
                "owner_name": "Local Dev User",
                "owner_image": "",
                "owner_id": 1,
                "profile_url": "/profile/local-dev-user",
                "tags": ["rambam", "mishneh torah", "prayer", "sample"],
                "topics_en": ["Rambam", "Prayer", "Mishneh Torah"],
                "topics_he": ["רמב״ם", "תפילה", "משנה תורה"],
                "topic_slugs": ["rambam", "prayer", "mishneh-torah"],
                "collections": ["Sample Collection"],
                "views": 27,
                "datePublished": now,
                "dateCreated": now,
                "dateModified": now,
                "version": "1",
            },
        },
    ]


def main():
    parser = argparse.ArgumentParser(description="Populate local Elasticsearch with tiny Sefaria sample indices.")
    parser.add_argument("--url", default=SEARCH_URL, help="Elasticsearch URL. Defaults to SEARCH_URL or localhost.")
    parser.add_argument("--force", action="store_true", help="Recreate sample backing indices if they already exist.")
    parser.add_argument("--allow-nonlocal", action="store_true", help="Allow non-local Elasticsearch URLs.")
    args = parser.parse_args()

    if not args.allow_nonlocal and not is_local_url(args.url):
        raise RuntimeError(f"Refusing to write sample data to non-local Elasticsearch URL: {args.url}")

    es = Elasticsearch(args.url)
    if not es.ping():
        raise RuntimeError(f"Could not connect to Elasticsearch at {args.url}")

    text_backing = f"{TEXT_INDEX}-a"
    sheet_backing = f"{SHEET_INDEX}-a"
    create_index_with_alias(es, TEXT_INDEX, text_backing, text_mapping(), args.force)
    create_index_with_alias(es, SHEET_INDEX, sheet_backing, sheet_mapping(), args.force)

    now = datetime.now(timezone.utc).isoformat()
    text_docs = sample_text_docs()
    sheet_docs = sample_sheet_docs(now)
    for doc in text_docs:
        doc["_index"] = text_backing
    for doc in sheet_docs:
        doc["_index"] = sheet_backing

    bulk(es, text_docs + sheet_docs, refresh=True)

    print(f"Created alias {TEXT_INDEX} -> {text_backing} with {len(text_docs)} text docs")
    print(f"Created alias {SHEET_INDEX} -> {sheet_backing} with {len(sheet_docs)} sheet docs")
    print("Try: curl 'http://localhost:9200/text/_search?q=beginning&pretty'")


if __name__ == "__main__":
    main()
