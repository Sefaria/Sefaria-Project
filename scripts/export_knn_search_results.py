#!/usr/bin/env python3
"""
Export Sefaria KNN search results for a CSV of natural-language queries.

Example:
    SEFARIA_KNN_AUTH_TOKEN=... python scripts/export_knn_search_results.py
"""

import argparse
import csv
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None


DEFAULT_INPUT = Path("data/private/dataset_natural_language_search.csv")
DEFAULT_OUTPUT = Path("data/private/dataset_natural_language_search_knn_results.csv")
DEFAULT_API_URL = "https://www.sefaria.org/api/knn-search"
DEFAULT_QUERY_COLUMN = "Simplified Search"
RAW_QUERY_COLUMN = "User Query (click to open in Braintrust)"
OUTPUT_FIELDS = [
    "query",
    "ref result",
    "linker_or_semantic",
    "distance (if semantic)",
    "en text",
    "he text",
    "en text source",
    "he text source",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Call /api/knn-search for each query in a CSV and flatten the top results."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help=f"Input CSV. Default: {DEFAULT_INPUT}")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help=f"Output CSV. Default: {DEFAULT_OUTPUT}")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"KNN search endpoint. Default: {DEFAULT_API_URL}")
    parser.add_argument(
        "--auth-token",
        default=os.environ.get("SEFARIA_KNN_AUTH_TOKEN"),
        help="Bearer token for /api/knn-search. Defaults to SEFARIA_KNN_AUTH_TOKEN.",
    )
    parser.add_argument(
        "--query-column",
        default=DEFAULT_QUERY_COLUMN,
        help=f"Column to search. Default: {DEFAULT_QUERY_COLUMN!r}. Use {RAW_QUERY_COLUMN!r} for raw queries.",
    )
    parser.add_argument("--limit", type=int, default=10, help="Number of semantic results per query. Default: 10")
    parser.add_argument("--linked-ref-limit", type=int, default=10, help="Number of linker results per query. Default: 10")
    parser.add_argument(
        "--no-linked-refs",
        action="store_true",
        help="Only export semantic results; do not request linked-ref/linker enhancements.",
    )
    parser.add_argument(
        "--no-hydrate-texts",
        action="store_true",
        help="Do not call /api/texts to fill missing English/Hebrew text for result refs.",
    )
    parser.add_argument(
        "--no-normalize-texts",
        action="store_true",
        help="Do not apply linker normalizers to the English and Hebrew text columns.",
    )
    parser.add_argument("--sleep", type=float, default=0.0, help="Seconds to sleep between queries. Default: 0")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP timeout in seconds. Default: 30")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite the output CSV if it exists.")
    return parser.parse_args()


def require_valid_args(args: argparse.Namespace) -> None:
    if not args.input.exists():
        raise SystemExit(f"Input CSV not found: {args.input}")
    if args.output.exists() and not args.overwrite:
        raise SystemExit(f"Output CSV already exists: {args.output}. Pass --overwrite to replace it.")
    if not args.auth_token:
        raise SystemExit("Missing auth token. Set SEFARIA_KNN_AUTH_TOKEN or pass --auth-token.")
    if args.limit < 1:
        raise SystemExit("--limit must be at least 1")
    if args.linked_ref_limit < 1:
        raise SystemExit("--linked-ref-limit must be at least 1")


def knn_search(session: requests.Session, args: argparse.Namespace, query: str) -> dict[str, Any]:
    payload = {
        "query": query,
        "result_limit": args.limit,
        "include_linked_refs": not args.no_linked_refs,
        "linked_ref_limit": args.linked_ref_limit,
        "include_text": True,
    }
    response = session.post(args.api_url, json=payload, timeout=args.timeout)
    response.raise_for_status()
    return response.json()


def text_api_url(api_url: str, ref: str) -> str:
    base = api_url.split("/api/knn-search", 1)[0]
    return f"{base}/api/texts/{quote(ref, safe='')}?context=0"


def hydrate_ref_texts(
    session: requests.Session,
    api_url: str,
    ref: str,
    timeout: float,
    cache: dict[str, tuple[str, str]],
) -> tuple[str, str]:
    if ref in cache:
        return cache[ref]

    response = session.get(text_api_url(api_url, ref), timeout=timeout)
    response.raise_for_status()
    data = response.json()
    en_text = flatten_text(data.get("text", ""))
    he_text = flatten_text(data.get("he", ""))
    cache[ref] = (en_text, he_text)
    return cache[ref]


def flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(part for part in (flatten_text(item) for item in value) if part)
    return ""


def result_distance(result: dict[str, Any]) -> str:
    for key in ("distance", "score", "similarity"):
        if key in result and result[key] is not None:
            return str(result[key])
    return ""


def get_text_normalizers(args: argparse.Namespace) -> dict[str, Any]:
    if args.no_normalize_texts:
        return {}

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
    import django

    django.setup()
    from sefaria.model.linker.linker_entity_recognizer import get_linker_normalizer

    return {
        "en": get_linker_normalizer("en"),
        "he": get_linker_normalizer("he"),
    }


def normalize_texts(en_text: str, he_text: str, normalizers: dict[str, Any]) -> tuple[str, str]:
    if not normalizers:
        return en_text, he_text
    if en_text:
        en_text = normalizers["en"].normalize(en_text).strip()
    if he_text:
        he_text = normalizers["he"].normalize(he_text).strip()
    return en_text, he_text


def row_texts(
    result: dict[str, Any],
    kind: str,
    session: requests.Session,
    args: argparse.Namespace,
    text_cache: dict[str, tuple[str, str]],
    text_normalizers: dict[str, Any],
) -> tuple[str, str, str, str]:
    ref = result.get("ref", "")
    en_text = ""
    he_text = ""
    en_source = ""
    he_source = ""

    if not args.no_hydrate_texts and ref:
        try:
            en_text, he_text = hydrate_ref_texts(session, args.api_url, ref, args.timeout, text_cache)
            if en_text:
                en_source = "text_api"
            if he_text:
                he_source = "text_api"
        except requests.RequestException as e:
            print(f"Warning: failed to hydrate text for {ref}: {e}", file=sys.stderr)

    inline_text = flatten_text(result.get("text", ""))
    if inline_text:
        language = result.get("language")
        if language == "he":
            he_text = inline_text
            he_source = "knn_search"
        elif language == "en":
            en_text = inline_text
            en_source = "knn_search"
        elif not en_text:
            en_text = inline_text
            en_source = "knn_search"

    en_text, he_text = normalize_texts(en_text, he_text, text_normalizers)
    return en_text, he_text, en_source, he_source


def iter_output_rows(
    query: str,
    response: dict[str, Any],
    session: requests.Session,
    args: argparse.Namespace,
    text_cache: dict[str, tuple[str, str]],
    text_normalizers: dict[str, Any],
) -> list[dict[str, str]]:
    rows = []
    result_groups = [("semantic", response.get("results", []))]
    if not args.no_linked_refs:
        result_groups.append(("linker", response.get("linked_refs", [])))

    for kind, results in result_groups:
        for result in results:
            if not isinstance(result, dict):
                continue
            en_text, he_text, en_source, he_source = row_texts(
                result, kind, session, args, text_cache, text_normalizers
            )
            rows.append({
                "query": query,
                "ref result": result.get("ref", ""),
                "linker_or_semantic": kind,
                "distance (if semantic)": result_distance(result) if kind == "semantic" else "",
                "en text": en_text,
                "he text": he_text,
                "en text source": en_source,
                "he text source": he_source,
            })
    return rows


def main() -> None:
    args = parse_args()
    require_valid_args(args)
    text_normalizers = get_text_normalizers(args)

    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {args.auth_token}",
        "Content-Type": "application/json",
    })
    text_cache: dict[str, tuple[str, str]] = {}

    with args.input.open(newline="", encoding="utf-8-sig") as input_file:
        reader = csv.DictReader(input_file)
        if not reader.fieldnames or args.query_column not in reader.fieldnames:
            raise SystemExit(f"Column {args.query_column!r} not found. Available columns: {reader.fieldnames}")

        args.output.parent.mkdir(parents=True, exist_ok=True)
        input_rows = list(reader)
        progress_rows = tqdm(input_rows, desc="KNN search queries") if tqdm else input_rows

        with args.output.open("w", newline="", encoding="utf-8") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=OUTPUT_FIELDS)
            writer.writeheader()

            for row_num, input_row in enumerate(progress_rows, start=1):
                query = (input_row.get(args.query_column) or "").strip()
                if not query:
                    continue
                try:
                    response = knn_search(session, args, query)
                    writer.writerows(iter_output_rows(query, response, session, args, text_cache, text_normalizers))
                    print(f"{row_num}: wrote results for {query!r}")
                except requests.RequestException as e:
                    print(f"{row_num}: request failed for {query!r}: {e}", file=sys.stderr)
                if args.sleep:
                    time.sleep(args.sleep)


if __name__ == "__main__":
    main()
