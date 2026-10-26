# -*- coding: utf-8 -*-
"""
Export English text for training an English language model, as JSONL.

Three sources, one doc per line, each tagged with `source`, a stable `id`, a `words` count and a `split`
("train", or "eval" for a stable ~EVAL_FRAC hash sample, so held-out text never reaches training):

  source="version"  every English Version (actualLanguage == 'en'), grouped into passage-sized docs, see version_docs.
                    id = "version:<ref>", where <ref> is the range the doc covers. `text` starts with that ref, so the
                    model sees which work and place each passage comes from.
  source="sheet"    one doc per public source sheet (split at node boundaries if over MAX_DOC_WORDS, see split_units):
                    its title, then its nodes in order. User-generated nodes
                    (`comment`, `outsideText`, both sides of `outsideBiText`) are kept as text. Library text quoted
                    in a sheet (`ref` sources) is replaced by its citation, e.g. "[Genesis 1:1]", since that text is
                    already covered by the versions. id = "sheet:<sheet id>", or "sheet:<sheet id>#<n>" for the parts of a split
                    sheet; every part repeats the title and stays in the sheet's split.
  source="webpage"  one doc per page in `webpages_text`, filtered for quality (see below). id = "webpage:<_id>", or
                    "webpage:<_id>#<n>" if the page is over MAX_DOC_WORDS and is split at line boundaries (every part
                    repeats the title and stays in the page's split).

Version and sheet HTML is converted to plain text. Bold is kept as markdown `**...**`, because it carries meaning
(in the Steinsaltz Talmud bold is the literal translation and plain text is the explanation; in commentaries bold
is the quoted lemma). Footnotes are taken out of the running text and appended to the end of the doc under "Notes:".

URLs are removed from all text (an `<a>` tag is dropped, and so is a bare link), since they are noise to a language model.

Library text quoted verbatim elsewhere is not exported twice: a sheet or webpage paragraph is dropped when at
least QUOTE_PARAGRAPH_FRAC of its words are in sentences that also appear in an English version. This needs the
versions read first, so `--only sheets` / `--only webpages` still walk the versions (without writing them).

Hebrew is kept where it sits inside English content (quotes, bilingual sheet nodes, Hebrew lines on an English
page). A sheet or webpage is dropped only when more than MAX_HEBREW_LETTER_FRAC of its letters are Hebrew.

Webpages need more cleanup, because raw bodies are mostly site chrome. A page is kept only if its site is
whitelisted in `websites`, and the emitted `text` is the page title followed by the cleaned body, not the stored one:
  - lines on >= BOILERPLATE_MIN_FRAC of the same site's pages (nav, footers, cookie banners) are removed
  - lines repeated within the page, and lines that are not mostly Latin or Hebrew script, are removed
  - lines broken mid-sentence by the page's HTML layout are joined back together
  - paragraphs that are mostly library quotes are removed (see above)
  - short lines before the first prose line (section menus, bylines, tables of contents) are removed
Then the cleaned text must pass every check below, otherwise the page is dropped:
  url_listing   URL is a search / tag / category / pagination / wiki-revision view, not an article
  too_short     fewer than MIN_PROSE_WORDS words in prose lines (lines of >= PROSE_LINE_MIN_WORDS words);
                this also catches error pages, empty search results and menu-only pages
  low_prose     prose lines are under MIN_PROSE_FRAC of the words (link lists, tables of contents)
  repetitive    more than MAX_DUP_NGRAM_FRAC of the 8-word sequences are repeats (templated text, boilerplate loops)
  not_english   under MIN_ENGLISH_STOPWORD_FRAC of the Latin-script words are common English function words
                (Latin-script French / Portuguese / Dutch etc. pass the per-line script check but fail this)
  hebrew_heavy  more than MAX_HEBREW_LETTER_FRAC of the letters are Hebrew
  code_dump     stack trace / SQL / PHP debug output
  error_page    error-page title ("Page Not Found"; or "Error"/"Forbidden" on a short page)
  duplicate     cleaned text identical to a page already exported
  site_cap      the site already contributes SITE_WORD_CAP words. Kept pages are a stable hash sample of the
                site's pages, so one large site (e.g. Times of Israel Blogs) cannot dominate the corpus.
Per-reason counts are printed at the end.

Dedupe. Once everything is exported, one more pass removes duplicates, so the model cannot memorize repeated text and
the eval split cannot leak into training. Eval docs go first and are never dropped for matching a train doc; a train
doc that matches an eval doc is dropped. Within a split, docs are taken in source-priority order (versions, sheets,
webpages), so the canonical copy survives. For each doc, in order:
  exact       cleaned text identical to an earlier doc
  near        MinHash over word 5-grams at >= NEAR_DUP_THRESHOLD similarity to an earlier doc
  paragraph   paragraphs of >= LONG_PARAGRAPH_MIN_WORDS words that are in an earlier doc are removed (this catches
              quotations); a doc left too short is dropped
Docs and words after every stage are logged per source and saved to <out>.stats.json.

Context length. Docs are sized with a ModernBERT tokenizer (--tokenizer), and the last step re-measures every doc as
the model will see it (the `tokens` field, plus [CLS] and [SEP]) and drops any that still exceed MODEL_CONTEXT_TOKENS.
Footnotes count towards a doc's size. A sheet node, webpage line or text segment that alone exceeds --max-tokens is
split at line, then sentence, then word boundaries.

Usage:
    ./run scripts/export_english_training_data.py
    ./run scripts/export_english_training_data.py --only sheets --limit 100 --out /path/out.jsonl
    ./run scripts/export_english_training_data.py --only webpages --limit 5000
    ./run scripts/export_english_training_data.py --exclude webpages
    ./run scripts/export_english_training_data.py --site-word-cap 0   # no per-site cap
    ./run scripts/export_english_training_data.py --max-tokens 0      # measure docs in words (MAX_DOC_WORDS), no tokenizer

Doc length is measured in tokens of --tokenizer (ModernBERT's) by default, with docs split above --max-tokens, because
tokens per word varies a lot here (about 1.5 for English prose, over 10 for Hebrew-heavy sheets), so no word cap fits a
fixed context. --max-tokens leaves room under the model's limit: the ref and a repeated sheet or page title are added
to a doc after its segments are measured. With --max-tokens 0 length is measured in words (MIN_DOC_WORDS /
MAX_DOC_WORDS) and the context check is skipped.
"""
import argparse
import hashlib
import html
import json
import os
import re
import tempfile
import time
from collections import Counter, defaultdict
from datetime import timedelta
from functools import lru_cache

import numpy as np

import django
django.setup()
from sefaria.system.database import db
from sefaria.model import VersionSet, Ref
from sefaria.model.text import AbstractTextRecord
from sefaria.sheets import get_sheet_language
from sefaria.helper.webpages import site_data_for_domain, domain_for_url

DEFAULT_OUT = "data/private/english_training_data.jsonl"

EVAL_FRAC = 0.01

# Version docs: segments are grouped by passage (Bavli sugyot, Tanakh stories) or else by section,
# then short groups are merged with their neighbours and long ones split, at segment boundaries.
# Sheets and webpages are not merged, but those over MAX_DOC_WORDS are split too (see split_units).
MIN_DOC_WORDS = 100
MAX_DOC_WORDS = 2000
MIN_DOC_TOKENS = 200  # about MIN_DOC_WORDS words, at ~2 tokens per word
DEFAULT_TOKENIZER = "answerdotai/ModernBERT-base"
DEFAULT_MAX_TOKENS = 7500  # leaves ~700 tokens of the 8192 for the ref, a repeated title and [CLS]/[SEP]
MODEL_CONTEXT_TOKENS = 8192
MODERNBERT_VOCAB_SIZE = 50368  # counting its added special tokens
SPECIAL_TOKENS = 2  # [CLS] and [SEP]

# Sheets
MIN_SHEET_USER_WORDS = 20  # user-written words, not counting the title or ref citations

# Library quotes in sheets and webpages
QUOTE_MIN_WORDS = 8  # shorter sentences ("And God said:") are too common to count as a quote
QUOTE_PARAGRAPH_FRAC = 0.5

MAX_HEBREW_LETTER_FRAC = 0.5

# Dedupe
LONG_PARAGRAPH_MIN_WORDS = 15
MIN_DEDUPED_DOC_WORDS = 50  # a text or sheet doc that loses paragraphs to dedupe must keep this many words (webpages: MIN_PROSE_WORDS of prose)
SHINGLE_SIZE = 5            # words per MinHash shingle
NUM_PERM = 128              # MinHash signature length
LSH_BANDS = 16              # 128 / 16 = 8 rows per band; candidates are then verified against NEAR_DUP_THRESHOLD
NEAR_DUP_THRESHOLD = 0.8

# Webpage quality thresholds, calibrated by hand on the 100k-page sample of `webpages_text`.
BOILERPLATE_MIN_FRAC = 0.01  # a line on >= this share of a site's pages is site chrome...
BOILERPLATE_MIN_DOCS = 5     # ...but never on fewer than this many pages
SCRIPT_LINE_MIN_LATIN_OR_HEBREW = 0.8
PROSE_LINE_MIN_WORDS = 8
MIN_PROSE_WORDS = 100
MIN_PROSE_FRAC = 0.6
MAX_DUP_NGRAM_FRAC = 0.2
MIN_ENGLISH_STOPWORD_FRAC = 0.25
NGRAM_SIZE = 8
SHORT_ERROR_PAGE_WORDS = 300
SITE_WORD_CAP = 10_000_000

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

# A line that ends like this is a complete line; anything else followed by a lowercase line was broken by layout.
LINE_END_RE = re.compile(r"[.!?:;\"”’')\]]$")

BOLD_RE = re.compile(r"<(b|strong)\b[^>]*>(\s*)(.*?)(\s*)</\1>", re.S | re.I)
BLOCK_TAG_RE = re.compile(r"<br\s*/?>|</?(p|div|li|ul|ol|h\d|tr|blockquote)\b[^>]*>", re.I)
TAG_RE = re.compile(r"<[^>]+>")
# A URL, without the punctuation that ends the sentence it sits in, and without markdown bold markers around it.
URL_RE = re.compile(r"""(?:https?://|\bwww\.)[^\s<>*]*[^\s<>*.,;:!?'")\]”’]""", re.I)
EMPTY_BOLD_RE = re.compile(r"\*\*\s*\*\*")
WORD_RE = re.compile(r"\w+")
FOOTNOTE_MARKER_RE = re.compile(r'<sup[^>]*class="footnote-marker"[^>]*>.*?</sup>', re.S)
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?;:])\s+")
HEBREW_LETTER_RE = re.compile(r"[א-ת]")

# Common English function words. Function words are ~35-45% of English prose and <10% of Portuguese, French, Dutch, etc.,
# which a Latin-script check alone cannot tell apart from English.
ENGLISH_STOPWORDS = frozenset(
    "the of and to in a is that it for with as was on are by be this from at or an not have had but his her they you we "
    "which their has were been would there what all can will who one more if no so out about into than them only other "
    "its also when some could these how do our my your".split()
)

SCRIPT_START = time.time()


def log(msg):
    """Print `msg` prefixed with wall-clock time and time since the script started."""
    elapsed = timedelta(seconds=int(time.time() - SCRIPT_START))
    print("[{} +{}] {}".format(time.strftime("%H:%M:%S"), elapsed, msg), flush=True)


class Progress:
    """Logs a plain one-line progress report every `every` items: count, percent of `total`, rate and ETA."""

    def __init__(self, label, total, every):
        self.label, self.total, self.every = label, total, every
        self.done = 0
        self.start = time.time()
        log("{}: starting, {:,} to read".format(label, total))

    def tick(self, extra=lambda: ""):
        """`extra` is a function returning text to append, called only when a line is actually logged."""
        self.done += 1
        if self.done % self.every == 0:
            self._log(extra())

    def finish(self, extra=""):
        self._log(extra, finished=True)

    def _log(self, extra, finished=False):
        elapsed = time.time() - self.start
        rate = self.done / elapsed if elapsed else 0.0
        parts = ["{}: {:,}/{:,}".format(self.label, self.done, self.total)]
        if self.total and not finished:
            parts[0] += " ({:.1%})".format(self.done / self.total)
            if rate:
                parts.append("ETA {}".format(timedelta(seconds=int(max(self.total - self.done, 0) / rate))))
        parts.append("{:,.0f}/s".format(rate))
        if finished:
            parts.append("done in {}".format(timedelta(seconds=int(elapsed))))
        if extra:
            parts.append(extra)
        log(" · ".join(parts))


def capped(total, limit):
    return min(total, limit) if limit else total


def stable_hash(s):
    """Unlike hash(), the same across runs, so the eval split and site-cap sample are reproducible."""
    return int(hashlib.md5(s.encode("utf-8")).hexdigest()[:12], 16)


def split_for(key):
    return "eval" if stable_hash(key) % 10000 < EVAL_FRAC * 10000 else "train"


def word_count(text):
    return len(text.split())


class SizeLimits:
    """How the length of a doc is measured, and the range its parts should fall in (see pack_groups)."""

    def __init__(self, measure, min_size, max_size, in_tokens=False):
        self.measure, self.min_size, self.max_size, self.in_tokens = measure, min_size, max_size, in_tokens


WORD_LIMITS = SizeLimits(word_count, MIN_DOC_WORDS, MAX_DOC_WORDS)


def token_limits(tokenizer, max_tokens):
    """Limits measured in tokens of a Hugging Face tokenizer (a hub name, or the path of a tokenizer.json), with no
    special tokens counted. Uses the `tokenizers` library alone, so `transformers` is not needed."""
    from tokenizers import Tokenizer
    tk = Tokenizer.from_file(tokenizer) if os.path.exists(tokenizer) else Tokenizer.from_pretrained(tokenizer)
    tk.no_truncation()
    log("tokenizer: {} (vocab size {:,}), docs up to {:,} tokens".format(tokenizer, tk.get_vocab_size(), max_tokens))
    if tk.get_vocab_size() != MODERNBERT_VOCAB_SIZE:
        raise SystemExit("{} has {:,} tokens; ModernBERT's tokenizer has {:,}, so counts would not match the model's".format(
            tokenizer, tk.get_vocab_size(), MODERNBERT_VOCAB_SIZE))
    return SizeLimits(
        lambda text: len(tk.encode(text, add_special_tokens=False).ids),
        min(MIN_DOC_TOKENS, max_tokens), max_tokens, in_tokens=True)


def hebrew_letter_frac(text):
    letters = sum(c.isalpha() for c in text)
    return len(HEBREW_LETTER_RE.findall(text)) / letters if letters else 0.0


def html_to_text(s):
    """Plain text from stored HTML: block tags become line breaks, bold becomes **markdown bold**, other tags are dropped."""
    s = BOLD_RE.sub(lambda m: "{}**{}**{}".format(m[2], m[3], m[4]) if m[3].strip() else m[2] + m[4], s)
    s = html.unescape(TAG_RE.sub("", BLOCK_TAG_RE.sub("\n", s)))
    s = EMPTY_BOLD_RE.sub(" ", URL_RE.sub(" ", s))
    lines = (re.sub(r"[ \t ]+", " ", line).strip() for line in s.split("\n"))
    return "\n".join(line for line in lines if line)


def clean_segment(s):
    """Return (text, footnotes) for a stored segment, with footnotes and other inline tags taken out of the text."""
    if "<sup" not in s and "<i" not in s:
        return html_to_text(s), []
    notes = [html_to_text(FOOTNOTE_MARKER_RE.sub("", fn)) for fn in AbstractTextRecord.find_all_footnotes(s)]
    return html_to_text(AbstractTextRecord.strip_itags(s)), [n for n in notes if n]


# Library quotes

def quote_keys(text):
    """Hash keys of the sentences of `text` long enough to identify a quote, with their word counts."""
    for sentence in SENTENCE_SPLIT_RE.split(text.replace("**", "")):
        normalized = re.sub(r"[^\w]+", " ", sentence.lower()).strip()
        n = normalized.count(" ") + 1
        if n >= QUOTE_MIN_WORDS:
            yield hash(normalized), n


def drop_library_quotes(lines, quote_index):
    """Drop lines that are mostly sentences found in the library. Returns (kept lines, number dropped)."""
    kept = []
    for line in lines:
        quoted = sum(n for key, n in quote_keys(line) if key in quote_index)
        if quoted and quoted >= QUOTE_PARAGRAPH_FRAC * word_count(line):
            continue
        kept.append(line)
    return kept, len(lines) - len(kept)


# Versions

@lru_cache(maxsize=None)
def passage_for_segment():
    """{segment ref: full_ref of the shortest passage containing it}. Passages exist for the Bavli (sugyot, mishnayot)
    and Tanakh (biblical stories, which can overlap; the shortest wins, as in Passage.containing_segment)."""
    best = {}
    for passage in db.passage.find({}, {"full_ref": 1, "ref_list": 1}):
        for tref in passage["ref_list"]:
            if tref not in best or len(passage["ref_list"]) < best[tref][0]:
                best[tref] = (len(passage["ref_list"]), passage["full_ref"])
    log("passages: {:,} segments are in a passage".format(len(best)))
    return {tref: full_ref for tref, (_, full_ref) in best.items()}


def section_of(tref):
    """'Genesis 1:3' -> 'Genesis 1', 'Berakhot 2a:4' -> 'Berakhot 2a', 'Sefer HaChinukh, Author's Introduction 3' ->
    'Sefer HaChinukh, Author's Introduction'. String-based, because building a Ref for every segment is slow."""
    return tref.rsplit(":", 1)[0] if ":" in tref else tref.rsplit(" ", 1)[0]


def merge_orders(sequences):
    """Merge segment orders from several versions of one text into one order. The first sequence is taken as is; a
    segment only found in a later version goes right after the segment that precedes it in that version."""
    next_of = defaultdict(list)
    seen = set()
    for seq in sequences:
        prev = None
        for tref in seq:
            if tref not in seen:
                seen.add(tref)
                next_of[prev].insert(0, tref)
            prev = tref
    order, stack = [], [None]
    while stack:
        tref = stack.pop()
        if tref is not None:
            order.append(tref)
        stack.extend(reversed(next_of[tref]))
    return order


def pack_groups(groups, limits=WORD_LIMITS):
    """Merge runs of groups shorter than limits.min_size, then split groups longer than limits.max_size into
    near-equal parts. Each group is a list of segment dicts with a `size`; splits are at segment boundaries, so only
    a single segment larger than limits.max_size can make a part exceed it."""
    merged, buf, buf_size = [], [], 0
    for group in groups:
        size = sum(seg["size"] for seg in group)
        if buf and (buf_size >= limits.min_size or buf_size + size > limits.max_size):
            merged.append(buf)
            buf, buf_size = [], 0
        buf, buf_size = buf + group, buf_size + size
    if buf:
        merged.append(buf)
    for group in merged:
        total = sum(seg["size"] for seg in group)
        n_parts = max(1, -(-total // limits.max_size))
        target = total / n_parts
        part, part_size = [], 0
        for seg in group:
            if part and part_size + seg["size"] > limits.max_size:
                yield part
                part, part_size = [], 0
            part.append(seg)
            part_size += seg["size"]
            if part_size >= target and len(part) < len(group):
                yield part
                part, part_size = [], 0
        if part:
            yield part


def cut_words(text, limits):
    """Halve `text` at word boundaries until every piece is within limits.max_size (a single huge word stays whole)."""
    words = text.split()
    if len(words) < 2 or limits.measure(text) <= limits.max_size:
        return [text]
    half = len(words) // 2
    return cut_words(" ".join(words[:half]), limits) + cut_words(" ".join(words[half:]), limits)


def split_line(line, limits):
    """Split a line longer than limits.max_size into pieces at sentence boundaries, cutting at word boundaries
    any sentence that is itself too long."""
    pieces, buf, buf_size = [], [], 0
    for sentence in SENTENCE_SPLIT_RE.split(line):
        for chunk in cut_words(sentence, limits):
            size = limits.measure(chunk)
            if buf and buf_size + size > limits.max_size:
                pieces.append(" ".join(buf))
                buf, buf_size = [], 0
            buf.append(chunk)
            buf_size += size
    if buf:
        pieces.append(" ".join(buf))
    return pieces


def split_units(units, limits=WORD_LIMITS):
    """Split a doc into parts of about limits.max_size. `units` is a list of line lists (a sheet node, a webpage
    line) that are kept whole, unless one alone is over the limit: that is broken into its lines, and a line that is
    still over the limit into pieces (see split_line). Returns the parts as flat line lists. A doc under the limit
    comes back as one part."""
    lines = [line for unit in units for line in unit]
    if limits.measure("\n".join(lines)) <= limits.max_size:
        return [lines]
    segments = []
    for unit in units:
        size = sum(limits.measure(line) for line in unit)
        if size <= limits.max_size:
            segments.append({"lines": unit, "size": size})
            continue
        for line in unit:
            pieces = split_line(line, limits) if limits.measure(line) > limits.max_size else [line]
            segments.extend({"lines": [piece], "size": limits.measure(piece)} for piece in pieces)
    return [[line for seg in part for line in seg["lines"]] for part in pack_groups([segments], limits)]


def range_ref(first, last):
    try:
        return Ref(first).to(Ref(last)).normal() if first != last else Ref(first).normal()
    except Exception:
        return "{} - {}".format(first, last) if first != last else first


def version_doc(segments):
    ref = range_ref(segments[0]["ref"], segments[-1]["ref"])
    text = ref + "\n\n" + "\n".join(seg["text"] for seg in segments)
    notes = [note for seg in segments for note in seg["notes"]]
    if notes:
        text += "\n\nNotes:\n" + "\n".join(notes)
    return {
        "id": "version:{}".format(ref),
        "source": "version",
        "split": split_for(ref),
        "versions": sorted({seg["version"] for seg in segments}),
        "words": word_count(text),
        "text": text,
    }


def fit_notes(text, notes, limits):
    """The footnotes that fit alongside `text` within limits.max_size; the rest are dropped."""
    used, kept = limits.measure(text), []
    for note in notes:
        size = limits.measure(note)
        if used + size > limits.max_size:
            break
        used += size
        kept.append(note)
    return kept


def make_segments(tref, text, notes, version, limits):
    """Segment dicts for one stored segment: normally one, several if its text is over limits.max_size (they share
    the ref). The size of a segment includes its footnotes, which are appended to the end of the doc."""
    size = limits.measure(text)
    if size <= limits.max_size:
        pieces, sizes = [text], [size]
    else:
        pieces = ["\n".join(part) for part in split_units([text.split("\n")], limits)]
        sizes = [limits.measure(piece) for piece in pieces]
    notes = fit_notes(pieces[-1], notes, limits) if notes else []
    sizes[-1] += sum(limits.measure(note) for note in notes)
    return [
        {"ref": tref, "text": piece, "notes": notes if i == len(pieces) - 1 else [], "size": size, "version": version}
        for i, (piece, size) in enumerate(zip(pieces, sizes))
    ]


def version_docs(limit=None, quote_index=None, limits=WORD_LIMITS):
    """Yield passage-sized docs for every English text. Within each index, versions are tried in Sefaria's preference
    order (VersionSet default: priority desc, then _id) and a ref is taken from the first version that has it.
    Segments are grouped by passage where one exists, else by section, then packed (see pack_groups) to `limits`.
    The sentences of every segment are added to `quote_index`, for drop_library_quotes."""
    passages = passage_for_segment()
    titles = sorted(db.texts.distinct("title", {"actualLanguage": "en"}))[:limit or None]
    progress = Progress("versions (indexes)", len(titles), every=100)
    n_docs = 0
    ref_counts = Counter()
    for title in titles:
        progress.tick(lambda: "{:,} docs exported".format(n_docs))
        segments, orders = {}, []
        for version in VersionSet({"title": title, "actualLanguage": "en"}):
            order = []

            def action(segment_str, tref, he_tref, v):
                if not isinstance(segment_str, str) or not segment_str.strip():
                    return
                order.append(tref)
                if tref not in segments:
                    text, notes = clean_segment(segment_str)
                    if text:
                        segments[tref] = make_segments(tref, text, notes, v.versionTitle, limits)

            try:
                version.walk_thru_contents(action)
            except Exception as e:  # e.g. version whose Index no longer exists
                log("Skipping {} / {}: {}: {}".format(version.title, version.versionTitle, type(e).__name__, e))
                continue
            orders.append(order)

        groups, prev_key = [], None
        for tref in merge_orders(orders):
            if tref not in segments:
                continue
            if quote_index is not None:
                quote_index.update(key for seg in segments[tref] for key, _ in quote_keys(seg["text"]))
            key = passages.get(tref) or section_of(tref)
            if key != prev_key:
                groups.append([])
                prev_key = key
            groups[-1].extend(segments[tref])
        for group in pack_groups(groups, limits):
            n_docs += 1
            doc = version_doc(group)
            n_same_ref = ref_counts[doc["id"]]  # a segment split in pieces gives several docs the same ref
            ref_counts[doc["id"]] += 1
            if n_same_ref:
                doc["id"] += "#{}".format(n_same_ref + 1)
            yield doc
    progress.finish("{:,} docs exported".format(n_docs))


def build_quote_index(limit=None):
    """Walk the versions only to collect their sentences, when versions are not being exported."""
    quote_index = set()
    log("Building the library quote index from the versions (not exporting them)")
    for _ in version_docs(limit, quote_index):
        pass
    return quote_index


# Sheets

def user_generated_texts(source):
    """User-written text of a sheet node, as a list (both sides of a bilingual node); empty for library sources."""
    if "comment" in source:
        return [source["comment"]]
    if "outsideText" in source:
        return [source["outsideText"]]
    if "outsideBiText" in source:
        bitext = source["outsideBiText"] or {}
        return [bitext.get("he", ""), bitext.get("en", "")]
    return []


def sheet_docs(limit=None, quote_index=None, rejected=None, limits=WORD_LIMITS):
    """Yield one doc per public sheet. `rejected` is a Counter that collects the reason for every dropped sheet."""
    quote_index = quote_index if quote_index is not None else set()
    rejected = rejected if rejected is not None else Counter()
    cursor = db.sheets.find({"status": "public"}, {"id": 1, "title": 1, "sources": 1})
    if limit:
        cursor = cursor.limit(limit)
    progress = Progress("sheets", capped(db.sheets.count_documents({"status": "public"}), limit), every=10000)
    n_docs = 0
    for sheet in cursor:
        progress.tick(lambda: "{:,} sheets exported".format(n_docs))
        title = html_to_text(sheet.get("title") or "").replace("\n", " ")
        nodes, user_lines = [], []  # nodes: one list of lines per sheet node, the units a long sheet is split between
        for source in sheet.get("sources", []):
            if source.get("ref"):
                nodes.append(["[{}]".format(source["ref"])])
                continue
            for raw in user_generated_texts(source):
                kept, _ = drop_library_quotes(html_to_text(raw or "").split("\n"), quote_index)
                kept = [line for line in kept if line]
                if kept:
                    nodes.append(kept)
                user_lines += kept
        user_text = "\n".join(user_lines)
        if not user_text:
            rejected["empty"] += 1
            continue
        if word_count(user_text) < MIN_SHEET_USER_WORDS:
            rejected["too_short"] += 1
            continue
        if hebrew_letter_frac(user_text) > MAX_HEBREW_LETTER_FRAC:
            rejected["hebrew_heavy"] += 1
            continue
        n_docs += 1
        parts = split_units(([[title]] if title else []) + nodes, limits)
        for i, part in enumerate(parts, 1):
            text = "\n".join(([title] if title and i > 1 else []) + part)
            yield {
                "id": "sheet:{}".format(sheet["id"]) + ("#{}".format(i) if len(parts) > 1 else ""),
                "source": "sheet",
                "split": split_for("sheet:{}".format(sheet["id"])),
                "sheet_id": sheet["id"],
                "sheet_language": get_sheet_language(sheet),
                "title": title,
                "part": i,
                "parts": len(parts),
                "words": word_count(text),
                "text": text,
            }
    progress.finish("{:,} sheets exported, rejected: {}".format(n_docs, dict(rejected)))


# Webpages

def whitelisted_site_name(url):
    """Return the name of the whitelisted site `url` belongs to, or None if the site is unknown or not whitelisted."""
    return whitelisted_site_name_for_domain(domain_for_url(url))


@lru_cache(maxsize=None)
def whitelisted_site_name_for_domain(domain):
    """Cached by domain, since site_data_for_domain scans every site's domains on each call."""
    site = site_data_for_domain(domain)
    return site["name"] if site and site.get("is_whitelisted") else None


def normalize_line(line):
    return re.sub(r"\s+", " ", URL_RE.sub(" ", JUNK_TOKEN_RE.sub(" ", html.unescape(line)))).strip()


def body_lines(body):
    return [line for line in map(normalize_line, body.split("\n")) if line]


def line_key(line):
    """Lines that differ only in digits ("Posted May 1, 2025", "Item 2 of 3") count as the same line."""
    return hash(re.sub(r"\d+", "#", line.lower()))


def is_allowed_script_line(line):
    """Mostly Latin or Hebrew letters. Hebrew lines are kept here; pages that are mostly Hebrew are dropped later."""
    letters = [c for c in line if c.isalpha()]
    allowed = sum(c.isascii() or "À" <= c <= "ɏ" or "א" <= c <= "ת" for c in letters)
    return bool(letters) and allowed / len(letters) >= SCRIPT_LINE_MIN_LATIN_OR_HEBREW


def find_site_boilerplate(limit=None):
    """Return {site name: set of line keys that appear on enough of that site's pages to be site chrome}."""
    pages_per_site = Counter()
    line_pages = defaultdict(Counter)  # site -> line key -> number of pages containing it
    cursor = db.webpages_text.find({}, {"url": 1, "body": 1}, limit=limit or 0)
    progress = Progress("webpages pass 1/2 (find boilerplate)", capped(db.webpages_text.estimated_document_count(), limit), every=10000)
    for page in cursor:
        progress.tick(lambda: "{:,} whitelisted pages, {:,} distinct lines counted".format(
            sum(pages_per_site.values()), sum(len(c) for c in line_pages.values())))
        site = whitelisted_site_name(page["url"])
        if site:
            pages_per_site[site] += 1
            line_pages[site].update({line_key(line) for line in body_lines(page.get("body") or "")})
    progress.finish("{:,} whitelisted pages on {:,} sites".format(sum(pages_per_site.values()), len(pages_per_site)))
    boilerplate = {}
    for site, counts in line_pages.items():
        threshold = max(BOILERPLATE_MIN_DOCS, BOILERPLATE_MIN_FRAC * pages_per_site[site])
        boilerplate[site] = {key for key, n in counts.items() if n >= threshold}
    return boilerplate


def clean_lines(lines, site_boilerplate):
    """Drop site chrome, lines repeated within the page, and lines in scripts other than Latin and Hebrew."""
    kept, seen = [], set()
    for line in lines:
        key = line_key(line)
        if key in site_boilerplate or key in seen or not is_allowed_script_line(line):
            continue
        seen.add(key)
        kept.append(line)
    return kept


def join_broken_lines(lines):
    """Join a line that does not end a sentence to a following line that starts lowercase
    ("A central aspect of this mitzvah is encouraging them" + "and praying for their recovery.")."""
    joined = []
    for line in lines:
        if joined and not LINE_END_RE.search(joined[-1]) and line[0].islower():
            joined[-1] += " " + line
        else:
            joined.append(line)
    return joined


def drop_preamble(lines):
    """Drop the short lines before the first prose line: section menus, bylines, tables of contents."""
    for i, line in enumerate(lines):
        if word_count(line) >= PROSE_LINE_MIN_WORDS:
            return lines[i:]
    return lines


def repeated_ngram_frac(words):
    """Share of word n-grams that are repeats of an earlier one. Unlike compression ratio or unique-word
    share, this does not shrink as a page gets longer, so long legitimate articles score ~0."""
    ngrams = [" ".join(words[i:i + NGRAM_SIZE]) for i in range(len(words) - NGRAM_SIZE + 1)]
    return 1 - len(set(ngrams)) / len(ngrams) if ngrams else 0.0


def webpage_quality(url, title, lines):
    """Return (reject_reason or None, metrics) for the cleaned `lines` of a page."""
    text = "\n".join(lines)
    words = re.findall(r"\w+", text.lower())
    latin_words = re.findall(r"[a-zÀ-ɏ]+", text.lower())
    prose_words = sum(len(line.split()) for line in lines if len(line.split()) >= PROSE_LINE_MIN_WORDS)
    metrics = {
        "words": len(words),
        "prose_words": prose_words,
        "prose_frac": round(prose_words / len(words), 3) if words else 0.0,
        "repeated_ngram_frac": round(repeated_ngram_frac(words), 3),
        "english_stopword_frac": round(sum(w in ENGLISH_STOPWORDS for w in latin_words) / max(len(latin_words), 1), 3),
        "hebrew_letter_frac": round(hebrew_letter_frac(text), 3),
    }
    if LISTING_URL_RE.search(url):
        reason = "url_listing"
    elif STRONG_ERROR_TITLE_RE.search(title):
        reason = "error_page"
    elif prose_words < MIN_PROSE_WORDS:
        reason = "too_short"
    elif metrics["hebrew_letter_frac"] > MAX_HEBREW_LETTER_FRAC:
        reason = "hebrew_heavy"
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


def webpage_docs(limit=None, quote_index=None, rejected=None, site_word_cap=SITE_WORD_CAP, tmp_dir=None, limits=WORD_LIMITS):
    """Yield quality-filtered webpage docs. `rejected` is a Counter that collects the reason for every dropped page.
    Pages that pass are written to a temp file first, so that each site's cap can be applied to a stable hash
    sample of all its pages rather than to whichever pages the cursor returns first."""
    quote_index = quote_index if quote_index is not None else set()
    rejected = rejected if rejected is not None else Counter()
    boilerplate = find_site_boilerplate(limit)
    exported_texts = set()
    candidates = defaultdict(list)  # site -> [(url hash, words, [temp file offset of each part])]
    progress = Progress("webpages pass 2/2 (filter)", capped(db.webpages_text.estimated_document_count(), limit), every=10000)
    with tempfile.TemporaryFile(dir=tmp_dir) as tmp:
        for page in db.webpages_text.find({}, limit=limit or 0):
            progress.tick(lambda: "{:,} passed, {:,} rejected".format(len(exported_texts), sum(rejected.values())))
            site = whitelisted_site_name(page["url"])
            if not site:
                rejected["not_whitelisted"] += 1
                continue
            title = normalize_line(page.get("title") or "")
            lines = join_broken_lines(clean_lines(body_lines(page.get("body") or ""), boilerplate[site]))
            lines, _ = drop_library_quotes(lines, quote_index)
            lines = drop_preamble(lines)
            reason, metrics = webpage_quality(page["url"], title, lines)
            body = "\n".join(lines)
            if not reason and hash(body) in exported_texts:
                reason = "duplicate"
            if reason:
                rejected[reason] += 1
                continue
            exported_texts.add(hash(body))
            parts = split_units([[line] for line in lines], limits)
            offsets, page_words = [], 0
            for i, part in enumerate(parts, 1):
                part_body = "\n".join(part)
                text = title + "\n\n" + part_body if title and title != lines[0] else part_body
                doc = {
                    "id": "webpage:{}".format(page["_id"]) + ("#{}".format(i) if len(parts) > 1 else ""),
                    "source": "webpage",
                    "split": split_for(page["url"]),
                    "url": page["url"],
                    "site": site,
                    "title": title,
                    "part": i,
                    "parts": len(parts),
                    **metrics,
                    "words": word_count(text),
                    "text": text,
                }
                offsets.append(tmp.tell())
                page_words += doc["words"]
                tmp.write((json.dumps(doc, ensure_ascii=False) + "\n").encode("utf-8"))
            candidates[site].append((stable_hash(page["url"]), page_words, offsets))
        progress.finish("{:,} passed, {:,} rejected".format(len(exported_texts), sum(rejected.values())))

        keep = []
        for site, pages in candidates.items():
            site_words = 0
            for _, words, offsets in sorted(pages):  # a page's parts are kept or dropped together
                if site_word_cap and site_words + words > site_word_cap:
                    rejected["site_cap"] += 1
                    continue
                site_words += words
                keep.extend(offsets)
            if site_word_cap and site_words >= 0.9 * site_word_cap:
                log("site cap: {} kept {:,} words".format(site, site_words))
        for offset in sorted(keep):
            tmp.seek(offset)
            yield json.loads(tmp.readline())


# Dedupe

class NearDuplicateIndex:
    """MinHash over word 5-grams, with LSH banding to find candidates. Candidates are then checked against the
    full signature, so a pair is only a duplicate if its estimated Jaccard similarity is >= `threshold`."""

    def __init__(self, num_perm=NUM_PERM, bands=LSH_BANDS, threshold=NEAR_DUP_THRESHOLD):
        rng = np.random.default_rng(0)
        odd = lambda size: rng.integers(1, 2 ** 63, size=size, dtype=np.uint64) | np.uint64(1)
        self.shingle_multipliers = odd(SHINGLE_SIZE)
        self.multipliers = odd(num_perm)
        self.offsets = rng.integers(0, 2 ** 63, size=num_perm, dtype=np.uint64)
        self.bands, self.rows, self.threshold = bands, num_perm // bands, threshold
        self.buckets = {}     # hash of (band, band signature) -> index of the first doc in it
        self.signatures = []  # signature of every indexed doc
        self.splits = []      # split of every indexed doc

    def signature(self, words):
        word_hashes = np.array([hash(w) for w in words], dtype=np.int64).view(np.uint64)
        n_shingles = len(word_hashes) - SHINGLE_SIZE + 1
        if n_shingles < 1:
            shingles = np.array([hash(" ".join(words))], dtype=np.int64).view(np.uint64)
        else:  # wrapping uint64 arithmetic is intended: it mixes the 5 word hashes into one shingle hash
            shingles = word_hashes[:n_shingles] * self.shingle_multipliers[0]
            for i in range(1, SHINGLE_SIZE):
                shingles = shingles + word_hashes[i:i + n_shingles] * self.shingle_multipliers[i]
        signature = np.full(len(self.multipliers), np.iinfo(np.uint64).max, dtype=np.uint64)
        for start in range(0, len(shingles), 2048):  # in chunks, to bound the (shingles x permutations) matrix
            chunk = shingles[start:start + 2048]
            hashed = (chunk[:, None] * self.multipliers[None, :] + self.offsets[None, :]) >> np.uint64(32)
            signature = np.minimum(signature, hashed.min(axis=0))
        return signature.astype(np.uint32)

    def match_or_add(self, words, split):
        """Return the split of an indexed doc that `words` is a near-duplicate of; or, if there is none, index
        `words` under `split` and return None."""
        signature = self.signature(words)
        keys = [hash((band, signature[band * self.rows:(band + 1) * self.rows].tobytes())) for band in range(self.bands)]
        for candidate in sorted({self.buckets[key] for key in keys if key in self.buckets}):
            if (self.signatures[candidate] == signature).mean() >= self.threshold:
                return self.splits[candidate]
        index = len(self.signatures)
        self.signatures.append(signature)
        self.splits.append(split)
        for key in keys:
            self.buckets.setdefault(key, index)
        return None


def paragraph_key(line):
    return hash(re.sub(r"\s+", " ", line.replace("**", "")).strip().lower())


def too_short_after_dedupe(source, lines):
    if source == "webpage":
        return sum(word_count(line) for line in lines if word_count(line) >= PROSE_LINE_MIN_WORDS) < MIN_PROSE_WORDS
    return word_count("\n".join(lines)) < MIN_DEDUPED_DOC_WORDS


def drop_repeated_paragraphs(doc, seen_paragraphs):
    """Remove from `doc` the long paragraphs already in `seen_paragraphs`. Returns False if the doc is left too short."""
    lines = doc["text"].split("\n")
    kept = [line for line in lines if word_count(line) < LONG_PARAGRAPH_MIN_WORDS or paragraph_key(line) not in seen_paragraphs]
    if len(kept) < len(lines):
        text_lines = []
        for line in kept:  # collapse the blank lines the removed paragraphs leave behind
            if line or (text_lines and text_lines[-1]):
                text_lines.append(line)
        while text_lines and not text_lines[-1].strip():
            text_lines.pop()
        if text_lines and text_lines[-1] == "Notes:":  # all its notes were removed
            text_lines.pop()
        if too_short_after_dedupe(doc["source"], [line for line in text_lines if line]):
            return False
        doc["text"] = "\n".join(text_lines)
        doc["words"] = word_count(doc["text"])
    seen_paragraphs.update(paragraph_key(line) for line in doc["text"].split("\n") if word_count(line) >= LONG_PARAGRAPH_MIN_WORDS)
    return True


class StageStats:
    """Docs and words that are still in the corpus after each dedupe stage, per source."""
    STAGES = ("exported", "exact_deduped", "near_deduped", "paragraph_deduped", "within_context")

    def __init__(self):
        self.docs = {stage: Counter() for stage in self.STAGES}
        self.words = {stage: Counter() for stage in self.STAGES}

    def add(self, stage, doc):
        self.docs[stage][doc["source"]] += 1
        self.words[stage][doc["source"]] += doc["words"]

    def as_dict(self):
        sources = ("version", "sheet", "webpage")
        return {
            stage: {
                **{source: {"docs": self.docs[stage][source], "words": self.words[stage][source]} for source in sources},
                "total": {"docs": sum(self.docs[stage].values()), "words": sum(self.words[stage].values())},
            }
            for stage in self.STAGES
        }

    def log(self):
        columns = ("version", "sheet", "webpage", "total")
        log("{:<18}".format("stage") + "".join("{:>13}{:>16}".format(c + " docs", c + " words") for c in columns))
        for stage, row in self.as_dict().items():
            log("{:<18}".format(stage) + "".join("{:>13,}{:>16,}".format(row[c]["docs"], row[c]["words"]) for c in columns))


def read_docs(path, split):
    with open(path, encoding="utf-8") as f:
        for line in f:
            doc = json.loads(line)
            if doc["split"] == split:
                yield doc


def dedupe_docs(raw_path, n_docs, fout, limits, stats, rejected):
    """Write the docs of `raw_path` to `fout` without duplicates, and (when sizes are in tokens) only those that fit the
    model's context. Eval docs are indexed first, so a train doc that matches one is dropped. `rejected` counts
    the reason for every dropped doc, as {(source, reason): n}."""
    exact, near, paragraphs = {}, NearDuplicateIndex(), set()  # exact: hash of text -> split
    progress = Progress("dedupe", n_docs, every=50000)
    n_kept = 0
    for split in ("eval", "train"):
        for doc in read_docs(raw_path, split):
            progress.tick(lambda: "{:,} kept, {:,} rejected".format(n_kept, sum(rejected.values())))
            source = doc["source"]
            stats.add("exported", doc)

            def reject(reason):
                rejected[(source, reason + ("_of_eval" if split == "train" and match == "eval" else ""))] += 1

            key = hash(doc["text"])
            match = exact.get(key)
            if match:
                reject("exact_duplicate")
                continue
            exact[key] = split
            stats.add("exact_deduped", doc)

            match = near.match_or_add(WORD_RE.findall(doc["text"].lower()), split)
            if match:
                reject("near_duplicate")
                continue
            stats.add("near_deduped", doc)

            if not drop_repeated_paragraphs(doc, paragraphs):
                match = None
                reject("duplicate_paragraphs")
                continue
            stats.add("paragraph_deduped", doc)

            if limits.in_tokens:
                doc["tokens"] = limits.measure(doc["text"])
                if doc["tokens"] + SPECIAL_TOKENS > MODEL_CONTEXT_TOKENS:
                    match = None
                    reject("over_context")
                    continue
            stats.add("within_context", doc)
            fout.write(json.dumps(doc, ensure_ascii=False) + "\n")
            n_kept += 1
    progress.finish("{:,} kept, {:,} rejected".format(n_kept, sum(rejected.values())))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=DEFAULT_OUT, help="output JSONL path (default: %(default)s)")
    parser.add_argument("--only", choices=["versions", "sheets", "webpages"], help="export just one source")
    parser.add_argument("--exclude", nargs="+", choices=["versions", "sheets", "webpages"], default=[], help="skip these sources")
    parser.add_argument("--limit", type=int, help="max indexes / sheets / webpages to read, for testing")
    parser.add_argument("--site-word-cap", type=int, default=SITE_WORD_CAP, help="max words per website, 0 for no cap (default: %(default)s)")
    parser.add_argument("--max-tokens", type=int, default=DEFAULT_MAX_TOKENS, help="measure doc length in tokens and split docs above this many; 0 to measure in words, split above MAX_DOC_WORDS (default: %(default)s)")
    parser.add_argument("--tokenizer", default=DEFAULT_TOKENIZER, help="tokenizer for --max-tokens: a Hugging Face name, or the path of a tokenizer.json (default: %(default)s)")
    args = parser.parse_args()
    limits = token_limits(args.tokenizer, args.max_tokens) if args.max_tokens else WORD_LIMITS

    def wanted(source):
        return args.only in (None, source) and source not in args.exclude

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    raw_path = args.out + ".raw"
    counts, words = Counter(), Counter()
    rejected = {"sheet": Counter(), "webpage": Counter()}
    quote_index = set()
    if not wanted("versions") and (wanted("sheets") or wanted("webpages")):
        quote_index = build_quote_index(args.limit)
    with open(raw_path, "w", encoding="utf-8") as fraw:
        generators = []
        # Versions must come first: they fill quote_index, which the sheets and webpages are checked against.
        # The order here is also the priority when duplicates are removed.
        if wanted("versions"):
            generators.append(version_docs(args.limit, quote_index, limits))
        if wanted("sheets"):
            generators.append(sheet_docs(args.limit, quote_index, rejected["sheet"], limits))
        if wanted("webpages"):
            generators.append(webpage_docs(args.limit, quote_index, rejected["webpage"], args.site_word_cap, out_dir, limits))
        for gen in generators:
            for doc in gen:
                fraw.write(json.dumps(doc, ensure_ascii=False) + "\n")
                counts[doc["source"]] += 1
                words[doc["source"]] += doc["words"]
                if sum(counts.values()) % 100000 == 0:
                    log("exported so far: {} ({:.2f} GB)".format(dict(counts), fraw.tell() / 1e9))
    log("Exported {} docs, {} words, before deduping".format(dict(counts), dict(words)))
    stats, dedupe_rejected = StageStats(), Counter()
    with open(args.out, "w", encoding="utf-8") as fout:
        dedupe_docs(raw_path, sum(counts.values()), fout, limits, stats, dedupe_rejected)
    os.remove(raw_path)
    log("Wrote {} docs, {} words to {} ({:.2f} GB)".format(
        dict(stats.docs["within_context"]), dict(stats.words["within_context"]), args.out, os.path.getsize(args.out) / 1e9))
    stats.log()
    for source, reasons in rejected.items():
        if reasons:
            log("{} rejected: {}".format(source, dict(reasons.most_common())))
    by_source = {}
    for (source, reason), n in dedupe_rejected.most_common():
        by_source.setdefault(source, {})[reason] = n
    log("Dropped by dedupe: {}".format(by_source))
    with open(args.out + ".stats.json", "w") as fstats:
        json.dump({"stages": stats.as_dict(), "rejected": {s: dict(r) for s, r in rejected.items()}, "dedupe_rejected": by_source}, fstats, indent=2)


if __name__ == "__main__":
    main()
