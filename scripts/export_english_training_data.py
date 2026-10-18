# -*- coding: utf-8 -*-
"""
Export English text for training an English language model, as JSONL.

Three sources, one doc per line, each tagged with `source` and a stable `id`:

  source="version"  every English Version (actualLanguage == 'en'), one doc per ref (deduped within each index, see version_docs),
                    id = "<ref>:<versionTitle>:<actualLanguage>"
  source="sheet"    every public source sheet, one doc per user-generated node
                    (`comment`, `outsideText`, and the English side of `outsideBiText`).
                    Library text quoted in a sheet (`ref` sources) is skipped, since it is
                    already covered by the versions.
  source="webpage"  one doc per page in `webpages_text`, filtered for quality (see below).

Version and sheet text is emitted as stored, including any HTML. Post-processing is left to the consumer.

Webpages are the exception, because raw bodies are mostly site chrome. A page is kept only if its site
is whitelisted in `websites`, and the emitted `text` is the cleaned body, not the stored one:
  - lines on >= BOILERPLATE_MIN_FRAC of the same site's pages (nav, footers, cookie banners) are removed
  - lines repeated within the page, and lines that are not mostly Latin script, are removed
Then the cleaned text must pass every check below, otherwise the page is dropped:
  url_listing   URL is a search / tag / category / pagination / wiki-revision view, not an article
  too_short     fewer than MIN_PROSE_WORDS words in prose lines (lines of >= PROSE_LINE_MIN_WORDS words);
                this also catches error pages, empty search results and menu-only pages
  low_prose     prose lines are under MIN_PROSE_FRAC of the words (link lists, tables of contents)
  repetitive    more than MAX_DUP_NGRAM_FRAC of the 8-word sequences are repeats (templated text, boilerplate loops)
  not_english   under MIN_ENGLISH_STOPWORD_FRAC of the words are common English function words
                (Latin-script French / Portuguese / Dutch etc. pass the per-line script check but fail this)
  code_dump     stack trace / SQL / PHP debug output
  error_page    error-page title ("Page Not Found"; or "Error"/"Forbidden" on a short page)
  duplicate     cleaned text identical to a page already exported
Per-reason counts are printed at the end.

Usage:
    ./run scripts/export_english_training_data.py
    ./run scripts/export_english_training_data.py --only sheets --limit 100 --out /path/out.jsonl
    ./run scripts/export_english_training_data.py --only webpages --limit 5000
    ./run scripts/export_english_training_data.py --exclude webpages
"""
import argparse
import html
import json
import os
import re
from collections import Counter, defaultdict

import django
django.setup()
from sefaria.system.database import db
from sefaria.model import VersionSet
from sefaria.sheets import get_sheet_language
from sefaria.helper.webpages import site_data_for_domain, domain_for_url

DEFAULT_OUT = "data/private/english_training_data.jsonl"

# Webpage quality thresholds, calibrated by hand on the 100k-page sample of `webpages_text`.
BOILERPLATE_MIN_FRAC = 0.01  # a line on >= this share of a site's pages is site chrome...
BOILERPLATE_MIN_DOCS = 5     # ...but never on fewer than this many pages
ENGLISH_LINE_MIN_LATIN = 0.8
PROSE_LINE_MIN_WORDS = 8
MIN_PROSE_WORDS = 100
MIN_PROSE_FRAC = 0.6
MAX_DUP_NGRAM_FRAC = 0.2
MIN_ENGLISH_STOPWORD_FRAC = 0.25
NGRAM_SIZE = 8
SHORT_ERROR_PAGE_WORDS = 300

JUNK_TOKEN_RE = re.compile(r"\?lit\$\d+\$")  # leftover from a client-side templating library
LISTING_URL_RE = re.compile(
    r"/search|/tag/|/category/|/author/|/page/\d+|[?&](s|_s|search|page|diff|oldid|hidemyself|action)=|Special:"
)
CODE_DUMP_RE = re.compile(
    r"SELECT .{1,80} FROM|require_once\(|Fatal error|Stack trace|Traceback \(most|<\?php|Uncaught \w*Exception|wp-settings|at \S+\.(php|js):\d+"
)
# Titles that mean an error page whatever the page length (templated 404s carry hundreds of words of site chrome)...
STRONG_ERROR_TITLE_RE = re.compile(r"not found|\b404\b|access denied|nothing found|no results|just a moment|are you a robot|captcha|^warning:|fatal error|WP_Error", re.I)
# ...and words that are only an error page when the page is also short ("The Error of Nadav and Avihu" is an article).
WEAK_ERROR_TITLE_RE = re.compile(r"\berror\b|forbidden|unavailable", re.I)

# Common English function words. Function words are ~35-45% of English prose and <10% of Portuguese, French, Dutch, etc.,
# which a Latin-script check alone cannot tell apart from English.
ENGLISH_STOPWORDS = frozenset(
    "the of and to in a is that it for with as was on are by be this from at or an not have had but his her they you we "
    "which their has were been would there what all can will who one more if no so out about into than them only other "
    "its also when some could these how do our my your".split()
)


def version_docs(limit=None):
    """Yield one doc per ref. Within each index, versions are tried in Sefaria's preference order
    (VersionSet default: priority desc, then _id) and a ref is taken from the first version that has it."""
    titles = sorted(db.texts.distinct("title", {"actualLanguage": "en"}))
    for title in titles[:limit or None]:
        seen_refs = set()
        for version in VersionSet({"title": title, "actualLanguage": "en"}):
            docs = []

            def action(segment_str, tref, he_tref, v):
                if tref not in seen_refs and isinstance(segment_str, str) and segment_str.strip():
                    seen_refs.add(tref)
                    docs.append({
                        "id": "{}:{}:{}".format(tref, v.versionTitle, v.actualLanguage),
                        "source": "version",
                        "text": segment_str,
                    })

            try:
                version.walk_thru_contents(action)
            except Exception as e:  # e.g. version whose Index no longer exists
                print("Skipping {} / {}: {}: {}".format(version.title, version.versionTitle, type(e).__name__, e), flush=True)
                continue
            yield from docs


def user_generated_text(source):
    """Return (node_type, text) for a user-generated English sheet node, or None for anything else."""
    if "comment" in source:
        return "comment", source["comment"]
    if "outsideText" in source:
        return "outsideText", source["outsideText"]
    if "outsideBiText" in source:
        return "outsideBiText", (source["outsideBiText"] or {}).get("en", "")
    return None


def sheet_docs(limit=None):
    cursor = db.sheets.find({"status": "public"}, {"id": 1, "title": 1, "sources": 1, "owner": 1, "dateCreated": 1})
    if limit:
        cursor = cursor.limit(limit)
    for sheet in cursor:
        sheet_language = get_sheet_language(sheet)
        for position, source in enumerate(sheet.get("sources", [])):
            node = user_generated_text(source)
            if not node or not node[1] or not node[1].strip():
                continue
            node_type, text = node
            yield {
                "id": "sheet:{}:{}".format(sheet["id"], source.get("node", position)),
                "source": "sheet",
                "sheet_id": sheet["id"],
                "node": source.get("node"),
                "position": position,
                "node_type": node_type,
                "sheet_language": sheet_language,
                "text": text,
            }


def whitelisted_site_name(url):
    """Return the name of the whitelisted site `url` belongs to, or None if the site is unknown or not whitelisted."""
    site = site_data_for_domain(domain_for_url(url))
    return site["name"] if site and site.get("is_whitelisted") else None


def normalize_line(line):
    return re.sub(r"\s+", " ", JUNK_TOKEN_RE.sub(" ", html.unescape(line))).strip()


def body_lines(body):
    return [line for line in map(normalize_line, body.split("\n")) if line]


def line_key(line):
    """Lines that differ only in digits ("Posted May 1, 2025", "Item 2 of 3") count as the same line."""
    return hash(re.sub(r"\d+", "#", line.lower()))


def is_english_line(line):
    letters = [c for c in line if c.isalpha()]
    latin = sum(c.isascii() or "À" <= c <= "ɏ" for c in letters)
    return bool(letters) and latin / len(letters) >= ENGLISH_LINE_MIN_LATIN


def find_site_boilerplate(limit=None):
    """Return {site name: set of line keys that appear on enough of that site's pages to be site chrome}."""
    pages_per_site = Counter()
    line_pages = defaultdict(Counter)  # site -> line key -> number of pages containing it
    cursor = db.webpages_text.find({}, {"url": 1, "body": 1}, limit=limit or 0)
    for page in cursor:
        site = whitelisted_site_name(page["url"])
        if site:
            pages_per_site[site] += 1
            line_pages[site].update({line_key(line) for line in body_lines(page.get("body") or "")})
    boilerplate = {}
    for site, counts in line_pages.items():
        threshold = max(BOILERPLATE_MIN_DOCS, BOILERPLATE_MIN_FRAC * pages_per_site[site])
        boilerplate[site] = {key for key, n in counts.items() if n >= threshold}
    return boilerplate


def clean_lines(lines, site_boilerplate):
    """Drop site chrome, lines repeated within the page, and non-English lines."""
    kept, seen = [], set()
    for line in lines:
        key = line_key(line)
        if key in site_boilerplate or key in seen or not is_english_line(line):
            continue
        seen.add(key)
        kept.append(line)
    return kept


def repeated_ngram_frac(words):
    """Share of word n-grams that are repeats of an earlier one. Unlike compression ratio or unique-word
    share, this does not shrink as a page gets longer, so long legitimate articles score ~0."""
    ngrams = [" ".join(words[i:i + NGRAM_SIZE]) for i in range(len(words) - NGRAM_SIZE + 1)]
    return 1 - len(set(ngrams)) / len(ngrams) if ngrams else 0.0


def webpage_quality(url, title, lines):
    """Return (reject_reason or None, metrics) for the cleaned `lines` of a page."""
    text = "\n".join(lines)
    words = re.findall(r"\w+", text.lower())
    alpha_words = re.findall(r"[^\W\d_]+", text.lower())
    prose_words = sum(len(line.split()) for line in lines if len(line.split()) >= PROSE_LINE_MIN_WORDS)
    metrics = {
        "words": len(words),
        "prose_words": prose_words,
        "prose_frac": round(prose_words / len(words), 3) if words else 0.0,
        "repeated_ngram_frac": round(repeated_ngram_frac(words), 3),
        "english_stopword_frac": round(sum(w in ENGLISH_STOPWORDS for w in alpha_words) / max(len(alpha_words), 1), 3),
    }
    if LISTING_URL_RE.search(url):
        reason = "url_listing"
    elif STRONG_ERROR_TITLE_RE.search(title):
        reason = "error_page"
    elif prose_words < MIN_PROSE_WORDS:
        reason = "too_short"
    elif metrics["english_stopword_frac"] < MIN_ENGLISH_STOPWORD_FRAC:
        reason = "not_english"
    elif metrics["prose_frac"] < MIN_PROSE_FRAC:
        reason = "low_prose"
    elif metrics["repeated_ngram_frac"] > MAX_DUP_NGRAM_FRAC:
        reason = "repetitive"
    elif len(CODE_DUMP_RE.findall(text)) >= 3:
        reason = "code_dump"
    elif WEAK_ERROR_TITLE_RE.search(title) and len(words) < SHORT_ERROR_PAGE_WORDS:
        reason = "error_page"
    else:
        reason = None
    return reason, metrics


def webpage_docs(limit=None, rejected=None):
    """Yield quality-filtered webpage docs. `rejected` is a Counter that collects the reason for every dropped page."""
    rejected = rejected if rejected is not None else Counter()
    boilerplate = find_site_boilerplate(limit)
    exported_texts = set()
    for page in db.webpages_text.find({}, limit=limit or 0):
        site = whitelisted_site_name(page["url"])
        if not site:
            rejected["not_whitelisted"] += 1
            continue
        title = normalize_line(page.get("title") or "")
        lines = clean_lines(body_lines(page.get("body") or ""), boilerplate[site])
        reason, metrics = webpage_quality(page["url"], title, lines)
        text = "\n".join(lines)
        if not reason and hash(text) in exported_texts:
            reason = "duplicate"
        if reason:
            rejected[reason] += 1
            continue
        exported_texts.add(hash(text))
        yield {
            "id": "webpage:{}".format(page["_id"]),
            "source": "webpage",
            "url": page["url"],
            "site": site,
            "title": title,
            "text": text,
            **metrics,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=DEFAULT_OUT, help="output JSONL path (default: %(default)s)")
    parser.add_argument("--only", choices=["versions", "sheets", "webpages"], help="export just one source")
    parser.add_argument("--exclude", nargs="+", choices=["versions", "sheets", "webpages"], default=[], help="skip these sources")
    parser.add_argument("--limit", type=int, help="max indexes / sheets / webpages to read, for testing")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    counts = {"version": 0, "sheet": 0, "webpage": 0}
    rejected = Counter()
    with open(args.out, "w", encoding="utf-8") as fout:
        generators = []
        if args.only in (None, "versions") and "versions" not in args.exclude:
            generators.append(version_docs(args.limit))
        if args.only in (None, "sheets") and "sheets" not in args.exclude:
            generators.append(sheet_docs(args.limit))
        if args.only in (None, "webpages") and "webpages" not in args.exclude:
            generators.append(webpage_docs(args.limit, rejected))
        for gen in generators:
            for doc in gen:
                fout.write(json.dumps(doc, ensure_ascii=False) + "\n")
                counts[doc["source"]] += 1
                if sum(counts.values()) % 100000 == 0:
                    print("...{}".format(counts), flush=True)
    print("Wrote {} to {}".format(counts, args.out))
    if rejected:
        print("Webpages rejected: {}".format(dict(rejected.most_common())))


if __name__ == "__main__":
    main()
