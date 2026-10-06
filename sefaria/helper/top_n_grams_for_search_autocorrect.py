# -*- coding: utf-8 -*-
"""
Top n-grams table for search-query auto-correction (sc-47189).

The "top n-grams" table is a precomputed set of normalized *phrases* -- contiguous runs of
1 to `MAX_PHRASE_WORDS` words -- that occur in more than some threshold of Sefaria segments
("documents"), each mapped to the number of documents it appears in. It powers query
auto-correction: a search query (or, for a query longer than `MAX_PHRASE_WORDS` words, the
longest contiguous run of its words) that isn't itself a known phrase, but is exactly one
edit (insert/delete/replace/transpose) away from one, gets silently rewritten to that known
phrase before hitting Elasticsearch (see `autocorrect_query` below and its caller,
`search_wrapper_api` in reader/views.py).

Correcting whole phrases rather than individual words (the original POC) matters because a
lone word can be a perfectly good 1-edit fix in isolation while still producing a corrected
*phrase* that appears nowhere in the corpus -- e.g. a real word substituted into a sequence
that never actually occurs together. Requiring the corrected phrase itself to be a top-n-gram
entry means a correction is only ever offered if the result is something the corpus actually
contains.

The table is built by `scripts/build_top_n_grams_for_search_autocorrect.py`, run on a
schedule by the `build-top-n-grams-for-search-autocorrect` CronJob
(helm-chart/sefaria/templates/cronjob/), and persisted to Mongo
(`db.top_n_grams_for_search_autocorrect`) rather than a local file -- every web pod reads the
same collection at startup with no artifact-shipping step of its own (see `save_top_n_grams` /
`load_top_n_grams` below). `Library.build_top_n_grams_for_search_autocorrect()`
(sefaria/model/text.py) loads it once, from `init_library_cache()` (reader/startup.py), onto
`Library._top_n_grams_for_search_autocorrect`. This module holds the tokenizer the builder and
the search-time lookup share, plus the edit-distance-1 candidate generation and the Mongo
load/save helpers.

`autocorrect_query` also optionally takes `entity_alt_index`: the runtime-only (never
persisted to Mongo) index of Book/Author/Topic alternate titles built by
`sefaria/helper/entity_alt_index.py` and held on `Library._entity_alt_index`. A candidate
from either source is ranked by the same damped popularity tie-break (`_tie_break_score`),
so the two can be compared on one scale even though their raw weights (corpus doc counts vs.
a topic's `numSources`) are nothing alike.
"""
import math
import re
import time
from collections import Counter
from typing import Dict, List, Optional, Tuple

import structlog
from pymongo import UpdateOne

from sefaria.system.database import db

logger = structlog.get_logger(__name__)

# Mongo collection the built table lives in: one document per phrase ({"_id": phrase,
# "count": doc_count, "batch": <build timestamp>}), plus one "__meta__" document carrying
# build info. `phrase` is 1 to MAX_PHRASE_WORDS words, normalized and joined by a single
# space -- the same shape `autocorrect_query` looks phrases up by.
TOP_N_GRAMS_COLLECTION = "top_n_grams_for_search_autocorrect"
_META_ID = "__meta__"
# Mongo bulk_write payloads are chunked at this size so a full-library build (potentially
# millions of phrases, now that every 1-3 word run is counted rather than every word) doesn't
# assemble one enormous in-memory request.
_BULK_WRITE_CHUNK_SIZE = 5000

# The longest phrase (in words) the table indexes and autocorrect_query will ever try to
# correct as a unit. Chosen so correction stays scoped to a coherent phrase rather than a
# single word -- see the module docstring -- while keeping the build tractable: a segment of
# length L contributes O(L * MAX_PHRASE_WORDS) phrases rather than O(L^2).
MAX_PHRASE_WORDS = 3

# Strip every leading/trailing non-word character (regular punctuation, ASCII/Hebrew quote
# marks, etc) but leave the interior of the word untouched -- this is what keeps an
# abbreviation's internal gershayim intact, e.g. 'רמב"ם' / 'רמב״ם' survive as one token.
_EDGE_STRIP_RE = re.compile(r'^\W+|\W+$', re.UNICODE)


def normalize_word(word: str) -> str:
    """
    Normalize a single already-whitespace-split token for the top-n-grams table: strip
    leading/trailing punctuation (keeping internal punctuation, e.g. internal quotation
    marks, untouched) and lowercase the result. No lemmatization is attempted (POC).
    """
    return _EDGE_STRIP_RE.sub('', word).lower()


def tokenize(text: str, lang: str) -> List[str]:
    """
    Split a segment of text into normalized words for the top-n-grams table. Runs the same
    normalizer the linker applies server-side (get_linker_normalizer) first, so words are
    tokenized consistently with the rest of the NLP pipeline -- cantillation/maqaf/HTML/
    footnote-markers stripped, quote characters unidecoded to ASCII -- then splits on
    whitespace and strips edge punctuation per word.
    """
    from sefaria.model.linker.linker_entity_recognizer import get_linker_normalizer
    normalized = get_linker_normalizer(lang).normalize(text or '')
    return [w for w in (normalize_word(tok) for tok in normalized.split()) if w]


def _segment_phrases(tokens: List[str], max_n: int = MAX_PHRASE_WORDS) -> set:
    """
    Every contiguous run of 1 to `max_n` words in `tokens` (a tokenized segment), each
    joined into a single space-separated phrase string. A phrase that recurs within the
    same segment (e.g. a word repeated twice) appears once in the returned set -- doc
    counting, like the original per-word table, counts a segment at most once per phrase.
    """
    phrases = set()
    n_tokens = len(tokens)
    for n in range(1, min(max_n, n_tokens) + 1):
        for start in range(0, n_tokens - n + 1):
            phrases.add(" ".join(tokens[start:start + n]))
    return phrases


# --- Build / persist / load ----------------------------------------------------------

def build_top_n_grams(min_doc_count: int, langs=('he', 'en'), categories: Optional[List[str]] = None) -> Dict[str, int]:
    """
    Walk every segment in the library (optionally scoped to `categories`, e.g. ["Tanakh"])
    and count, per normalized phrase (every contiguous run of 1 to MAX_PHRASE_WORDS words),
    the number of distinct segments ("documents") it appears in at least once. A phrase that
    occurs 5 times in one segment and never again still has a doc count of 1. Returns only
    phrases whose doc count is > `min_doc_count`.

    Uses Version.walk_thru_contents, which bulk-fetches a whole version's content in one
    query, instead of one ref.text() call per segment -- far fewer round trips to Mongo.

    Every version of a requested language is walked (not just the top-priority one), but
    each tref is only ever counted once per (index, lang): `index.versionSet()` sorts by
    priority descending (VersionSet's default sort), and a `seen_trefs` set shared across
    all of an index's versions of a language -- not reset per version -- skips a tref the
    moment it's been counted once. Walking in priority order means that's normally the
    top-priority version's wording; a tref only falls through to a lower-priority version
    when the higher-priority one doesn't have it at all (a partial translation, a stub,
    etc.), so a partial top version can't silently drop that segment from the table.
    The same set is what prevents two versions that both cover a tref from counting its
    phrases twice -- there is no other version-counting logic here.
    """
    from sefaria.model import IndexSet

    doc_counts = Counter()
    query = {"categories": {"$in": categories}} if categories else {}
    indexes = list(IndexSet(query))
    total = len(indexes)
    for i, index in enumerate(indexes):
        logger.info(f"[{i + 1}/{total}] {index.title}")
        try:
            versions = list(index.versionSet())  # sorted by priority desc
        except Exception as e:
            logger.warning(f"Skipping {index.title}, couldn't get versions: {e}")
            continue

        seen_trefs_by_lang = {lang: set() for lang in langs}

        for version in versions:
            lang = version.language
            if lang not in langs:
                continue
            seen_trefs = seen_trefs_by_lang[lang]

            def action(segment_str, tref, _he_tref, version, _lang=lang, _seen=seen_trefs):
                if tref in _seen:
                    # Already counted from a higher-priority (or, for a tie, earlier)
                    # version of this same (index, lang) -- don't count it again.
                    return
                _seen.add(tref)
                if not segment_str:
                    return
                # A phrase counts once per document, no matter how many times it recurs in it.
                doc_counts.update(_segment_phrases(tokenize(segment_str, _lang)))

            try:
                version.walk_thru_contents(action)
            except Exception as e:
                logger.warning(f"Failed walking {index.title} ({version.versionTitle}, {lang}): {e}")

    return {phrase: count for phrase, count in doc_counts.items() if count > min_doc_count}


def save_top_n_grams(top_n_grams: Dict[str, int], min_doc_count: int) -> None:
    """
    Persist a freshly built top-n-grams table to `db.top_n_grams_for_search_autocorrect`, one
    document per phrase, so every web pod can load it at startup with a single query and no
    file/bucket to ship.

    Writes are tagged with a fresh `batch` id (a timestamp); once every phrase of the new
    batch has been upserted, documents left over from the previous batch (an old phrase that
    no longer clears `min_doc_count`, or was dropped from the library) are deleted. Readers
    never see a half-written table -- concurrently, they see the previous complete batch
    until this finishes, then the new one.
    """
    batch = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    items = list(top_n_grams.items())
    for i in range(0, len(items), _BULK_WRITE_CHUNK_SIZE):
        chunk = items[i:i + _BULK_WRITE_CHUNK_SIZE]
        db[TOP_N_GRAMS_COLLECTION].bulk_write(
            [UpdateOne({"_id": phrase}, {"$set": {"count": count, "batch": batch}}, upsert=True)
             for phrase, count in chunk],
            ordered=False,
        )
    db[TOP_N_GRAMS_COLLECTION].delete_many({"_id": {"$ne": _META_ID}, "batch": {"$ne": batch}})
    db[TOP_N_GRAMS_COLLECTION].update_one(
        {"_id": _META_ID},
        {"$set": {"min_doc_count": min_doc_count, "generated": batch, "num_words": len(top_n_grams)}},
        upsert=True,
    )


def load_top_n_grams() -> Dict[str, int]:
    """
    Load the top-n-grams table built by the most recent
    `scripts/build_top_n_grams_for_search_autocorrect.py` run from Mongo. Returns {} (which
    silently disables auto-correction -- `autocorrect_query` always returns None against an
    empty table) if it hasn't been built yet in this environment, or on any read error --
    that must not be a startup error.
    """
    try:
        return {
            doc["_id"]: doc["count"]
            for doc in db[TOP_N_GRAMS_COLLECTION].find({"_id": {"$ne": _META_ID}}, {"count": 1})
        }
    except Exception as e:
        logger.warning(f"Could not load top-n-grams table from Mongo: {e}")
        return {}


# --- Autocorrect -----------------------------------------------------------------------

# Alphabet used to generate edit candidates: Hebrew letters, English letters, digits, and
# the quote characters a top-n-grams phrase can legitimately contain internally (e.g. רמב"ם).
# Deliberately excludes the space character -- replace/insert never introduces a new word
# boundary, so a candidate can only gain or lose one by *deleting* an existing space.
_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789'\"" + ''.join(chr(c) for c in range(0x05d0, 0x05eb))


def _one_edit_candidates(phrase: str) -> set:
    """
    Every string exactly one edit (delete, transpose, replace, or insert) away from
    `phrase`. Same brute-force approach as the Norvig-style corrector in
    sefaria/model/autospell.py's SpellChecker.single_edits, reimplemented locally so this
    table's own alphabet (Hebrew + Latin + digits + quotes) is used instead of the lexicon's,
    and so this module has no dependency on the lexicon/autocomplete stack. `phrase` may be a
    single word or several words joined by spaces -- the edit operates on the string as a
    whole either way.
    """
    splits = [(phrase[:i], phrase[i:]) for i in range(len(phrase) + 1)]
    deletes = [L + R[1:] for L, R in splits if R]
    transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R) > 1]
    replaces = [L + c + R[1:] for L, R in splits if R for c in _ALPHABET]
    inserts = [L + c + R for L, R in splits for c in _ALPHABET]
    return set(deletes + transposes + replaces + inserts)


def _tie_break_score(count: int) -> float:
    """
    Damps a raw doc count onto a log scale: large counts stop mattering in direct proportion
    to their size, so a phrase with 50,000 hits isn't treated as 500x "more correct" than one
    with 100. This is also the scale `sefaria.helper.entity_alt_index` precomputes its own
    candidates' scores on (see that module's `_entity_tie_break_score`), so a top-n-grams
    candidate and an entity-alt candidate can be ranked against each other by this one number
    even though their raw weights (corpus doc counts vs. a topic's `numSources`) are on
    completely different scales. Mirrors the shape (not the exact constants) of the
    popularity tie-break `get_entity_query_obj` already uses for entity-search relevance
    (`1 + log10(1 + numSources) * 0.2`) -- popularity/frequency breaks ties, it never is the
    primary signal.
    """
    return math.log10(1 + max(count, 0))


def _best_match(phrase: str, top_n_grams: Dict[str, int],
                 entity_alt_index: Optional[Dict[str, float]] = None) -> Optional[str]:
    """
    One-edit-distance correction for a phrase (one or more words), chosen from both the
    top-n-grams table and the optional runtime entity-alt index. A candidate found in both is
    scored by whichever source ranks it higher. Ties (including a tie between the two
    sources) are broken by `_tie_break_score`/`entity_alt_index`'s own precomputed score --
    never by raw magnitude, since the two sources' raw weights aren't comparable.
    """
    best, best_score = None, None
    for c in _one_edit_candidates(phrase):
        if c in top_n_grams:
            score = _tie_break_score(top_n_grams[c])
            if best_score is None or score > best_score:
                best, best_score = c, score
        if entity_alt_index and c in entity_alt_index:
            score = entity_alt_index[c]  # already precomputed on the same comparable scale
            if best_score is None or score > best_score:
                best, best_score = c, score
    return best


def _try_window(words: List[str], normalized: List[str], start: int, end: int,
                 top_n_grams: Dict[str, int],
                 entity_alt_index: Optional[Dict[str, float]] = None) -> Optional[str]:
    """
    Try to correct `normalized[start:end]` (a contiguous run of query words) as a single
    phrase. Returns the full corrected query (all of `words`, with just this window fixed
    up) if the window's phrase is exactly one edit from some *other* phrase in either source;
    None if the window is already a known phrase in either source (nothing to fix) or isn't a
    1-edit match for anything.
    """
    phrase = " ".join(normalized[start:end])
    if phrase in top_n_grams or (entity_alt_index and phrase in entity_alt_index):
        return None  # already an attested phrase/title -- nothing to correct here
    candidate = _best_match(phrase, top_n_grams, entity_alt_index)
    if candidate is None:
        return None

    corrected_words = list(words)
    candidate_words = candidate.split()
    if len(candidate_words) == end - start:
        # Same word count as the window: swap in only the word(s) that actually changed, so
        # a word the user already typed correctly keeps its original casing instead of being
        # flattened to the table's lowercase form.
        for offset, (orig, corr) in enumerate(zip(normalized[start:end], candidate_words)):
            if orig != corr:
                corrected_words[start + offset] = corr
    else:
        # The one-character edit crossed a word boundary (deleted a space, merging two
        # words) -- old and new words no longer line up position-by-position, so replace
        # the whole window verbatim.
        corrected_words[start:end] = candidate_words
    return " ".join(corrected_words)


def autocorrect_query(query: str, top_n_grams: Dict[str, int],
                       entity_alt_index: Optional[Dict[str, float]] = None) -> Optional[Tuple[str, str]]:
    """
    Product spec sc-47189. Corrects a *phrase*, never a lone word in isolation, so a fix is
    only ever offered when the resulting phrase is itself something the corpus contains, or a
    known Book/Author/Topic alternate title/name (see the module docstring and
    sefaria/helper/entity_alt_index.py).

    - A query of up to MAX_PHRASE_WORDS words is treated as a single phrase: if it already
      matches a top-n-grams or entity-alt entry, it's searched normally, uncorrected (returns
      None). Otherwise, if the whole phrase is exactly one edit away from some phrase in
      either source, that's the correction.
    - A longer query first gets one extra, entity-alt-only chance to be corrected *in its
      entirety*: an entity title/name is a single curated unit, not generated as a sliding
      window over corpus text, so unlike the top-n-grams table it is never capped at
      MAX_PHRASE_WORDS -- explaining the WHOLE query this way beats any partial fix below.
      Failing that, the query is corrected at most once, in its longest fixable contiguous
      run of words: window sizes MAX_PHRASE_WORDS down to 1 are tried (against both sources),
      left to right within each size, and the first window that is both not already a known
      phrase and one edit from one is corrected; every other word in the query is left
      exactly as typed. A query with no such window anywhere (every window already attested,
      or too far off to fix within a 1-edit budget) also returns None.

    :param query: the raw query text as typed/submitted.
    :param top_n_grams: {normalized_phrase: doc_count}, e.g. `library._top_n_grams_for_search_autocorrect`.
    :param entity_alt_index: {normalized_phrase: tie_break_score}, e.g.
        `library._entity_alt_index` -- see sefaria/helper/entity_alt_index.py. Optional: a
        query corrects against the top-n-grams table alone when omitted.
    :return: (corrected_query, original_query) if a correction applies, else None.
    """
    if not query or (not top_n_grams and not entity_alt_index):
        return None
    words = query.split()
    if not words:
        return None
    normalized = [normalize_word(w) for w in words]
    n = len(normalized)

    if n <= MAX_PHRASE_WORDS:
        corrected = _try_window(words, normalized, 0, n, top_n_grams, entity_alt_index)
        return (corrected, query) if corrected else None

    if entity_alt_index:
        whole = _try_window(words, normalized, 0, n, {}, entity_alt_index)
        if whole:
            return whole, query

    for size in range(MAX_PHRASE_WORDS, 0, -1):
        for start in range(0, n - size + 1):
            corrected = _try_window(words, normalized, start, start + size, top_n_grams, entity_alt_index)
            if corrected:
                return corrected, query
    return None
