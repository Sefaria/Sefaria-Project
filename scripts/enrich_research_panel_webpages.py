#!/usr/bin/env python
"""
Fetch sampled webpage candidates for the research-panel POC.

This is fixture-data enrichment, not a production crawler. It reads the sampled
POC JSON, fetches only webpage resources, extracts readable page text, and adds
simple deterministic citation-window snippets when an anchor ref appears in the
page text.
"""
import argparse
import json
import re
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup


DEFAULT_IN = Path("data/research_panel_poc/nitzavim_candidates_1000.json")
DEFAULT_OUT = Path("data/research_panel_poc/nitzavim_candidates_1000.webpages_enriched.json")

USER_AGENT = (
    "SefariaResearchPanelPOC/0.1 "
    "(fixture enrichment; https://www.sefaria.org/)"
)

REMOVE_TAGS = [
    "script", "style", "noscript", "svg", "canvas", "iframe", "form",
    "header", "footer", "nav", "aside",
]


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def get_meta(soup: BeautifulSoup, *names: str) -> str:
    for name in names:
        tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        if tag and tag.get("content"):
            return normalize_space(tag["content"])
    return ""


def extract_page(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    title = normalize_space(soup.title.get_text(" ")) if soup.title else ""
    description = get_meta(soup, "description", "og:description", "twitter:description")

    for tag_name in REMOVE_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    main = soup.find("article") or soup.find("main") or soup.body or soup
    text = normalize_space(main.get_text(" "))
    return {
        "fetchedTitle": title,
        "fetchedDescription": description,
        "extractedText": text,
    }


def ref_parts(tref: str) -> Optional[tuple[int, int]]:
    match = re.search(r"(\d+):(\d+)", tref)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def citation_patterns(anchor_refs: list[str]) -> list[re.Pattern]:
    variants = []
    for tref in anchor_refs:
        parts = ref_parts(tref)
        if not parts:
            continue
        chapter, verse = parts
        verse_variants = {verse}
        if chapter == 29:
            # Many English sites use the alternate Deuteronomy 29 numbering.
            verse_variants.add(verse + 1)
        for vnum in sorted(verse_variants):
            variants.extend([
                rf"\bDeuteronomy\s+{chapter}[:.]\s*{vnum}\b",
                rf"\bDeut\.?\s+{chapter}[:.]\s*{vnum}\b",
                rf"\bDevarim\s+{chapter}[:.]\s*{vnum}\b",
                rf"\bD['’]?varim\s+{chapter}[:.]\s*{vnum}\b",
            ])
    return [re.compile(pattern, re.IGNORECASE) for pattern in dict.fromkeys(variants)]


def snippet_around(text: str, match: re.Match, window: int) -> str:
    start = max(0, match.start() - window)
    end = min(len(text), match.end() + window)
    snippet = text[start:end].strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet += "..."
    return snippet


def find_citation_snippet(text: str, anchor_refs: list[str], window: int) -> dict[str, Any]:
    for pattern in citation_patterns(anchor_refs):
        match = pattern.search(text)
        if match:
            return {
                "citationFound": True,
                "citationMatch": match.group(0),
                "citationSnippet": snippet_around(text, match, window),
                "snippetMethod": "webpage-citation-window",
            }
    return {
        "citationFound": False,
        "citationMatch": "",
        "citationSnippet": text[: window * 2].strip(),
        "snippetMethod": "webpage-text-preview" if text else "no-text",
    }


def fetch_url(session: requests.Session, url: str, timeout: float) -> dict[str, Any]:
    started = time.time()
    try:
        response = session.get(url, timeout=timeout, allow_redirects=True)
        elapsed_ms = int((time.time() - started) * 1000)
        content_type = response.headers.get("content-type", "")
        html = response.text if "html" in content_type.lower() else ""
        return {
            "fetchOk": response.ok and bool(html),
            "fetchStatus": response.status_code,
            "fetchError": "",
            "elapsedMs": elapsed_ms,
            "finalUrl": response.url,
            "redirected": response.url.rstrip("/") != url.rstrip("/"),
            "contentType": content_type,
            "contentLength": len(response.content or b""),
            "html": html,
        }
    except requests.RequestException as exc:
        elapsed_ms = int((time.time() - started) * 1000)
        return {
            "fetchOk": False,
            "fetchStatus": None,
            "fetchError": f"{type(exc).__name__}: {exc}",
            "elapsedMs": elapsed_ms,
            "finalUrl": "",
            "redirected": False,
            "contentType": "",
            "contentLength": 0,
            "html": "",
        }


def enrich_webpage(session: requests.Session, item: dict[str, Any], timeout: float, snippet_window: int) -> dict[str, Any]:
    url = item["url"]
    fetched = fetch_url(session, url, timeout)
    extracted = {"fetchedTitle": "", "fetchedDescription": "", "extractedText": ""}
    if fetched["html"]:
        extracted = extract_page(fetched["html"])
    snippet = find_citation_snippet(extracted["extractedText"], item.get("anchorRefs") or [], snippet_window)
    parsed = urlparse(fetched["finalUrl"] or url)
    return {
        **item,
        "webFetch": {
            key: value for key, value in fetched.items() if key != "html"
        },
        "fetchedDomain": parsed.netloc.lower().removeprefix("www."),
        "fetchedTitle": extracted["fetchedTitle"],
        "fetchedDescription": extracted["fetchedDescription"],
        "extractedTextPreview": extracted["extractedText"][:2000],
        "extractedTextLength": len(extracted["extractedText"]),
        **snippet,
    }


def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
    webpages = [item for item in items if item.get("resourceType") == "webpage"]
    return {
        "webpageCount": len(webpages),
        "fetchOkCount": sum(1 for item in webpages if item.get("webFetch", {}).get("fetchOk")),
        "citationFoundCount": sum(1 for item in webpages if item.get("citationFound")),
        "redirectedCount": sum(1 for item in webpages if item.get("webFetch", {}).get("redirected")),
        "deadOrFailedCount": sum(1 for item in webpages if not item.get("webFetch", {}).get("fetchOk")),
        "withExtractedTextCount": sum(1 for item in webpages if item.get("extractedTextLength", 0) > 0),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(DEFAULT_IN))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--timeout", type=float, default=12.0)
    parser.add_argument("--delay", type=float, default=0.25)
    parser.add_argument("--snippet-window", type=int, default=220)
    args = parser.parse_args()

    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    items = data["items"]
    webpage_indexes = [i for i, item in enumerate(items) if item.get("resourceType") == "webpage"]
    if args.limit is not None:
        webpage_indexes = webpage_indexes[:args.limit]

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})

    for offset, index in enumerate(webpage_indexes, start=1):
        item = items[index]
        print(f"[{offset}/{len(webpage_indexes)}] {item['url']}", flush=True)
        items[index] = enrich_webpage(session, item, args.timeout, args.snippet_window)
        if args.delay:
            time.sleep(args.delay)

    data["webpageEnrichmentPolicy"] = {
        "sourceFile": args.input,
        "timeoutSeconds": args.timeout,
        "delaySeconds": args.delay,
        "snippetWindowChars": args.snippet_window,
        "note": "Webpage text is fetched into this POC fixture only; citation snippets are deterministic pattern matches, not LLM output.",
    }
    data["webpageEnrichmentSummary"] = summarize(items)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")
    print(json.dumps(data["webpageEnrichmentSummary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
